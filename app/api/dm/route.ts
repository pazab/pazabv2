import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// GET /api/dm?targetId=xxx
// 현재 로그인 유저와 targetId 사이의 DM match를 찾거나 생성해서 matchId 반환
export async function GET(req: NextRequest) {
  try {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { getAll: () => cookieStore.getAll() } }
    );
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "인증 필요" }, { status: 401 });

    const targetId = req.nextUrl.searchParams.get("targetId");
    if (!targetId) return NextResponse.json({ error: "targetId 필요" }, { status: 400 });

    const myId = user.id;

    // 1. 기존 match 탐색 (상태 무관, 최신순)
    const { data: existing } = await supabaseAdmin
      .from("matches")
      .select("id, worker_left, employer_left")
      .or(`and(employer_id.eq.${myId},worker_id.eq.${targetId}),and(employer_id.eq.${targetId},worker_id.eq.${myId})`)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existing) {
      // left 플래그 리셋 → 양쪽 채팅 목록에 재노출
      if (existing.worker_left || existing.employer_left) {
        await supabaseAdmin.from("matches")
          .update({ worker_left: false, employer_left: false })
          .eq("id", existing.id);
      }
      return NextResponse.json({ matchId: existing.id });
    }

    // 2. match 없으면 team_members에서 관계 확인 후 생성
    const { data: tm } = await supabaseAdmin
      .from("team_members")
      .select("employer_id, worker_id")
      .or(`and(employer_id.eq.${myId},worker_id.eq.${targetId}),and(employer_id.eq.${targetId},worker_id.eq.${myId})`)
      .eq("status", "active")
      .limit(1)
      .maybeSingle();

    if (!tm) {
      return NextResponse.json({ error: "연결된 팀 관계가 없어요" }, { status: 404 });
    }

    const { data: newMatch } = await supabaseAdmin
      .from("matches")
      .insert({
        employer_id: tm.employer_id,
        worker_id: tm.worker_id,
        status: "hired",
        progress_status: "hired",
        worker_left: false,
        employer_left: false,
      })
      .select("id")
      .single();

    if (!newMatch) return NextResponse.json({ error: "채팅방 생성 실패" }, { status: 500 });

    return NextResponse.json({ matchId: newMatch.id });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
