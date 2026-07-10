import os
import random
import json
from PIL import Image, ImageDraw, ImageFont

# 이미지 및 정답을 보관할 폴더 생성
output_dir = "test_dataset"
os.makedirs(output_dir, exist_ok=True)

# ── 랜덤 데이터 소스 정의 ──
first_names = ["김", "이", "박", "최", "정", "강", "조", "윤", "장", "임", "한", "오", "서", "신", "권", "황", "안", "송", "전", "홍"]
last_names = ["민준", "서준", "도윤", "예준", "시우", "하준", "주원", "지호", "지후", "준서", "서연", "서윤", "지우", "서현", "하은", "하윤", "민서", "지아", "윤서", "채원"]
store_prefix = ["메가", "백다방", "컴포즈", "이디야", "스타", "파리", "뚜레", "올리브", "GS", "CU", "세븐"]
store_suffix = ["커피", "점", "제과", "마트", "베이커리", "치킨", "피자", "푸드"]
job_types = ["매장 음료 제조", "홀 서빙 및 청소", "상품 진열 및 카운터", "조리 보조 및 서빙", "배달 및 포장"]
districts = ["마포구", "서대문구", "강남구", "송파구", "영등포구", "종로구", "관악구", "강서구", "서초구", "용산구"]
streets = ["백범로", "신촌로", "테헤란로", "올림픽로", "여의대로", "대학로", "남부순환로", "공항대로", "서초대로", "한강대로"]

# ── 랜덤 생성 함수 ──
def generate_mock_contract_data(idx):
    worker_name = random.choice(first_names) + random.choice(last_names)
    ceo_name = random.choice(first_names) + random.choice(last_names)
    
    # 중복 방지를 위한 랜덤 이름 조합
    while worker_name == ceo_name:
        ceo_name = random.choice(first_names) + random.choice(last_names)
        
    biz_name = f"주식회사 {random.choice(store_prefix)}{random.choice(store_suffix)} {random.choice(districts)}점"
    biz_reg = f"{random.randint(100, 999):03d}-{random.randint(10, 99):02d}-{random.randint(10000, 99999):05d}"
    biz_addr = f"서울시 {random.choice(districts)} {random.choice(streets)} {random.randint(1, 200)}길 {random.randint(1, 90)}"
    
    start_year = 2026
    start_month = random.randint(1, 12)
    start_day = random.randint(1, 28)
    start_date = f"{start_year}-{start_month:02d}-{start_day:02d}"
    
    work_start_hr = random.randint(7, 18)
    work_end_hr = (work_start_hr + random.randint(4, 9)) % 24
    work_start = f"{work_start_hr:02d}:00"
    work_end = f"{work_end_hr:02d}:00"
    
    # 4시간 이상이면 의무 휴게시간 매칭
    break_start = f"{(work_start_hr + 4)%24:02d}:00"
    break_end = f"{(work_start_hr + 5)%24:02d}:00"
    
    wage = random.choice([9860, 10000, 11000, 12000, 13000, 15000, 18000, 20000])
    
    days_list = random.sample(["월", "화", "수", "목", "금", "토", "일"], k=random.randint(1, 5))
    week_order = {w: i for i, w in enumerate(["월", "화", "수", "목", "금", "토", "일"])}
    days_list.sort(key=lambda x: week_order[x])
    work_days = ", ".join(days_list)
    
    return {
        "biz": biz_name,
        "bizRegNo": biz_reg,
        "ceo": ceo_name,
        "ceoPhone": f"010-{random.randint(1000, 9999)}-{random.randint(1000, 9999)}",
        "bizAddr": biz_addr,
        "worker": worker_name,
        "workerBirth": f"{random.randint(70, 99):02d}. {random.randint(1, 12):02d}. {random.randint(1, 28):02d}",
        "workerPhone": f"010-{random.randint(1000, 9999)}-{random.randint(1000, 9999)}",
        "workerAddr": f"경기도 고양시 덕양구 화정동 {random.randint(1, 500)}번지",
        "startDate": start_date,
        "endDate": "",
        "workPlace": f"매장 내부 및 {biz_addr.split()[-2]} 인근",
        "jobDesc": random.choice(job_types),
        "workStart": work_start,
        "workEnd": work_end,
        "breakStart": break_start,
        "breakEnd": break_end,
        "workDaysText": work_days,
        "wage": str(wage),
        "wageType": "hour",
        "contractDate": start_date
    }

# ── 폰트 및 드로잉 헬퍼 ──
font_path = "C:\\Windows\\Fonts\\malgun.ttf"
try:
    font_large = ImageFont.truetype(font_path, 22)
    font_normal = ImageFont.truetype(font_path, 16)
