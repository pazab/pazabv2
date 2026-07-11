import os
import re
import cv2
import numpy as np
import logging
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import easyocr

logging.basicConfig(level=logging.WARNING)

app = FastAPI(title="Pazab OCR Daemon Service", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# EasyOCR 한국어 + 영어 모델 초기화 (숫자/영문 혼합 계약서 대응)
reader = easyocr.Reader(["ko", "en"], gpu=False)

# ── 이미지 전처리 ──────────────────────────────────────────────
def preprocess_image(image_bytes: bytes) -> np.ndarray:
    """
    밝기 기반으로 전처리 강도를 자동 조절.
    - 잘 찍힌 사진(밝기 높음): 원본 컬러 그대로 반환 → EasyOCR 자체 전처리가 더 나음
    - 어둡거나 흐린 사진: CLAHE 대비 강화 후 반환
    """
    nparr = np.frombuffer(image_bytes, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    if img is None:
        raise ValueError("Image decoding failed.")

    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    h, w = gray.shape[:2]

    # 해상도가 너무 작으면 확대 (OCR 정확도 보강)
    if h < 1000 or w < 1000:
        img = cv2.resize(img, (w * 2, h * 2), interpolation=cv2.INTER_CUBIC)
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

    mean_brightness = np.mean(gray)

    if mean_brightness > 140:
        # 잘 찍힌 사진 → 원본 컬러 그대로 (EasyOCR 내부 전처리 활용)
        return img
    else:
        # 어둡거나 저조도 → CLAHE 대비 강화 (adaptive thresholding 대신)
        clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
        enhanced = clahe.apply(gray)
        return cv2.cvtColor(enhanced, cv2.COLOR_GRAY2BGR)


# ── BBox 유틸 ─────────────────────────────────────────────────
def get_bbox_coords(bbox) -> list[int]:
    """EasyOCR bbox: [[x0,y0],[x1,y0],[x1,y1],[x0,y1]]"""
    xs = [pt[0] for pt in bbox]
    ys = [pt[1] for pt in bbox]
    return [int(min(xs)), int(min(ys)), int(max(xs)), int(max(ys))]


# ── 기하학 매핑 헬퍼 ──────────────────────────────────────────
def find_right_neighbor(keyword_bbox, all_results, max_y_diff=35, max_x_dist=450):
    kx1, ky1 = keyword_bbox[0]
    kx2, ky2 = keyword_bbox[2]
    k_center_y = (ky1 + ky2) / 2
    k_height = ky2 - ky1
    actual_y_diff = max(max_y_diff, k_height * 0.95)

    candidates = []
    for bbox, text, conf in all_results:
        bx1, by1 = bbox[0]
        bx2, by2 = bbox[2]
        if bx1 == kx1 and by1 == ky1:
            continue
        b_center_y = (by1 + by2) / 2
        if abs(k_center_y - b_center_y) < actual_y_diff:
            if bx1 >= (kx2 - 15) and (bx1 - kx2) < max_x_dist:
                candidates.append((bx1, text))

    if not candidates:
        return ""
    candidates.sort(key=lambda x: x[0])
    return " ".join([c[1] for c in candidates])


def find_bottom_neighbor(keyword_bbox, all_results, max_x_diff=40, max_y_dist=150):
    kx1, ky1 = keyword_bbox[0]
    kx2, ky2 = keyword_bbox[2]
    k_center_x = (kx1 + kx2) / 2

    best_candidate = None
    min_dist = float("inf")
    for bbox, text, conf in all_results:
        bx1, by1 = bbox[0]
        bx2, by2 = bbox[2]
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


def get_inline_value(text: str, keywords: list) -> str:
    for kw in keywords:
        if kw in text:
            parts = text.split(kw)
            if len(parts) > 1:
                val = parts[-1].strip(" :.-()=갑을")
                if val:
                    return val
    return ""


# ── 규칙 기반 파서 ────────────────────────────────────────────
def parse_contract_rules(flat_results, full_text) -> tuple[dict, dict]:
    """
    EasyOCR 결과 형식: [(bbox, text, conf), ...]
    """
    extracted: dict[str, str] = {
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
        "contractDate": "",
    }
    extracted_boxes: dict[str, list[int]] = {}

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
        "wage": ["시급", "임금", "기본급", "월급", "일급"],
    }

    for bbox, text, conf in flat_results:
        clean_text = text.replace(" ", "").replace(":", "").replace("-", "")

        if any(k in clean_text for k in keywords["biz"]) and not extracted["biz"]:
            inline_val = get_inline_value(text, keywords["biz"])
            neighbor_val = find_right_neighbor(bbox, flat_results)
            val = (inline_val + " " + neighbor_val).strip() or find_bottom_neighbor(bbox, flat_results) or ""
            if val:
                extracted["biz"] = re.sub(r"\(갑\)", "", val).strip(" :.-()=갑")

        if any(k in clean_text for k in keywords["bizRegNo"]) and not extracted["bizRegNo"]:
            inline_val = get_inline_value(text, keywords["bizRegNo"])
            neighbor_val = find_right_neighbor(bbox, flat_results)
            val = (inline_val + " " + neighbor_val).strip() or find_bottom_neighbor(bbox, flat_results) or ""
            if val:
                matches = re.findall(r"\d{3}-\d{2}-\d{5}|\d{10}", val)
                if matches:
                    extracted["bizRegNo"] = matches[0]

        if any(k in clean_text for k in keywords["ceo"]) and not extracted["ceo"]:
            inline_val = get_inline_value(text, keywords["ceo"])
            neighbor_val = find_right_neighbor(bbox, flat_results)
            val = (inline_val + " " + neighbor_val).strip() or find_bottom_neighbor(bbox, flat_results) or ""
            if val:
                extracted["ceo"] = val.replace(" ", "").replace("(인)", "").replace(":", "").strip(" :.-()=갑")

        if any(k in clean_text for k in keywords["bizAddr"]) and not extracted["bizAddr"]:
            inline_val = get_inline_value(text, keywords["bizAddr"])
            neighbor_val = find_right_neighbor(bbox, flat_results, max_x_dist=450)
            val = (inline_val + " " + neighbor_val).strip() or find_bottom_neighbor(bbox, flat_results) or ""
            if val:
                extracted["bizAddr"] = val.strip()

        if any(k in clean_text for k in keywords["worker"]) and not extracted["worker"]:
            if "대표" not in clean_text and "사업" not in clean_text:
                inline_val = get_inline_value(text, keywords["worker"])
                neighbor_val = find_right_neighbor(bbox, flat_results)
                val = (inline_val + " " + neighbor_val).strip() or find_bottom_neighbor(bbox, flat_results) or ""
                if val:
                    extracted["worker"] = val.replace(" ", "").replace("(인)", "").replace(":", "").strip(" :.-()=을")

        if any(k in clean_text for k in keywords["workerBirth"]) and not extracted["workerBirth"]:
            inline_val = get_inline_value(text, keywords["workerBirth"])
            neighbor_val = find_right_neighbor(bbox, flat_results)
            val = (inline_val + " " + neighbor_val).strip() or find_bottom_neighbor(bbox, flat_results) or ""
            if val:
                only_digits = re.sub(r"[^\d]", "", val)
                if len(only_digits) >= 6:
                    raw_num = only_digits[:6]
                    extracted["workerBirth"] = f"{raw_num[:2]}. {raw_num[2:4]}. {raw_num[4:6]}"

        if any(k in clean_text for k in keywords["workerAddr"]) and not extracted["workerAddr"]:
            if "사업" not in clean_text and "소재지" not in clean_text:
                inline_val = get_inline_value(text, keywords["workerAddr"])
                neighbor_val = find_right_neighbor(bbox, flat_results, max_x_dist=450)
                val = (inline_val + " " + neighbor_val).strip() or find_bottom_neighbor(bbox, flat_results) or ""
                if val:
                    extracted["workerAddr"] = val.strip()

        if any(k in clean_text for k in keywords["workPlace"]) and not extracted["workPlace"]:
            inline_val = get_inline_value(text, keywords["workPlace"])
            neighbor_val = find_right_neighbor(bbox, flat_results)
            val = (inline_val + " " + neighbor_val).strip() or find_bottom_neighbor(bbox, flat_results) or ""
            if val:
                extracted["workPlace"] = val.strip()

        if any(k in clean_text for k in keywords["jobDesc"]) and not extracted["jobDesc"]:
            inline_val = get_inline_value(text, keywords["jobDesc"])
            neighbor_val = find_right_neighbor(bbox, flat_results, max_x_dist=400)
            val = (inline_val + " " + neighbor_val).strip() or find_bottom_neighbor(bbox, flat_results) or ""
            if val:
                extracted["jobDesc"] = val.strip()

        if any(k in clean_text for k in keywords["wage"]) and not extracted["wage"]:
            if "월급" in text or "월" in text:
                extracted["wageType"] = "month"
            elif "일급" in text or "일" in text:
                extracted["wageType"] = "day"
            else:
                extracted["wageType"] = "hour"
            val = get_inline_value(text, keywords["wage"]) or find_right_neighbor(bbox, flat_results) or text
            if val:
                digits = re.sub(r"[^\d]", "", val)
                if digits:
                    extracted["wage"] = digits

    # ── 정규식 Fallback ────────────────────────────────────────

    # 연락처: 키워드 근접 박스에서 먼저 찾고, 없으면 순서 기반 폴백
    phone_assigned: dict[str, str] = {}
    for bbox, text, conf in flat_results:
        clean = text.replace(" ", "")
        phone_match = re.search(r"01[0-9]-?\d{3,4}-?\d{4}", clean)
        if not phone_match:
            continue
        phone = phone_match.group()
        phone_center_y = (bbox[0][1] + bbox[2][1]) / 2
        ctx = " ".join([t for inner_bbox, t, _ in flat_results
                        if abs(phone_center_y - (inner_bbox[0][1] + inner_bbox[2][1]) / 2) < 60])
        if any(k in ctx for k in ["사업주", "대표자", "사용자"]) and "ceoPhone" not in phone_assigned:
            phone_assigned["ceoPhone"] = phone
        elif "workerPhone" not in phone_assigned:
            phone_assigned["workerPhone"] = phone

    # 키워드 미매칭 시 단순 순서 폴백
    all_phones = re.findall(r"01[0-9]-?\d{3,4}-?\d{4}", full_text)
    if "ceoPhone" not in phone_assigned and len(all_phones) >= 1:
        phone_assigned["ceoPhone"] = all_phones[0]
    if "workerPhone" not in phone_assigned and len(all_phones) >= 2:
        phone_assigned["workerPhone"] = all_phones[1]

    extracted.update(phone_assigned)

    # 시간: "부터/까지" 맥락 우선, 없으면 순서 폴백
    workstart_match = re.search(r"(\d{1,2})\s*[:시]\s*(\d{2})?\s*(?:분?\s*부터|~)", full_text)
    workend_match = re.search(r"(\d{1,2})\s*[:시]\s*(\d{2})?\s*(?:분?\s*까지)", full_text)
    if workstart_match:
        h, m = workstart_match.group(1), workstart_match.group(2) or "00"
        extracted["workStart"] = f"{int(h):02d}:{m}"
    if workend_match:
        h, m = workend_match.group(1), workend_match.group(2) or "00"
        extracted["workEnd"] = f"{int(h):02d}:{m}"

    if not extracted["workStart"] or not extracted["workEnd"]:
        times = re.findall(r"(\d{1,2})\s*[:시]\s*(\d{2})?", full_text)
        time_strs = [f"{int(h):02d}:{m if m else '00'}" for h, m in times]
        if not extracted["workStart"] and len(time_strs) >= 1:
            extracted["workStart"] = time_strs[0]
        if not extracted["workEnd"] and len(time_strs) >= 2:
            extracted["workEnd"] = time_strs[1]
        if len(time_strs) >= 4:
            extracted["breakStart"] = time_strs[2]
            extracted["breakEnd"] = time_strs[3]

    # 날짜: 키워드 근접도 우선
    date_pattern = r"(\d{4})\s*[년\.\-]\s*(\d{1,2})\s*[월\.\-]\s*(\d{1,2})"
    all_dates_raw = list(re.finditer(date_pattern, full_text))
    all_dates = [f"{y}-{int(m):02d}-{int(d):02d}" for y, m, d in
                 [match.groups() for match in all_dates_raw]]

    # 근로기간/근로개시일 키워드 이후 첫 날짜 → startDate
    start_ctx = re.search(r"(?:근로개시일|근로기간|계약기간)[^\n]{0,30}?" + date_pattern, full_text)
    if start_ctx:
        y, m, d = start_ctx.group(1), start_ctx.group(2), start_ctx.group(3)
        extracted["startDate"] = f"{y}-{int(m):02d}-{int(d):02d}"
    elif all_dates:
        extracted["startDate"] = all_dates[0]

    if len(all_dates) >= 2:
        extracted["contractDate"] = all_dates[-1]
        if len(all_dates) >= 3:
            extracted["endDate"] = all_dates[1]

    # 근무요일
    days = re.findall(r"[월화수목금토일]\s*요일|[월화수목금토일]", full_text)
    week_order = {w: i for i, w in enumerate(["월", "화", "수", "목", "금", "토", "일"])}
    unique_days: list[str] = []
    for d in days:
        ch = d[0]
        if ch not in unique_days and ch != "주":
            unique_days.append(ch)
    if unique_days:
        unique_days.sort(key=lambda x: week_order.get(x, 10))
        extracted["workDaysText"] = ", ".join(unique_days)

    # 임금 Fallback — wageType별 범위 분기
    if not extracted["wage"]:
        wage_ranges = {"hour": (9000, 50000), "day": (50000, 500000), "month": (1500000, 10000000)}
        lo, hi = wage_ranges.get(extracted["wageType"], (9000, 50000))

        wage_candidates = re.findall(
            r"(?:시급|임금|기본급|금액|급)\s*[:\-\=]?\s*([0-9]{1,3}(?:,[0-9]{3})*|[0-9]{4,8})",
            full_text,
        )
        if wage_candidates:
            extracted["wage"] = re.sub(r"[^\d]", "", wage_candidates[0])
        else:
            clean = re.sub(r"\d{3}-\d{2}-\d{5}|\d{10}", "", full_text)
            clean = re.sub(r"01[0-9]-?\d{3,4}-?\d{4}", "", clean)
            clean = re.sub(date_pattern, "", clean)
            for num in re.findall(r"\d{4,8}", clean):
                if lo <= int(num) <= hi:
                    extracted["wage"] = num
                    break

    # BBox 역추적
    for key, val in extracted.items():
        if not val:
            continue
        clean_val = re.sub(r"[^\w\d]", "", str(val))
        if not clean_val:
            continue
        for bbox, text, conf in flat_results:
            clean_txt = re.sub(r"[^\w\d]", "", text)
            if clean_val in clean_txt:
                extracted_boxes[key] = get_bbox_coords(bbox)
                break

    return extracted, extracted_boxes


# ── FastAPI 엔드포인트 ─────────────────────────────────────────
@app.post("/api/v1/ocr")
async def perform_ocr(file: UploadFile = File(...)):
    ext = os.path.splitext(file.filename)[-1].lower()
    if ext not in [".jpg", ".jpeg", ".png", ".webp"]:
        raise HTTPException(status_code=400, detail="Only image files (JPG, PNG, WEBP) are supported.")

    try:
        image_bytes = await file.read()

        from PIL import Image
        import io
        img_pil = Image.open(io.BytesIO(image_bytes))
        width, height = img_pil.size

        processed_img = preprocess_image(image_bytes)

        # EasyOCR은 numpy array 직접 입력 지원
        raw_result = reader.readtext(processed_img)
        # raw_result: [(bbox, text, conf), ...]

        if not raw_result:
            return {
                "success": True,
                "data": {},
                "boxes": {},
                "image_size": {"width": width, "height": height},
                "raw_text": "",
            }

        raw_text = "\n".join([text for _, text, _ in raw_result])
        parsed_data, boxes_data = parse_contract_rules(raw_result, raw_text)

        return {
            "success": True,
            "data": parsed_data,
            "boxes": boxes_data,
            "image_size": {"width": width, "height": height},
            "raw_text": raw_text,
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"OCR Processing failed: {str(e)}")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app:app", host="127.0.0.1", port=8000, reload=True)
