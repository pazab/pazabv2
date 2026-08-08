import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// 내 대타 공고에 "알림이 몇 명에게 갔는지" — notifications RLS(본인만 SELECT)상 사장님이 직접 못 읽으므로
// 소유권 확인 후 서비스롤로 집계해서 넘겨준다.
export async function POST(req: NextRequest) {
  try {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { getAll: () => cookieStore.getAll() } }
    );
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });

    const { postingIds } = await req.json();
    if (!Array.isArray(postingIds) || postingIds.length === 0) {
      return NextResponse.json({ counts: {} });
    }

    const { data: postings } = await supabaseAdmin
      .from("daeta_postings")
      .select("id, user_id")
      .in("id", postingIds);
    const ownedIds = (postings || []).filter(p => p.user_id === user.id).map(p => p.id);
    if (ownedIds.length === 0) return NextResponse.json({ counts: {} });

    const { data: notifRows } = await supabaseAdmin
      .from("notifications")
      .select("user_id, data")
      .eq("type", "daeta")
      .in("data->>daetaPostingId", ownedIds);

    const sets: Record<string, Set<string>> = {};
    (notifRows || []).forEach((n: { user_id: string; data: Record<string, unknown> | null }) => {
      const pid = n.data?.daetaPostingId as string | undefined;
      if (!pid) return;
      (sets[pid] ||= new Set()).add(n.user_id);
    });

    const counts: Record<string, number> = {};
    Object.entries(sets).forEach(([pid, set]) => { counts[pid] = set.size; });

    return NextResponse.json({ counts });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "조회 실패" }, { status: 500 });
  }
}
