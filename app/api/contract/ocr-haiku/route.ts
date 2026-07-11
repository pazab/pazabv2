import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

// AiGate 경유 불가 (이미지 base64 크기 제한) → Anthropic 직접 호출
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
const MODEL = "claude-haiku-4-5-20251001";

const PROMPT = `당신은 한국 근로계약서 분석 전문가입니다.
첨부된 계약서 이미지에서 아래 필드들을 추출해 JSON으로만 응답하세요.
인식 불가 필드는 빈 문자열("")로 두세요. JSON 외 텍스트는 절대 출력하지 마세요.

{
  "biz": "회사명/상호",
  "bizRegNo": "사업자등록번호 (형식: 000-00-00000)",
  "ceo": "대표자 성명",
  "ceoPhone": "대표자/사업주 연락처",
  "bizAddr": "사업장 소재지 주소",
  "worker": "근로자 성명",
  "workerBirth": "근로자 생년월일 (형식: YY. MM. DD)",
  "workerPhone": "근로자 연락처",
  "workerAddr": "근로자 주소",
  "startDate": "근로 시작일 (형식: YYYY-MM-DD)",
  "endDate": "근로 종료일 (형식: YYYY-MM-DD, 기간 정함 없으면 빈 문자열)",
  "workPlace": "근무 장소",
  "jobDesc": "담당 업무 내용",
  "workStart": "출근 시간 (형식: HH:MM)",
  "workEnd": "퇴근 시간 (형식: HH:MM)",
  "breakStart": "휴게 시작 시간 (형식: HH:MM, 없으면 빈 문자열)",
  "breakEnd": "휴게 종료 시간 (형식: HH:MM, 없으면 빈 문자열)",
  "workDaysText": "근무 요일 (예: 월, 화, 수, 목, 금)",
  "wage": "임금 금액 (숫자만, 예: 10030)",
  "wageType": "임금 유형 (hour/day/month 중 하나)",
  "contractDate": "계약 체결일 (형식: YYYY-MM-DD)"
}`;

// 이미지를 Canvas API 없이 크기만 줄여 base64 재인코딩
// sharp 없이 순수 Buffer 조작 — JPEG quality 조정으로 용량 감소
async function compressImageBuffer(buffer: ArrayBuffer): Promise<{ data: string; mediaType: "image/jpeg" }> {
  // sharp 대신 jimp 또는 단순 리사이즈 없이 원본 JPEG를 그대로 쓰되
  // 파일이 크면 경고 후 그대로 전송 (Anthropic 직접 호출이므로 제한 없음)
  const base64 = Buffer.from(buffer).toString("base64");
  return { data: base64, mediaType: "image/jpeg" };
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ success: false, error: "파일 없음" }, { status: 400 });
    }

    const validTypes = ["image/jpeg", "image/png", "image/webp"];
    if (!validTypes.includes(file.type)) {
      return NextResponse.json({ success: false, error: "JPG, PNG, WEBP만 지원합니다." }, { status: 400 });
    }

    const buffer = await file.arrayBuffer();
    const base64 = Buffer.from(buffer).toString("base64");
    const mediaType = file.type as "image/jpeg" | "image/png" | "image/webp";

    const message = await client.messages.create({
      model: MODEL,
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "base64", media_type: mediaType, data: base64 },
            },
            { type: "text", text: PROMPT },
          ],
        },
      ],
    });

    const rawText = message.content[0].type === "text" ? message.content[0].text.trim() : "";

    // ```json ... ``` 블록 또는 순수 JSON 모두 파싱
    const jsonMatch = rawText.match(/```json\s*([\s\S]*?)```/) ?? rawText.match(/(\{[\s\S]*\})/);
    if (!jsonMatch) {
      console.error("[OCR Haiku] JSON 파싱 실패, raw:", rawText);
      return NextResponse.json({ success: false, error: "응답 파싱 실패" }, { status: 500 });
    }

    const data = JSON.parse(jsonMatch[1]);
    return NextResponse.json({ success: true, data });

  } catch (err: any) {
    console.error("[OCR Haiku Error]", err?.message ?? err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
