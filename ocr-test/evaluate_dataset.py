import os
import json
import time
import requests

url = "http://127.0.0.1:8000/api/v1/ocr"
dataset_dir = "test_dataset"
gt_path = os.path.join(dataset_dir, "ground_truth.json")

if not os.path.exists(gt_path):
    print(f"Error: {gt_path} not found. Please run generate_dataset.py first.")
    exit(1)

with open(gt_path, "r", encoding="utf-8") as f:
    ground_truth = json.load(f)

# 평가할 핵심 필드 정의
evaluate_keys = [
    "biz", "bizRegNo", "ceo", "ceoPhone", "bizAddr", 
    "worker", "workerBirth", "workerPhone", "workerAddr", 
    "startDate", "workPlace", "jobDesc", "workStart", 
    "workEnd", "workDaysText", "wage", "contractDate"
]

# 필드별 매치 횟수 누적
match_stats = {k: {"correct": 0, "total": 0} for k in evaluate_keys}
total_images = len(ground_truth)

print(f"Evaluating {total_images} contract images against rules-based OCR parser...")
start_time = time.time()

# 1. 루프를 돌며 API 호출 및 평가
for idx, (img_name, expected) in enumerate(ground_truth.items(), 1):
    img_path = os.path.join(dataset_dir, img_name)
    if not os.path.exists(img_path):
        continue
        
    try:
        # API 호출
        with open(img_path, "rb") as f:
            files = {"file": (img_name, f, "image/jpeg")}
            response = requests.post(url, files=files, timeout=30)
            
        if response.status_code != 200:
            print(f"[{idx}/{total_images}] {img_name}: Failed with status {response.status_code}")
            continue
            
        actual = response.json().get("data", {})
        
        # 각 필드별 정확성 판정
        import unicodedata
        for key in evaluate_keys:
            exp_val = unicodedata.normalize('NFC', str(expected.get(key, "")).strip().replace(" ", "").replace(":", ""))
            act_val = unicodedata.normalize('NFC', str(actual.get(key, "")).strip().replace(" ", "").replace(":", ""))
            
            # 주소나 텍스트의 경우 가벼운 부분 일치도 허용하는 옵션 제공
            is_match = False
            if exp_val == act_val:
                is_match = True
            elif key in ["bizAddr", "workerAddr", "workPlace", "jobDesc"] and (exp_val in act_val or act_val in exp_val):
                is_match = True
                
            match_stats[key]["total"] += 1
            if is_match:
                match_stats[key]["correct"] += 1
                
        print(f"[{idx}/{total_images}] {img_name} evaluated successfully.")
        
    except Exception as e:
        print(f"[{idx}/{total_images}] {img_name}: Error occurred - {e}")

elapsed_time = time.time() - start_time
avg_time = elapsed_time / total_images if total_images > 0 else 0

# 2. 리포트 생성 및 저장
report_lines = []
report_lines.append("==================================================")
report_lines.append("           OCR API ACCURACY EVALUATION REPORT")
report_lines.append("==================================================")
report_lines.append(f"Total Evaluated Images : {total_images}")
report_lines.append(f"Total Execution Time   : {elapsed_time:.2f} seconds")
report_lines.append(f"Average Time per Image : {avg_time:.3f} seconds")
report_lines.append("--------------------------------------------------")
report_lines.append("  FIELD KEY       | MATCH / TOTAL | ACCURACY (%)")
report_lines.append("--------------------------------------------------")

for key in evaluate_keys:
    correct = match_stats[key]["correct"]
    total = match_stats[key]["total"]
    accuracy = (correct / total * 100) if total > 0 else 0.0
    report_lines.append(f"  {key:<15} | {correct:>3} / {total:>3}   | {accuracy:>6.2f}%")
report_lines.append("==================================================")

report_content = "\n".join(report_lines)

# 결과 리포트 저장
with open("test_report.txt", "w", encoding="utf-8") as f:
    f.write(report_content)

print("\n" + report_content)
print("\ntest_report.txt saved successfully.")
