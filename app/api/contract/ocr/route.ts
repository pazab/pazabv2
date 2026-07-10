import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    // 1. 요청으로부터 Multipart Form 데이터 파싱
    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json(
        { success: false, error: "업로드된 파일이 없습니다." },
        { status: 400 }
      );
    }

    // 2. 파일 타입 검증 (이미지 형태 확인)
    const validTypes = ["image/jpeg", "image/png", "image/webp"];
    if (!validTypes.includes(file.type)) {
      return NextResponse.json(
        { success: false, error: "지원하지 않는 파일 형식입니다. (JPG, PNG, WEBP만 가능)" },
        { status: 400 }
      );
    }

    // 3. FastAPI OCR 서버로 전송할 Multipart FormData 빌드
    const externalFormData = new FormData();
    // Blob/File 데이터를 그대로 바이너리 릴레이 전송
    externalFormData.append("file", file, file.name);

    // 환경 변수로부터 OCR 서버 URL을 획득하고 없으면 로컬 기본값 적용
    const ocrServerUrl = process.env.OCR_SERVER_URL || "http://localhost:8000/api/v1/ocr";

    console.log(`[Next.js OCR Proxy] Relaying request to ${ocrServerUrl}...`);

    // 4. FastAPI 호출
    const response = await fetch(ocrServerUrl, {
      method: "POST",
      body: externalFormData,
      // Next.js 캐시 방지
      cache: "no-store",
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OCR 데몬 서버 응답 에러 (${response.status}): ${errorText}`);
    }

    // 5. 성공 결과 반환
    const result = await response.json();
    return NextResponse.json(result);

  } catch (error: any) {
    console.error("[Next.js OCR Proxy Error]:", error);
    return NextResponse.json(
      {
        success: false,
        error: "계약서 이미지를 분석하는 도중 에러가 발생했습니다.",
        details: error.message,
      },
      { status: 500 }
    );
  }
}
