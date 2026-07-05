import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get("userId");
    if (!userId) return NextResponse.json({ error: "필수 정보 없음", success: false }, { status: 400 });

    const [workerRes, employerRes] = await Promise.all([
      supabase.from("matches").select("id, employer_id, worker_id, status, progress_status, worker_left, updated_at")
        .eq("worker_id", userId)
        .in("status", ["accepted", "interviewing", "hired"])
        .eq("worker_left", false),
      supabase.from("matches").select("id, employer_id, worker_id, status, progress_status, employer_left, updated_at")
        .eq("employer_id", userId)
        .in("status", ["accepted", "interviewing", "hired"])
        .eq("employer_left", false),
    ]);

    const allMatches = [
      ...(workerRes.data || []).map(m => ({ ...m, myRole: "worker" })),
      ...(employerRes.data || []).map(m => ({ ...m, myRole: "employer" })),
    ];

    // 같은 employer+worker 조합은 최신 match만 표시
    const seen = new Set<string>();
    const deduped = allMatches.filter(m => {
      const key = [m.employer_id, m.worker_id].sort().join("-");
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    if (deduped.length === 0) return NextResponse.json({ data: [], success: true });

    const matchIds = deduped.map(m => m.id);

    // 각 match의 최신 메시지 + 안읽은 수를 한번에
    const { data: allChats } = await supabase.from("chats")
      .select("match_id, message, created_at, receiver_id, is_read")
      .in("match_id", matchIds)
      .order("created_at", { ascending: false });

    const lastMsgMap: Record<string, { message: string; created_at: string }> = {};
    const unreadMap: Record<string, number> = {};
    for (const c of (allChats || [])) {
      if (!lastMsgMap[c.match_id]) lastMsgMap[c.match_id] = { message: c.message, created_at: c.created_at };
      if (c.receiver_id === userId && !c.is_read) unreadMap[c.match_id] = (unreadMap[c.match_id] || 0) + 1;
    }

    // 상대방 정보 조회
    const counterpartIds = deduped.map(m => m.myRole === "worker" ? m.employer_id : m.worker_id);
    const { data: users } = await supabase.from("users")
      .select("id, nickname, name, user_type, avatar_url")
      .in("id", counterpartIds);

    const employerIds = (users || []).filter(u => u.user_type === "employer").map(u => u.id);
    const { data: empProfiles } = employerIds.length > 0
      ? await supabase.from("employer_profiles").select("user_id, business_name").in("user_id", employerIds)
      : { data: [] };

    const enriched = deduped.map(match => {
      const cpId = match.myRole === "worker" ? match.employer_id : match.worker_id;
      const user = (users || []).find(u => u.id === cpId);
      const emp = (empProfiles || []).find(e => e.user_id === cpId);
      const lastMsg = lastMsgMap[match.id];
      return {
        ...match,
        counterpartName: emp?.business_name ? emp.business_name + " 사장님" : (user?.nickname || user?.name || "알 수 없음"),
        counterpartType: user?.user_type,
        counterpartAvatar: user?.avatar_url || null,
        last_message: lastMsg?.message || "채팅을 시작해보세요 👋",
        last_message_at: lastMsg?.created_at || match.updated_at,
        unreadCount: unreadMap[match.id] || 0,
      };
    }).sort((a, b) => {
      if (!a.last_message_at) return 1;
      if (!b.last_message_at) return -1;
      return new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime();
    });

    return NextResponse.json({ data: enriched, success: true });
  } catch (error: unknown) {
    return NextResponse.json({ error: (error as Error).message, success: false }, { status: 500 });
  }
}
