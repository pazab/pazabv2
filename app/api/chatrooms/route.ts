import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// 채팅방 목록 (수락된 매칭)
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get("userId");

    if (!userId) {
      return NextResponse.json({ error: "필수 정보 없음", success: false }, { status: 400 });
    }

    // 수락된 매칭 + 채팅 열린 것 전부 (나간 사람 제외)
    const [workerRes, employerRes] = await Promise.all([
      supabase.from("matches").select("*")
        .eq("worker_id", userId)
        .in("status", ["accepted", "interviewing", "hired"])
        .eq("worker_left", false)
        .order("last_message_at", { ascending: false, nullsFirst: false }),
      supabase.from("matches").select("*")
        .eq("employer_id", userId)
        .in("status", ["accepted", "interviewing", "hired"])
        .eq("employer_left", false)
        .order("last_message_at", { ascending: false, nullsFirst: false }),
    ]);

    const allMatches = [
      ...(workerRes.data || []).map(m => ({ ...m, myRole: "worker" })),
      ...(employerRes.data || []).map(m => ({ ...m, myRole: "employer" })),
    ].sort((a, b) => {
      if (!a.last_message_at) return 1;
      if (!b.last_message_at) return -1;
      return new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime();
    });

    // 같은 employer+worker 조합은 최신 match만 표시
    const seen = new Set<string>();
    const deduped = allMatches.filter(m => {
      const key = [m.employer_id, m.worker_id].sort().join("-");
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    // 상대방 정보 + 읽지 않은 메시지 수
    const enriched = await Promise.all(deduped.map(async (match) => {
      const counterpartId = match.myRole === "worker" ? match.employer_id : match.worker_id;

      const { data: user } = await supabase
        .from("users")
        .select("id, nickname, name, user_type, grade, avatar_url")
        .eq("id", counterpartId)
        .single();

      let profileName = user?.nickname || user?.name || "알 수 없음";
      let businessName = "";
      if (user?.user_type === "employer") {
        const { data: emp } = await supabase
          .from("employer_profiles")
          .select("business_name")
          .eq("id", match.employer_profile_id)
          .maybeSingle();
        if (emp?.business_name) {
          businessName = emp.business_name;
          profileName = emp.business_name + " 사장님";
        }
      }

      // 읽지 않은 메시지 수
      const { count } = await supabase
        .from("chats")
        .select("*", { count: "exact", head: true })
        .eq("match_id", match.id)
        .eq("receiver_id", userId)
        .eq("is_read", false);

      return {
        ...match,
        counterpartName: profileName,
        counterpartType: user?.user_type,
        counterpartAvatar: user?.avatar_url || null,
        businessName,
        unreadCount: count || 0,
      };
    }));

    return NextResponse.json({ data: enriched, success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message, success: false }, { status: 500 });
  }
}
