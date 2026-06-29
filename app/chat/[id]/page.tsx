"use client";

import React, { useState, useEffect, useRef } from "react";
import { useRouter, useParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { getTrustGrade } from "@/lib/utils";

export default function ChatRoomPage() {
  const router = useRouter();
  const params = useParams();
  const matchId = params.id as string;

  const [userId, setUserId] = useState<string | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [counterpart, setCounterpart] = useState<any>(null);
  const [counterpartProfile, setCounterpartProfile] = useState<any>(null);
  const [match, setMatch] = useState<any>(null);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showMenu, setShowMenu] = useState(false);
  const [showLeaveModal, setShowLeaveModal] = useState(false);
  const [showHireProposalModal, setShowHireProposalModal] = useState(false);
  const [showContractModal, setShowContractModal] = useState(false);
  const [contractData, setContractData] = useState<any>(null);
  const [contractStatus, setContractStatus] = useState<"none"|"pending"|"done">("none");
  const [leaveStep, setLeaveStep] = useState<"confirm" | "review">("confirm");
  const [quickReview, setQuickReview] = useState<"good" | "bad" | null>(null);
  const [quickReviewReason, setQuickReviewReason] = useState("");
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [reviewScore, setReviewScore] = useState(0);
  const [reviewComment, setReviewComment] = useState("");
  const [showInterviewModal, setShowInterviewModal] = useState(false);
  const [hasInterview, setHasInterview] = useState(false);
  const [muteNotif, setMuteNotif] = useState(false);
  const [progressStatus, setProgressStatus] = useState("accepted");
  const progressStatusRef = useRef("accepted");
  const isEmployerRef = useRef(false);

  const updateProgressStatus = (status: string) => {
    setProgressStatus(status);
    progressStatusRef.current = status;
  };

  // 면접 예약 폼
  const [interviewDate, setInterviewDate] = useState("");
  const [interviewTime, setInterviewTime] = useState("");
  const [interviewPlace, setInterviewPlace] = useState("");

  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<any>(null);
  const [recording, setRecording] = useState(false);

  useEffect(() => {
    let readPollIntervalId: any;
    init().then(() => {
      readPollIntervalId = setInterval(async () => {
        const uid = (await supabase.auth.getUser()).data.user?.id;
        if (!uid) return;
        const { data: updatedMsgs } = await supabase
          .from("chats").select("id, is_read")
          .eq("match_id", matchId).eq("sender_id", uid).eq("is_read", true);
        if (updatedMsgs && updatedMsgs.length > 0) {
          const readIds = new Set(updatedMsgs.map((m: any) => m.id));
          setMessages(prev => prev.map(m => readIds.has(m.id) ? { ...m, is_read: true } : m));
        }
      }, 3000);
    });
    return () => {
      supabase.removeAllChannels();
      if (readPollIntervalId) clearInterval(readPollIntervalId);
    };
  }, [matchId]);

  const checkContractStatus = async () => {
    const { data } = await supabase.from("contracts")
      .select("id, worker_signed, employer_signed")
      .eq("match_id", matchId).limit(1).maybeSingle();
    if (!data) setContractStatus("none");
    else if (data.worker_signed) setContractStatus("done");
    else setContractStatus("pending");
  };

  const init = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { router.push("/login"); return; }
    setUserId(session.user.id);
    await fetchMessages(session.user.id);
    subscribeRealtime(session.user.id);
  };

  const fetchMessages = async (uid: string) => {
    try {
      const res = await fetch(`/api/chat?matchId=${matchId}&userId=${uid}`);
      const data = await res.json();
      if (data.success) {
        setMessages(data.data || []);
        setCounterpart(data.counterpart);
        setCounterpartProfile(data.counterpartProfile);
        setMatch(data.match);
        const ps = data.match?.progress_status || "accepted";
        setProgressStatus(ps);

        // 내가 받은 안읽은 메시지 일괄 읽음 처리
        supabase.from("chats")
          .update({ is_read: true })
          .eq("match_id", matchId)
          .eq("receiver_id", uid)
          .eq("is_read", false)
          .then(() => {
            // 읽음 처리 후 메시지 상태 업데이트
            setMessages(prev => prev.map(m =>
              m.receiver_id === uid ? { ...m, is_read: true } : m
            ));
          });

        // hired 상태면 항상 계약서 상태 체크
        if (ps === "hired") {
          checkContractStatus();
        }

        // 로그인 후 미확인 채용 제안 감지
        const m = data.match;
        const isEmp = m?.employer_id === uid;
        if (m?.hire_confirmed_by_employer && !m?.hire_confirmed_by_worker && !isEmp && m?.progress_status !== "hired") {
          setShowHireProposalModal(true);
        }
      }
    } catch {}
    setLoading(false);
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
  };

  const subscribeRealtime = (uid: string) => {
    const channel = supabase.channel(`chat:${matchId}:${Date.now()}`);

    // 새 메시지 구독 (INSERT)
    channel.on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "chats",
        filter: `match_id=eq.${matchId}`,
      }, (payload) => {
        setMessages(prev => {
          if (prev.find(m => m.id === payload.new.id)) return prev;
          return [...prev, payload.new];
        });
        setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
        if (payload.new.receiver_id === uid) {
          supabase.from("chats").update({ is_read: true }).eq("id", payload.new.id);
          setMessages(prev => prev.map(m => m.id === payload.new.id ? { ...m, is_read: true } : m));
          if (payload.new.message_type === "system" && payload.new.message?.includes("채용이 확정됐어요")) {
            setShowReviewModal(true);
          }
        }
      })
    // 읽음 상태 변경 구독 (UPDATE) - 상대가 읽으면 "1" 즉시 제거
    .on("postgres_changes", {
        event: "UPDATE",
        schema: "public",
        table: "chats",
        filter: `match_id=eq.${matchId}`,
      }, (payload) => {
        if (payload.new.is_read && payload.new.sender_id === uid) {
          setMessages(prev => prev.map(m =>
            m.id === payload.new.id ? { ...m, is_read: true } : m
          ));
        }
      })
    .subscribe();

    const pollInterval = setInterval(async () => {
      const { data: m } = await supabase
        .from("matches")
        .select("progress_status, hire_confirmed_by_employer, hire_confirmed_by_worker")
        .eq("id", matchId).single();

      if (m?.progress_status === "hired") {
        updateProgressStatus("hired");
        checkContractStatus(); // hired 상태면 계속 계약서 상태 체크
      } else if (m?.progress_status === "interviewing") {
        updateProgressStatus("interviewing");
      }

      // 알바생: 채용 제안 감지 (이미 모달 표시 중이 아닐 때만)
      if (m?.hire_confirmed_by_employer && !m?.hire_confirmed_by_worker && !isEmployerRef.current && m?.progress_status !== "hired") {
        setShowHireProposalModal(true);
        clearInterval(pollInterval);
      }
    }, 3000);
  };

  const startRecording = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) { alert("크롬 브라우저를 사용해주세요!"); return; }

    const recognition = new SpeechRecognition();
    recognition.lang = "ko-KR";
    recognition.continuous = false;
    recognition.interimResults = true;

    recognition.onstart = () => setRecording(true);

    recognition.onresult = (event: any) => {
      let interim = "";
      let final = "";
      for (let i = 0; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) final = transcript;
        else interim = transcript;
      }
      setInput(final || interim);
    };

    recognition.onerror = () => setRecording(false);
    recognition.onend = () => setRecording(false);

    recognitionRef.current = recognition;
    recognition.start();
  };

  const stopRecording = () => {
    recognitionRef.current?.stop();
    setRecording(false);
  };

  const handleInterviewResult = async (result: "complete" | "cancel" | "noshow") => {
    const { data: { user: authUser } } = await supabase.auth.getUser();
    const myId = authUser?.id;
    const otherId = counterpart?.id;
    if (!myId || !otherId) return;

    if (result === "complete") {
      // 면접 완료 → accepted 복귀 (채용 제안 단계로)
      await supabase.from("matches").update({ progress_status: "accepted" }).eq("id", matchId);
      updateProgressStatus("accepted");
      await sendMessage("✅ 면접이 완료됐어요!\n채용 여부를 결정해주세요 😊", "system");

    } else if (result === "cancel") {
      // 합의 취소 → accepted 복귀
      await supabase.from("matches").update({ progress_status: "accepted" }).eq("id", matchId);
      updateProgressStatus("accepted");
      await sendMessage("📅 면접이 취소됐어요.\n필요하면 다시 면접을 잡을 수 있어요.", "system");
      // 신뢰점수 소폭 감소 (양쪽)
      await adjustTrustScore(myId, -3, "면접 취소");
      await adjustTrustScore(otherId, -3, "면접 취소");

    } else if (result === "noshow") {
      // 노쇼 신고 → 상대방 신뢰점수 -20
      const confirmed = window.confirm(
        "🚫 노쇼 신고\n\n상대방이 면접에 나타나지 않았나요?\n\n신고 시 상대방 신뢰점수가 -20점 감소해요.\n허위 신고 시 본인 점수도 감소할 수 있어요.\n\n계속 진행하시겠어요?"
      );
      if (!confirmed) return;
      await supabase.from("matches").update({ progress_status: "accepted" }).eq("id", matchId);
      updateProgressStatus("accepted");
      await sendMessage("🚫 노쇼가 신고됐어요.\n상대방 신뢰점수에 반영됩니다.", "system");
      await adjustTrustScore(otherId, -20, "면접 노쇼");
    }
  };

  const adjustTrustScore = async (uid: string, delta: number, reason: string) => {
    const { data: user } = await supabase.from("users")
      .select("trust_score, trust_log").eq("id", uid).single();
    if (!user) return;
    const newScore = Math.max(0, Math.min(200, (user.trust_score ?? 100) + delta));
    const newLog = [...(user.trust_log || []), {
      delta, reason, at: new Date().toISOString(), matchId,
    }].slice(-50); // 최근 50개만
    await supabase.from("users").update({ trust_score: newScore, trust_log: newLog }).eq("id", uid);
  };

  const loadContract = async () => {
    const { data } = await supabase.from("contracts")
      .select("*").eq("match_id", matchId)
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (data) {
      setContractData(data);
      setContractStatus(data.worker_signed ? "done" : "pending");
    } else {
      setContractStatus("none");
    }
    setShowContractModal(true);
  };

  const sendMessage = async (text?: string, type = "text") => {
    const msg = text || input.trim();
    if (!msg || !userId || sending) return;
    if (!text) setInput("");
    setSending(true);
    const counterpartId = match?.employer_id === userId ? match?.worker_id : match?.employer_id;
    try {
      await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ matchId, senderId: userId, receiverId: counterpartId, message: msg, messageType: type }),
      });
    } catch {}
    setSending(false);
    inputRef.current?.focus();
  };

  const handleProgress = async (action: string) => {
    setShowMenu(false);
    try {
      // hire는 양방향 동의 방식이라 직접 처리 (lovecall API 먼저 호출 안 함)
      if (action !== "hire" && action !== "hire_accept" && action !== "hire_reject") {
        await fetch("/api/lovecall", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ matchId, action }),
        });
      }
      if (action === "hire") {
        // 사장님이 채용 제안 → hire_confirmed_by_employer = true
        await supabase.from("matches")
          .update({ hire_confirmed_by_employer: true })
          .eq("id", matchId);
        await sendMessage("✅ 채용 제안을 보냈어요! 상대방의 수락을 기다리는 중이에요 😊", "system");
        updateProgressStatus("interviewing"); // 대기 상태 유지
      } else if (action === "hire_accept") {
        // 알바생이 수락 → 최종 hired
        await supabase.from("matches")
          .update({ hire_confirmed_by_worker: true })
          .eq("id", matchId);

        // team_members 자동 생성
        const empProfile = match?.employer_profile_id
          ? (await supabase.from("employer_profiles").select("wage, work_days, work_hours").eq("id", match.employer_profile_id).maybeSingle()).data
          : null;

        const { data: existingTm } = await supabase.from("team_members")
          .select("id")
          .eq("match_id", matchId)
          .maybeSingle();

        if (!existingTm) {
          await supabase.from("team_members").insert({
            employer_id: match?.employer_id,
            worker_id: match?.worker_id,
            match_id: matchId,
            hire_date: new Date().toISOString().split("T")[0],
            status: "active",
            wage: empProfile?.wage || null,
            work_days: empProfile?.work_days || null,
            work_hours: empProfile?.work_hours || null,
          });
        }

        await fetch("/api/lovecall", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ matchId, action: "hire" }),
        });
        updateProgressStatus("hired");
        // 사장님용 메시지 (receiver = employer)
        await supabase.from("chats").insert({
          match_id: matchId,
          sender_id: userId,
          receiver_id: match?.employer_id,
          message: "🎉 채용이 확정됐어요!\n\n📄 [계약서] 버튼을 눌러 근로계약서를 작성해주세요.\n계약서 작성 후 저장하면 알바생에게 알림이 가요.",
          message_type: "system",
          is_read: false,
        });
        // 알바생용 메시지 (본인 화면)
        await sendMessage(
          "🎉 채용이 확정됐어요!\n\n📄 사장님이 근로계약서를 작성 중이에요.\n작성 완료 후 알림이 오면 확인하고 동의해주세요.",
          "system"
        );
        setShowReviewModal(true);
      } else if (action === "hire_reject") {
        // 알바생이 거절 → 공고 active 복귀 + 채팅 유지
        await supabase.from("matches")
          .update({ hire_confirmed_by_employer: false })
          .eq("id", matchId);
        // 공고 active 복귀
        if (match?.employer_profile_id) {
          await supabase.from("employer_profiles")
            .update({ job_status: "active", is_active: true })
            .eq("id", match.employer_profile_id);
        }
        updateProgressStatus("accepted");
        await sendMessage("채용 제안이 거절됐어요. 다시 논의해봐요 😊", "system");
        setTimeout(() => init(), 500);
      } else if (action === "fail") {
        updateProgressStatus("failed");
        await sendMessage("매칭이 종료됐어요.", "system");
        router.push("/chat");
      } else if (action === "cancel") {
        updateProgressStatus("cancelled");
        await sendMessage("매칭이 취소됐어요.", "system");
        router.push("/chat");
      }
    } catch {}
  };

  const handleSubmitReview = async () => {
    if (!reviewScore) return;
    try {
      const employerRole = match?.employer_id === userId;
      const revieweeId = match?.worker_id === userId ? match?.employer_id : match?.worker_id;
      await supabase.from("reviews").insert({
        match_id: matchId,
        reviewer_id: userId,
        reviewee_id: revieweeId,
        score: reviewScore,
        comment: reviewComment,
        reviewer_type: employerRole ? "employer" : "worker",
      });
      const { data: reviews } = await supabase.from("reviews").select("score").eq("reviewee_id", revieweeId);
      if (reviews?.length) {
        const avg = reviews.reduce((s, r) => s + r.score, 0) / reviews.length;
        await supabase.from("users").update({ trust_score: Math.round(avg * 10) / 10, review_count: reviews.length }).eq("id", revieweeId);
      }
      setShowReviewModal(false);
      setReviewScore(0);
      setReviewComment("");
    } catch {}
  };

  const handleLeaveWithReview = async () => {
    if (quickReview) {
      try {
        const employerRole = match?.employer_id === userId;
        const score = quickReview === "good" ? 4 : 2;
        const revieweeId = match?.worker_id === userId ? match?.employer_id : match?.worker_id;
        await supabase.from("reviews").insert({
          match_id: matchId,
          reviewer_id: userId,
          reviewee_id: revieweeId,
          score,
          comment: quickReviewReason || (quickReview === "good" ? "괜찮았어요" : "별로였어요"),
          reviewer_type: employerRole ? "employer" : "worker",
        });
        const { data: reviews } = await supabase.from("reviews").select("score").eq("reviewee_id", revieweeId);
        if (reviews?.length) {
          const avg = reviews.reduce((s, r) => s + r.score, 0) / reviews.length;
          await supabase.from("users").update({ trust_score: Math.round(avg * 10) / 10, review_count: reviews.length }).eq("id", revieweeId);
        }
      } catch {}
    }
    handleLeaveRoom();
  };

  const handleLeaveRoom = async () => {
    try {
      // DB에서 최신 status 재확인
      const { data: currentMatch } = await supabase
        .from("matches").select("status, progress_status").eq("id", matchId).single();
      const currentStatus = currentMatch?.progress_status || currentMatch?.status || "accepted";

      // 면접 예약 중에 나가면 신뢰점수 감소
      if (currentStatus === "interviewing") {
        const { data: { user: authUser } } = await supabase.auth.getUser();
        if (authUser) await adjustTrustScore(authUser.id, -5, "면접 예약 후 나가기");
      }

      // 상대방한테 시스템 메시지 전송
      await supabase.from("chats").insert({
        match_id: matchId,
        sender_id: userId,
        message: currentStatus === "hired" ? "상대방이 채팅방을 나갔어요." : "상대방이 채팅방을 나갔어요. 매칭이 취소됩니다.",
        message_type: "system",
        is_read: false,
        receiver_id: match?.worker_id === userId ? match?.employer_id : match?.worker_id,
      });
      // 나간 사람 기록
      await fetch("/api/lovecall", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ matchId, action: "leave", userId }),
      });
      // hired 상태가 아닐 때만 cancel 처리
      if (currentStatus !== "hired") {
        await fetch("/api/lovecall", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ matchId, action: "cancel" }),
        });
      }
      router.replace("/chat");
    } catch { router.replace("/chat"); }
  };

  const handleInterviewSubmit = async () => {
    if (!interviewDate || !interviewTime) return;
    const dateTimeStr = `${interviewDate} ${interviewTime}`;
    const place = interviewPlace || "장소 미정";
    const msg = `📅 면접이 예약됐어요\n일시: ${interviewDate} ${interviewTime}\n장소: ${place}`;

    try {
      await fetch("/api/lovecall", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          matchId,
          action: "interview",
          interviewAt: new Date(`${interviewDate}T${interviewTime}`).toISOString(),
          interviewMemo: place,
        }),
      });
      updateProgressStatus("interviewing");
      await sendMessage(msg, "system");
    } catch {}
    setShowInterviewModal(false);
    setHasInterview(true);
    setInterviewDate(""); setInterviewTime(""); setInterviewPlace("");
  };

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric", weekday: "short" });
  };

  const counterpartName = counterpartProfile?.business_name
    ? `${counterpartProfile.business_name} 사장님`
    : counterpart?.nickname || counterpart?.name || "상대방";

  const isEmployer = match?.employer_id === userId;
  isEmployerRef.current = isEmployer;

  const getProgressBadge = () => {
    switch (progressStatus) {
      case "interviewing": return { label: "📅 면접예약중", color: "#fbbf24" };
      case "hired": return { label: "✅ 채용확정", color: "#86efac" };
      case "failed": return { label: "❌ 매칭실패", color: "#f87171" };
      case "cancelled": return { label: "취소됨", color: "#6b7280" };
      default: return { label: "💬 채팅중", color: "#c4b5fd" };
    }
  };

  const badge = getProgressBadge();
  let lastDate = "";

  if (loading) return (
    <main style={{ minHeight: "100vh", background: "var(--bg)", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <p style={{ color: "var(--text-muted)" }}>불러오는 중...</p>
    </main>
  );

  return (
    <main style={{ height: "100vh", background: "var(--bg)", color: "var(--text)", display: "flex", flexDirection: "column", maxWidth: 480, margin: "0 auto", position: "relative" }}>
      {/* 헤더 */}
      <div style={{ position: "sticky", top: 0, zIndex: 20, background: "rgba(24,24,27,0.97)", backdropFilter: "blur(12px)", borderBottom: "1px solid var(--border)", padding: "12px 16px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button onClick={() => router.push("/chat")}
            style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", flexShrink: 0, padding: 4 }}>
            <i className="ti ti-arrow-left" style={{ fontSize: 20, display: "block" }} aria-hidden="true" />
          </button>
          <button onClick={() => {
            const profilePath = counterpart?.user_type === "employer"
              ? `/job/${match?.employer_id}`
              : `/worker/${match?.worker_id}`;
            router.push(profilePath);
          }} style={{ display: "flex", alignItems: "center", gap: 10, background: "none", border: "none", cursor: "pointer", flex: 1, minWidth: 0, textAlign: "left" }}>
            <div style={{ width: 38, height: 38, borderRadius: 12, background: counterpart?.user_type === "employer" ? "linear-gradient(135deg, rgba(236,72,153,0.2), rgba(190,24,93,0.1))" : "linear-gradient(135deg, rgba(139,92,246,0.2), rgba(124,58,237,0.1))", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <i className={`ti ${counterpart?.user_type === "employer" ? "ti-building-store" : "ti-bolt"}`} style={{ fontSize: 18, color: counterpart?.user_type === "employer" ? "#f9a8d4" : "#c4b5fd" }} aria-hidden="true" />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <p style={{ fontSize: 15, fontWeight: 700, margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--text)" }}>{counterpartName}</p>
                <span style={{ fontSize: 10, fontWeight: 700, color: badge.color, background: `${badge.color}20`, padding: "2px 7px", borderRadius: 20, flexShrink: 0 }}>
                  {badge.label}
                </span>
                {counterpart?.trust_score != null && (() => {
                  const g = getTrustGrade(counterpart.trust_score);
                  return <span style={{ fontSize: 10, color: g.color, flexShrink: 0 }}>{g.emoji}</span>;
                })()}
              </div>
              <p style={{ fontSize: 11, color: "var(--text-muted)", margin: 0 }}>궁합 {match?.match_score}점 · 탭하면 프로필 보기</p>
            </div>
          </button>
          {/* AI 사전미팅 버튼 */}
          <button onClick={() => router.push(`/pre-meet/${params.id}`)}
            style={{ background: "rgba(139,92,246,0.15)", border: "1px solid rgba(139,92,246,0.3)", color: "#c4b5fd", fontSize: 11, fontWeight: 600, padding: "5px 10px", borderRadius: 20, cursor: "pointer", flexShrink: 0, whiteSpace: "nowrap" }}>
            🤖 사전미팅
          </button>
          {/* ··· 메뉴 */}
          <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 6 }}>
          {/* 계약서 버튼 (hired 상태) */}
          {progressStatus === "hired" && (
            <button onClick={loadContract}
              style={{
                background: contractStatus === "done" ? "rgba(16,185,129,0.15)" : contractStatus === "pending" ? "rgba(245,158,11,0.15)" : "rgba(239,68,68,0.15)",
                border: `1px solid ${contractStatus === "done" ? "rgba(16,185,129,0.4)" : contractStatus === "pending" ? "rgba(245,158,11,0.4)" : "rgba(239,68,68,0.4)"}`,
                color: contractStatus === "done" ? "#10b981" : contractStatus === "pending" ? "#f59e0b" : "#ef4444",
                fontSize: 11, fontWeight: 700, padding: "5px 10px", borderRadius: 20, cursor: "pointer", flexShrink: 0, whiteSpace: "nowrap" as const,
              }}>
              {contractStatus === "done" ? "📄 계약완료" : contractStatus === "pending" ? "⏳ 서명대기" : "⚠️ 계약서미작성"}
            </button>
          )}
            <button onClick={() => setShowMenu(!showMenu)}
              style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", padding: "4px 8px" }}>
              <i className="ti ti-dots" style={{ fontSize: 20, display: "block" }} aria-hidden="true" />
            </button>
            {showMenu && (
              <div style={{ position: "absolute", top: "100%", right: 0, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14, overflow: "hidden", width: 180, boxShadow: "0 8px 24px rgba(0,0,0,0.3)", zIndex: 50 }}>
                {/* 알림 끄기 */}
                <button onClick={() => { setMuteNotif(!muteNotif); setShowMenu(false); }}
                  style={{ width: "100%", background: "none", border: "none", padding: "12px 16px", cursor: "pointer", textAlign: "left", fontSize: 13, color: "var(--text)", borderBottom: "1px solid var(--border)" }}>
                  {muteNotif ? "🔔 알림 켜기" : "🔕 알림 끄기"}
                </button>
                {/* 면접 예약/수정 (사장님 + accepted 상태만) */}
                {isEmployer && progressStatus === "accepted" && (
                  <button onClick={() => { setShowMenu(false); setShowInterviewModal(true); }}
                    style={{ width: "100%", background: "none", border: "none", padding: "12px 16px", cursor: "pointer", textAlign: "left", fontSize: 13, color: "#fbbf24", borderBottom: "1px solid var(--border)" }}>
                    {hasInterview ? "📅 면접 일정 수정" : "📅 면접 예약하기"}
                  </button>
                )}
                {/* 면접 결과 처리 (interviewing 상태) */}
                {progressStatus === "interviewing" && (<>
                  {isEmployer && (
                    <button onClick={() => { setShowMenu(false); handleInterviewResult("complete"); }}
                      style={{ width: "100%", background: "none", border: "none", padding: "12px 16px", cursor: "pointer", textAlign: "left", fontSize: 13, color: "#86efac", borderBottom: "1px solid var(--border)" }}>
                      ✅ 면접 완료
                    </button>
                  )}
                  <button onClick={() => { setShowMenu(false); handleInterviewResult("cancel"); }}
                    style={{ width: "100%", background: "none", border: "none", padding: "12px 16px", cursor: "pointer", textAlign: "left", fontSize: 13, color: "#fbbf24", borderBottom: "1px solid var(--border)" }}>
                    ❌ 면접 취소 (합의)
                  </button>
                  <button onClick={() => { setShowMenu(false); handleInterviewResult("noshow"); }}
                    style={{ width: "100%", background: "none", border: "none", padding: "12px 16px", cursor: "pointer", textAlign: "left", fontSize: 13, color: "#f87171", borderBottom: "1px solid var(--border)" }}>
                    🚫 노쇼 신고
                  </button>
                </>)}
                {/* 채용 확정 (사장님 + accepted or interviewing만) */}
                {isEmployer && ["accepted", "interviewing"].includes(progressStatus) && (
                  <button onClick={() => { setShowMenu(false); handleProgress("hire"); }}
                    style={{ width: "100%", background: "none", border: "none", padding: "12px 16px", cursor: "pointer", textAlign: "left", fontSize: 13, color: "#86efac", borderBottom: "1px solid var(--border)" }}>
                    ✅ 채용 제안 보내기
                  </button>
                )}
                {/* 채팅방 나가기 - 항상 표시 */}
                <button onClick={() => { setShowMenu(false); setShowLeaveModal(true); }}
                  style={{ width: "100%", background: "none", border: "none", padding: "12px 16px", cursor: "pointer", textAlign: "left", fontSize: 13, color: "#f87171" }}>
                  🚪 채팅방 나가기
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 메시지 목록 */}
      <div style={{ flex: 1, overflowY: "auto", padding: "16px" }} onClick={() => setShowMenu(false)}>
        {messages.length === 0 && (
          <div style={{ textAlign: "center", padding: "40px 0" }}>
            <p style={{ fontSize: 14, color: "var(--text-muted)", marginBottom: 4 }}>매칭이 성사됐어요! 🎉</p>
            <p style={{ fontSize: 13, color: "var(--text-muted)" }}>먼저 인사를 건네보세요 👋</p>
          </div>
        )}
        {messages.map((msg) => {
          const isMine = msg.sender_id === userId;
          const dateLabel = formatDate(msg.created_at);
          const showDate = dateLabel !== lastDate;
          lastDate = dateLabel;
          return (
            <div key={msg.id}>
              {showDate && (
                <div style={{ textAlign: "center", margin: "12px 0" }}>
                  <span style={{ fontSize: 11, color: "var(--text-muted)", background: "var(--surface2)", padding: "4px 12px", borderRadius: 20 }}>{dateLabel}</span>
                </div>
              )}
              {msg.message_type === "system" ? (
                <div style={{ display: "flex", justifyContent: "center", marginBottom: 12 }}>
                  <div style={{ background: "linear-gradient(135deg, rgba(139,92,246,0.12), rgba(236,72,153,0.08))", border: "1px solid var(--primary-border)", borderRadius: 16, padding: "10px 16px", fontSize: 13, color: "#c4b5fd", textAlign: "center", maxWidth: "85%", lineHeight: 1.6, whiteSpace: "pre-line" }}>
                    {msg.message}
                    {/* 채용 확정 → 사장님: 계약서 작성 버튼 */}
                    {msg.message?.includes("채용이 확정됐어요") && msg.message?.includes("계약서를 작성") && isEmployer && (
                      <div style={{ marginTop: 10 }}>
                        <button onClick={() => router.push(`/contract?matchId=${matchId}&mode=update&from=chat`)}
                          style={{ background: "linear-gradient(135deg,#7c3aed,#ec4899)", border: "none", borderRadius: 10, padding: "8px 16px", color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                          ✏️ 계약서 작성하기
                        </button>
                      </div>
                    )}
                    {/* 계약서 발행/수정 → [계약서 확인하기] */}
                    {(msg.message?.includes("근로계약서가 발행") || msg.message?.includes("근로계약서가 수정")) && (
                      <div style={{ marginTop: 10, display: "flex", gap: 6, justifyContent: "center", flexWrap: "wrap" as const }}>
                        <button onClick={loadContract}
                          style={{ background: "linear-gradient(135deg,#7c3aed,#ec4899)", border: "none", borderRadius: 10, padding: "8px 14px", color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                          📄 계약서 확인하기
                        </button>
                        {isEmployer && (
                          <button onClick={() => router.push(`/contract?matchId=${matchId}&mode=update&from=chat`)}
                            style={{ background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 10, padding: "8px 14px", color: "var(--text-muted)", fontSize: 12, cursor: "pointer" }}>
                            ✏️ 수정하기
                          </button>
                        )}
                      </div>
                    )}
                    {/* 수정 요청 → 사장님: 계약서 수정하기 버튼 */}
                    {msg.message?.includes("수정 요청") && isEmployer && (
                      <div style={{ marginTop: 10 }}>
                        <button onClick={() => router.push(`/contract?matchId=${matchId}&mode=update&from=chat`)}
                          style={{ background: "rgba(245,158,11,0.2)", border: "1px solid rgba(245,158,11,0.4)", borderRadius: 10, padding: "8px 16px", color: "#f59e0b", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                          ✏️ 계약서 수정하기
                        </button>
                      </div>
                    )}
                    {/* 동의 완료 → 계약서 보기 + 사장님은 재계약하기 */}
                    {msg.message?.includes("동의가 완료") && (
                      <div style={{ marginTop: 10, display:"flex", gap:6, justifyContent:"center", flexWrap:"wrap" as const }}>
                        <button onClick={loadContract}
                          style={{ background: "rgba(16,185,129,0.2)", border: "1px solid rgba(16,185,129,0.4)", borderRadius: 10, padding: "8px 14px", color: "#10b981", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                          📄 계약서 보기
                        </button>
                        {isEmployer && (
                          <button onClick={() => router.push(`/contract?matchId=${matchId}&mode=update&from=chat`)}
                            style={{ background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 10, padding: "8px 14px", color: "var(--text-muted)", fontSize: 12, cursor: "pointer" }}>
                            📝 재계약하기
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ) : isMine ? (
                /* 내 메시지 - 오른쪽 */
                <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 4 }}>
                  <div style={{ maxWidth: "72%" }}>
                    <div style={{ background: "linear-gradient(135deg, #8b5cf6, #7c3aed)", borderRadius: "18px 18px 4px 18px", padding: "10px 14px", fontSize: 14, color: "#fff", lineHeight: 1.5, wordBreak: "break-word" }}>
                      {msg.message}
                    </div>
                    <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 3, textAlign: "right", display: "flex", alignItems: "center", gap: 4, justifyContent: "flex-end" }}>
                      {!msg.is_read && <span style={{ color: "#c4b5fd", fontSize: 9, fontWeight: 700 }}>1</span>}
                      {formatTime(msg.created_at)}
                    </div>
                  </div>
                </div>
              ) : (
                /* 상대방 메시지 - 왼쪽 + 아바타 + 닉네임 */
                <div style={{ display: "flex", gap: 8, marginBottom: 4, alignItems: "flex-start" }}>
                  {/* 아바타 */}
                  <button onClick={() => router.push(`/profile/${counterpart?.id}`)}
                    style={{ background: "none", border: "none", padding: 0, cursor: "pointer", flexShrink: 0 }}>
                    {counterpart?.avatar_url ? (
                      <img src={counterpart.avatar_url} alt="avatar"
                        style={{ width: 36, height: 36, borderRadius: "50%", objectFit: "cover" }} />
                    ) : (
                      <div style={{ width: 36, height: 36, borderRadius: "50%", background: counterpart?.user_type === "employer" ? "linear-gradient(135deg, rgba(236,72,153,0.3), rgba(190,24,93,0.2))" : "linear-gradient(135deg, rgba(139,92,246,0.3), rgba(124,58,237,0.2))", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <i className={`ti ${counterpart?.user_type === "employer" ? "ti-building-store" : "ti-bolt"}`} style={{ fontSize: 18, color: counterpart?.user_type === "employer" ? "#f9a8d4" : "#c4b5fd" }} aria-hidden="true" />
                      </div>
                    )}
                  </button>
                  <div style={{ maxWidth: "72%" }}>
                    {/* 닉네임 */}
                    <button onClick={() => router.push(`/profile/${counterpart?.id}`)}
                      style={{ background: "none", border: "none", padding: 0, cursor: "pointer", marginBottom: 4 }}>
                      <span style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 600 }}>
                        {counterpartName}
                      </span>
                    </button>
                    <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "4px 18px 18px 18px", padding: "10px 14px", fontSize: 14, color: "var(--text)", lineHeight: 1.5, wordBreak: "break-word" }}>
                      {msg.message}
                    </div>
                    <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 3 }}>
                      {formatTime(msg.created_at)}
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* 입력창 */}
      <div style={{ borderTop: "1px solid var(--border)", padding: "10px 16px", background: "rgba(24,24,27,0.97)", backdropFilter: "blur(12px)", paddingBottom: "calc(10px + env(safe-area-inset-bottom))" }}>
        {/* 상대방 나간 상태 */}
        {(() => {
          const isEmp = match?.employer_id === userId;
          const counterpartLeft = isEmp ? match?.worker_left : match?.employer_left;
          if (counterpartLeft) return (
            <div style={{ textAlign: "center", padding: "8px 0", marginBottom: 8 }}>
              <span style={{ fontSize: 12, color: "var(--text-muted)", background: "var(--surface2)", padding: "6px 14px", borderRadius: 20 }}>
                상대방이 채팅방을 나갔어요
              </span>
            </div>
          );
          return null;
        })()}
        <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
          {/* 음성 입력 버튼 - 토글 */}
          <button
            onClick={recording ? stopRecording : startRecording}
            disabled={sending || !!(match?.employer_id === userId ? match?.worker_left : match?.employer_left)}
            style={{ width: 42, height: 42, borderRadius: "50%", flexShrink: 0, background: recording ? "linear-gradient(135deg, #ef4444, #dc2626)" : "var(--surface2)", border: `1px solid ${recording ? "#ef4444" : "var(--border)"}`, cursor: "pointer", fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: recording ? "0 0 0 4px rgba(239,68,68,0.25)" : "none", transition: "all 0.15s" }}>
            <i className={`ti ${recording ? "ti-player-stop" : "ti-microphone"}`} style={{ fontSize: 18 }} aria-hidden="true" />
          </button>
          <input ref={inputRef} type="text" value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
            placeholder={recording ? "말씀하세요... 🎤" : "메시지를 입력하세요..."}
            disabled={!!(match?.employer_id === userId ? match?.worker_left : match?.employer_left)}
            style={{ flex: 1, background: "var(--surface)", border: `1px solid ${recording ? "#8b5cf6" : "var(--border)"}`, borderRadius: 20, padding: "10px 16px", color: "var(--text)", fontSize: 14, outline: "none", transition: "border 0.15s", opacity: (match?.employer_id === userId ? match?.worker_left : match?.employer_left) ? 0.5 : 1 }} />
          <button onClick={() => sendMessage()} disabled={!input.trim() || sending || !!(match?.employer_id === userId ? match?.worker_left : match?.employer_left)}
            style={{ width: 42, height: 42, borderRadius: "50%", background: input.trim() ? "linear-gradient(135deg, #8b5cf6, #7c3aed)" : "var(--surface2)", border: "none", color: "#fff", cursor: input.trim() ? "pointer" : "default", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, transition: "background 0.2s" }}>
            <i className="ti ti-send" style={{ fontSize: 18 }} aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* 면접 예약 모달 */}
      {showInterviewModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 100, display: "flex", alignItems: "flex-end" }}>
          <div style={{ background: "var(--surface)", borderRadius: "20px 20px 0 0", padding: 24, width: "100%", maxWidth: 480, margin: "0 auto" }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, margin: "0 0 20px" }}>
              {hasInterview ? "📅 면접 일정 수정" : "📅 면접 예약"}
            </h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

              {/* 날짜 */}
              <div>
                <label style={{ fontSize: 13, color: "var(--text-muted)", display: "block", marginBottom: 6 }}>📆 면접 날짜</label>
                <input type="date" value={interviewDate} onChange={e => setInterviewDate(e.target.value)}
                  min={new Date().toISOString().split("T")[0]}
                  style={{ width: "100%", background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 12, padding: "12px 14px", color: "var(--text)", fontSize: 14, outline: "none", boxSizing: "border-box" }} />
              </div>

              {/* 시간 - 드롭다운 */}
              <div>
                <label style={{ fontSize: 13, color: "var(--text-muted)", display: "block", marginBottom: 6 }}>⏰ 면접 시간</label>
                <select value={interviewTime} onChange={e => setInterviewTime(e.target.value)}
                  style={{ width: "100%", background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 12, padding: "12px 14px", color: interviewTime ? "var(--text)" : "var(--text-muted)", fontSize: 14, outline: "none", boxSizing: "border-box" }}>
                  <option value="">시간 선택</option>
                  {Array.from({ length: 27 }, (_, i) => {
                    const h = Math.floor(i / 2) + 9;
                    const m = i % 2 === 0 ? "00" : "30";
                    const label = `${String(h).padStart(2, "0")}:${m}`;
                    return <option key={label} value={label}>{label}</option>;
                  })}
                </select>
              </div>

              {/* 장소 */}
              <div>
                <label style={{ fontSize: 13, color: "var(--text-muted)", display: "block", marginBottom: 6 }}>📍 면접 장소</label>
                <input type="text" value={interviewPlace} onChange={e => setInterviewPlace(e.target.value)}
                  placeholder="예: 매장 내, 카페 이름, 주소 등"
                  style={{ width: "100%", background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 12, padding: "12px 14px", color: "var(--text)", fontSize: 14, outline: "none", boxSizing: "border-box" }} />
                {/* 빠른 선택 */}
                <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
                  {["매장 내", "카페", "화상 면접"].map(p => (
                    <button key={p} onClick={() => setInterviewPlace(p)}
                      style={{ padding: "5px 12px", borderRadius: 20, fontSize: 12, cursor: "pointer", background: interviewPlace === p ? "var(--primary-light)" : "var(--surface2)", color: interviewPlace === p ? "#c4b5fd" : "var(--text-muted)", border: interviewPlace === p ? "1px solid var(--primary-border)" : "1px solid transparent" }}>
                      {p}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 20 }}>
              <button onClick={handleInterviewSubmit} disabled={!interviewDate || !interviewTime}
                style={{ flex: 1, background: !interviewDate || !interviewTime ? "var(--surface2)" : "linear-gradient(135deg, #8b5cf6, #7c3aed)", border: "none", color: !interviewDate || !interviewTime ? "var(--text-muted)" : "#fff", fontWeight: 700, padding: 14, borderRadius: 12, cursor: !interviewDate || !interviewTime ? "default" : "pointer", fontSize: 14 }}>
                {hasInterview ? "일정 수정" : "예약 확정"}
              </button>
              <button onClick={() => setShowInterviewModal(false)}
                style={{ flex: 1, background: "var(--surface2)", border: "1px solid var(--border)", color: "var(--text-muted)", fontWeight: 600, padding: 14, borderRadius: 12, cursor: "pointer", fontSize: 14 }}>
                취소
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 계약서 모달 */}
      {showContractModal && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.85)", zIndex:200, display:"flex", flexDirection:"column" }}>
          {/* 모달 헤더 */}
          <div style={{ background:"rgba(24,24,27,0.98)", borderBottom:"1px solid var(--border)", padding:"12px 16px", display:"flex", alignItems:"center", gap:10, flexShrink:0 }}>
            <button onClick={() => setShowContractModal(false)}
              style={{ background:"none", border:"none", color:"var(--text-muted)", fontSize:20, cursor:"pointer" }}>←</button>
            <span style={{ fontSize:15, fontWeight:700, color:"var(--text)" }}>근로계약서</span>
            <div style={{ flex:1 }} />
            <span style={{ fontSize:11, borderRadius:8, padding:"3px 8px", fontWeight:600,
              background: contractData?.worker_signed ? "#10b98120" : "#f59e0b20",
              color: contractData?.worker_signed ? "#10b981" : "#f59e0b" }}>
              {contractData?.worker_signed ? "✅ 서명 완료" : "⏳ 서명 대기"}
            </span>
          </div>

          {/* 계약서 내용 스크롤 */}
          <div style={{ flex:1, overflowY:"auto", padding:12 }}>
            {contractData ? (
              <div style={{ background:"#fff", borderRadius:10, padding:"14px 12px" }}>
                {(() => {
                  const f = contractData.contract_data || {};
                  const ct = f.contractType || "parttime";
                  const titles: Record<string,string> = {
                    parttime:"단시간근로자 표준근로계약서",
                    standard:"표준 근로계약서",
                    minor:"연소근로자 표준근로계약서",
                  };
                  const selectedDays = f.workDaysMode==="text" ? f.workDaysText :
                    ["월","화","수","목","금","토","일"].filter((_,i) =>
                      (f as any)[[`workDaysMon`,`workDaysTue`,`workDaysWed`,`workDaysThu`,`workDaysFri`,`workDaysSat`,`workDaysSun`][i]]
                    ).join("·");
                  const tdH = { border:"1px solid #555", padding:"5px 8px", background:"#f0f0f0", fontWeight:600 as const, width:"22%", textAlign:"center" as const, fontSize:"9pt" };
                  const tdV = { border:"1px solid #555", padding:"5px 8px", fontSize:"9pt" };
                  return (
                    <div style={{ fontFamily:"'Noto Sans KR',sans-serif", fontSize:"9.5pt", color:"#000", lineHeight:1.6 }}>
                      <div style={{ fontSize:14, fontWeight:900, textAlign:"center", letterSpacing:3, marginBottom:4 }}>{titles[ct]}</div>
                      <div style={{ fontSize:"8pt", textAlign:"center", color:"#444", marginBottom:12, borderBottom:"2px solid #000", paddingBottom:6 }}>
                        (「근로기준법」 제17조에 따른 서면 근로계약)
                      </div>
                      {[
                        { sec:"1. 사업주 정보", rows:[
                          [{h:"사업체명",v:f.biz||"-"},{h:"사업자번호",v:f.bizRegNo||"-"}],
                          [{h:"대표자",v:f.ceo||"-"},{h:"연락처",v:f.ceoPhone||"-"}],
                          [{h:"사업장 소재지",v:f.bizAddr||"-",colSpan:3}],
                          [{h:"근무 장소",v:f.samePlace?(f.bizAddr||"사업장 소재지와 동일"):(f.workPlace||"-"),colSpan:3}],
                          [{h:"업종",v:f.bizType||"-"},{h:"담당 업무",v:f.jobDesc||"-"}],
                        ]},
                        { sec:`${ct==="minor"?"3":"2"}. 근로자 정보`, rows:[
                          [{h:"성명",v:f.worker||"-"},{h:"생년월일",v:f.workerBirth||"-"}],
                          [{h:"연락처",v:f.workerPhone||"-"},{h:"주소",v:f.workerAddr||"-"}],
                        ]},
                      ].map(sec => (
                        <div key={sec.sec}>
                          <div style={{ fontSize:"9.5pt", fontWeight:700, borderLeft:"3px solid #000", paddingLeft:5, margin:"10px 0 4px" }}>{sec.sec}</div>
                          <table style={{ width:"100%", borderCollapse:"collapse" as const, marginBottom:2 }}><tbody>
                            {sec.rows.map((row, ri) => (
                              <tr key={ri}>
                                {row.map((cell: any, ci) => (
                                  cell.colSpan ? (
                                    <React.Fragment key={ci}><td style={tdH}>{cell.h}</td><td colSpan={cell.colSpan} style={tdV}>{cell.v}</td></React.Fragment>
                                  ) : (
                                    <React.Fragment key={ci}><td style={tdH}>{cell.h}</td><td style={tdV}>{cell.v}</td></React.Fragment>
                                  )
                                ))}
                              </tr>
                            ))}
                          </tbody></table>
                        </div>
                      ))}
                      {/* 계약 기간 */}
                      <div style={{ fontSize:"9.5pt", fontWeight:700, borderLeft:"3px solid #000", paddingLeft:5, margin:"10px 0 4px" }}>{ct==="minor"?"4":"3"}. 근로계약 기간</div>
                      <div style={{ paddingLeft:12, fontSize:"9pt", lineHeight:2 }}>
                        {f.contractType==="unlimited"?"무기계약":f.contractType==="daily"?"일용직":"기간제"} · {f.startDate||"-"} ~ {f.contractType==="unlimited"?"별도 해지 통보 시까지":(f.endDate||"-")}
                      </div>
                      {/* 근무 요일/시간 */}
                      <div style={{ fontSize:"9.5pt", fontWeight:700, borderLeft:"3px solid #000", paddingLeft:5, margin:"10px 0 4px" }}>{ct==="minor"?"5":"4"}. 근무 요일 및 시간</div>
                      <div style={{ paddingLeft:12, fontSize:"9pt", lineHeight:2 }}>
                        <div>근무 요일: <strong>{selectedDays||"-"}</strong></div>
                        <div>근무 시간: {f.workStart||"-"} ~ {f.workEnd||"-"} (휴게 {f.breakTime||"-"}분)</div>
                        <div>1일 {f.dailyHours||"-"}시간 · 1주 {f.weeklyHours||"-"}시간</div>
                      </div>
                      {/* 임금 */}
                      <div style={{ fontSize:"9.5pt", fontWeight:700, borderLeft:"3px solid #000", paddingLeft:5, margin:"10px 0 4px" }}>{ct==="minor"?"6":"5"}. 임금</div>
                      <div style={{ paddingLeft:12, fontSize:"9pt", lineHeight:2 }}>
                        <div>시급: <strong>{f.wage||"-"}원</strong></div>
                        <div>지급일: 매월 {f.payDay||"-"} · 지급 방법: {f.payMethod||"-"}</div>
                      </div>
                      {/* 사회보험 */}
                      <div style={{ fontSize:"9.5pt", fontWeight:700, borderLeft:"3px solid #000", paddingLeft:5, margin:"10px 0 4px" }}>{ct==="minor"?"7":"6"}. 사회보험</div>
                      <div style={{ paddingLeft:12, fontSize:"9pt", display:"flex", gap:12, flexWrap:"wrap" as const }}>
                        {[{k:"insEmp",l:"고용보험"},{k:"insAcc",l:"산재보험"},{k:"insPension",l:"국민연금"},{k:"insHealth",l:"건강보험"}].map(ins => (
                          <span key={ins.k} style={{ display:"inline-flex", alignItems:"center", gap:3 }}>
                            <span style={{ display:"inline-block", width:11, height:11, border:"1px solid #555", textAlign:"center" as const, lineHeight:"11px", fontSize:"8pt" }}>{f[ins.k]?"✓":""}</span>
                            {ins.l}
                          </span>
                        ))}
                      </div>
                      {/* 서명란 */}
                      <div style={{ marginTop:14, borderTop:"1px solid #000", paddingTop:10, fontSize:"8.5pt" }}>
                        <div style={{ textAlign:"center", marginBottom:8 }}>위와 같이 근로계약을 체결하고 서명날인한다.</div>
                        <div style={{ textAlign:"center", marginBottom:10 }}>{f.contractDate||"-"}</div>
                        <div style={{ display:"flex", justifyContent:"space-around" }}>
                          <div style={{ textAlign:"center" }}>
                            <div style={{ fontWeight:700, marginBottom:4 }}>사 업 주</div>
                            <div>{f.biz||"-"} · {f.ceo||"-"}</div>
                            <div style={{ color: contractData.employer_signed?"#10b981":"#aaa", fontSize:"8pt" }}>{contractData.employer_signed?"(서명 완료)":"(미서명)"}</div>
                          </div>
                          <div style={{ textAlign:"center" }}>
                            <div style={{ fontWeight:700, marginBottom:4 }}>근 로 자</div>
                            <div>{f.worker||"-"}</div>
                            <div style={{ color: contractData.worker_signed?"#10b981":"#f59e0b", fontSize:"8pt" }}>{contractData.worker_signed?"(서명 완료)":"(서명 대기)"}</div>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </div>
            ) : (
              <div style={{ textAlign:"center", padding:"40px 24px", color:"#888" }}>
                <div style={{ fontSize:48, marginBottom:12 }}>📄</div>
                {isEmployer ? (
                  <>
                    <p style={{ fontSize:15, fontWeight:700, color:"var(--text)", marginBottom:8 }}>아직 계약서가 없어요</p>
                    <p style={{ fontSize:13, color:"var(--text-muted)", lineHeight:1.7, marginBottom:20 }}>
                      지금 바로 근로계약서를 작성해보세요.<br/>
                      작성 후 저장하면 알바생에게 알림이 가요.
                    </p>
                    <button onClick={() => { setShowContractModal(false); router.push(`/contract?matchId=${matchId}&mode=update&from=chat`); }}
                      style={{ background:"linear-gradient(135deg,#7c3aed,#ec4899)", border:"none", borderRadius:14, padding:"12px 24px", color:"#fff", fontSize:14, fontWeight:700, cursor:"pointer" }}>
                      ✏️ 계약서 작성하기
                    </button>
                  </>
                ) : (
                  <>
                    <p style={{ fontSize:15, fontWeight:700, color:"var(--text)", marginBottom:8 }}>아직 계약서가 없어요</p>
                    <p style={{ fontSize:13, color:"var(--text-muted)", lineHeight:1.7 }}>
                      사장님이 근로계약서를 작성하면<br/>
                      이곳에서 확인하고 동의할 수 있어요.
                    </p>
                  </>
                )}
              </div>
            )}
          </div>

          {/* 하단 버튼 */}
          <div style={{ padding:"12px 16px 24px", background:"rgba(24,24,27,0.98)", borderTop:"1px solid var(--border)", flexShrink:0 }}>
            {!isEmployer && contractData && !contractData.worker_signed ? (
              <div style={{ display:"flex", gap:8 }}>
                <button onClick={async () => {
                  const reason = prompt("수정 요청 내용을 입력해주세요:");
                  if (!reason) return;
                  await sendMessage(`⚠️ 계약서 수정 요청\n"${reason}"`, "system");
                  setShowContractModal(false);
                }}
                  style={{ flex:1, background:"var(--surface2)", border:"1px solid #f59e0b40", color:"#f59e0b", fontWeight:600, padding:14, borderRadius:14, fontSize:13, cursor:"pointer" }}>
                  ⚠️ 수정 요청
                </button>
                <button onClick={async () => {
                  // 1단계: 법적 안내 confirm
                  const confirmed = window.confirm(
                    "📄 근로계약서 동의 전 확인사항\n\n" +
                    "✅ 본 동의는 전자문서법에 따라\n" +
                    "   법적 효력이 있는 계약으로 성립됩니다.\n\n" +
                    "📌 권장 사항\n" +
                    "· 계약서를 출력하여 양측이 서명 후\n" +
                    "  각 1부씩 보관하시길 권장해요.\n" +
                    "· 출력은 [출력] 버튼을 이용해주세요.\n\n" +
                    "⚠️ 동의 후에는 취소가 어려우니\n" +
                    "   내용을 충분히 확인 후 동의해주세요.\n\n" +
                    "[확인] 동의를 진행합니다\n" +
                    "[취소] 다시 확인합니다"
                  );
                  if (!confirmed) return;

                  // 2단계: 실제 동의 처리
                  await supabase.from("contracts")
                    .update({ worker_signed:true, status:"active", signed_at:new Date().toISOString() })
                    .eq("id", contractData.id);

                  if (progressStatus !== "hired") {
                    await supabase.from("matches")
                      .update({ progress_status:"hired", hire_confirmed_by_employer:true, hire_confirmed_by_worker:true })
                      .eq("id", matchId);
                    const { data: existingTm } = await supabase.from("team_members")
                      .select("id")
                      .eq("match_id", matchId)
                      .maybeSingle();

                    if (!existingTm) {
                      await supabase.from("team_members").insert({
                        employer_id: counterpart?.id,
                        worker_id: userId,
                        match_id: matchId,
                        hire_date: new Date().toISOString().split("T")[0],
                        status: "active",
                      });
                    }
                    updateProgressStatus("hired");
                  }

                  await sendMessage(
                    "🎉 근로계약서 동의가 완료됐어요!\n\n" +
                    "📄 계약서는 MY → 팀·소속 관리에서\n언제든 확인하실 수 있어요.\n\n" +
                    "📌 출력 후 각자 1부씩 보관하시길 권장해요.\n\n" +
                    "이제 법적 고용 관계가 성립됐습니다 ✅",
                    "system"
                  );
                  setContractData((p:any) => ({...p, worker_signed:true, status:"active"}));
                  setContractStatus("done");
                  setShowContractModal(false);
                }}
                  style={{ flex:2, background:"linear-gradient(135deg,#10b981,#059669)", border:"none", color:"#fff", fontWeight:700, padding:14, borderRadius:14, fontSize:14, cursor:"pointer" }}>
                  ✅ 계약서에 동의합니다
                </button>
              </div>
            ) : isEmployer ? (
              <div style={{ display:"flex", gap:8 }}>
                <button onClick={() => { setShowContractModal(false); router.push(`/contract?matchId=${matchId}&mode=update&from=chat`); }}
                  style={{ flex:1, background:"var(--surface2)", border:"1px solid var(--border)", color:"var(--text)", fontWeight:600, padding:14, borderRadius:14, fontSize:13, cursor:"pointer" }}>
                  ✏️ 수정하기
                </button>
                <button onClick={() => setShowContractModal(false)}
                  style={{ flex:1, background:"none", border:"none", color:"var(--text-muted)", padding:14, fontSize:13, cursor:"pointer" }}>
                  닫기
                </button>
              </div>
            ) : (
              <button onClick={() => setShowContractModal(false)}
                style={{ width:"100%", background:"var(--surface2)", border:"none", borderRadius:14, padding:14, color:"var(--text-muted)", fontSize:14, cursor:"pointer" }}>
                닫기
              </button>
            )}
          </div>
        </div>
      )}

      {/* 채용 제안 모달 (알바생용) */}
      {showHireProposalModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 100, display: "flex", alignItems: "flex-end" }}>
          <div style={{ background: "var(--surface)", borderRadius: "20px 20px 0 0", padding: 24, width: "100%", maxWidth: 480, margin: "0 auto" }}>
            <div style={{ textAlign: "center", marginBottom: 20 }}>
              <div style={{ fontSize: 48, marginBottom: 8 }}>🎉</div>
              <h3 style={{ fontSize: 18, fontWeight: 900, margin: "0 0 8px" }}>채용 제안이 왔어요!</h3>
              <p style={{ fontSize: 14, color: "var(--text-muted)", margin: 0, lineHeight: 1.7 }}>
                사장님이 채용을 제안했어요.<br />
                수락하면 최종 채용이 확정돼요!
              </p>
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => { handleProgress("hire_reject"); setShowHireProposalModal(false); }}
                style={{ flex: 1, background: "var(--surface2)", border: "1px solid var(--border)", color: "var(--text-muted)", fontWeight: 600, padding: 14, borderRadius: 12, cursor: "pointer", fontSize: 14 }}>
                거절하기
              </button>
              <button onClick={() => { handleProgress("hire_accept"); setShowHireProposalModal(false); }}
                style={{ flex: 2, background: "linear-gradient(135deg, #8b5cf6, #7c3aed)", border: "none", color: "#fff", fontWeight: 700, padding: 14, borderRadius: 12, cursor: "pointer", fontSize: 14 }}>
                🎉 수락하기
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 평가 모달 */}
      {showReviewModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div style={{ background: "var(--surface)", borderRadius: 24, padding: 28, width: "100%", maxWidth: 340, textAlign: "center" }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>🎉</div>
            <h3 style={{ fontSize: 18, fontWeight: 900, margin: "0 0 6px" }}>채용 확정!</h3>
            <p style={{ fontSize: 13, color: "var(--text-muted)", margin: "0 0 20px", lineHeight: 1.6 }}>
              {counterpartName}님은 어떠셨나요?<br />솔직한 평가가 서로에게 도움이 돼요 😊
            </p>

            {/* 별점 */}
            <div style={{ display: "flex", justifyContent: "center", gap: 8, marginBottom: 16 }}>
              {[1,2,3,4,5].map(s => (
                <button key={s} onClick={() => setReviewScore(s)}
                  style={{ fontSize: 32, background: "none", border: "none", cursor: "pointer", opacity: s <= reviewScore ? 1 : 0.3, transform: s <= reviewScore ? "scale(1.1)" : "scale(1)", transition: "all 0.1s" }}>
                  ⭐
                </button>
              ))}
            </div>
            <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "0 0 14px" }}>
              {reviewScore === 0 ? "별점을 선택해주세요" : ["😞 별로예요", "😐 그저 그래요", "😊 괜찮아요", "😄 좋았어요", "🤩 최고예요!"][reviewScore - 1]}
            </p>

            {/* 한줄평 */}
            <textarea value={reviewComment} onChange={e => setReviewComment(e.target.value)}
              placeholder="한줄평을 남겨주세요 (선택)"
              rows={2}
              style={{ width: "100%", background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 12, padding: "10px 14px", color: "var(--text)", fontSize: 13, outline: "none", resize: "none", boxSizing: "border-box", marginBottom: 16 }} />

            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <button onClick={handleSubmitReview} disabled={!reviewScore}
                style={{ width: "100%", background: reviewScore ? "linear-gradient(135deg, #8b5cf6, #7c3aed)" : "var(--surface2)", border: "none", color: reviewScore ? "#fff" : "var(--text-muted)", fontWeight: 700, padding: 14, borderRadius: 12, cursor: reviewScore ? "pointer" : "default", fontSize: 14 }}>
                평가 제출하기
              </button>
              <button onClick={() => setShowReviewModal(false)}
                style={{ width: "100%", background: "none", border: "none", color: "var(--text-muted)", fontSize: 13, cursor: "pointer", padding: 8 }}>
                나중에
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 채팅방 나가기 모달 */}
      {showLeaveModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div style={{ background: "var(--surface)", borderRadius: 20, padding: 24, width: "100%", maxWidth: 320, textAlign: "center" }}>

            {leaveStep === "confirm" ? (
              <>
                <h3 style={{ fontSize: 17, fontWeight: 900, margin: "0 0 10px" }}>채팅방을 나갈까요?</h3>
                <p style={{ fontSize: 13, color: "var(--text-muted)", margin: "0 0 20px", lineHeight: 1.6 }}>
                  {progressStatusRef.current === "hired"
                    ? "채팅방을 나가면 대화 내용이 삭제돼요.\n채용 확정 기록은 유지돼요 😊"
                    : "채팅방을 나가면 채팅 목록 및\n대화 내용이 삭제되고 복구할 수 없어요"
                  }
                </p>
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={() => { setLeaveStep("review"); }}
                    style={{ flex: 1, background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.3)", color: "#f87171", fontWeight: 700, padding: 14, borderRadius: 12, cursor: "pointer", fontSize: 14 }}>
                    나가기
                  </button>
                  <button onClick={() => { setShowLeaveModal(false); setLeaveStep("confirm"); }}
                    style={{ flex: 1, background: "var(--surface2)", border: "1px solid var(--border)", color: "var(--text-muted)", fontWeight: 600, padding: 14, borderRadius: 12, cursor: "pointer", fontSize: 14 }}>
                    취소
                  </button>
                </div>
              </>
            ) : (
              <>
                <h3 style={{ fontSize: 16, fontWeight: 900, margin: "0 0 6px" }}>상대방은 어떠셨나요?</h3>
                <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "0 0 16px" }}>솔직한 평가가 플랫폼을 더 안전하게 만들어요</p>

                {/* 간단 평가 버튼 */}
                <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
                  <button onClick={() => setQuickReview("good")}
                    style={{ flex: 1, padding: "12px", borderRadius: 12, border: `2px solid ${quickReview === "good" ? "#86efac" : "var(--border)"}`, background: quickReview === "good" ? "rgba(34,197,94,0.1)" : "var(--surface2)", cursor: "pointer", fontSize: 22 }}>
                    😊<br /><span style={{ fontSize: 11, color: quickReview === "good" ? "#86efac" : "var(--text-muted)", fontWeight: 600 }}>괜찮았어요</span>
                  </button>
                  <button onClick={() => setQuickReview("bad")}
                    style={{ flex: 1, padding: "12px", borderRadius: 12, border: `2px solid ${quickReview === "bad" ? "#f87171" : "var(--border)"}`, background: quickReview === "bad" ? "rgba(239,68,68,0.1)" : "var(--surface2)", cursor: "pointer", fontSize: 22 }}>
                    😞<br /><span style={{ fontSize: 11, color: quickReview === "bad" ? "#f87171" : "var(--text-muted)", fontWeight: 600 }}>별로였어요</span>
                  </button>
                </div>

                {/* 별로일 때 이유 선택 */}
                {quickReview === "bad" && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 14, justifyContent: "center" }}>
                    {["노쇼/연락두절", "비매너", "허위정보", "약속불이행", "기타"].map(r => (
                      <button key={r} onClick={() => setQuickReviewReason(r)}
                        style={{ padding: "5px 12px", borderRadius: 20, fontSize: 11, cursor: "pointer", background: quickReviewReason === r ? "rgba(239,68,68,0.15)" : "var(--surface2)", color: quickReviewReason === r ? "#f87171" : "var(--text-muted)", border: quickReviewReason === r ? "1px solid rgba(239,68,68,0.4)" : "1px solid transparent" }}>
                        {r}
                      </button>
                    ))}
                  </div>
                )}

                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <button onClick={handleLeaveWithReview}
                    style={{ width: "100%", background: "linear-gradient(135deg, #8b5cf6, #7c3aed)", border: "none", color: "#fff", fontWeight: 700, padding: 12, borderRadius: 12, cursor: "pointer", fontSize: 14 }}>
                    {quickReview ? "평가하고 나가기" : "그냥 나가기"}
                  </button>
                  <button onClick={() => { setLeaveStep("confirm"); setQuickReview(null); setQuickReviewReason(""); }}
                    style={{ background: "none", border: "none", color: "var(--text-muted)", fontSize: 12, cursor: "pointer", padding: 4 }}>
                    ← 돌아가기
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
