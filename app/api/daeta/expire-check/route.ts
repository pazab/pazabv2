import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { expireStalePostings } from "@/lib/daetaEscalation";

const getServiceClient = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

// POST /api/daeta/expire-check — 대타 홈 화면 진입 시 즉시 만료 정리 트리거 (크론 5분 주기 사이 공백 메움).
// 클라이언트가 직접 daeta_postings.status를 update하면 지원자 정리(matches)와 알림 발송(서비스롤 필요)을
// 할 수 없어 매칭이 pending으로 영구 방치됐음 — 서비스롤로 처리하는 서버 라우트로 교체.
// 인증 불필요: 읽기 전용 판정(expires_at 경과 여부)이라 누가 호출해도 결과가 같고, 중복 호출해도 멱등적.
export async function POST() {
  try {
    const sb = getServiceClient();
    const expired = await expireStalePostings(sb, new Date());
    return NextResponse.json({ success: true, expired });
  } catch (e: any) {
    return NextResponse.json({ error: e.message, success: false }, { status: 500 });
  }
}
