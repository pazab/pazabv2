"""
PaddleOCR vs EasyOCR 한국어 계약서 인식률 비교 스크립트

사용법:
    python compare_ocr.py <이미지경로>
    python compare_ocr.py sample.jpg

출력:
    - 콘솔: 두 엔진의 raw 텍스트 나란히 출력
    - compare_result.txt: 전체 비교 결과 저장
"""
import sys
import os
import time
import logging

os.environ["FLAGS_use_onednn"] = "0"
os.environ["FLAGS_enable_pir_api"] = "0"
os.environ["PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK"] = "True"
logging.getLogger("ppocr").setLevel(logging.WARNING)

img_path = sys.argv[1] if len(sys.argv) > 1 else "sample.jpg"

if not os.path.exists(img_path):
    print(f"[ERROR] 이미지 파일 없음: {img_path}")
    print("사용법: python compare_ocr.py <이미지경로>")
    sys.exit(1)

SEPARATOR = "=" * 60

# ── PaddleOCR 실행 ─────────────────────────────────────────────
paddle_lines = []
paddle_error = None
try:
    from paddleocr import PaddleOCR
    import cv2
    import numpy as np

    def preprocess(path: str) -> str:
        img = cv2.imread(path)
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        h, w = gray.shape[:2]
        if h < 1000 or w < 1000:
            gray = cv2.resize(gray, (w * 2, h * 2), interpolation=cv2.INTER_CUBIC)
        processed = cv2.adaptiveThreshold(
            gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, 15, 4
        )
        tmp = "_tmp_paddle.jpg"
        cv2.imwrite(tmp, processed)
        return tmp

    print("[PaddleOCR] 초기화 중...")
    t0 = time.time()
    ocr = PaddleOCR(use_angle_cls=True, lang="korean")
    tmp_path = preprocess(img_path)
    result = ocr.ocr(tmp_path, cls=True)
    if os.path.exists(tmp_path):
        os.remove(tmp_path)
    paddle_elapsed = time.time() - t0

    if result and result[0]:
        for line in result[0]:
            text = line[1][0]
            conf = line[1][1]
            paddle_lines.append((text, conf))
    print(f"[PaddleOCR] 완료 ({paddle_elapsed:.1f}s), {len(paddle_lines)}개 박스 검출")

except Exception as e:
    paddle_error = str(e)
    print(f"[PaddleOCR] 실패: {e}")

# ── EasyOCR 실행 ───────────────────────────────────────────────
easy_lines = []
easy_error = None
try:
    import easyocr

    print("[EasyOCR] 초기화 중... (첫 실행 시 모델 다운로드 있을 수 있음)")
    t0 = time.time()
    reader = easyocr.Reader(["ko", "en"], gpu=False)
    result = reader.readtext(img_path)
    easy_elapsed = time.time() - t0

    for (bbox, text, conf) in result:
        easy_lines.append((text, conf))
    print(f"[EasyOCR] 완료 ({easy_elapsed:.1f}s), {len(easy_lines)}개 박스 검출")

except ImportError:
    easy_error = "easyocr 미설치. 설치 명령: pip install easyocr"
    print(f"[EasyOCR] {easy_error}")
except Exception as e:
    easy_error = str(e)
    print(f"[EasyOCR] 실패: {e}")

# ── 결과 출력 ──────────────────────────────────────────────────
lines_out = []

def out(s=""):
    print(s)
    lines_out.append(s)

out()
out(SEPARATOR)
out(f"비교 대상 이미지: {img_path}")
out(SEPARATOR)

# PaddleOCR 결과
out()
out("[ PaddleOCR (현재) ]")
out("-" * 40)
if paddle_error:
    out(f"  오류: {paddle_error}")
else:
    out(f"  검출 박스 수: {len(paddle_lines)}")
    out(f"  소요 시간:    {paddle_elapsed:.1f}s")
    out()
    out("  ▼ 전체 raw 텍스트 (신뢰도 순)")
    for text, conf in sorted(paddle_lines, key=lambda x: -x[1]):
        marker = "⚠️ " if conf < 0.7 else "   "
        out(f"  {marker}[{conf:.2f}] {text}")
    out()
    out("  ▼ 붙여쓰기 (full_text)")
    out("  " + " ".join([t for t, _ in paddle_lines]))

out()
out(SEPARATOR)

# EasyOCR 결과
out()
out("[ EasyOCR (대안) ]")
out("-" * 40)
if easy_error:
    out(f"  오류: {easy_error}")
else:
    out(f"  검출 박스 수: {len(easy_lines)}")
    out(f"  소요 시간:    {easy_elapsed:.1f}s")
    out()
    out("  ▼ 전체 raw 텍스트 (신뢰도 순)")
    for text, conf in sorted(easy_lines, key=lambda x: -x[1]):
        marker = "⚠️ " if conf < 0.7 else "   "
        out(f"  {marker}[{conf:.2f}] {text}")
    out()
    out("  ▼ 붙여쓰기 (full_text)")
    out("  " + " ".join([t for t, _ in easy_lines]))

out()
out(SEPARATOR)

# 저신뢰도 비교 요약
if not paddle_error and not easy_error:
    p_low = sum(1 for _, c in paddle_lines if c < 0.7)
    e_low = sum(1 for _, c in easy_lines if c < 0.7)
    out()
    out("[ 신뢰도 0.7 미만 박스 비교 ]")
    out(f"  PaddleOCR : {p_low}/{len(paddle_lines)} 개  {'← 더 많음 (불안정)' if p_low > e_low else ''}")
    out(f"  EasyOCR   : {e_low}/{len(easy_lines)} 개  {'← 더 많음 (불안정)' if e_low > p_low else ''}")
    out()
    if p_low > e_low:
        out("  → EasyOCR가 더 안정적으로 보임")
    elif e_low > p_low:
        out("  → PaddleOCR가 더 안정적으로 보임")
    else:
        out("  → 신뢰도 분포 유사, 전체 텍스트 내용으로 판단 필요")

out()
out(SEPARATOR)

# 파일 저장
out_file = "compare_result.txt"
with open(out_file, "w", encoding="utf-8") as f:
    f.write("\n".join(lines_out))

print()
print(f"결과 저장됨: {out_file}")
