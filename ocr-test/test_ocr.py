import sys
import os
import logging

# OneDNN CPU 가속 및 PIR API 에러 방지를 위해 비활성화
os.environ["FLAGS_use_onednn"] = "0"
os.environ["FLAGS_enable_pir_api"] = "0"
os.environ["PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK"] = "True"  # 연결 확인 시간 단축


# PaddleOCR 내부 로그 레벨 조정 (출력이 지저분해지는 것 방지)
logging.getLogger("ppocr").setLevel(logging.WARNING)

try:
    from paddleocr import PaddleOCR
except ImportError as e:
    print(f"Failed to import PaddleOCR: {e}")
    sys.exit(1)

# PaddleOCR 인스턴스 초기화
# use_angle_cls=True: 텍스트 방향 분류기 사용
# lang='ko': 한국어 모델 사용
print("Initializing PaddleOCR...")
ocr = PaddleOCR(use_angle_cls=True, lang='korean')

# 테스트 이미지 경로 지정
img_path = sys.argv[1] if len(sys.argv) > 1 else 'sample.jpg'

if not os.path.exists(img_path):
    print(f"Error: '{img_path}' file not found.")
    sys.exit(1)

print(f"Performing OCR on: {img_path}")
try:
    # OCR 수행
    result = ocr.ocr(img_path, cls=True)
except Exception as e:
    print(f"OCR execution failed: {e}")
    sys.exit(1)

print("\n=== OCR DETECTION RESULTS ===")
with open("ocr_result.txt", "w", encoding="utf-8") as f:
    f.write("=== OCR DETECTION RESULTS ===\n")
    if not result or result[0] is None:
        print("No text detected.")
        f.write("No text detected.\n")
    else:
        for line in result[0]:
            box = line[0]           # 텍스트 사각형 영역 좌표
            text = line[1][0]        # 검출된 텍스트
            confidence = line[1][1]  # 신뢰도 (0 ~ 1)
            print(f"Text: [{text}] (Confidence: {confidence:.4f})")
            f.write(f"Text: [{text}] (Confidence: {confidence:.4f})\n")



