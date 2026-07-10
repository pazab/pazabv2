import os
import re
import cv2
import numpy as np
import logging
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from paddleocr import PaddleOCR

# ── 1. CPU 가속 및 실행 환경 최적화 설정 ──────────────────────────
os.environ["FLAGS_use_onednn"] = "0"
os.environ["FLAGS_enable_pir_api"] = "0"
os.environ["PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK"] = "True"

# PaddleOCR 자체 내부 로그 억제
logging.getLogger("ppocr").setLevel(logging.WARNING)

app = FastAPI(title="Pazab OCR Daemon Service", version="1.0.0")

# CORS 활성화 (Next.js 로컬 통신 원활화)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# PaddleOCR 한국어(korean) 모델 초기화
# v5 모델 기본 적용을 위해 ocr_version은 생략하여 auto-selection 유도
ocr = PaddleOCR(use_angle_cls=True, lang='korean')

# ── 2. 이미지 전처리 유틸리티 ─────────────────────────────────────
def preprocess_image(image_bytes: bytes) -> np.ndarray:
    """
    OpenCV를 사용해 이미지를 Grayscale로 변환하고 Adaptive Thresholding으로 이진화 처리하여
    흐릿한 촬영 사진의 가독성 및 OCR 인식률을 보강합니다.
    """
    nparr = np.frombuffer(image_bytes, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    if img is None:
        raise ValueError("Image decoding failed.")

    # 1. 흑백(Grayscale) 변환
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    
    # 2. 이미지 크기 조절 (해상도가 너무 작으면 확대)
    h, w = gray.shape[:2]
    if h < 1000 or w < 1000:
        gray = cv2.resize(gray, (w * 2, h * 2), interpolation=cv2.INTER_CUBIC)
        
    # 3. Adaptive Thresholding으로 대비 강화 및 그림자 제거
    processed = cv2.adaptiveThreshold(
        gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, 15, 4
    )
    return processed

# ── 3. 기하학적 Bounding Box 매핑 알고리즘 ───────────────────────
def find_right_neighbor(keyword_box, all_results, max_y_diff=35, max_x_dist=450):
    """
    식별한 '키워드 박스'와 Y축(높이)이 겹치면서 X축상으로 우측에 위치한
    모든 텍스트 조각들을 수집한 뒤, X축 좌표 순서대로 정렬하여 공백으로 결합해 반환합니다.
    """
    kx1, ky1 = keyword_box[0] # 좌상단
    kx2, ky2 = keyword_box[2] # 우하단
    k_center_y = (ky1 + ky2) / 2
    k_height = ky2 - ky1
    
    # 동적 y_diff 임계값 적용 (키워드 박스 높이의 95% 수준까지 넓힘)
    actual_y_diff = max(max_y_diff, k_height * 0.95)
    candidates = []
    
    for box, (text, conf) in all_results:
        bx1, by1 = box[0]
        bx2, by2 = box[2]
        b_center_y = (by1 + by2) / 2
        
        # 자기 자신은 제외
        if bx1 == kx1 and by1 == ky1:
            continue
            
        # Y축 중심선 편차가 임계값 내인지 체크
        if abs(k_center_y - b_center_y) < actual_y_diff:
            # 키워드 우측에 있고 지정한 최대 X축 거리 내에 있는지 체크
            if bx1 >= (kx2 - 15) and (bx1 - kx2) < max_x_dist:
                candidates.append((bx1, text))
                
    if not candidates:
        return ""
        
    # X축 시작 좌표(bx1) 기준으로 오름차순 정렬하여 단어 순서 보장
    candidates.sort(key=lambda x: x[0])
    
    # 공백을 주어 단어들을 결합
    return " ".join([c[1] for c in candidates])



def find_bottom_neighbor(keyword_box, all_results, max_x_diff=40, max_y_dist=150):
    """
    [우측에 값이 없고 표 아래에 값이 밀려 있을 때의 대비책]
    키워드 박스 아래(Y축이 더 큼)에 위치하며 X축 정렬이 수직으로 정렬된 가장 가까운 텍스트를 추출합니다.
    """
    kx1, ky1 = keyword_box[0]
    kx2, ky2 = keyword_box[2]
    k_center_x = (kx1 + kx2) / 2
    
    best_candidate = None
    min_dist = float('inf')
    
    for box, (text, conf) in all_results:
        bx1, by1 = box[0]
        bx2, by2 = box[2]
        b_center_x = (bx1 + bx2) / 2
        
        if bx1 == kx1 and by1 == ky1:
            continue
            
        if abs(k_center_x - b_center_x) < max_x_diff:
            if by1 >= (ky2 - 5) and (by1 - ky2) < max_y_dist:
                dist = by1 - ky2
                if dist < min_dist:
                    min_dist = dist
                    best_candidate = text
                    
    return best_candidate

def get_bbox_coords(box):
    # box 형태: [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]
    xs = [pt[0] for pt in box]
    ys = [pt[1] for pt in box]
    return [int(min(xs)), int(min(ys)), int(max(xs)), int(max(ys))]

def get_inline_value(text: str, keywords: list) -> str:
    """
    텍스트 박스 자체에 키워드와 밸류가 다닥다닥 붙어 있는 경우
    콜론(:)이나 한 칸 공백 뒤의 우측 밸류를 반환합니다.
    """
    for kw in keywords:
        if kw in text:
            parts = text.split(kw)
            if len(parts) > 1:
                val = parts[-1].strip()
                # 깨진 유니코드 문자( 등)를 훼손하지 않도록 순수 특수문자 및 갑/을 장식기호만 strip
                val = val.strip(" :.-()=갑을")
                if val:
                    return val
    return ""



# ── 4. 결정론적 규칙 및 정규식 기반 근로계약서 파서 ───────────────
def parse_contract_rules(flat_results, full_text) -> dict:
    """
    정제된 OCR flat 결과 리스트와 full_text를 기반으로
    다양한 계약서 템플릿의 필드(상호, 주민번호, 시급 등)를 기하학 및 정규식 규칙으로 파싱합니다.
    """
    extracted = {
        "biz": "",
        "bizRegNo": "",
        "ceo": "",
        "ceoPhone": "",
        "bizAddr": "",
        "worker": "",
        "workerBirth": "",
        "workerPhone": "",
        "workerAddr": "",
        "startDate": "",
        "endDate": "",
        "workPlace": "",
        "jobDesc": "",
        "workStart": "",
        "workEnd": "",
        "breakStart": "12:00",
        "breakEnd": "13:00",
        "workDaysText": "",
        "wage": "",
        "wageType": "hour",
        "contractDate": ""
    }
    extracted_boxes = {}
    
    # ── 키워드 사전 정의 ──
    keywords = {
        "biz": ["상호", "회사명", "사업체명", "사업장명", "사업주명"],
        "bizRegNo": ["등록번호", "사업자등록번호", "사업자번호"],
        "ceo": ["대표자", "사용자", "대표자명", "대표"],
        "ceoPhone": ["사업주연락처", "전화번호", "대표자전화"],
        "bizAddr": ["사업장소재지", "소재지", "사업장주소"],
        "worker": ["근로자", "성명", "피고용인", "을의성명"],
        "workerBirth": ["주민등록번호", "생년월일", "주민번호"],
        "workerPhone": ["근로자연락처", "휴대폰", "연락처"],
        "workerAddr": ["주소", "거주지", "근로자주소"],
        "startDate": ["근로개시일", "근로기간", "계약기간"],
        "workPlace": ["근무장소", "취업장소", "근무지"],
        "jobDesc": ["업무내용", "종사할업무", "직무내용", "담당업무"],
        "wage": ["시급", "임금", "기본급", "월급", "일급"]
    }
    
    # 각 바운딩 박스를 순회하며 기하학 매핑 우선 적용
    for box, (text, conf) in flat_results:
        clean_text = text.replace(" ", "").replace(":", "").replace("-", "")
        
        # 1. 상호명 (biz)
        if any(k in clean_text for k in keywords["biz"]) and not extracted["biz"]:
            inline_val = get_inline_value(text, keywords["biz"])
            neighbor_val = find_right_neighbor(box, flat_results)
            val = (inline_val + " " + neighbor_val).strip() if (inline_val or neighbor_val) else find_bottom_neighbor(box, flat_results)
            if val: 
                # (갑) 등 수식어 및 앞뒤 기호 제거
                extracted["biz"] = re.sub(r'\(갑\)', '', val).strip(" :.-()=갑").strip()
            
        # 2. 사업자번호 (bizRegNo)
        if any(k in clean_text for k in keywords["bizRegNo"]) and not extracted["bizRegNo"]:
            inline_val = get_inline_value(text, keywords["bizRegNo"])
            neighbor_val = find_right_neighbor(box, flat_results)
            val = (inline_val + " " + neighbor_val).strip() if (inline_val or neighbor_val) else find_bottom_neighbor(box, flat_results)
            if val:
                matches = re.findall(r'\d{3}-\d{2}-\d{5}|\d{10}', val)
                if matches: extracted["bizRegNo"] = matches[0]
                
        # 3. 대표자명 (ceo)
        if any(k in clean_text for k in keywords["ceo"]) and not extracted["ceo"]:
            inline_val = get_inline_value(text, keywords["ceo"])
            neighbor_val = find_right_neighbor(box, flat_results)
            val = (inline_val + " " + neighbor_val).strip() if (inline_val or neighbor_val) else find_bottom_neighbor(box, flat_results)
            if val:
                extracted["ceo"] = val.replace(" ", "").replace("(인)", "").replace(":", "").strip(" :.-()=갑").strip()
                
        # 4. 사업장 주소 (bizAddr)
        if any(k in clean_text for k in keywords["bizAddr"]) and not extracted["bizAddr"]:
            inline_val = get_inline_value(text, keywords["bizAddr"])
            neighbor_val = find_right_neighbor(box, flat_results, max_x_dist=450)
            val = (inline_val + " " + neighbor_val).strip() if (inline_val or neighbor_val) else find_bottom_neighbor(box, flat_results)
            if val: extracted["bizAddr"] = val.strip()
            
        # 5. 근로자명 (worker)
        if any(k in clean_text for k in keywords["worker"]) and not extracted["worker"]:
            if "대표" not in clean_text and "사업" not in clean_text:
                inline_val = get_inline_value(text, keywords["worker"])
                neighbor_val = find_right_neighbor(box, flat_results)
                val = (inline_val + " " + neighbor_val).strip() if (inline_val or neighbor_val) else find_bottom_neighbor(box, flat_results)
                if val: 
                    extracted["worker"] = val.replace(" ", "").replace("(인)", "").replace(":", "").strip(" :.-()=을").strip()
                
        # 6. 근로자 생년월일 (workerBirth)
        if any(k in clean_text for k in keywords["workerBirth"]) and not extracted["workerBirth"]:
            inline_val = get_inline_value(text, keywords["workerBirth"])
            neighbor_val = find_right_neighbor(box, flat_results)
            val = (inline_val + " " + neighbor_val).strip() if (inline_val or neighbor_val) else find_bottom_neighbor(box, flat_results)
            if val:
                only_digits = re.sub(r'[^\d]', '', val)
                if len(only_digits) >= 6:
                    raw_num = only_digits[:6]
                    extracted["workerBirth"] = f"{raw_num[:2]}. {raw_num[2:4]}. {raw_num[4:6]}"
                    
        # 7. 근로자 주소 (workerAddr)
        if any(k in clean_text for k in keywords["workerAddr"]) and not extracted["workerAddr"]:
            if "사업" not in clean_text and "소재지" not in clean_text:
                inline_val = get_inline_value(text, keywords["workerAddr"])
                neighbor_val = find_right_neighbor(box, flat_results, max_x_dist=450)
                val = (inline_val + " " + neighbor_val).strip() if (inline_val or neighbor_val) else find_bottom_neighbor(box, flat_results)
                if val: extracted["workerAddr"] = val.strip()
                
        # 8. 근무장소 (workPlace)
        if any(k in clean_text for k in keywords["workPlace"]) and not extracted["workPlace"]:
            inline_val = get_inline_value(text, keywords["workPlace"])
            neighbor_val = find_right_neighbor(box, flat_results)
            val = (inline_val + " " + neighbor_val).strip() if (inline_val or neighbor_val) else find_bottom_neighbor(box, flat_results)
            if val: extracted["workPlace"] = val.strip()
            
        # 9. 업무내용 (jobDesc)
        if any(k in clean_text for k in keywords["jobDesc"]) and not extracted["jobDesc"]:
            inline_val = get_inline_value(text, keywords["jobDesc"])
            neighbor_val = find_right_neighbor(box, flat_results, max_x_dist=400)
            val = (inline_val + " " + neighbor_val).strip() if (inline_val or neighbor_val) else find_bottom_neighbor(box, flat_results)
            if val: extracted["jobDesc"] = val.strip()
            
        # 10. 임금 금액 및 유형 (wage / wageType)
        if any(k in clean_text for k in keywords["wage"]) and not extracted["wage"]:
            if "월급" in text or "월" in text:
                extracted["wageType"] = "month"
            elif "일급" in text or "일" in text:
                extracted["wageType"] = "day"
            else:
                extracted["wageType"] = "hour"
            
            val = get_inline_value(text, keywords["wage"]) or find_right_neighbor(box, flat_results) or text
            if val:
                # 숫자만 남기고 모든 콤마, 공백, 원 기호 제거
                digits = re.sub(r'[^\d]', '', val)
                if digits:
                    extracted["wage"] = digits


    # ── 5. 정규식을 활용한 정교한 텍스트 패턴 추출 (Fallback 포함) ──
    
    # A. 연락처 추출 (01X-XXXX-XXXX)
    phones = re.findall(r'01[0-9]-?\d{3,4}-?\d{4}', full_text)
    if phones:
        if len(phones) >= 2:
            extracted["ceoPhone"] = phones[0]
            extracted["workerPhone"] = phones[1]
        else:
            extracted["workerPhone"] = phones[0]
            
    # B. 시간대 매칭 (순차 추출법: 한글 근로계약서 양식 다변화 대응)
    # 예: "09시 00분부터 18시 00분까지" 또는 "09:00 ~ 18:00"에서 시간 패턴 순차 획득
    times = re.findall(r'(\d{1,2})\s*[:시]\s*(\d{2})?', full_text)
    if times:
        time_strs = []
        for hr, mn in times:
            m = mn if mn else "00"
            time_strs.append(f"{int(hr):02d}:{m}")
            
        # 순서대로 꽂아 넣음
        if len(time_strs) >= 1:
            extracted["workStart"] = time_strs[0]
        if len(time_strs) >= 2:
            extracted["workEnd"] = time_strs[1]
        if len(time_strs) >= 4:
            # 3, 4번째 시간대가 모두 존재할 경우 휴게시간으로 오버라이트
            extracted["breakStart"] = time_strs[2]
            extracted["breakEnd"] = time_strs[3]


    # C. 날짜 매칭 (시작일, 종료일, 계약일)
    # 예: 2026.07.10 / 2026년 07월 10일
    date_matches = re.findall(r'(\d{4})\s*[년\.\-]\s*(\d{1,2})\s*[월\.\-]\s*(\d{1,2})', full_text)
    if date_matches:
        formatted_dates = []
        for year, month, day in date_matches:
            formatted_dates.append(f"{year}-{int(month):02d}-{int(day):02d}")
            
        if len(formatted_dates) >= 1:
            extracted["startDate"] = formatted_dates[0]
        if len(formatted_dates) >= 2:
            extracted["contractDate"] = formatted_dates[-1] # 일반적으로 맨 밑에 있는 날짜가 서명(계약)일
            if len(formatted_dates) >= 3:
                extracted["endDate"] = formatted_dates[1]
                
    # D. 근무요일 파싱 (월/화/수/목/금/토/일 매칭)
    days = re.findall(r'[월화수목금토일]\s*요일|[월화수목금토일]', full_text)
    if days:
        unique_days = []
        for d in days:
            day_char = d[0]
            if day_char not in unique_days and day_char != "주": # '주'는 '매주' 등에서 제외
                unique_days.append(day_char)
        if unique_days:
            # 순서 보장을 위해 정렬
            week_order = {w: i for i, w in enumerate(["월", "화", "수", "목", "금", "토", "일"])}
            unique_days.sort(key=lambda x: week_order.get(x, 10))
            extracted["workDaysText"] = ", ".join(unique_days)
            
    # E. 임금(시급) Fallback (키워드가 깨졌거나 단독 숫자로만 검출된 경우 복구)
    print("[DEBUG Fallback] current wage status:", repr(extracted["wage"]), flush=True)
    if not extracted["wage"]:
        # 1) 전체 텍스트에서 '시급/임금/급 20,000' 형태의 패턴 획득 시도
        wage_candidates = re.findall(r'(?:시급|임금|기본급|금액|급)\s*[:\-\=]?\s*([0-9]{1,3}(?:,[0-9]{3})*|[0-9]{4,6})', full_text)
        if wage_candidates:
            extracted["wage"] = re.sub(r'[^\d]', '', wage_candidates[0])
            print("[DEBUG Fallback] Found wage via candidates:", extracted["wage"], flush=True)
        else:
            # 2) 날짜, 사업자등록번호, 연락처 등 대형 고유정보 번호들을 필터링하여 혼선 방지
            clean_for_wage = full_text
            clean_for_wage = re.sub(r'\d{3}-\d{2}-\d{5}|\d{10}', '', clean_for_wage)  # 사업자번호 제거
            clean_for_wage = re.sub(r'01[0-9]-?\d{3,4}-?\d{4}', '', clean_for_wage)  # 연락처 제거
            clean_for_wage = re.sub(r'\d{4}\s*[년\.\-]\s*\d{1,2}\s*[월\.\-]\s*\d{1,2}', '', clean_for_wage)  # 날짜 제거
            
            all_numbers = re.findall(r'\d{4,5}', clean_for_wage)
            print("[DEBUG Fallback] clean_for_wage numbers found:", all_numbers, flush=True)
            for num in all_numbers:
                val_num = int(num)
                if 9000 <= val_num <= 50000:
                    extracted["wage"] = num
                    print("[DEBUG Fallback] Selected wage:", num, flush=True)
                    break
            else:
                print("[DEBUG Fallback] No candidate satisfied the range 9000~50000", flush=True)

    # ── 6. 추출된 모든 필드에 대한 좌표 역추적 매칭 ──
    for key, val in extracted.items():
        if not val:
            continue
        clean_val = re.sub(r'[^\w\d]', '', str(val))
        if not clean_val:
            continue
        for box, (text, conf) in flat_results:
            clean_txt = re.sub(r'[^\w\d]', '', text)
            if clean_val in clean_txt:
                extracted_boxes[key] = get_bbox_coords(box)
                break

    return extracted, extracted_boxes

# ── 5. FastAPI 엔드포인트 구현 ──────────────────────────────────
@app.post("/api/v1/ocr")
async def perform_ocr(file: UploadFile = File(...)):
    # 파일 확장자 검증
    ext = os.path.splitext(file.filename)[-1].lower()
    if ext not in [".jpg", ".jpeg", ".png", ".webp"]:
        raise HTTPException(status_code=400, detail="Only image files (JPG, PNG, WEBP) are supported.")
        
    try:
        image_bytes = await file.read()
        
        # PIL 이미지 객체로 열어 해상도 정보 획득
        from PIL import Image
        import io
        img_pil = Image.open(io.BytesIO(image_bytes))
        width, height = img_pil.size
        
        # 1. 이미지 전처리
        processed_img = preprocess_image(image_bytes)
        
        # 2. 임시 파일로 저장 (PaddleOCR의 내부 OpenCV 경로 입력 호환 목적)
        temp_filename = "temp_processing_ocr.jpg"
        cv2.imwrite(temp_filename, processed_img)
        
        # 3. PaddleOCR 추론 수행
        raw_result = ocr.ocr(temp_filename, cls=True)
        
        # 임시 파일 즉시 청소
        if os.path.exists(temp_filename):
            os.remove(temp_filename)
            
        # 4. 규칙 및 좌표 기반 파싱 수행
        if not raw_result or raw_result[0] is None:
            parsed_data = {}
            boxes_data = {}
            raw_text = ""
        else:
            flat_results = raw_result[0]
            raw_text = "\n".join([line[1][0] for line in flat_results])
            parsed_data, boxes_data = parse_contract_rules(flat_results, raw_text)
            
        return {
            "success": True,
            "data": parsed_data,
            "boxes": boxes_data,
            "image_size": {
                "width": width,
                "height": height
            },
            "raw_text": raw_text
        }
        
    except Exception as e:
        # 에러 발생 시 파일 흔적 제거 보장
        if os.path.exists("temp_processing_ocr.jpg"):
            os.remove("temp_processing_ocr.jpg")
        raise HTTPException(status_code=500, detail=f"OCR Processing failed: {str(e)}")

# 로컬 단독 구동 테스트용 메인 진입
if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app:app", host="127.0.0.1", port=8000, reload=True)