except IOError:
    font_large = ImageFont.load_default()
    font_normal = ImageFont.load_default()

ground_truth = {}
count = 100

print(f"Generating {count} synthetic contract images in '{output_dir}'...")

for i in range(1, count + 1):
    data = generate_mock_contract_data(i)
    img_name = f"contract_{i:03d}.jpg"
    img_path = os.path.join(output_dir, img_name)
    
    # 넉넉한 800x1200 크기의 백색 서류 이미지 생성
    img = Image.new('RGB', (800, 1200), color='white')
    d = ImageDraw.Draw(img)
    
    # 계약서 타이틀 및 외곽 격자 드로잉 (실제 문서 레이아웃 모사)
    d.rectangle([(20, 20), (780, 1180)], outline="black", width=2)
    d.text((320, 50), "표 줌 근 로 계 약 서", fill='black', font=font_large)
    
    # 필수 기재란 드로잉
    y = 120
    d.line([(30, y), (770, y)], fill="black", width=1)
    
    # 1. 계약주체 정보
    y += 20
    d.text((40, y), f"1. 사업주명 (갑): {data['biz']}", fill='black', font=font_normal)
    y += 40
    d.text((40, y), f" - 사업자등록번호: {data['bizRegNo']}", fill='black', font=font_normal)
    d.text((400, y), f" - 대 표 자 : {data['ceo']}", fill='black', font=font_normal)
    y += 40
    d.text((40, y), f" - 사업주 연락처: {data['ceoPhone']}", fill='black', font=font_normal)
    d.text((400, y), f" - 소 재 지 : {data['bizAddr']}", fill='black', font=font_normal)
    
    y += 40
    d.line([(30, y), (770, y)], fill="gray", width=1)
    
    # 2. 근로자 정보
    y += 20
    d.text((40, y), f"2. 근로자명 (을): {data['worker']}", fill='black', font=font_normal)
    y += 40
    d.text((40, y), f" - 생년월일: {data['workerBirth']}", fill='black', font=font_normal)
    d.text((400, y), f" - 연 락 처 : {data['workerPhone']}", fill='black', font=font_normal)
    y += 40
    d.text((40, y), f" - 근로자 주소: {data['workerAddr']}", fill='black', font=font_normal)
    
    y += 40
    d.line([(30, y), (770, y)], fill="gray", width=1)
    
    # 3. 근무조건
    y += 20
    d.text((40, y), f"3. 근로개시일: {data['startDate']} 부터 근무하기로 한다.", fill='black', font=font_normal)
    y += 40
    d.text((40, y), f"4. 근무장소: {data['workPlace']}", fill='black', font=font_normal)
    y += 40
    d.text((40, y), f"5. 업무내용: {data['jobDesc']}", fill='black', font=font_normal)
    
    y += 40
    d.line([(30, y), (770, y)], fill="gray", width=1)
    
    # 4. 소정근로시간 및 휴게시간
    y += 20
    d.text((40, y), f"6. 소정근로시간: {data['workStart']} 부터 {data['workEnd']} 까지로 한다.", fill='black', font=font_normal)
    y += 40
    d.text((40, y), f" - 휴게시간: {data['breakStart']} 부터 {data['breakEnd']} 까지 분할 부여한다.", fill='black', font=font_normal)
    y += 40
    d.text((40, y), f"7. 근무요일: 매주 [ {data['workDaysText']} ] 요일에 근무한다.", fill='black', font=font_normal)
    
    y += 40
    d.line([(30, y), (770, y)], fill="gray", width=1)
    
    # 5. 임금
    y += 20
    d.text((40, y), f"8. 임금 (시급): {int(data['wage']):,} 원을 지급하기로 약정한다.", fill='black', font=font_normal)
    
    y += 120
    d.text((300, y), f"계 약 일 자 :  {data['contractDate']}", fill='black', font=font_normal)
    
    y += 80
    d.text((100, y), "사업주 (갑) :                       (인)", fill='black', font=font_normal)
    d.text((450, y), "근로자 (을) :                       (인)", fill='black', font=font_normal)

    # 이미지 저장
    img.save(img_path, quality=95)
    
    # 정답 맵에 저장
    ground_truth[img_name] = data

# 정답 JSON 저장
with open(os.path.join(output_dir, "ground_truth.json"), "w", encoding="utf-8") as f:
    json.dump(ground_truth, f, indent=2, ensure_ascii=False)

print(f"Dataset generation complete! Created 100 files in '{output_dir}'.")
