import json
import requests

url = "http://127.0.0.1:8000/api/v1/ocr"
img_path = "test_dataset/contract_001.jpg"

with open("test_dataset/ground_truth.json", "r", encoding="utf-8") as f:
    gt = json.load(f)
    
expected = gt["contract_001.jpg"]

with open(img_path, "rb") as f:
    files = {"file": ("contract_001.jpg", f, "image/jpeg")}
    response = requests.post(url, files=files)
actual = response.json().get("data", {})
raw_text = response.json().get("raw_text", "") # raw_text가 없다면 full_text로 대조

print("=== RAW OCR TEXT ===")
print(raw_text)
print("====================")

print("=== ACTUAL DATA DICT ===")
print(json.dumps(actual, indent=2, ensure_ascii=False))
print("=== ACTUAL BOXES ===")
print(json.dumps(response.json().get("boxes", {}), indent=2))
print("=== IMAGE SIZE ===")
print(json.dumps(response.json().get("image_size", {}), indent=2))
print("=== DIGITAL SEGMENT DEBUG ===")
import re
print("Found 4-5 digits:", re.findall(r'\d{4,5}', raw_text))
print("All digits list :", re.findall(r'\d+', raw_text))
print("=============================")

print("=== DIAGNOSTIC COMPARISON FOR contract_001.jpg ===")
for k in expected.keys():
    exp_val = expected[k]
    act_val = actual.get(k, '')
    print(f"Key: {k}")
    print(f"  Expected: {repr(exp_val)}")
    print(f"  Actual  : {repr(act_val)}")
    import unicodedata
    norm_exp = unicodedata.normalize('NFC', exp_val.replace(' ', '').replace(':', '').lower())
    norm_act = unicodedata.normalize('NFC', act_val.replace(' ', '').replace(':', '').lower())
    print(f"  Match   : {norm_exp == norm_act}")
