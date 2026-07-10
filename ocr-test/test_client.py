import requests

url = "http://127.0.0.1:8000/api/v1/ocr"
file_path = "sample.jpg"

try:
    print(f"Sending {file_path} to {url}...")
    with open(file_path, "rb") as f:
        files = {"file": (file_path, f, "image/jpeg")}
        response = requests.post(url, files=files)
        print(f"Status Code: {response.status_code}")
        print("Response JSON:")
        import json
        print(json.dumps(response.json(), indent=2, ensure_ascii=False))
except Exception as e:
    print(f"Error occurred: {e}")
