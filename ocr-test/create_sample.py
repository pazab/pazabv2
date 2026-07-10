from PIL import Image, ImageDraw, ImageFont

# 600x300 크기의 흰색 이미지 생성
img = Image.new('RGB', (600, 300), color='white')
d = ImageDraw.Draw(img)

# Windows의 맑은 고딕(Malgun Gothic) 폰트 경로
font_path = "C:\\Windows\\Fonts\\malgun.ttf"
try:
    font = ImageFont.truetype(font_path, 24)
except IOError:
    # 폰트를 못 찾으면 기본 폰트 사용
    font = ImageFont.load_default()

# 한글 텍스트 그리기
d.text((50, 40), "표준근로계약서", fill='black', font=font)
d.text((50, 90), "1. 사업주명: 주식회사 파잡 (pazab)", fill='black', font=font)
d.text((50, 140), "2. 근로자명: 홍길동", fill='black', font=font)
d.text((50, 190), "3. 임금(시급): 12,000원", fill='black', font=font)
d.text((50, 240), "4. 근무시간: 09시 00분부터 18시 00분까지", fill='black', font=font)

# 이미지 저장
img.save('sample.jpg')
print("sample.jpg created successfully with Hangul text.")
