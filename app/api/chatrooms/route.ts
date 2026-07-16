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
      supabase.from("matches").select("id, employer_id, worker_id, progress_status, worker_left, created_at, updated_at")
        .eq("worker_id", userId)
        .in("progress_status", ["accepted", "interviewing", "hired"])
        .eq("worker_left", false),
      supabase.from("matches").select("id, employer_id, worker_id, progress_status, employer_left, created_at, updated_at")
        .eq("employer_id", userId)
        .in("progress_status", ["accepted", "interviewing", "hired"])
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
      .select("id, nickname, user_type, avatar_url")
      .in("id", counterpartIds);

    const employerIds = (users || []).filter(u => u.user_type === "employer").map(u => u.id);
    const workerIds = (users || []).filter(u => u.user_type === "worker").map(u => u.id);

    const [empProfilesRes, workerProfilesRes] = await Promise.all([
      employerIds.length > 0
        ? supabase.from("employer_profiles").select("user_id, business_name, logo_url, image_url").in("user_id", employerIds)
        : Promise.resolve({ data: [] }),
      workerIds.length > 0
        ? supabase.from("worker_profiles").select("user_id, image_url").in("user_id", workerIds)
        : Promise.resolve({ data: [] }),
    ]);

    const empProfiles = empProfilesRes.data || [];
    const workerProfiles = workerProfilesRes.data || [];

    const enriched = deduped.map(match => {
      const cpId = match.myRole === "worker" ? match.employer_id : match.worker_id;
      const user = (users || []).find(u => u.id === cpId);
      const emp = (empProfiles || []).find(e => e.user_id === cpId);
      const worker = (workerProfiles || []).find(w => w.user_id === cpId);
      const lastMsg = lastMsgMap[match.id];
      
      const avatar = user?.user_type === "employer"
        ? (emp?.logo_url || emp?.image_url || user?.avatar_url || null)
        : (worker?.image_url || user?.avatar_url || null);

      return {
        ...match,
        counterpartName: emp?.business_name ? emp.business_name + " 사장님" : (user?.nickname || "알 수 없음"),
        counterpartType: user?.user_type,
        counterpartAvatar: avatar,
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
