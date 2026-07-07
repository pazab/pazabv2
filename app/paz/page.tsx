"use client";

import { useState, useEffect, useRef, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { matchPazIntent } from "@/lib/pazIntents";

interface Message {
  role: "user" | "assistant";
  content: string;
  isVoice?: boolean;
  createdAt?: string;
  isRecommend?: boolean;
}

const THEMES: Record<string, { from: string; to: string }> = {
  purple: { from: "#7c3aed", to: "#ec4899" },
  blue: { from: "#0ea5e9", to: "#6366f1" },
  green: { from: "#10b981", to: "#0ea5e9" },
  pink: { from: "#ec4899", to: "#f43f5e" },
  gold: { from: "#f59e0b", to: "#ef4444" },
};

export default function PazPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: "100vh", background: "var(--bg)" }} />}>
      <PazContent />
    </Suspense>
  );
}

function PazContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [user, setUser] = useState<any>(null);
  const [pazName, setPazName] = useState("PAZ");
  const [editingName, setEditingName] = useState(false);
  const [tempName, setTempName] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [pendingConfirm, setPendingConfirm] = useState<{text: string, action: string} | null>(null);
  const [recording, setRecording] = useState(false);
  const [avatar, setAvatar] = useState("🤖");
  const [themeFrom, setThemeFrom] = useState("#7c3aed");
  const [themeTo, setThemeTo] = useState("#ec4899");
  const [autoSpeak, setAutoSpeak] = useState(false);
  const [speakingIndex, setSpeakingIndex] = useState<number | null>(null);

  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<any>(null);
  const voiceHandled = useRef(false);
  const [profileLoaded, setProfileLoaded] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then((res) => {
      const user = res.data.user;
      if (!user) { router.push("/login"); return; }
      setUser(user);
      loadProfile(user.id).then(() => setProfileLoaded(true));
    });
  }, []);

  // 플로팅 버튼에서 텍스트 전달받으면 자동 전송
  useEffect(() => {
    const q = searchParams?.get("voice") || searchParams?.get("q");
    console.log("PAZ auto-send check:", { q, profileLoaded, handled: voiceHandled.current });
    if (q && profileLoaded && !voiceHandled.current) {
      voiceHandled.current = true;
      const decoded = decodeURIComponent(q);
      console.log("PAZ auto-send firing:", decoded);
      setInput(decoded);
      setTimeout(() => {
        sendMessage(decoded, true);
        router.replace("/paz");
      }, 300);
    }
  }, [searchParams, profileLoaded]);

  // 이미 PAZ 페이지에 있을 때 플로팅 버튼에서 직접 입력
  useEffect(() => {
    const handler = (e: Event) => {
      const text = (e as CustomEvent).detail?.text;
      if (!text) return;
      setInput(text);
      setTimeout(() => {
        const btn = document.querySelector("[data-paz-send]") as HTMLButtonElement;
        if (btn) btn.click();
      }, 150);
    };
    window.addEventListener("paz-input", handler);
    return () => window.removeEventListener("paz-input", handler);
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);


  // PAZ용 실시간 DB 데이터 조회
  async function fetchPazContext(userId: string, userType: string) {
    const kstNow = new Date(new Date().getTime() + 9*60*60*1000);
    const today = kstNow.toISOString().split("T")[0];
    const monthStr = kstNow.toISOString().slice(0, 7);
    let context = "";

    try {
      if (userType === "employer" || userType === "both") {
        // 팀원 현황
        const { data: members } = await supabase.from("team_members")
          .select("id, worker_id, hire_date, wage, work_days, work_hours, users!team_members_worker_id_fkey(nickname, email)")
          .eq("employer_id", userId).eq("status", "active");

        if (members && members.length > 0) {
          context += `\n[팀원 현황 - ${members.length}명]\n`;
          members.forEach((m: any) => {
            const name = m.users?.nickname || m.users?.email?.split("@")[0] || "팀원";
            context += `- ${name}: 시급 ${m.wage?.toLocaleString()||"미설정"}원, ${m.work_days||"요일미정"}\n`;
          });

          // 오늘 출근 현황 (KST)
          const memberIds = members.map((m: any) => m.id);
          const { data: todayAtt } = await supabase.from("attendance")
            .select("team_member_id, status, check_in, check_out, actual_hours")
            .in("team_member_id", memberIds).eq("work_date", today);

          if (todayAtt && todayAtt.length > 0) {
            context += `\n[오늘 출근 현황]\n`;
            todayAtt.forEach((a: any) => {
              const member = members.find((m: any) => m.id === a.team_member_id);
              const name = (member as any)?.users?.nickname || (member as any)?.users?.email?.split("@")[0] || "팀원";
              const checkIn = a.check_in ? new Date(a.check_in).toLocaleTimeString("ko-KR", {hour:"2-digit", minute:"2-digit"}) : "-";
              const checkOut = a.check_out ? new Date(a.check_out).toLocaleTimeString("ko-KR", {hour:"2-digit", minute:"2-digit"}) : "미퇴근";
              const statusMap: Record<string,string> = {normal:"출근", late:"지각", early_leave:"조퇴", absent:"결근", off:"휴무"};
              context += `- ${name}: ${statusMap[a.status]||a.status} ${checkIn}~${checkOut}\n`;
            });
            const absentMembers = members.filter((m: any) => !todayAtt.find((a: any) => a.team_member_id === m.id));
            if (absentMembers.length > 0) {
              context += `- 미출근: ${absentMembers.map((m: any) => m.users?.nickname || "팀원").join(", ")}\n`;
            }
          } else {
            context += `\n[오늘 출근 현황] 아직 출근 기록 없음\n`;
          }

          // 미서명 계약서
          const { data: pendingContracts } = await supabase.from("contracts")
            .select("worker_id, status, users!contracts_worker_id_fkey(nickname)")
            .eq("employer_id", userId).eq("status", "pending");
          if (pendingContracts && pendingContracts.length > 0) {
            context += `\n[계약서 서명 대기] ${pendingContracts.map((c: any) => c.users?.nickname || "팀원").join(", ")}\n`;
          }
        }
      }

      if (userType === "worker" || userType === "both") {
        // 현재 소속
        const { data: myWork } = await supabase.from("team_members")
          .select("employer_id, hire_date, wage, work_days, work_hours, users!team_members_employer_id_fkey(nickname)")
          .eq("worker_id", userId).eq("status", "active");

        if (myWork && myWork.length > 0) {
          context += `\n[현재 소속]\n`;
          myWork.forEach((m: any) => {
            context += `- 사장님: ${m.users?.nickname||"사장님"}, 시급 ${m.wage?.toLocaleString()||"미설정"}원, ${m.work_days||"요일미정"}\n`;
          });
        }

        // 이번달 근태
        const { data: myAtt } = await supabase.from("attendance")
          .select("work_date, status, actual_hours")
          .eq("worker_id", userId)
          .gte("work_date", monthStr + "-01")
          .order("work_date", { ascending: false }).limit(10);

        if (myAtt && myAtt.length > 0) {
          const totalH = myAtt.reduce((s: number, a: any) => s + (parseFloat(a.actual_hours)||0), 0);
          context += `\n[이번달 근태] 총 ${myAtt.length}일 근무, ${totalH.toFixed(1)}시간\n`;
        }
      }
    } catch (e) {
      console.error("PAZ context error:", e);
    }
    return context;
  }

  // 인텐트 감지 및 액션 처리 (lib/pazIntents.ts 기반 - 비용 0)
  async function detectAndExecuteAction(text: string, userId: string, userType: string): Promise<string | null> {
    const intent = matchPazIntent(text, userType);
    if (!intent) return null;

    const today = new Date(new Date().getTime() + 9*60*60*1000).toISOString().split("T")[0];
    const monthStr = new Date(new Date().getTime() + 9*60*60*1000).toISOString().slice(0, 7);

    // ── 오늘 출근 현황 ──
    if (intent.id === "attendance_today") {
      const { data: members } = await supabase.from("team_members")
        .select("id, users!team_members_worker_id_fkey(nickname, email)")
        .eq("employer_id", userId).eq("status", "active");
      if (!members || members.length === 0) return "등록된 팀원이 없어요.";
      const { data: att } = await supabase.from("attendance")
        .select("team_member_id, status, check_in")
        .in("team_member_id", members.map((m: any) => m.id))
        .eq("work_date", today);
      const statusMap: Record<string,string> = {normal:"✅출근", late:"⏰지각", early_leave:"🔜조퇴", absent:"❌결근", off:"📅휴무"};
      const checkedIn = (att||[]).map((a: any) => {
        const m = members.find((m: any) => m.id === a.team_member_id);
        const name = (m as any)?.users?.nickname || (m as any)?.users?.email?.split("@")[0] || "팀원";
        const time = a.check_in ? new Date(a.check_in).toLocaleTimeString("ko-KR", {hour:"2-digit", minute:"2-digit"}) : "";
        return `${statusMap[a.status]||a.status} ${name} ${time}`;
      });
      const absent = members.filter((m: any) => !(att||[]).find((a: any) => a.team_member_id === m.id))
        .map((m: any) => (m as any).users?.nickname || "팀원");
      let result = `📋 오늘(${today}) 출근 현황\n`;
      if (checkedIn.length > 0) result += checkedIn.join("\n") + "\n";
      if (absent.length > 0) result += `⬜ 미출근: ${absent.join(", ")}`;
      return result;
    }

    // ── 예상 급여 ──
    if (intent.id === "salary_estimate" || intent.id === "my_salary") {
      if (userType === "worker" || userType === "both") {
        const { data: myWork } = await supabase.from("team_members")
          .select("wage, work_hours").eq("worker_id", userId).eq("status", "active").limit(1).maybeSingle();
        const { data: att } = await supabase.from("attendance")
          .select("actual_hours").eq("worker_id", userId).gte("work_date", `${monthStr}-01`);
        if (!myWork?.wage) return "시급 정보가 없어요. 계약서를 먼저 작성해주세요.";
        const totalH = (att||[]).reduce((s: number, a: any) => s + (parseFloat(a.actual_hours)||0), 0);
        return `💰 이번달(${monthStr}) 예상 급여\n근무: ${totalH.toFixed(1)}시간\n시급: ${myWork.wage.toLocaleString()}원\n예상: ${Math.round(totalH * myWork.wage).toLocaleString()}원`;
      }
      if (userType === "employer" || userType === "both") {
        const { data: members } = await supabase.from("team_members")
          .select("wage, worker_id, users!team_members_worker_id_fkey(nickname)")
          .eq("employer_id", userId).eq("status", "active");
        if (!members || members.length === 0) return "등록된 팀원이 없어요.";
        let result = `💰 이번달(${monthStr}) 팀원별 예상 급여\n`;
        for (const m of members) {
          const { data: att } = await supabase.from("attendance")
            .select("actual_hours").eq("worker_id", m.worker_id).gte("work_date", `${monthStr}-01`);
          const totalH = (att||[]).reduce((s: number, a: any) => s + (parseFloat(a.actual_hours)||0), 0);
          const name = (m as any).users?.nickname || "팀원";
          result += `- ${name}: ${totalH.toFixed(1)}h → ${m.wage ? Math.round(totalH*m.wage).toLocaleString() : "미설정"}원\n`;
        }
        return result;
      }
    }

    // ── 계약서 미서명 ──
    if (intent.id === "unsigned_contracts") {
      const { data: pending } = await supabase.from("contracts")
        .select("match_id, worker_id, users!contracts_worker_id_fkey(nickname)")
        .eq("employer_id", userId).eq("status", "pending");
      if (!pending || pending.length === 0) return "✅ 미서명 계약서가 없어요!";
      const names = pending.map((c: any) => (c as any).users?.nickname || "팀원").join(", ");
      return `📄 미서명 계약서: ${pending.length}건\n(${names})\n알림을 보낼까요? "계약서 알림 보내줘"라고 말해주세요.`;
    }

    // ── 계약서 알림 발송 ──
    if (intent.id === "contract_notify") {
      const { data: pending } = await supabase.from("contracts")
        .select("match_id, worker_id, users!contracts_worker_id_fkey(nickname)")
        .eq("employer_id", userId).eq("status", "pending");
      if (!pending || pending.length === 0) return "✅ 미서명 계약서가 없어요!";
      let notified = 0;
      for (const c of pending) {
        if (!c.match_id) continue;
        await fetch("/api/chat", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ matchId: c.match_id, senderId: userId, receiverId: c.worker_id,
            message: "📄 근로계약서 서명이 아직 완료되지 않았어요!\n팀소속관리 → 계약서 탭에서 확인해주세요.", messageType: "system" }),
        });
        notified++;
      }
      const names = pending.map((c: any) => (c as any).users?.nickname || "팀원").join(", ");
      return `📨 ${notified}명에게 계약서 서명 알림 발송 완료!\n(${names})`;
    }

    // ── 근태 요약 ──
    if (intent.id === "attendance_summary") {
      const { data: members } = await supabase.from("team_members")
        .select("id, worker_id, users!team_members_worker_id_fkey(nickname)")
        .eq("employer_id", userId).eq("status", "active");
      if (!members || members.length === 0) return "등록된 팀원이 없어요.";
      let result = `📊 이번달(${monthStr}) 근태 요약\n`;
      for (const m of members) {
        const { data: att } = await supabase.from("attendance")
          .select("status, actual_hours").eq("team_member_id", m.id).gte("work_date", `${monthStr}-01`);
        const normal = (att||[]).filter((a: any) => a.status==="normal").length;
        const late = (att||[]).filter((a: any) => a.status==="late").length;
        const absent = (att||[]).filter((a: any) => a.status==="absent").length;
        const totalH = (att||[]).reduce((s: number, a: any) => s+(parseFloat(a.actual_hours)||0), 0);
        const name = (m as any).users?.nickname || "팀원";
        result += `- ${name}: 출근${normal} 지각${late} 결근${absent} (${totalH.toFixed(1)}h)\n`;
      }
      return result;
    }

    // ── 팀원 현황 ──
    if (intent.id === "team_status") {
      const { data: members } = await supabase.from("team_members")
        .select("hire_date, wage, work_days, users!team_members_worker_id_fkey(nickname)")
        .eq("employer_id", userId).eq("status", "active");
      if (!members || members.length === 0) return "등록된 팀원이 없어요.";
      let result = `👥 현재 팀원 ${members.length}명\n`;
      members.forEach((m: any) => {
        result += `- ${m.users?.nickname||"팀원"}: ${m.work_days||"요일미정"} 시급${m.wage?.toLocaleString()||"미설정"}원\n`;
      });
      return result;
    }

    // ── 내 근태 ──
    if (intent.id === "my_attendance") {
      const { data: att } = await supabase.from("attendance")
        .select("work_date, status, actual_hours").eq("worker_id", userId)
        .gte("work_date", `${monthStr}-01`).order("work_date");
      if (!att || att.length === 0) return `이번달(${monthStr}) 근태 기록이 없어요.`;
      type AttRow = { status: string; actual_hours: string | number | null };
      const normal = (att as AttRow[]).filter(a => a.status==="normal").length;
      const late = (att as AttRow[]).filter(a => a.status==="late").length;
      const totalH = (att as AttRow[]).reduce((s, a) => s+(parseFloat(String(a.actual_hours ?? 0))||0), 0);
      return `📊 이번달(${monthStr}) 내 근태\n출근 ${normal}일 / 지각 ${late}회\n총 근무 ${totalH.toFixed(1)}시간`;
    }

    return null;
  }

  async function loadProfile(userId: string) {
    const { data } = await supabase.from("users")
      .select("nickname, paz_name, paz_knowledge, paz_avatar, paz_theme, paz_photo_url, worker_result, employer_result, user_type")
      .eq("id", userId).maybeSingle();
    if (data) {
      const name = data.paz_name || "PAZ";
      setPazName(name);
      setAvatar(data.paz_avatar || "🤖");
      setPhotoUrl(data.paz_photo_url || null);
      setUsePhoto(!!data.paz_photo_url);
      const t = THEMES[data.paz_theme || "purple"] || THEMES.purple;
      setThemeFrom(t.from);
      setThemeTo(t.to);

      // 최근 대화 이력 불러오기 (최근 100개)
      const { data: history } = await supabase
        .from("paz_chats")
        .select("role, content, is_voice, created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(100);

      const nickname = data.nickname || "님";

      if (history && history.length > 0) {
        const sorted = [...history].reverse().map(m => ({
          role: m.role as "user" | "assistant",
          content: m.content,
          isVoice: m.is_voice,
          createdAt: m.created_at,
        }));
        setMessages(sorted);

        // 선제적 대화 체크 (마지막 대화 이후 이벤트 확인)
        await checkProactiveMessage(userId, name, nickname, data.user_type);
      } else {
        const greeting = {
          role: "assistant" as const,
          content: `안녕하세요! 저는 ${name}예요 🤖\n\n채용·업무 고민·이직·커리어 방향 등 일에 관한 모든 것을 함께 이야기해요. 무엇이든 편하게 말씀해주세요, ${nickname}님!`,
          createdAt: new Date().toISOString(),
        };
        setMessages([greeting]);
        await supabase.from("paz_chats").insert({ user_id: userId, role: "assistant", content: greeting.content });
      }
    }
  }

  async function checkProactiveMessage(userId: string, pazName: string, nickname: string, userType: string) {
    // 마지막 PAZ 대화 시간
    const { data: lastChat } = await supabase
      .from("paz_chats")
      .select("created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const lastChatTime = lastChat ? new Date(lastChat.created_at) : null;
    const now = new Date();
    const hoursSinceLast = lastChatTime ? (now.getTime() - lastChatTime.getTime()) / (1000 * 60 * 60) : 999;

    // 6시간 이내 접속이면 선제 메시지 안 띄움
    if (hoursSinceLast < 6) return;

    let proactiveMsg = "";

    // 1. 최근 채용 완료된 매칭 확인
    const { data: recentHired } = await supabase
      .from("matches")
      .select("id, updated_at, employer_profiles(business_name)")
      .or(`worker_id.eq.${userId},employer_id.eq.${userId}`)
      .eq("progress_status", "hired")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (recentHired) {
      const hiredAt = new Date(recentHired.updated_at);
      const daysSinceHired = (now.getTime() - hiredAt.getTime()) / (1000 * 60 * 60 * 24);
      const bizName = (recentHired as any).employer_profiles?.business_name;

      if (daysSinceHired >= 1 && daysSinceHired <= 7) {
        if (userType === "worker" || userType === "both") {
          proactiveMsg = `${bizName ? `${bizName}에서` : ""} 일 시작하셨죠? 😊 첫 며칠 어떠세요? 적응은 잘 되고 계신가요?`;
        } else {
          proactiveMsg = `${bizName ? `${bizName}에` : ""} 새 직원이 합류했죠! 😊 잘 적응하고 있나요? 팀 분위기는 어때요?`;
        }
      }
    }

    // 2. 면접 예약 후 지났는지 확인
    if (!proactiveMsg) {
      const { data: recentInterview } = await supabase
        .from("interviews")
        .select("interview_date, interview_time")
        .or(`worker_id.eq.${userId},employer_id.eq.${userId}`)
        .lte("interview_date", now.toISOString().split("T")[0])
        .order("interview_date", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (recentInterview) {
        const interviewAt = new Date(recentInterview.interview_date);
        const daysSince = (now.getTime() - interviewAt.getTime()) / (1000 * 60 * 60 * 24);
        if (daysSince >= 0.5 && daysSince <= 2) {
          proactiveMsg = userType === "worker"
            ? `면접은 잘 보셨나요? 😊 결과가 궁금하네요!`
            : `면접 진행하셨죠? 어떠셨나요? 마음에 드는 분이었나요?`;
        }
      }
    }

    // 3. 오랫동안 안 들어온 경우
    if (!proactiveMsg && hoursSinceLast >= 72) {
      const greetings = [
        `${nickname}님, 잘 지내고 계신가요? 😊 요즘 일은 어떠세요?`,
        `오랜만이에요 ${nickname}님! 요즘 어떻게 지내셨어요?`,
        `${nickname}님 안녕하세요! 그동안 잘 지내셨죠? 😊`,
      ];
      proactiveMsg = greetings[Math.floor(Math.random() * greetings.length)];
    }

    // 선제 메시지 있으면 추가
    if (proactiveMsg) {
      const msg = {
        role: "assistant" as const,
        content: proactiveMsg,
        createdAt: new Date().toISOString(),
      };
      setMessages(prev => [...prev, msg]);
      await supabase.from("paz_chats").insert({ user_id: userId, role: "assistant", content: proactiveMsg });
    }
  }

  async function savePazName(name: string) {
    if (!user) return;
    await supabase.from("users").update({ paz_name: name }).eq("id", user.id);
    setPazName(name);
    setEditingName(false);
    setMessages(prev => [{
      role: "assistant",
      content: `이제부터 ${name}(으)로 불러주세요! 잘 부탁드려요 😊`,
    }, ...prev.slice(1)]);
  }

  async function sendMessage(text: string, isVoice = false) {
    if (!text.trim() || loading) return;
    const userMsg: Message = { role: "user", content: text, isVoice, createdAt: new Date().toISOString() };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");
    setLoading(true);

    // 유저 메시지 저장
    const { data: insertedChat } = await supabase
      .from("paz_chats")
      .insert({ user_id: user.id, role: "user", content: text, is_voice: isVoice })
      .select("id").single();

    // 임베딩 생성 (백그라운드 - 응답 안 기다림)
    if (insertedChat?.id) {
      fetch("/api/paz-memory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "embed", userId: user.id, chatId: insertedChat.id, text }),
      }).catch(() => {});
    }

    try {
      // 사용자 성향 + 장기기억 로드
      const { data: profile } = await supabase.from("users")
        .select("nickname, worker_result, employer_result, user_type, worker_bot_knowledge, employer_bot_knowledge, paz_knowledge")
        .eq("id", user.id).maybeSingle();

      // 유사 기억 검색 (pgvector)
      let similarMemories = "";
      try {
        const memRes = await fetch("/api/paz-memory", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "search", userId: user.id, query: text }),
        });
        const memData = await memRes.json();
        if (memData.memories?.length > 0) {
          similarMemories = "\n- 관련 과거 기억:\n" + memData.memories
            .map((m: any) => `  · ${new Date(m.created_at).toLocaleDateString("ko-KR")}: "${m.content}" (감정: ${m.emotion || "중립"})`)
            .join("\n");
        }
      } catch {}


      // 위험 액션(발행/발송) 전 확인 단계
      const actionConfirmKeywords = ["발행", "보내줘", "발송"];
      const needsConfirm = actionConfirmKeywords.some(k => text.includes(k));
      const isConfirmReply = ["네", "응", "ㅇㅇ", "고고", "해줘"].includes(text.trim());
      const isCancelReply = ["아니", "취소", "ㄴㄴ"].some(k => text.trim().startsWith(k));

      if (needsConfirm && !isConfirmReply && !pendingConfirm) {
        // 첫 요청 → 확인 메시지
        const confirmMsg = { role: "assistant" as const, content: `"${text}" 를 실행할까요? (네/아니오)`, createdAt: new Date().toISOString() };
        setMessages(prev => [...prev, confirmMsg]);
        setPendingConfirm({ text, action: text });
        setInput("");
        setLoading(false);
        return;
      }

      if (isCancelReply && pendingConfirm) {
        setPendingConfirm(null);
        const cancelMsg = { role: "assistant" as const, content: "취소했어요! 다른 도움이 필요하면 말해주세요.", createdAt: new Date().toISOString() };
        setMessages(prev => [...prev, cancelMsg]);
        setInput("");
        setLoading(false);
        return;
      }

      // 확인 응답이면 pending 액션 실행
      const finalText = (isConfirmReply && pendingConfirm) ? pendingConfirm.text : text;
      if (isConfirmReply && pendingConfirm) setPendingConfirm(null);
      // 실시간 DB 컨텍스트 조회
      const dbContext = await fetchPazContext(user.id, profile?.user_type || "worker");

      // 인텐트 감지 및 즉시 처리
      const actionResult = await detectAndExecuteAction(text, user.id, profile?.user_type || "worker");
      if (actionResult) {
        const actionMsg = { role: "assistant" as const, content: actionResult, createdAt: new Date().toISOString() };
        setMessages(prev => [...prev, actionMsg]);
        await supabase.from("paz_chats").insert({ user_id: user.id, role: "assistant", content: actionResult });
        setInput("");
        setLoading(false);
        return;
      }

      const systemPrompt = `당신은 ${pazName}입니다. 파잡(PAZAB) 플랫폼의 AI 인사·커리어 에이전트예요.

사용자 정보:
- 닉네임: ${profile?.nickname || "사용자"}
- 역할: ${profile?.user_type === "employer" ? "사장님(자영업자)" : profile?.user_type === "worker" ? "알바생/구직자" : "사장님+구직자"}
${profile?.worker_result ? `- 성향(구직자): ${JSON.stringify(profile.worker_result).slice(0, 200)}` : ""}
${profile?.employer_result ? `- 성향(사장님): ${JSON.stringify(profile.employer_result).slice(0, 200)}` : ""}
${profile?.employer_bot_knowledge ? `- 매장/사업 정보: ${profile.employer_bot_knowledge.slice(0, 300)}` : ""}
${profile?.paz_knowledge ? `- 대화 요약 (장기기억): ${profile.paz_knowledge}` : ""}${similarMemories}
${dbContext ? `\n실시간 현황:${dbContext}` : ""}

역할:
- 사장님에게: AI 인사관리자 (채용·계약·근태·팀관리 조언)
- 구직자에게: AI 커리어 코치 (업무고민·이직·커리어방향)
- 성향 데이터 기반 개인화된 조언
- 실시간 현황 데이터를 활용해 구체적으로 답변
- 무조건 1~3문장으로 짧게. 핵심만.
- 절대 하지 말 것: 전문 심리상담, 법률/의료 조언`;

      const res = await fetch("/api/paz-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: newMessages.map(m => ({ role: m.role, content: m.content })),
          systemPrompt,
          userId: user?.id,
          userType: profile?.user_type || "worker",
        }),
      });

      const data = await res.json();
      const reply = data.reply;
      const emotion = data.emotion || "중립";
      const jobChangeIntent = data.jobChangeIntent || false;

      setMessages(prev => [...prev, { role: "assistant", content: reply, createdAt: new Date().toISOString() }]);

      // 자동 읽기 ON이면 답변 음성 출력 후 다시 음성 인식 시작 (핸즈프리 루프)
      if (autoSpeak) {
        speak(reply, -1); // -1 = 자동재생 (버튼과 무관)
        const checkSpeaking = setInterval(() => {
          if (!window.speechSynthesis.speaking) {
            clearInterval(checkSpeaking);
            if (autoSpeak) startRecording();
          }
        }, 500);
      }

      // 유저 메시지 + 감정 저장
      await supabase.from("paz_chats").update({ emotion }).eq("user_id", user.id).order("created_at", { ascending: false }).limit(1);

      // AI 응답 저장
      await supabase.from("paz_chats").insert({ user_id: user.id, role: "assistant", content: reply });

      // 이직 의도 감지 → 공고 추천 메시지
      if (jobChangeIntent) {
        setTimeout(async () => {
          const recommendMsg = {
            role: "assistant" as const,
            content: `이직 고민하고 계시는군요! 성향에 맞는 공고를 찾아봤어요 👀\n탐색 페이지에서 확인해보세요!`,
            createdAt: new Date().toISOString(),
            isRecommend: true,
          };
          setMessages(prev => [...prev, recommendMsg]);
          await supabase.from("paz_chats").insert({ user_id: user.id, role: "assistant", content: recommendMsg.content });
        }, 1500);
      }

      // 주간 리포트 체크 (7일마다)
      const { data: userInfo } = await supabase.from("users").select("paz_last_report_at").eq("id", user.id).maybeSingle();
      const lastReport = userInfo?.paz_last_report_at ? new Date(userInfo.paz_last_report_at) : null;
      const daysSinceReport = lastReport ? (new Date().getTime() - lastReport.getTime()) / (1000 * 60 * 60 * 24) : 999;

      if (daysSinceReport >= 7) {
        const { data: weekChats } = await supabase.from("paz_chats").select("emotion, content, role").eq("user_id", user.id).order("created_at", { ascending: false }).limit(50);
        if (weekChats && weekChats.length >= 5) {
          const emotions = weekChats.filter((c: { emotion: string | null }) => c.emotion).map((c: { emotion: string | null }) => c.emotion as string);
          const emotionCount: Record<string, number> = {};
          emotions.forEach((e: string) => { emotionCount[e] = (emotionCount[e] || 0) + 1; });
          const topEmotion = Object.entries(emotionCount).sort((a,b) => b[1]-a[1])[0]?.[0] || "중립";
          const negativeCount = (emotionCount["부정"] || 0) + (emotionCount["스트레스"] || 0) + (emotionCount["불안"] || 0);
          const positiveCount = (emotionCount["긍정"] || 0) + (emotionCount["만족"] || 0) + (emotionCount["기대"] || 0);

          const reportMsg = `📊 이번 주 감정 리포트\n\n주로 느낀 감정: ${topEmotion}\n긍정적 순간: ${positiveCount}회 / 부정적 순간: ${negativeCount}회\n\n${negativeCount > positiveCount ? "요즘 힘드신 게 있으신 것 같아요. 언제든 이야기해요 💙" : "이번 주도 잘 지내고 계시네요! 앞으로도 응원할게요 🎉"}`;

          setTimeout(async () => {
            setMessages(prev => [...prev, { role: "assistant", content: reportMsg, createdAt: new Date().toISOString() }]);
            await supabase.from("paz_chats").insert({ user_id: user.id, role: "assistant", content: reportMsg });
            await supabase.from("users").update({ paz_last_report_at: new Date().toISOString() }).eq("id", user.id);
          }, 2000);
        }
      }

      // 20개마다 요약 → 장기기억
      const { count } = await supabase.from("paz_chats").select("*", { count: "exact", head: true }).eq("user_id", user.id);
      if (count && count % 20 === 0) {
        const { data: recent } = await supabase.from("paz_chats").select("role, content").eq("user_id", user.id).order("created_at", { ascending: false }).limit(20);
        if (recent) {
          const summaryRes = await fetch("/api/paz-chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              messages: [{ role: "user", content: `다음 대화를 3~5문장으로 요약해줘. 사용자의 주요 고민, 상황, 성향이 드러나도록:\n\n${recent.reverse().map((m: { role: string; content: string }) => `${m.role}: ${m.content}`).join("\n")}` }],
              systemPrompt: "대화 요약 전문가. 핵심만 간결하게.",
            }),
          });
          const summaryData = await summaryRes.json();
          await supabase.from("users").update({ paz_knowledge: summaryData.reply }).eq("id", user.id);
        }
      }
    } catch (e) {
      setMessages(prev => [...prev, { role: "assistant", content: "잠시 오류가 발생했어요. 다시 시도해주세요 🙏" }]);
    }
    setLoading(false);
  }

  // Web Speech API 실시간 음성인식
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [usePhoto, setUsePhoto] = useState(false);

  function speak(text: string, index?: number) {
    if (!window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = "ko-KR";
    utter.rate = 1.05;
    utter.pitch = 1.0;
    utter.onstart = () => setSpeakingIndex(index ?? -1);
    utter.onend = () => setSpeakingIndex(null);
    utter.onerror = () => setSpeakingIndex(null);
    window.speechSynthesis.speak(utter);
  }

  function stopSpeak() {
    window.speechSynthesis?.cancel();
    setSpeakingIndex(null);
  }

  function startRecording() {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("음성인식을 지원하지 않는 브라우저예요. 크롬을 사용해주세요!");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = "ko-KR";
    recognition.continuous = false;    // 한 문장씩
    recognition.interimResults = true;

    let finalResult = "";

    recognition.onstart = () => setRecording(true);

    recognition.onresult = (event: any) => {
      let interim = "";
      let final = "";
      for (let i = 0; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) final = transcript;
        else interim = transcript;
      }
      if (final) finalResult = final;
      setInput(final || interim);
    };

    recognition.onerror = (e: any) => {
      console.error("Speech error:", e.error);
      setRecording(false);
    };

    recognition.onend = () => {
      setRecording(false);
      // 인식된 텍스트 자동 전송
      if (finalResult.trim()) {
        sendMessage(finalResult.trim(), true);
        setInput("");
      }
    };

    recognitionRef.current = recognition;
    recognition.start();
  }

  function stopRecording() {
    recognitionRef.current?.stop();
    setRecording(false);
  }

  const quickQuestions = [
    "나 지금 이직 고민 중인데...",
    "우리 팀 분위기가 좀 안 좋아서",
    "나한테 맞는 일이 뭘까?",
    "채용 공고 어떻게 쓰면 좋아?",
  ];

  return (
    <main style={{ minHeight: "100vh", background: "var(--bg)", display: "flex", flexDirection: "column", maxWidth: 480, margin: "0 auto" }}>

      {/* 헤더 */}
      <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 12, background: "var(--surface)" }}>
        <button onClick={() => router.back()} style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", padding: 4, flexShrink: 0 }}>
          <i className="ti ti-arrow-left" style={{ fontSize: 20, display: "block" }} aria-hidden="true" />
        </button>

        {/* PAZ 아바타 */}
        <div style={{ width: 40, height: 40, borderRadius: "50%", background: "linear-gradient(135deg, #8b5cf6, #ec4899)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, boxShadow: "0 2px 12px rgba(139,92,246,0.4)", animation: "morphBtn 4s ease-in-out infinite" }}>
          <i className="ti ti-robot" style={{ fontSize: 20, color: "#fff" }} aria-hidden="true" />
        </div>

        {/* 이름 + 서브타이틀 */}
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text)" }}>PAZ</div>
          <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
            {(() => {
              const userType = (user as any)?.user_type;
              const mode = typeof window !== "undefined" ? localStorage.getItem("current_mode") : null;
              const isEmployer = userType === "employer" || (userType === "both" && mode === "employer");
              return isEmployer ? "AI HR 에이전트" : "AI 커리어 코치";
            })()}
          </div>
        </div>

        {/* 온라인 표시 */}
        <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#10b981", flexShrink: 0 }} />

        {/* 핸즈프리 토글 */}
        <button onClick={() => {
          if (speakingIndex !== null) stopSpeak();
          const next = !autoSpeak;
          setAutoSpeak(next);
          if (!next && recording) stopRecording();
        }}
          title={autoSpeak ? "핸즈프리 끄기" : "핸즈프리 켜기"}
          style={{ background: autoSpeak ? "linear-gradient(135deg, #8b5cf6, #ec4899)" : "var(--surface2)", border: "none", borderRadius: 20, padding: "5px 10px", fontSize: 11, fontWeight: 700, color: autoSpeak ? "#fff" : "var(--text-muted)", cursor: "pointer", transition: "all 0.15s", display: "flex", alignItems: "center", gap: 4 }}>
          <i className="ti ti-microphone" style={{ fontSize: 13 }} aria-hidden="true" />
          <span>{autoSpeak ? "ON" : "OFF"}</span>
        </button>

        {/* 설정 버튼 */}
        <button onClick={() => router.push("/paz/settings")}
          style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", padding: 4 }}>
          <i className="ti ti-settings" style={{ fontSize: 18, display: "block" }} aria-hidden="true" />
        </button>
      </div>

      {/* 메시지 목록 */}
      <div style={{ flex: 1, overflowY: "auto", padding: "16px", display: "flex", flexDirection: "column", gap: 12 }}>
        {messages.map((msg, i) => {
          // 날짜 구분선 표시 여부
          const msgDate = msg.createdAt ? new Date(msg.createdAt).toDateString() : null;
          const prevDate = i > 0 && messages[i-1].createdAt ? new Date(messages[i-1].createdAt!).toDateString() : null;
          const showDateDivider = msgDate && msgDate !== prevDate;

          const formatDate = (iso: string) => {
            const d = new Date(iso);
            const days = ["일", "월", "화", "수", "목", "금", "토"];
            return `${d.getFullYear()}년 ${d.getMonth()+1}월 ${d.getDate()}일 ${days[d.getDay()]}요일`;
          };

          return (
            <div key={i}>
              {/* 날짜 구분선 */}
              {showDateDivider && (
                <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "8px 0 16px" }}>
                  <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
                  <span style={{ fontSize: 11, color: "var(--text-muted)", background: "var(--surface2)", padding: "3px 10px", borderRadius: 20, whiteSpace: "nowrap" }}>
                    {formatDate(msg.createdAt!)}
                  </span>
                  <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
                </div>
              )}

              <div style={{ display: "flex", justifyContent: msg.role === "user" ? "flex-end" : "flex-start", alignItems: "flex-end", gap: 6 }}>
                {msg.role === "assistant" && (
                  <div style={{ width: 28, height: 28, borderRadius: "50%", background: "linear-gradient(135deg, #8b5cf6, #ec4899)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <i className="ti ti-robot" style={{ fontSize: 14, color: "#fff" }} aria-hidden="true" />
                  </div>
                )}
                <div style={{
                  maxWidth: "72%",
                  background: msg.role === "user" ? `linear-gradient(135deg, ${themeFrom}, ${themeFrom}cc)` : "var(--surface2)",
                  color: msg.role === "user" ? "#fff" : "var(--text)",
                  borderRadius: msg.role === "user" ? "18px 18px 4px 18px" : "18px 18px 18px 4px",
                  padding: "10px 14px",
                  fontSize: 14,
                  lineHeight: 1.6,
                  whiteSpace: "pre-wrap",
                }}>
                  {msg.isVoice && <span style={{ fontSize: 10, color: "rgba(255,255,255,0.6)", display: "block", marginBottom: 4 }}>🎤 음성</span>}
                  {msg.content}
                  {msg.isRecommend && (
                    <button onClick={() => router.push("/explore")}
                      style={{ display: "block", marginTop: 10, width: "100%", background: `linear-gradient(135deg, ${themeFrom}, ${themeTo})`, border: "none", borderRadius: 10, padding: "8px 12px", color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                      👀 공고 탐색하기 →
                    </button>
                  )}
                </div>
                {/* 🔊 읽기 버튼 - 말풍선별 독립 */}
                <button onClick={() => speakingIndex === i ? stopSpeak() : speak(msg.content, i)}
                  style={{ background: speakingIndex === i ? "rgba(139,92,246,0.15)" : "none", border: "none", width: 28, height: 28, borderRadius: "50%", cursor: "pointer", flexShrink: 0, color: speakingIndex === i ? "#8b5cf6" : "var(--text-muted)", transition: "all 0.15s", display: "flex", alignItems: "center", justifyContent: "center", opacity: speakingIndex === i ? 1 : 0.4 }}
                  title={speakingIndex === i ? "멈추기" : "읽기"}>
                  <i className={`ti ${speakingIndex === i ? "ti-player-stop" : "ti-volume"}`} style={{ fontSize: 14 }} aria-hidden="true" />
                </button>
                {msg.role === "user" && <div style={{ width: 4 }} />}
              </div>
            </div>
          );
        })}

        {/* 로딩 */}
        {loading && (
          <div style={{ display: "flex", alignItems: "flex-end", gap: 8 }}>
            <div style={{ width: 28, height: 28, borderRadius: "50%", background: "linear-gradient(135deg, #8b5cf6, #ec4899)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <i className="ti ti-robot" style={{ fontSize: 14, color: "#fff" }} aria-hidden="true" />
            </div>
            <div style={{ background: "var(--surface2)", borderRadius: "18px 18px 18px 4px", padding: "10px 14px" }}>
              <span style={{ fontSize: 13, color: "var(--text-muted)" }}>생각 중...</span>
            </div>
          </div>
        )}

        {/* 빠른 질문 (메시지 없을 때) */}
        {messages.length <= 1 && (
          <div style={{ marginTop: 8 }}>
            <p style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 8 }}>자주 묻는 질문</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {quickQuestions.map((q, i) => (
                <button key={i} onClick={() => sendMessage(q)}
                  style={{ background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 12, padding: "8px 12px", textAlign: "left", fontSize: 13, color: "var(--text-muted)", cursor: "pointer" }}>
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* 입력창 */}
      <div style={{ padding: "12px 16px 28px", borderTop: "1px solid var(--border)", background: "var(--surface)", display: "flex", gap: 8, alignItems: "flex-end" }}>

        {/* 마이크 버튼 - 토글 방식 */}
        <button
          onClick={recording ? stopRecording : startRecording}
          disabled={loading}
          style={{
            width: 44, height: 44, borderRadius: "50%", flexShrink: 0,
            background: recording ? "linear-gradient(135deg, #ef4444, #dc2626)" : `linear-gradient(135deg, ${themeFrom}, ${themeTo})`,
            border: "none", cursor: "pointer", fontSize: 18,
            display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: recording ? "0 0 0 4px rgba(239,68,68,0.3)" : `0 2px 8px ${themeFrom}55`,
            transition: "all 0.15s",
            animation: recording ? "pulse 1s infinite" : "none",
          }}>
          <i className={`ti ${recording ? "ti-player-stop" : "ti-microphone"}`} style={{ fontSize: 18 }} aria-hidden="true" />
        </button>

        {/* 텍스트 입력 */}
        <input
          ref={inputRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === "Enter" && !e.shiftKey && sendMessage(input)}
          placeholder={recording ? "말씀하세요... 🎤" : "메시지 입력..."}
          disabled={loading}
          style={{
            flex: 1, background: "var(--surface2)", border: `1px solid ${recording ? themeFrom : "var(--border)"}`,
            borderRadius: 22, padding: "10px 16px", color: "var(--text)", fontSize: 14,
            outline: "none", transition: "border 0.15s",
          }}
        />

        {/* 전송 버튼 */}
        <button
          data-paz-send
          onClick={() => sendMessage(input)}
          disabled={!input.trim() || loading || recording}
          style={{
            width: 44, height: 44, borderRadius: "50%", flexShrink: 0,
            background: input.trim() ? `linear-gradient(135deg, ${themeFrom}, ${themeTo})` : "var(--surface2)",
            border: "none", cursor: input.trim() ? "pointer" : "default",
            fontSize: 18, display: "flex", alignItems: "center", justifyContent: "center",
            opacity: !input.trim() || loading ? 0.4 : 1, transition: "all 0.15s",
          }}>
          <i className="ti ti-send" style={{ fontSize: 18 }} aria-hidden="true" />
        </button>
      </div>
    </main>
  );
}
