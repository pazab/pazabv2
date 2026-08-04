"use client";

import React, { useState, useEffect, useRef } from "react";
import type { CSSProperties } from "react";
import { useRouter, useParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { getTrustGrade } from "@/lib/utils";
import { chipStyle, chipSuccess, chipWarning, chipDanger, chipPrimary } from "@/lib/styles";
import { useToast } from "@/lib/useToast";

const mutedChip: CSSProperties = {
  ...chipStyle,
  background: "var(--surface2)",
  border: "1px solid var(--border)",
  color: "var(--text-muted)",
};

export default function ChatRoomPage() {
  const router = useRouter();
  const params = useParams();
  const matchId = params.id as string;
  const { showToast, ToastUI } = useToast();

  const [userId, setUserId] = useState<string | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [counterpart, setCounterpart] = useState<any>(null);
  const [counterpartProfile, setCounterpartProfile] = useState<any>(null);
  const [counterpartWorkerProfile, setCounterpartWorkerProfile] = useState<any>(null);
  const [match, setMatch] = useState<any>(null);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showMenu, setShowMenu] = useState(false);
  const [showLeaveModal, setShowLeaveModal] = useState(false);
  const [showHireProposalModal, setShowHireProposalModal] = useState(false);
  const [showContractModal, setShowContractModal] = useState(false);
  const [contractData, setContractData] = useState<any>(null);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [showRevisionModal, setShowRevisionModal] = useState(false);
  const [revisionReason, setRevisionReason] = useState("");
  const [contractStatus, setContractStatus] = useState<"none"|"pending"|"done"|"cancelled">("none");
  const [daetaContract, setDaetaContract] = useState<any>(null);
  const [leaveStep, setLeaveStep] = useState<"confirm" | "review">("confirm");
  const [quickReview, setQuickReview] = useState<"good" | "bad" | null>(null);
  const [quickReviewReason, setQuickReviewReason] = useState("");
  const [showSignConfirm, setShowSignConfirm] = useState(false);
  const [signSelfInfo, setSignSelfInfo] = useState<{ birth_date: string | null; phone: string | null; address: string | null; address_detail: string | null } | null>(null);
  const [signBirth, setSignBirth] = useState("");
  const [signPhone, setSignPhone] = useState("");
  const [signAddr, setSignAddr] = useState("");
  const [signAddrDetail, setSignAddrDetail] = useState("");
  const [signPostcode, setSignPostcode] = useState("");
  const [signBankName, setSignBankName] = useState("");
  const [signBankCustomName, setSignBankCustomName] = useState("");
  const [signBankNumber, setSignBankNumber] = useState("");
  const [signTried, setSignTried] = useState(false);
  const [showMinorWarningModal, setShowMinorWarningModal] = useState(false);
  const [detectedMinorAge, setDetectedMinorAge] = useState<number | null>(null);

  const calcAge = (birthDateStr: string): number | null => {
    if (!birthDateStr) return null;
    const clean = birthDateStr.replace(/\.\s*/g, "-").replace(/\s+/g, "");
    const birth = new Date(clean);
    if (isNaN(birth.getTime())) return null;
    const today = new Date();
    let age = today.getFullYear() - birth.getFullYear();
    const m = today.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) {
      age--;
    }
    return age;
  };
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [reviewScore, setReviewScore] = useState(0);
  const [reviewComment, setReviewComment] = useState("");
  const [showInterviewModal, setShowInterviewModal] = useState(false);
  const [hasInterview, setHasInterview] = useState(false);
  const [muteNotif, setMuteNotif] = useState(false);
  const [progressStatus, setProgressStatus] = useState("accepted");
  const progressStatusRef = useRef("accepted");
  const isEmployerRef = useRef(false);
  const [showRejectConfirmModal, setShowRejectConfirmModal] = useState(false);

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

  // 계약서 동의 시 본인 정보(생년월일/연락처/주소) 중 비어있는 항목만 받기 위해 조회
  useEffect(() => {
    if (!showSignConfirm || !userId) return;
    setSignTried(false);
    setSignBirth(""); setSignPhone(""); setSignAddr(""); setSignAddrDetail("");
    supabase.from("users").select("birth_date, phone, address, address_detail").eq("id", userId).maybeSingle()
      .then(({ data }) => setSignSelfInfo(data || { birth_date: null, phone: null, address: null, address_detail: null }));
  }, [showSignConfirm, userId]);

  // 대타 지원발 매칭은 수락 시점에 이미 근로계약서가 자동 체결됨(app/api/lovecall/route.ts accept 처리) —
  // 면접예약/채용제안 같은 일반 채용 절차를 또 거칠 필요가 없으므로 요약 배너용으로 그 계약서를 조회
  useEffect(() => {
    if (!match?.daeta_posting_id || !matchId) { setDaetaContract(null); return; }
    supabase.from("contracts").select("*").eq("match_id", matchId)
      .order("created_at", { ascending: false }).limit(1).maybeSingle()
      .then(({ data }) => setDaetaContract(data));
  }, [match?.daeta_posting_id, matchId]);

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
    const { data: tm } = await supabase.from("team_members")
      .select("id").eq("match_id", matchId).maybeSingle();
    if (!tm) { setContractStatus("none"); return; }
    const { data } = await supabase.from("contracts")
      .select("id, worker_signed, employer_signed, status")
      .eq("team_member_id", tm.id)
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (!data) setContractStatus("none");
    else if (data.status === "cancelled") setContractStatus("cancelled");
    else if (data.worker_signed) setContractStatus("done");
    else setContractStatus("pending");
  };

  const goToUpdateContract = async () => {
    if (contractData?.team_member_id) {
      router.push(`/contract?memberId=${contractData.team_member_id}&mode=update&from=chat`);
      return;
    }
    const { data: tm } = await supabase.from("team_members")
      .select("id").eq("match_id", matchId).maybeSingle();
    if (tm) {
      router.push(`/contract?memberId=${tm.id}&mode=update&from=chat`);
    } else {
      router.push(`/contract?matchId=${matchId}&mode=update&from=chat`);
    }
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
        setCounterpartWorkerProfile(data.counterpartWorkerProfile);
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
      }, (payload: { new: Record<string, unknown> }) => {
        setMessages(prev => {
          if (prev.find(m => m.id === payload.new.id)) return prev;
          return [...prev, payload.new];
        });
        setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
        if (payload.new.receiver_id === uid) {
          setMessages(prev => prev.map(m => m.id === payload.new.id ? { ...m, is_read: true } : m));
          if (payload.new.message_type === "system" && (payload.new.message as string | null)?.includes("채용이 확정됐어요")) {
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
      }, (payload: { new: Record<string, unknown> }) => {
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
        .select("progress_status, hire_confirmed_by_employer, hire_confirmed_by_worker, worker_left, employer_left")
        .eq("id", matchId).single();

      if (m) {
        setMatch((prev: any) => prev ? { ...prev, ...m } : prev);
        if (m.progress_status === "hired") {
          updateProgressStatus("hired");
          checkContractStatus(); // hired 상태면 계속 계약서 상태 체크
        } else if (m.progress_status === "interviewing") {
          updateProgressStatus("interviewing");
        }
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

  // 상대방 프로필로 이동: 워커는 항상 구직카드, 사장님은 특정 매장 맥락이 있으면 매장홈, 없으면 소셜 프로필
  const goToCounterpartProfile = () => {
    if (!counterpart?.id) return;
    if (counterpart.user_type === "employer") {
      router.push(match?.employer_profile_id ? `/store/${match.employer_profile_id}` : `/worker/${counterpart.id}`);
    } else {
      router.push(`/worker/${counterpart.id}`);
    }
  };

  const loadContract = async () => {
    // contracts에 match_id 없음 → team_members 경유
    const { data: tm } = await supabase.from("team_members")
      .select("id").eq("match_id", matchId).maybeSingle();
    const { data } = await supabase.from("contracts")
      .select("*")
      .eq(tm ? "team_member_id" : "employer_id", tm ? tm.id : "")
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (data) {
      setContractData(data);
      if (data.status === "cancelled") {
        setContractStatus("cancelled");
      } else {
        setContractStatus(data.worker_signed ? "done" : "pending");
      }
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

    // 낙관적 업데이트 — realtime 지연/누락과 무관하게 즉시 표시
    const tempId = `temp-${Date.now()}`;
    const tempMsg = {
      id: tempId,
      match_id: matchId,
      sender_id: userId,
      receiver_id: counterpartId,
      message: msg,
      message_type: type,
      is_read: false,
      created_at: new Date().toISOString(),
    };
    setMessages(prev => [...prev, tempMsg]);
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 50);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ matchId, senderId: userId, receiverId: counterpartId, message: msg, messageType: type }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.data?.id) {
          setMessages(prev => {
            // realtime이 먼저 추가했으면 temp만 제거, 아니면 temp → 실제 레코드 교체
            const alreadyAdded = prev.some(m => m.id === data.data.id);
            if (alreadyAdded) return prev.filter(m => m.id !== tempId);
            return prev.map(m => m.id === tempId ? data.data : m);
          });
        }
      }
    } catch {}
    setSending(false);
    inputRef.current?.focus();
  };

  const handleProgress = async (action: string) => {
    setShowMenu(false);
    try {
      // hire는 양방향 동의 방식이라 직접 처리 (lovecall API 먼저 호출 안 함)
      if (action !== "hire" && action !== "hire_accept") {
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

        // team_members 자동 생성 (매칭이 특정 매장에서 발생했으면 그 매장으로 소속 연결)
        const { data: existingTm } = await supabase.from("team_members")
          .select("id")
          .eq("match_id", matchId)
          .maybeSingle();

        if (!existingTm) {
          await supabase.from("team_members").insert({
            employer_id: match?.employer_id,
            worker_id: match?.worker_id,
            employer_profile_id: match?.employer_profile_id || null,
            match_id: matchId,
            hire_date: new Date().toISOString().split("T")[0],
            status: "active",
            wage: null,
            work_days: null,
            work_hours: null,
          });
        }

        await fetch("/api/lovecall", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ matchId, action: "hire" }),
        });
        updateProgressStatus("hired");
        // 사장님용 메시지
        await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            matchId, senderId: userId, receiverId: match?.employer_id,
            message: "🎉 채용이 확정됐어요!\n\n📄 [계약서] 버튼을 눌러 근로계약서를 작성해주세요.",
            messageType: "system",
          }),
        });
        // 알바생용 메시지 (본인 화면)
        await sendMessage(
          "🎉 채용이 확정됐어요!\n\n📄 사장님이 근로계약서를 작성 중이에요.\n작성 완료 후 알림이 오면 확인하고 동의해주세요.",
          "system"
        );
        setShowReviewModal(true);
      } else if (action === "hire_reject") {
        // 알바생이 거절 → 매칭 failed 처리
        updateProgressStatus("failed");
        await sendMessage("💔 알바생이 채용 제안을 거절하여 매칭이 종료되었습니다.", "system");
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
        const avg = (reviews as { score: number }[]).reduce((s, r) => s + r.score, 0) / reviews.length;
        await supabase.from("users").update({ trust_score: Math.round(avg * 10) / 10 }).eq("id", revieweeId);
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
          const avg = (reviews as { score: number }[]).reduce((s, r) => s + r.score, 0) / reviews.length;
          await supabase.from("users").update({ trust_score: Math.round(avg * 10) / 10 }).eq("id", revieweeId);
        }
      } catch {}
    }
    handleLeaveRoom();
  };

  const handleLeaveRoom = async () => {
    try {
      const { data: currentMatch } = await supabase
        .from("matches").select("progress_status").eq("id", matchId).single();
      const currentStatus = currentMatch?.progress_status || "accepted";

      // 면접 예약 중에 나가면 신뢰점수 감소
      if (currentStatus === "interviewing") {
        const { data: { user: authUser } } = await supabase.auth.getUser();
        if (authUser) await adjustTrustScore(authUser.id, -5, "면접 예약 후 나가기");
      }

      // 상대방한테 시스템 메시지 전송
      const receiverId = match?.worker_id === userId ? match?.employer_id : match?.worker_id;
      await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          matchId,
          senderId: userId,
          receiverId,
          message: currentStatus === "hired" ? "상대방이 채팅방을 나갔어요." : "상대방이 채팅방을 나갔어요. 매칭이 취소됩니다.",
          messageType: "system",
        }),
      });
      // 나간 사람 기록
      const leaveRes = await fetch("/api/lovecall", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ matchId, action: "leave", userId }),
      });
      if (!leaveRes.ok) {
        const leaveErr = await leaveRes.json().catch(() => ({}));
        console.error("나가기 leave 오류:", leaveErr);
      }
      // hired 상태가 아닐 때만 cancel 처리
      if (currentStatus !== "hired") {
        await fetch("/api/lovecall", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ matchId, action: "cancel" }),
        });
      }
      router.replace("/chat");
    } catch (e) { console.error("나가기 오류:", e); router.replace("/chat"); }
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

  const formatPhone = (v: string) => {
    const n = v.replace(/\D/g, "");
    if (n.length <= 3) return n;
    if (n.length <= 7) return `${n.slice(0, 3)}-${n.slice(3)}`;
    if (n.length <= 11) return `${n.slice(0, 3)}-${n.slice(3, 7)}-${n.slice(7)}`;
    return `${n.slice(0, 3)}-${n.slice(3, 7)}-${n.slice(7, 11)}`;
  };

  const counterpartName = counterpartProfile?.business_name
    ? `${counterpartProfile.business_name} 사장님`
    : counterpart?.nickname || "상대방";

  const counterpartAvatar = counterpart?.user_type === "employer"
    ? (counterpartProfile?.logo_url || counterpartProfile?.image_url || counterpart?.avatar_url || null)
    : (counterpartWorkerProfile?.image_url || counterpart?.avatar_url || null);

  const isEmployer = match?.employer_id === userId;
  isEmployerRef.current = isEmployer;
  const isDaetaMatch = !!match?.daeta_posting_id;

  const getProgressBadge = (): { label: string; chip: CSSProperties } => {
    if (isDaetaMatch && !["rejected", "failed", "cancelled"].includes(progressStatus)) {
      return { label: "✅ 대타 확정", chip: chipSuccess };
    }
    switch (progressStatus) {
      case "pending": return { label: "⏳ 수락대기", chip: mutedChip };
      case "rejected": return { label: "💔 거절됨", chip: chipDanger };
      case "interviewing": return { label: "📅 면접예약중", chip: chipWarning };
      case "hired": return { label: "✅ 채용확정", chip: chipSuccess };
      case "failed": return { label: "❌ 매칭실패", chip: chipDanger };
      case "cancelled": return { label: "취소됨", chip: mutedChip };
      default: return { label: "💬 채팅중", chip: chipPrimary };
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
    <main style={{ height: "100vh", background: "var(--bg)", color: "var(--text)", display: "flex", flexDirection: "column", position: "relative" }}>
      {/* 헤더 */}
      <div style={{ position: "sticky", top: 0, zIndex: 20, background: "var(--nav-bg)", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)", borderBottom: "1px solid var(--border)", padding: "10px 14px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, maxWidth: 480, margin: "0 auto" }}>
          <button onClick={() => router.push("/chat")}
            style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text-muted)", cursor: "pointer", flexShrink: 0, padding: 0, width: 34, height: 34, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <i className="ti ti-arrow-left" style={{ fontSize: 18, display: "block" }} aria-hidden="true" />
          </button>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, minWidth: 0 }}>
            {/* 아바타 영역: 프로필 페이지 이동 */}
            <div onClick={goToCounterpartProfile} style={{ position: "relative", flexShrink: 0, cursor: "pointer" }}>
              <div style={{ width: 40, height: 40, borderRadius: counterpart?.user_type === "employer" ? "8px" : "50%", background: "var(--surface2)", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", boxShadow: "0 0 0 2px var(--border)" }}>
                {counterpartAvatar ? (
                  <img src={counterpartAvatar} alt="avatar" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                ) : (
                  <i className={counterpart?.user_type === "employer" ? "ti ti-building-store" : "ti ti-user"}
                    style={{ fontSize: 18, color: "var(--text-muted)" }} aria-hidden="true" />
                )}
              </div>
              <div style={{ position: "absolute", bottom: 0, right: 0, width: 11, height: 11, borderRadius: "50%", background: "var(--success)", border: "2px solid var(--bg)" }} />
            </div>
            {/* 이름 텍스트 영역: 프로필 페이지 이동 (아바타와 동일한 목적지) */}
            <div onClick={goToCounterpartProfile} style={{ flex: 1, minWidth: 0, cursor: "pointer" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <p style={{ fontSize: 15, fontWeight: 700, margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--text)" }}>{counterpartName}</p>
                <span style={{ ...badge.chip, borderRadius: 20, flexShrink: 0 }}>
                  {badge.label}
                </span>
                {counterpart?.trust_score != null && (() => {
                  const g = getTrustGrade(counterpart.trust_score);
                  return <span style={{ fontSize: 10, color: g.color, flexShrink: 0 }}>{g.emoji}</span>;
                })()}
              </div>
              <p style={{ fontSize: 11, color: "var(--text-muted)", margin: 0 }}>궁합 {match?.match_score}점 · 탭하면 프로필 보기</p>
            </div>
          </div>
          {/* 계약서 아이콘 버튼 (hired 상태) */}
          {progressStatus === "hired" && (
            <button onClick={loadContract}
              style={{
                width: 34, height: 34, borderRadius: "50%", flexShrink: 0, cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center",
                background: contractStatus === "done" ? "var(--success-bg)" : contractStatus === "pending" ? "var(--warning-bg)" : "var(--danger-bg)",
                border: `1px solid ${contractStatus === "done" ? "var(--success-border)" : contractStatus === "pending" ? "var(--warning-border)" : "var(--danger-border)"}`,
                color: contractStatus === "done" ? "var(--success)" : contractStatus === "pending" ? "var(--warning)" : "var(--danger)",
                fontSize: 16,
              }}
              title={contractStatus === "done" ? "계약완료" : contractStatus === "pending" ? "서명대기" : "계약서 미작성"}>
              {contractStatus === "done" ? "📄" : contractStatus === "pending" ? "⏳" : "⚠️"}
            </button>
          )}
          {/* ··· 메뉴 */}
          <div style={{ position: "relative" }}>
            <button onClick={() => setShowMenu(!showMenu)}
              style={{ width: 34, height: 34, borderRadius: "50%", background: showMenu ? "var(--surface)" : "none", border: showMenu ? "1px solid var(--border)" : "none", color: "var(--text-muted)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <i className="ti ti-dots-vertical" style={{ fontSize: 20 }} aria-hidden="true" />
            </button>
            {showMenu && (
              <div style={{ position: "absolute", top: "calc(100% + 6px)", right: 0, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 16, overflow: "hidden", width: 200, boxShadow: "0 8px 32px rgba(0,0,0,0.25)", zIndex: 50 }}>
                {/* AI 사전미팅 */}
                <button onClick={() => { setShowMenu(false); router.push(`/pre-meet/${params.id}`); }}
                  style={{ width: "100%", background: "none", border: "none", padding: "13px 16px", cursor: "pointer", textAlign: "left", fontSize: 13, color: "var(--purple-text)", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 15 }}>🤖</span> AI 사전미팅
                </button>
                {/* 알림 끄기 */}
                <button onClick={() => { setMuteNotif(!muteNotif); setShowMenu(false); }}
                  style={{ width: "100%", background: "none", border: "none", padding: "13px 16px", cursor: "pointer", textAlign: "left", fontSize: 13, color: "var(--text)", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 15 }}>{muteNotif ? "🔔" : "🔕"}</span> {muteNotif ? "알림 켜기" : "알림 끄기"}
                </button>
                {/* 면접 예약/수정 (사장님 + accepted 상태만) — 대타는 수락 시 이미 자동계약 완료라 면접 절차 자체가 불필요 */}
                {!isDaetaMatch && isEmployer && progressStatus === "accepted" && (
                  <button onClick={() => { setShowMenu(false); setShowInterviewModal(true); }}
                    style={{ width: "100%", background: "none", border: "none", padding: "13px 16px", cursor: "pointer", textAlign: "left", fontSize: 13, color: "var(--warning)", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 15 }}>📅</span> {hasInterview ? "면접 일정 수정" : "면접 예약하기"}
                  </button>
                )}
                {/* 면접 결과 처리 (interviewing 상태) */}
                {!isDaetaMatch && progressStatus === "interviewing" && (<>
                  {isEmployer && (
                    <button onClick={() => { setShowMenu(false); handleInterviewResult("complete"); }}
                      style={{ width: "100%", background: "none", border: "none", padding: "13px 16px", cursor: "pointer", textAlign: "left", fontSize: 13, color: "var(--success)", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 15 }}>✅</span> 면접 완료
                    </button>
                  )}
                  <button onClick={() => { setShowMenu(false); handleInterviewResult("cancel"); }}
                    style={{ width: "100%", background: "none", border: "none", padding: "13px 16px", cursor: "pointer", textAlign: "left", fontSize: 13, color: "var(--warning)", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 15 }}>❌</span> 면접 취소 (합의)
                  </button>
                  <button onClick={() => { setShowMenu(false); handleInterviewResult("noshow"); }}
                    style={{ width: "100%", background: "none", border: "none", padding: "13px 16px", cursor: "pointer", textAlign: "left", fontSize: 13, color: "var(--danger)", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 15 }}>🚫</span> 노쇼 신고
                  </button>
                </>)}
                {/* 채용 확정 (사장님 + accepted or interviewing만) — 대타는 이미 계약 체결됨 */}
                {!isDaetaMatch && isEmployer && ["accepted", "interviewing"].includes(progressStatus) && (
                  <button onClick={() => { setShowMenu(false); handleProgress("hire"); }}
                    style={{ width: "100%", background: "none", border: "none", padding: "13px 16px", cursor: "pointer", textAlign: "left", fontSize: 13, color: "var(--success)", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 15 }}>✅</span> 채용 제안 보내기
                  </button>
                )}
                {/* 채팅방 나가기 */}
                <button onClick={() => { setShowMenu(false); setShowLeaveModal(true); }}
                  style={{ width: "100%", background: "none", border: "none", padding: "13px 16px", cursor: "pointer", textAlign: "left", fontSize: 13, color: "var(--danger)", display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 15 }}>🚪</span> 채팅방 나가기
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 상대방이 나간 상태 배너 */}
      {(() => {
        const isEmp = match?.employer_id === userId;
        const counterpartLeft = isEmp ? match?.worker_left : match?.employer_left;
        if (counterpartLeft) {
          return (
            <div style={{
              background: "var(--danger-bg)",
              borderBottom: "1px solid var(--border)",
              padding: "12px 16px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              boxShadow: "var(--shadow-elevate)"
            }}>
              <span style={{ fontSize: 18 }}>🚪</span>
              <div style={{ display: "flex", flexDirection: "column", gap: 2, alignItems: "center" }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: "var(--danger)" }}>상대방이 채팅방을 나갔습니다</span>
                <span style={{ fontSize: 11, color: "var(--text-muted)" }}>더 이상 메시지를 보낼 수 없습니다.</span>
              </div>
            </div>
          );
        }
        return null;
      })()}

      {/* 지원/제안 대기 중 배너 */}
      {progressStatus === "pending" && (
        <div style={{
          background: "var(--primary-light)",
          borderBottom: "1px solid var(--border)",
          padding: "12px 16px",
          display: "flex",
          flexDirection: "column",
          gap: 10,
          boxShadow: "var(--shadow-elevate)"
        }}>
          {(() => {
            const isEmp = match?.employer_id === userId;
            const initiatedByMe = match?.initiated_by === userId;
            if (initiatedByMe) {
              return (
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontSize: 20 }}>⏳</span>
                  <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>수락 대기 중...</span>
                    <span style={{ fontSize: 11, color: "var(--text-muted)" }}>상대방이 지원/제안을 검토하고 있습니다. 답변을 기다려주세요.</span>
                  </div>
                </div>
              );
            } else {
              return (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, minWidth: 200 }}>
                    <span style={{ fontSize: 20 }}>📥</span>
                    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>
                        {isEmp ? "새로운 매장 지원서 도착" : "새로운 채용 제안 도착"}
                      </span>
                      <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
                        {isEmp ? "지원서를 수락하고 대화를 시작할까요?" : "채용 제안을 수락하고 대화를 시작할까요?"}
                      </span>
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button onClick={async () => {
                      const res = await fetch("/api/lovecall", {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ matchId, action: "accept" })
                      });
                      const data = await res.json();
                      if (data.success) {
                        updateProgressStatus("accepted");
                        await sendMessage("🎉 지원/제안을 수락했습니다! 대화를 나눠보세요. 😊", "system");
                      }
                    }}
                      style={{ background: "var(--primary)", border: "none", borderRadius: 12, padding: "8px 16px", color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                      수락하기
                    </button>
                    <button onClick={async () => {
                      const res = await fetch("/api/lovecall", {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ matchId, action: "reject" })
                      });
                      const data = await res.json();
                      if (data.success) {
                        updateProgressStatus("rejected");
                        await sendMessage("💔 지원/제안이 거절되었습니다.", "system");
                      }
                    }}
                      style={{ background: "var(--danger-bg)", border: "1px solid var(--danger-border)", borderRadius: 12, padding: "8px 16px", color: "var(--danger)", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                      거절하기
                    </button>
                  </div>
                </div>
              );
            }
          })()}
        </div>
      )}

      {/* 채용 프로세스 액션 가이드 배너 (사장님용) — 대타 매칭은 이미 자동계약 완료라 별도 안내 배너로 대체 */}
      {!isDaetaMatch && isEmployer && (
        <>
          {progressStatus === "accepted" && (
            <div style={{
              background: "var(--surface)",
              borderBottom: "1px solid var(--border)",
              padding: "12px 16px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              boxShadow: "0 2px 8px rgba(0,0,0,0.05)"
            }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 2, flex: 1 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>채용 진행하기 🎯</span>
                <span style={{ fontSize: 11, color: "var(--text-muted)" }}>알바생과 소통 후 면접 예약 또는 채용을 진행해 보세요.</span>
              </div>
              <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                <button onClick={() => setShowInterviewModal(true)}
                  style={{
                    background: "var(--warning-bg)",
                    border: "1px solid var(--warning-border)",
                    borderRadius: 12,
                    padding: "8px 14px",
                    color: "var(--warning)",
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: 4
                  }}>
                  📅 면접 예약
                </button>
                <button onClick={() => handleProgress("hire")}
                  style={{
                    background: "var(--primary)",
                    border: "none",
                    borderRadius: 12,
                    padding: "8px 14px",
                    color: "#fff",
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: 4
                  }}>
                  ✅ 채용 제안
                </button>
              </div>
            </div>
          )}

          {progressStatus === "interviewing" && (
            <div style={{
              background: "var(--surface)",
              borderBottom: "1px solid var(--border)",
              padding: "12px 16px",
              display: "flex",
              flexDirection: "column",
              gap: 10,
              boxShadow: "0 2px 8px rgba(0,0,0,0.05)"
            }}>
              {match?.hire_confirmed_by_employer && !match?.hire_confirmed_by_worker ? (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%" }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>⏳ 채용 제안 수락 대기 중</span>
                    <span style={{ fontSize: 11, color: "var(--text-muted)" }}>알바생의 채용 수락 결정을 기다리고 있습니다.</span>
                  </div>
                  <button onClick={() => handleInterviewResult("cancel")}
                    style={{
                      background: "var(--danger-bg)",
                      border: "1px solid var(--danger-border)",
                      borderRadius: 12,
                      padding: "8px 14px",
                      color: "var(--danger)",
                      fontSize: 12,
                      fontWeight: 700,
                      cursor: "pointer"
                    }}>
                    제안 취소
                  </button>
                </div>
              ) : (
                <>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%" }}>
                    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>📅 면접 일정이 예약되었습니다</span>
                      <span style={{ fontSize: 11, color: "var(--text-muted)" }}>면접 진행 후 결과를 아래에서 결정해 주세요.</span>
                    </div>
                    <div style={{ display: "flex", gap: 6 }}>
                      <button onClick={() => setShowInterviewModal(true)}
                        style={{
                          background: "var(--surface2)",
                          border: "1px solid var(--border)",
                          borderRadius: 12,
                          padding: "6px 12px",
                          color: "var(--text-muted)",
                          fontSize: 11,
                          fontWeight: 700,
                          cursor: "pointer"
                        }}>
                        일정 수정
                      </button>
                      <button onClick={() => handleProgress("hire")}
                        style={{
                          background: "var(--primary)",
                          border: "none",
                          borderRadius: 12,
                          padding: "6px 12px",
                          color: "#fff",
                          fontSize: 11,
                          fontWeight: 700,
                          cursor: "pointer"
                        }}>
                        바로 채용
                      </button>
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 6, width: "100%" }}>
                    <button onClick={() => handleInterviewResult("complete")}
                      style={{
                        flex: 1,
                        background: "var(--success-bg)",
                        border: "1px solid var(--success-border)",
                        borderRadius: 12,
                        padding: "8px",
                        color: "var(--success)",
                        fontSize: 12,
                        fontWeight: 700,
                        cursor: "pointer"
                      }}>
                      ✅ 면접 완료
                    </button>
                    <button onClick={() => handleInterviewResult("cancel")}
                      style={{
                        flex: 1,
                        background: "var(--warning-bg)",
                        border: "1px solid var(--warning-border)",
                        borderRadius: 12,
                        padding: "8px",
                        color: "var(--warning)",
                        fontSize: 12,
                        fontWeight: 700,
                        cursor: "pointer"
                      }}>
                      ❌ 면접 취소
                    </button>
                    <button onClick={() => handleInterviewResult("noshow")}
                      style={{
                        flex: 1,
                        background: "var(--danger-bg)",
                        border: "1px solid var(--danger-border)",
                        borderRadius: 12,
                        padding: "8px",
                        color: "var(--danger)",
                        fontSize: 12,
                        fontWeight: 700,
                        cursor: "pointer"
                      }}>
                      🚫 노쇼 신고
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </>
      )}

      {/* 대타 확정 요약 배너 — 실제 상태변경 액션(취소/완료/노쇼)은 /daeta 히스토리 화면으로 위임.
          채팅은 대화·상태 요약만, 신뢰점수·정산처럼 무거운 처리는 전용 화면에서 하는 게 맞아서 분리함 */}
      {isDaetaMatch && !["rejected", "failed", "cancelled", "hired"].includes(progressStatus) && (
        <div style={{
          background: "var(--success-bg)",
          borderBottom: "1px solid var(--success-border)",
          padding: "12px 16px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
        }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: "var(--success)" }}>✅ 대타 확정 — 자동계약 완료</span>
            <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
              {daetaContract?.work_hours ? `근무: ${daetaContract.work_hours}` : "면접·채용 제안 없이 바로 근무 협의만 하면 돼요"}
              {daetaContract?.wage ? ` · 시급 ${Number(daetaContract.wage).toLocaleString()}원` : ""}
            </span>
          </div>
          <button onClick={() => router.push(`/daeta?history=1&matchId=${matchId}`)}
            style={{ background: "var(--surface)", border: "1px solid var(--success-border)", borderRadius: 12, padding: "8px 14px", color: "var(--success)", fontSize: 12, fontWeight: 700, cursor: "pointer", flexShrink: 0 }}>
            🗂 대타 관리하기 →
          </button>
        </div>
      )}

      {/* 채용 프로세스 액션 가이드 배너 (알바생용) */}
      {!isEmployer && progressStatus === "interviewing" && match?.hire_confirmed_by_employer && !match?.hire_confirmed_by_worker && (
        <div style={{
          background: "var(--primary-light)",
          borderBottom: "1px solid var(--border)",
          padding: "12px 16px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          boxShadow: "var(--shadow-elevate)"
        }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 2, flex: 1 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>🏪 사장님의 채용 제안 도착!</span>
            <span style={{ fontSize: 11, color: "var(--text-muted)" }}>이 매장에서 일하시겠습니까? 수락하면 채용이 완료됩니다.</span>
          </div>
          <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
            <button onClick={() => setShowRejectConfirmModal(true)}
              style={{
                background: "var(--danger-bg)",
                border: "1px solid var(--danger-border)",
                borderRadius: 12,
                padding: "8px 14px",
                color: "var(--danger)",
                fontSize: 12,
                fontWeight: 700,
                cursor: "pointer"
              }}>
              거절하기
            </button>
            <button onClick={() => handleProgress("hire_accept")}
              style={{
                background: "var(--success)",
                border: "none",
                borderRadius: 12,
                padding: "8px 14px",
                color: "#fff",
                fontSize: 12,
                fontWeight: 700,
                cursor: "pointer"
              }}>
              수락하기
            </button>
          </div>
        </div>
      )}

      {/* 채용 확정 후 계약서 작성 배너 (사장님용) */}
      {progressStatus === "hired" && contractStatus === "none" && isEmployer && (
        <div style={{
          background: "var(--primary-light)",
          borderBottom: "1px solid var(--border)",
          padding: "12px 16px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          boxShadow: "var(--shadow-elevate)"
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1 }}>
            <span style={{ fontSize: 20 }}>📄</span>
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>채용이 확정되었습니다! 🎉</span>
              <span style={{ fontSize: 11, color: "var(--text-muted)" }}>알바생의 근로계약서를 신속히 작성해 주세요.</span>
            </div>
          </div>
          <button onClick={goToUpdateContract}
            style={{
              background: "var(--primary)",
              border: "none",
              borderRadius: 20,
              padding: "6px 14px",
              color: "#fff",
              fontSize: 11,
              fontWeight: 700,
              cursor: "pointer",
              whiteSpace: "nowrap"
            }}>
            계약서 작성 →
          </button>
        </div>
      )}

      {/* 채용 확정 후 계약서 서명 대기 배너 (알바생용) */}
      {progressStatus === "hired" && contractStatus === "none" && !isEmployer && (
        <div style={{
          background: "var(--warning-bg)",
          borderBottom: "1px solid var(--border)",
          padding: "12px 16px",
          display: "flex",
          alignItems: "center",
          gap: 10,
          boxShadow: "var(--shadow-elevate)"
        }}>
          <span style={{ fontSize: 20 }}>⏳</span>
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>채용이 확정되었습니다! 🎉</span>
            <span style={{ fontSize: 11, color: "var(--text-muted)", lineHeight: 1.4 }}>사장님이 근로계약서를 작성하는 중입니다. 작성이 완료되면 서명 요청 알림이 발송됩니다.</span>
          </div>
        </div>
      )}

      {/* 메시지 목록 */}
      <div style={{ flex: 1, overflowY: "auto" }} onClick={() => setShowMenu(false)}>
      <div style={{ maxWidth: 480, margin: "0 auto", padding: "12px 14px" }}>
        {messages.length === 0 && (
          <div style={{ textAlign: "center", padding: "48px 0" }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>👋</div>
            <p style={{ fontSize: 14, fontWeight: 700, color: "var(--text)", marginBottom: 6 }}>매칭이 성사됐어요! 🎉</p>
            <p style={{ fontSize: 13, color: "var(--text-muted)" }}>먼저 인사를 건네보세요</p>
          </div>
        )}
        {/* 가장 최신의 계약서 관련 시스템 메시지 ID 식별 */}
        {(() => {
          const latestContractMsgId = [...messages].reverse().find(m =>
            m.message_type === "system" &&
            (m.message?.includes("근로계약서가 발행") || m.message?.includes("근로계약서가 수정"))
          )?.id;

          return messages.map((msg) => {
            const isMine = msg.sender_id === userId;
            const dateLabel = formatDate(msg.created_at);
            const showDate = dateLabel !== lastDate;
            lastDate = dateLabel;
            const isLatestContractMsg = msg.id === latestContractMsgId;

            return (
              <div key={msg.id}>
                {showDate && (
                  <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "16px 0 12px" }}>
                    <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
                    <span style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 600, whiteSpace: "nowrap", background: "var(--bg)", padding: "0 4px" }}>{dateLabel}</span>
                    <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
                  </div>
                )}
                {msg.message_type === "system" ? (
                  <div style={{ display: "flex", justifyContent: "center", marginBottom: 14 }}>
                    <div style={{ background: "var(--primary-light)", border: "1px solid var(--primary-border)", borderRadius: 18, padding: "10px 18px", fontSize: 13, color: "var(--purple-text)", textAlign: "center", maxWidth: "88%", lineHeight: 1.7, whiteSpace: "pre-line", boxShadow: "var(--shadow-elevate)" }}>
                      {msg.message}
                      {/* 채용 확정 → 사장님: 계약서 작성 버튼 */}
                      {msg.message?.includes("채용이 확정됐어요") && msg.message?.includes("계약서를 작성") && isEmployer && (
                        <div style={{ marginTop: 10 }}>
                          <button onClick={() => router.push(`/contract?matchId=${matchId}&mode=update&from=chat`)}
                            style={{ background: "var(--primary)", border: "none", borderRadius: 12, padding: "8px 18px", color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer", boxShadow: "var(--shadow-elevate)" }}>
                            ✏️ 계약서 작성하기
                          </button>
                        </div>
                      )}
                      {/* 계약서 발행/수정 → 최신 메시지만 [계약서 확인하기] 버튼 활성화 */}
                      {(msg.message?.includes("근로계약서가 발행") || msg.message?.includes("근로계약서가 수정")) && (
                        <div style={{ marginTop: 10, display: "flex", gap: 6, justifyContent: "center", flexWrap: "wrap" as const }}>
                          {!isLatestContractMsg ? (
                            <span style={{ background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 12, padding: "6px 12px", color: "var(--text-muted)", fontSize: 11, fontWeight: 600 }}>
                              📋 이전 계약서 메시지 (대체됨)
                            </span>
                          ) : contractStatus === "cancelled" || contractData?.status === "cancelled" ? (
                            <span style={{ background: "rgba(248,113,113,0.12)", border: "1px solid rgba(248,113,113,0.3)", borderRadius: 12, padding: "8px 14px", color: "#f87171", fontSize: 12, fontWeight: 700 }}>
                              🚫 계약서 발행 취소됨
                            </span>
                          ) : (
                            <button onClick={loadContract}
                              style={{ background: "var(--primary)", border: "none", borderRadius: 12, padding: "8px 14px", color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                              📄 계약서 확인하기
                            </button>
                          )}
                          {isEmployer && isLatestContractMsg && contractStatus !== "cancelled" && (
                            <button onClick={goToUpdateContract}
                              style={{ background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 12, padding: "8px 14px", color: "var(--text-muted)", fontSize: 12, cursor: "pointer" }}>
                              ✏️ 수정하기
                            </button>
                          )}
                        </div>
                      )}
                    {/* 수정 요청 → 사장님: 계약서 수정하기 버튼 */}
                    {msg.message?.includes("수정 요청") && isEmployer && (
                      <div style={{ marginTop: 10 }}>
                        <button onClick={goToUpdateContract}
                          style={{ background: "var(--warning-bg)", border: "1px solid var(--warning-border)", borderRadius: 12, padding: "8px 16px", color: "var(--warning)", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                          ✏️ 계약서 수정하기
                        </button>
                      </div>
                    )}
                    {/* 동의 완료 → 계약서 보기 + 사장님은 재계약하기 */}
                    {msg.message?.includes("동의가 완료") && (
                      <div style={{ marginTop: 10, display:"flex", gap:6, justifyContent:"center", flexWrap:"wrap" as const }}>
                        <button onClick={loadContract}
                          style={{ background: "var(--success-bg)", border: "1px solid var(--success-border)", borderRadius: 12, padding: "8px 14px", color: "var(--success)", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                          📄 계약서 보기
                        </button>
                        {isEmployer && (
                          <button onClick={goToUpdateContract}
                            style={{ background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 12, padding: "8px 14px", color: "var(--text-muted)", fontSize: 12, cursor: "pointer" }}>
                            📝 재계약하기
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ) : isMine ? (
                /* 내 메시지 - 오른쪽 */
                <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 3, alignItems: "flex-end", gap: 6 }}>
                  <div style={{ fontSize: 10, color: "var(--text-muted)", display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2, flexShrink: 0 }}>
                    {!msg.is_read && <span style={{ color: "var(--purple-text)", fontSize: 9, fontWeight: 800, lineHeight: 1 }}>1</span>}
                    <span>{formatTime(msg.created_at)}</span>
                  </div>
                  <div style={{ maxWidth: "78%" }}>
                    <div style={{ background: "var(--primary)", borderRadius: "20px 20px 4px 20px", padding: "10px 15px", fontSize: 14, color: "#fff", lineHeight: 1.55, wordBreak: "break-word", boxShadow: "var(--shadow-elevate)" }}>
                      {msg.message}
                    </div>
                  </div>
                </div>
              ) : (
                /* 상대방 메시지 - 왼쪽 + 아바타 + 닉네임 */
                <div style={{ display: "flex", gap: 9, marginBottom: 3, alignItems: "flex-end" }}>
                  {/* 아바타 */}
                  <button onClick={goToCounterpartProfile} style={{ background: "none", border: "none", padding: 0, cursor: "pointer", flexShrink: 0 }}>
                    {counterpartAvatar ? (
                      <img src={counterpartAvatar} alt="avatar"
                        style={{ width: 34, height: 34, borderRadius: counterpart?.user_type === "employer" ? "6px" : "50%", objectFit: "cover", border: "1.5px solid var(--border)" }} />
                    ) : (
                      <div style={{ width: 34, height: 34, borderRadius: counterpart?.user_type === "employer" ? "6px" : "50%", background: "var(--surface2)", display: "flex", alignItems: "center", justifyContent: "center", border: "1.5px solid var(--border)" }}>
                        <i className={counterpart?.user_type === "employer" ? "ti ti-building-store" : "ti ti-user"}
                          style={{ fontSize: 15, color: "var(--text-muted)" }} aria-hidden="true" />
                      </div>
                    )}
                  </button>
                  <div style={{ maxWidth: "78%" }}>
                    {/* 닉네임 */}
                    <button onClick={goToCounterpartProfile}
                      style={{ background: "none", border: "none", padding: 0, cursor: "pointer", marginBottom: 5 }}>
                      <span style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 700 }}>
                        {counterpartName}
                      </span>
                    </button>
                    <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "4px 20px 20px 20px", padding: "10px 15px", fontSize: 14, color: "var(--text)", lineHeight: 1.55, wordBreak: "break-word", boxShadow: "0 1px 4px rgba(0,0,0,0.08)" }}>
                      {msg.message}
                    </div>
                    <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 4, paddingLeft: 2 }}>
                      {formatTime(msg.created_at)}
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        });
      })()}
        <div ref={bottomRef} />
      </div>
      </div>

      {/* 입력창 */}
      <div style={{ borderTop: "1px solid var(--border)", background: "var(--nav-bg)", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)" }}>
      <div style={{ maxWidth: 480, margin: "0 auto", padding: "10px 14px", paddingBottom: "calc(10px + env(safe-area-inset-bottom))" }}>
        {/* 상대방 나간 상태 및 매칭 종료 상태 */}
        {(() => {
          if (["failed", "rejected", "cancelled"].includes(progressStatus)) {
            return (
              <div style={{ textAlign: "center", padding: "6px 0", marginBottom: 8 }}>
                <span style={{ fontSize: 12, color: "var(--text-muted)", background: "var(--surface2)", padding: "5px 14px", borderRadius: 20, border: "1px solid var(--border)" }}>
                  종료된 매칭으로 메시지를 보낼 수 없습니다.
                </span>
              </div>
            );
          }
          const isEmp = match?.employer_id === userId;
          const counterpartLeft = isEmp ? match?.worker_left : match?.employer_left;
          if (counterpartLeft) return (
            <div style={{ textAlign: "center", padding: "6px 0", marginBottom: 8 }}>
              <span style={{ fontSize: 12, color: "var(--text-muted)", background: "var(--surface2)", padding: "5px 14px", borderRadius: 20, border: "1px solid var(--border)" }}>
                상대방이 채팅방을 나갔어요
              </span>
            </div>
          );
          return null;
        })()}
        {(() => {
          const isEmp = match?.employer_id === userId;
          const counterpartLeft = isEmp ? match?.worker_left : match?.employer_left;
          const isChatDisabled = !!counterpartLeft || ["failed", "rejected", "cancelled"].includes(progressStatus);
          return (
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              {/* 음성 입력 버튼 */}
              <button
                onClick={recording ? stopRecording : startRecording}
                disabled={sending || isChatDisabled}
                style={{ width: 40, height: 40, borderRadius: "50%", flexShrink: 0, background: recording ? "var(--danger)" : "var(--surface)", border: `1px solid ${recording ? "var(--danger-border)" : "var(--border)"}`, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "var(--shadow-elevate)", transition: "all 0.18s", color: recording ? "#fff" : "var(--text-muted)" }}>
                <i className={`ti ${recording ? "ti-player-stop" : "ti-microphone"}`} style={{ fontSize: 17 }} aria-hidden="true" />
              </button>
              {/* 텍스트 입력 */}
              <div style={{ flex: 1, position: "relative" }}>
                <input ref={inputRef} type="text" value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
                  placeholder={recording ? "말씀하세요... 🎤" : "메시지를 입력하세요..."}
                  disabled={isChatDisabled}
                  style={{ width: "100%", background: "var(--surface)", border: `1.5px solid ${recording || input ? "var(--primary-border)" : "var(--border)"}`, borderRadius: 24, padding: "10px 18px", color: "var(--text)", fontSize: 14, outline: "none", transition: "border 0.18s, box-shadow 0.18s", opacity: isChatDisabled ? 0.5 : 1, boxSizing: "border-box" }} />
              </div>
              {/* 전송 버튼 */}
              <button onClick={() => sendMessage()} disabled={!input.trim() || sending || isChatDisabled}
                style={{ width: 40, height: 40, borderRadius: "50%", background: input.trim() ? "var(--primary)" : "var(--surface)", border: input.trim() ? "none" : "1px solid var(--border)", color: input.trim() ? "#fff" : "var(--text-muted)", cursor: input.trim() ? "pointer" : "default", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, transition: "all 0.2s", boxShadow: input.trim() ? "var(--shadow-elevate)" : "none", transform: input.trim() ? "scale(1)" : "scale(0.92)" }}>
                <i className="ti ti-send" style={{ fontSize: 17 }} aria-hidden="true" />
              </button>
            </div>
          );
        })()}
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
                      style={{ padding: "5px 12px", borderRadius: 20, fontSize: 12, cursor: "pointer", background: interviewPlace === p ? "var(--primary-light)" : "var(--surface2)", color: interviewPlace === p ? "var(--purple-text)" : "var(--text-muted)", border: interviewPlace === p ? "1px solid var(--primary-border)" : "1px solid transparent" }}>
                      {p}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 20 }}>
              <button onClick={handleInterviewSubmit} disabled={!interviewDate || !interviewTime}
                style={{ flex: 1, background: !interviewDate || !interviewTime ? "var(--surface2)" : "var(--primary)", border: "none", color: !interviewDate || !interviewTime ? "var(--text-muted)" : "#fff", fontWeight: 700, padding: 14, borderRadius: 12, cursor: !interviewDate || !interviewTime ? "default" : "pointer", fontSize: 14 }}>
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
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.75)", backdropFilter:"blur(6px)", zIndex:200, display:"flex", alignItems:"center", justifyContent:"center", padding:12 }}
          onClick={() => setShowContractModal(false)}>
          <div style={{ background:"var(--surface)", border:"1px solid var(--border)", borderRadius:20, width:"100%", maxWidth:540, height:"92vh", display:"flex", flexDirection:"column", overflow:"hidden", boxShadow:"0 25px 50px -12px rgba(0,0,0,0.5)" }}
            onClick={e => e.stopPropagation()}>
          {/* 모달 헤더 */}
          <div style={{ background:"var(--nav-bg)", borderBottom:"1px solid var(--border)", padding:"12px 16px", display:"flex", alignItems:"center", gap:10, flexShrink:0 }}>
            <div style={{ display:"flex", alignItems:"center", gap:6 }}>
              <span style={{ fontSize:16 }}>📄</span>
              <span style={{ fontSize:15, fontWeight:800, color:"var(--text)" }}>근로계약서</span>
            </div>
            <span style={{ ...chipStyle, fontWeight:600,
              background: contractData?.status === "cancelled" ? "rgba(248,113,113,0.15)" : contractData?.worker_signed ? "var(--success-bg)" : "var(--warning-bg)",
              border: `1px solid ${contractData?.status === "cancelled" ? "rgba(248,113,113,0.3)" : contractData?.worker_signed ? "var(--success-border)" : "var(--warning-border)"}`,
              color: contractData?.status === "cancelled" ? "#f87171" : contractData?.worker_signed ? "var(--success)" : "var(--warning)" }}>
              {contractData?.status === "cancelled" ? "🚫 발행 취소됨" : contractData?.worker_signed ? "✅ 서명 완료" : "⏳ 서명 대기"}
            </span>
            <div style={{ flex:1 }} />
            <button onClick={() => setShowContractModal(false)} aria-label="닫기" title="닫기"
              style={{ background:"var(--surface2)", border:"1px solid var(--border)", color:"var(--text)", width:32, height:32, borderRadius:"50%", fontSize:16, fontWeight:700, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}>
              ✕
            </button>
          </div>

          {/* 계약서 내용 스크롤 */}
          <div style={{ flex:1, overflowY:"auto", padding:12 }}>
            {contractData?.status === "cancelled" ? (
              <div style={{ textAlign:"center", padding:"40px 24px" }}>
                <div style={{ fontSize:48, marginBottom:12 }}>🚫</div>
                <p style={{ fontSize:15, fontWeight:700, color:"#f87171", marginBottom:8 }}>계약서 발행이 취소되었어요</p>
                <p style={{ fontSize:13, color:"var(--text-muted)", lineHeight:1.7 }}>
                  사장님이 이 근로계약서의 발행을 취소했습니다.<br/>
                  필요시 새로 계약서를 작성해야 합니다.
                </p>
              </div>
            ) : contractData ? (
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
                          [{h:"성명",v:f.worker||"-"},{h:"생년월일",v:f.workerBirth || (
                            <input type="date" value={signBirth} onChange={e => {
                              const val = e.target.value;
                              setSignBirth(val);
                              const age = calcAge(val);
                              if (age !== null && age < 18) {
                                setDetectedMinorAge(age);
                                setShowMinorWarningModal(true);
                              }
                            }}
                              style={{ background:"rgba(251,146,60,0.15)", border:"1.5px dashed #f97316", borderRadius:6, padding:"2px 6px", fontSize:"8.5pt", color:"#ea580c", fontWeight:800, outline:"none", width:"100%", boxSizing:"border-box" }} />
                          )}],
                          [{h:"연락처",v:f.workerPhone || (
                            <input type="tel" value={signPhone} onChange={e => setSignPhone(formatPhone(e.target.value))} placeholder="👉 연락처 직접 입력 (010-0000-0000)"
                              style={{ background:"rgba(251,146,60,0.15)", border:"1.5px dashed #f97316", borderRadius:6, padding:"2px 6px", fontSize:"8.5pt", color:"#ea580c", fontWeight:800, outline:"none", width:"100%", boxSizing:"border-box" }} />
                          ),colSpan:3}],
                          [{h:"주소",v:[f.workerAddr, f.workerAddrDetail].filter(Boolean).join(" ") || (
                            <div style={{ display:"flex", flexDirection:"column", gap:4, width:"100%" }}>
                              <div style={{ display:"flex", gap:4, alignItems:"center", width:"100%" }}>
                                <input type="text" value={signAddr} onChange={e => setSignAddr(e.target.value)} placeholder="👉 도로명/지번 주소 입력"
                                  style={{ background:"rgba(251,146,60,0.15)", border:"1.5px dashed #f97316", borderRadius:6, padding:"2px 6px", fontSize:"8.5pt", color:"#ea580c", fontWeight:800, outline:"none", flex:1 }} />
                                <button type="button" onClick={() => {
                                  const triggerDaum = () => {
                                    new (window as any).daum.Postcode({
                                      oncomplete: (data: any) => {
                                        setSignAddr(data.roadAddress || data.jibunAddress);
                                        setSignPostcode(data.zonecode || "");
                                      },
                                    }).open();
                                  };
                                  if (typeof window !== "undefined" && (window as any).daum?.Postcode) triggerDaum();
                                  else {
                                    const script = document.createElement("script");
                                    script.src = "//t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js";
                                    script.onload = triggerDaum;
                                    document.head.appendChild(script);
                                  }
                                }} style={{ background:"linear-gradient(135deg,#7c3aed,#6366f1)", border:"none", borderRadius:6, padding:"2px 6px", fontSize:"7.5pt", fontWeight:700, color:"#fff", cursor:"pointer", whiteSpace:"nowrap" }}>
                                  🔍 검색
                                </button>
                              </div>
                              <input type="text" value={signAddrDetail} onChange={e => setSignAddrDetail(e.target.value)} placeholder="👉 상세주소 입력 (동·호수·층 등)"
                                style={{ background:"rgba(251,146,60,0.15)", border:"1.5px dashed #f97316", borderRadius:6, padding:"2px 6px", fontSize:"8.5pt", color:"#ea580c", fontWeight:800, outline:"none", width:"100%", boxSizing:"border-box" }} />
                            </div>
                          ),colSpan:3}],
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
                        <div>지급일: 매월 {f.payDay||"-"} · 지급 방법: {f.payMethod === "계좌이체" ? (
                          <span>근로자 명의 계좌 입금 (수령 계좌: {f.bankAccount || (
                            <span style={{ display:"inline-flex", gap:4, alignItems:"center", verticalAlign:"middle" }}>
                              <select value={signBankName} onChange={e => setSignBankName(e.target.value)}
                                style={{ background:"rgba(251,146,60,0.15)", border:"1.5px dashed #f97316", borderRadius:6, padding:"2px 4px", fontSize:"8.5pt", color:"#ea580c", fontWeight:800 }}>
                                <option value="">은행 선택</option>
                                <option value="KB국민">KB국민</option>
                                <option value="신한">신한</option>
                                <option value="우리">우리</option>
                                <option value="하나">하나</option>
                                <option value="카카오뱅크">카카오뱅크</option>
                                <option value="토스뱅크">토스뱅크</option>
                                <option value="NH농협">NH농협</option>
                                <option value="IBK기업">IBK기업</option>
                                <option value="새마을금고">새마을금고</option>
                                <option value="우체국">우체국</option>
                                <option value="기타">기타</option>
                              </select>
                              {signBankName === "기타" && (
                                <input type="text" value={signBankCustomName} onChange={e => setSignBankCustomName(e.target.value)} placeholder="은행명"
                                  style={{ background:"rgba(251,146,60,0.15)", border:"1.5px dashed #f97316", borderRadius:6, padding:"2px 4px", fontSize:"8.5pt", color:"#ea580c", fontWeight:800, width:65 }} />
                              )}
                              <input type="text" value={signBankNumber} onChange={e => setSignBankNumber(e.target.value)} placeholder="👉 계좌번호 직접 입력" inputMode="numeric"
                                style={{ background:"rgba(251,146,60,0.15)", border:"1.5px dashed #f97316", borderRadius:6, padding:"2px 6px", fontSize:"8.5pt", color:"#ea580c", fontWeight:800, outline:"none", width:130 }} />
                            </span>
                          )})</span>
                        ) : f.payMethod||"-"}</div>
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
                      style={{ background:"var(--primary)", border:"none", borderRadius:14, padding:"12px 24px", color:"#fff", fontSize:14, fontWeight:700, cursor:"pointer" }}>
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
          <div style={{ padding:"12px 16px 24px", background:"var(--nav-bg)", borderTop:"1px solid var(--border)", flexShrink:0 }}>
            {!isEmployer && contractData && !contractData.worker_signed ? (
              <div style={{ display:"flex", gap:8 }}>
                <button onClick={() => {
                  setRevisionReason("");
                  setShowRevisionModal(true);
                }}
                  style={{ flex:1, background:"var(--surface2)", border:"1px solid var(--warning-border)", color:"var(--warning)", fontWeight:600, padding:14, borderRadius:14, fontSize:13, cursor:"pointer" }}>
                  ⚠️ 수정 요청
                </button>
                <button onClick={async () => {
                  const cd = contractData?.contract_data || {};
                  let userProf: any = null;
                  if (userId) {
                    const { data } = await supabase.from("users").select("birth_date, phone, address, address_detail").eq("id", userId).maybeSingle();
                    userProf = data;
                    setSignSelfInfo(data);
                  }
                  setSignBirth(cd.workerBirth || userProf?.birth_date || "");
                  setSignPhone(cd.workerPhone || userProf?.phone || "");
                  setSignAddr(cd.workerAddr || userProf?.address || "");
                  setSignAddrDetail(cd.workerAddrDetail || userProf?.address_detail || "");
                  setSignPostcode(cd.workerPostcode || cd.postcode || "");
                  setSignBankName(cd.bankName || (cd.bankAccount ? cd.bankAccount.split(" ")[0] : ""));
                  setSignBankNumber(cd.bankNumber || (cd.bankAccount ? cd.bankAccount.replace(/^[^\s]+\s*/, "") : ""));
                  setShowSignConfirm(true);
                }}
                  style={{ flex:2, background:"var(--success)", border:"none", color:"#fff", fontWeight:700, padding:14, borderRadius:14, fontSize:14, cursor:"pointer" }}>
                  ✅ 계약서에 동의합니다
                </button>
              </div>
            ) : isEmployer ? (
              <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                <div style={{ display:"flex", gap:8 }}>
                  <button onClick={() => { setShowContractModal(false); goToUpdateContract(); }}
                    style={{ flex:1, background:"var(--surface2)", border:"1px solid var(--border)", color:"var(--text)", fontWeight:600, padding:14, borderRadius:14, fontSize:13, cursor:"pointer" }}>
                    ✏️ 수정하기
                  </button>
                  <button onClick={() => setShowContractModal(false)}
                    style={{ flex:1, background:"none", border:"none", color:"var(--text-muted)", padding:14, fontSize:13, cursor:"pointer" }}>
                    닫기
                  </button>
                </div>
                {contractData && !contractData.worker_signed && (
                  <button onClick={() => setShowCancelConfirm(true)}
                    style={{ width:"100%", background:"var(--danger-bg)", border:"1px solid var(--danger-border)", color:"var(--danger)", fontWeight:600, padding:12, borderRadius:14, fontSize:13, cursor:"pointer" }}>
                    🗑️ 계약서 발행 취소
                  </button>
                )}
              </div>
            ) : (
              <button onClick={() => setShowContractModal(false)}
                style={{ width:"100%", background:"var(--surface2)", border:"none", borderRadius:14, padding:14, color:"var(--text-muted)", fontSize:14, cursor:"pointer" }}>
                닫기
              </button>
            )}
          </div>
        </div>
      </div>
    )}

      {/* ── 계약서 발행 취소 확인 모달 ── */}
      {showCancelConfirm && contractData && (
        <div style={{
          position: "fixed", inset: 0,
          background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)",
          display: "flex", alignItems: "center", justifyContent: "center",
          zIndex: 9999, padding: 24
        }}>
          <div style={{
            background: "var(--surface)", borderRadius: 20,
            width: "100%", maxWidth: 360, padding: 24,
            border: "1px solid var(--border)",
            boxShadow: "0 10px 25px rgba(0,0,0,0.3)",
            textAlign: "center"
          }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>⚠️</div>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: "var(--text)", margin: "0 0 10px" }}>
              계약서 발행 취소
            </h3>
            <p style={{ fontSize: 13, color: "var(--text-muted)", margin: "0 0 20px", lineHeight: 1.6 }}>
              정말로 계약서 발행을 취소하시겠습니까?<br />
              취소하시면 알바생의 <span style={{ fontWeight: 700, color: "var(--warning)" }}>서명 대기</span> 상태가 해제되며, 계약서가 무효 처리됩니다.
            </p>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setShowCancelConfirm(false)}
                style={{ flex: 1, padding: "12px", background: "var(--surface2)", border: "1px solid var(--border)", color: "var(--text)", borderRadius: 12, cursor: "pointer", fontSize: 13, fontWeight: 600 }}>
                닫기
              </button>
              <button onClick={async () => {
                await supabase.from("contracts").update({ status:"cancelled" }).eq("id", contractData.id);
                await supabase.from("team_members").update({ contract_status:"none" }).eq("id", contractData.team_member_id);
                await sendMessage("❌ 계약서 발행이 취소됐어요.", "system");
                setContractData((prev: any) => prev ? { ...prev, status: "cancelled" } : null);
                setContractStatus("cancelled");
                setShowCancelConfirm(false);
                setShowContractModal(false);
              }}
                style={{ flex: 1, padding: "12px", background: "var(--danger)", border: "none", color: "#fff", borderRadius: 12, cursor: "pointer", fontSize: 13, fontWeight: 700 }}>
                발행 취소
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── 계약서 수정 요청 모달 ── */}
      {showRevisionModal && (
        <div style={{
          position: "fixed", inset: 0,
          background: "rgba(0,0,0,0.6)", backdropFilter: "blur(6px)",
          display: "flex", alignItems: "center", justifyContent: "center",
          zIndex: 9999, padding: 24
        }}>
          <div style={{
            background: "var(--surface)", borderRadius: 20,
            width: "100%", maxWidth: 380, padding: 24,
            border: "1px solid var(--border)",
            boxShadow: "0 10px 25px rgba(0,0,0,0.3)",
          }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: "var(--text)", margin: "0 0 10px", display: "flex", alignItems: "center", gap: 6 }}>
              ✏️ 계약서 수정 요청
            </h3>
            <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "0 0 14px", lineHeight: 1.5 }}>
              사장님에게 보낼 수정 요청 내용을 상세히 입력해 주세요.
            </p>
            <textarea
              value={revisionReason}
              onChange={e => setRevisionReason(e.target.value)}
              placeholder="예: 시급을 10,000원에서 10,500원으로 변경해 주세요. / 근무 요일을 화, 목에서 월, 수, 금으로 조정해 주세요."
              style={{
                width: "100%", height: 100,
                background: "var(--surface2)",
                border: "1px solid var(--border)",
                borderRadius: 12,
                padding: 12,
                color: "var(--text)",
                fontSize: 13,
                fontFamily: "inherit",
                resize: "none",
                outline: "none",
                boxSizing: "border-box",
                marginBottom: 20
              }}
            />
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => { setShowRevisionModal(false); setRevisionReason(""); }}
                style={{ flex: 1, padding: "12px", background: "var(--surface2)", border: "1px solid var(--border)", color: "var(--text)", borderRadius: 12, cursor: "pointer", fontSize: 13, fontWeight: 600 }}>
                취소
              </button>
              <button
                disabled={!revisionReason.trim()}
                onClick={async () => {
                  if (!revisionReason.trim()) return;
                  await sendMessage(`⚠️ 계약서 수정 요청\n"${revisionReason.trim()}"`, "system");
                  setShowRevisionModal(false);
                  setShowContractModal(false);
                }}
                style={{
                  flex: 1, padding: "12px",
                  background: revisionReason.trim() ? "var(--warning)" : "var(--border)",
                  border: "none", color: "#fff", borderRadius: 12,
                  cursor: revisionReason.trim() ? "pointer" : "default",
                  fontSize: 13, fontWeight: 700,
                  opacity: revisionReason.trim() ? 1 : 0.5
                }}
              >
                전송하기
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 계약서 서명 확인 바텀시트 */}
      {showSignConfirm && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.7)", zIndex:300, display:"flex", alignItems:"flex-end" }}
          onClick={() => setShowSignConfirm(false)}>
          <div style={{ background:"var(--surface)", borderRadius:"20px 20px 0 0", padding:"24px 20px 36px", width:"100%", maxWidth:480, margin:"0 auto", position:"relative" }}
            onClick={e => e.stopPropagation()}>
            <button onClick={() => setShowSignConfirm(false)} aria-label="닫기" title="닫기"
              style={{ position:"absolute", top:16, right:16, background:"var(--surface2)", border:"1px solid var(--border)", color:"var(--text-muted)", width:30, height:30, borderRadius:"50%", fontSize:14, fontWeight:700, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}>
              ✕
            </button>
            <div style={{ textAlign:"center", marginBottom:20 }}>
              <div style={{ fontSize:44, marginBottom:10 }}>✍️</div>
              <h3 style={{ fontSize:17, fontWeight:900, margin:"0 0 8px" }}>계약서에 동의하시겠어요?</h3>
              <p style={{ fontSize:13, color:"var(--text-muted)", lineHeight:1.7, margin:0 }}>
                본 동의는 전자문서법에 따라 법적 효력이 있는<br/>
                근로계약으로 성립돼요.<br/>
                동의 후에는 취소가 어려우니 내용을 충분히<br/>
                확인한 후 진행해주세요.
              </p>
            </div>
            <div style={{ background:"var(--warning-bg)", border:"1px solid var(--warning-border)", borderRadius:12, padding:"10px 14px", marginBottom:14, fontSize:12, color:"var(--warning)", lineHeight:1.7 }}>
              📌 계약서를 출력해 양측이 서명 후 각 1부씩 보관하시길 권장해요.
            </div>
            {/* 입력 정보 요약 카카오 카드 */}
            {(() => {
              const cd = contractData?.contract_data || {};
              const workerName = cd.worker || "-";
              const workerBirth = signBirth || cd.workerBirth || "";
              const workerPhone = signPhone || cd.workerPhone || "";
              const workerAddr = [signAddr || cd.workerAddr, signAddrDetail || cd.workerAddrDetail].filter(Boolean).join(" ");
              const bankNameStr = signBankName === "기타" ? signBankCustomName : signBankName;
              const bankAccountStr = cd.bankAccount || ((bankNameStr || signBankNumber) ? `${bankNameStr} ${signBankNumber}`.trim() : "");
              return (
                <div style={{ background:"rgba(16,185,129,0.06)", border:"1.5px solid #10b981", borderRadius:16, padding:14, display:"flex", flexDirection:"column", gap:10, marginBottom:20 }}>
                  <div style={{ fontSize:12, display:"flex", justifyContent:"space-between", borderBottom:"1px dashed var(--border)", paddingBottom:6 }}>
                    <span style={{ color:"var(--text-muted)", fontWeight:600 }}>👤 성명</span>
                    <span style={{ color:"var(--text)", fontWeight:800 }}>{workerName}</span>
                  </div>
                  <div style={{ fontSize:12, display:"flex", justifyContent:"space-between", borderBottom:"1px dashed var(--border)", paddingBottom:6 }}>
                    <span style={{ color:"var(--text-muted)", fontWeight:600 }}>🎂 생년월일</span>
                    <span style={{ color: workerBirth ? "#10b981" : "#ea580c", fontWeight:800 }}>
                      {workerBirth || "미입력 (*본문 기입 필요)"}
                    </span>
                  </div>
                  <div style={{ fontSize:12, display:"flex", justifyContent:"space-between", borderBottom:"1px dashed var(--border)", paddingBottom:6 }}>
                    <span style={{ color:"var(--text-muted)", fontWeight:600 }}>📱 연락처</span>
                    <span style={{ color: workerPhone ? "#10b981" : "#ea580c", fontWeight:800 }}>
                      {workerPhone || "미입력 (*본문 기입 필요)"}
                    </span>
                  </div>
                  <div style={{ fontSize:12, display:"flex", flexDirection:"column", gap:2, borderBottom:"1px dashed var(--border)", paddingBottom:6 }}>
                    <div style={{ display:"flex", justifyContent:"space-between" }}>
                      <span style={{ color:"var(--text-muted)", fontWeight:600 }}>🏠 등본지 주소</span>
                      {signPostcode && <span style={{ fontSize:10, color:"#7c3aed", fontWeight:700 }}>📮 [{signPostcode}]</span>}
                    </div>
                    <span style={{ color: workerAddr ? "#10b981" : "#ea580c", fontWeight:800, textAlign:"right", marginTop:2 }}>
                      {workerAddr || "미입력 (*본문 기입 필요)"}
                    </span>
                  </div>
                  <div style={{ fontSize:12, display:"flex", justifyContent:"space-between" }}>
                    <span style={{ color:"var(--text-muted)", fontWeight:600 }}>🏦 급여 계좌</span>
                    <span style={{ color: bankAccountStr ? "#10b981" : "#ea580c", fontWeight:800 }}>
                      {bankAccountStr || "미입력 (*본문 기입 필요)"}
                    </span>
                  </div>
                </div>
              );
            })()}
            <div style={{ display:"flex", gap:10 }}>
              <button onClick={() => setShowSignConfirm(false)}
                style={{ flex:1, background:"var(--surface2)", border:"1px solid var(--border)", color:"var(--text-muted)", fontWeight:600, padding:14, borderRadius:14, fontSize:14, cursor:"pointer" }}>
                다시 확인할게요
              </button>
              <button onClick={async () => {
                const needBirth = !signSelfInfo?.birth_date;
                const needPhone = !signSelfInfo?.phone;
                const needAddr = !signSelfInfo?.address;
                if ((needBirth && !signBirth) || (needPhone && !signPhone.trim()) || (needAddr && !signAddr.trim())) {
                  setSignTried(true);
                  showToast("⚠️ 비어있는 본인 정보를 입력해주세요.", "error");
                  return;
                }
                if (signPhone.trim() && !/^01[016789]-\d{3,4}-\d{4}$/.test(signPhone.trim())) {
                  setSignTried(true);
                  showToast("⚠️ 연락처를 올바른 휴대폰 번호 형식(010-0000-0000)으로 입력해주세요.", "error");
                  return;
                }
                const selfUpdate: Record<string, string> = {};
                if (needBirth && signBirth) selfUpdate.birth_date = signBirth;
                if (needPhone && signPhone.trim()) selfUpdate.phone = signPhone.trim();
                if (needAddr && signAddr.trim()) {
                  selfUpdate.address = signAddr.trim();
                  if (signAddrDetail.trim()) selfUpdate.address_detail = signAddrDetail.trim();
                }
                if (Object.keys(selfUpdate).length > 0 && userId) {
                  await supabase.from("users").update(selfUpdate).eq("id", userId);
                }

                // 2. contracts 테이블 contract_data SOT 및 서명 상태 수동 업데이트
                const cd = contractData?.contract_data || {};
                const finalBankName = signBankName === "기타" ? signBankCustomName.trim() : signBankName;
                const updatedBankAcc = (finalBankName || signBankNumber.trim())
                  ? `${finalBankName} ${signBankNumber.trim()}`.trim()
                  : cd.bankAccount || null;

                const updatedContractData = {
                  ...cd,
                  workerBirth: signBirth || cd.workerBirth || selfUpdate.birth_date || null,
                  workerPhone: signPhone || cd.workerPhone || selfUpdate.phone || null,
                  workerAddr: signAddr || cd.workerAddr || selfUpdate.address || null,
                  workerAddrDetail: signAddrDetail || cd.workerAddrDetail || selfUpdate.address_detail || null,
                  workerPostcode: signPostcode || cd.workerPostcode || null,
                  bankName: finalBankName || cd.bankName || null,
                  bankNumber: signBankNumber.trim() || cd.bankNumber || null,
                  bankAccount: updatedBankAcc || cd.bankAccount || null,
                };

                await supabase.from("contracts").update({
                  contract_data: updatedContractData,
                  worker_signed: true,
                  worker_signed_at: new Date().toISOString(),
                  status: "active",
                }).eq("id", contractData.id);

                setShowSignConfirm(false);
                // 3. 서버 API로 서명 처리 (team_members 업데이트는 service role 필요)
                await fetch("/api/contract", {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    action: "sign",
                    contractId: contractData.id,
                    teamMemberId: contractData.team_member_id,
                    matchId,
                    workerId: userId,
                    employerId: counterpart?.id,
                    isHired: progressStatus === "hired",
                  }),
                });
                if (progressStatus !== "hired") updateProgressStatus("hired");
                await sendMessage("🎉 근로계약서 동의가 완료됐어요!\n계약서는 MY → 팀·소속 관리에서 확인하실 수 있어요. ✅", "system");
                setContractData((p: Record<string,unknown>) => ({ ...p, contract_data: updatedContractData, worker_signed: true, status: "active" }));
                setContractStatus("done");
                setShowContractModal(false);
              }}
                style={{ flex:2, background:"var(--success)", border:"none", color:"#fff", fontWeight:700, padding:14, borderRadius:14, fontSize:14, cursor:"pointer" }}>
                ✅ 동의합니다
              </button>
            </div>
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
              <button onClick={() => setShowRejectConfirmModal(true)}
                style={{ flex: 1, background: "var(--surface2)", border: "1px solid var(--border)", color: "var(--text-muted)", fontWeight: 600, padding: 14, borderRadius: 12, cursor: "pointer", fontSize: 14 }}>
                거절하기
              </button>
              <button onClick={() => { handleProgress("hire_accept"); setShowHireProposalModal(false); }}
                style={{ flex: 2, background: "var(--primary)", border: "none", color: "#fff", fontWeight: 700, padding: 14, borderRadius: 12, cursor: "pointer", fontSize: 14 }}>
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
                style={{ width: "100%", background: reviewScore ? "var(--primary)" : "var(--surface2)", border: "none", color: reviewScore ? "#fff" : "var(--text-muted)", fontWeight: 700, padding: 14, borderRadius: 12, cursor: reviewScore ? "pointer" : "default", fontSize: 14 }}>
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
                    style={{ flex: 1, background: "var(--danger-bg)", border: "1px solid var(--danger-border)", color: "var(--danger)", fontWeight: 700, padding: 14, borderRadius: 12, cursor: "pointer", fontSize: 14 }}>
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
                    style={{ flex: 1, padding: "12px", borderRadius: 12, border: `2px solid ${quickReview === "good" ? "var(--success)" : "var(--border)"}`, background: quickReview === "good" ? "var(--success-bg)" : "var(--surface2)", cursor: "pointer", fontSize: 22 }}>
                    😊<br /><span style={{ fontSize: 11, color: quickReview === "good" ? "var(--success)" : "var(--text-muted)", fontWeight: 600 }}>괜찮았어요</span>
                  </button>
                  <button onClick={() => setQuickReview("bad")}
                    style={{ flex: 1, padding: "12px", borderRadius: 12, border: `2px solid ${quickReview === "bad" ? "var(--danger)" : "var(--border)"}`, background: quickReview === "bad" ? "var(--danger-bg)" : "var(--surface2)", cursor: "pointer", fontSize: 22 }}>
                    😞<br /><span style={{ fontSize: 11, color: quickReview === "bad" ? "var(--danger)" : "var(--text-muted)", fontWeight: 600 }}>별로였어요</span>
                  </button>
                </div>

                {/* 별로일 때 이유 선택 */}
                {quickReview === "bad" && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 14, justifyContent: "center" }}>
                    {["노쇼/연락두절", "비매너", "허위정보", "약속불이행", "기타"].map(r => (
                      <button key={r} onClick={() => setQuickReviewReason(r)}
                        style={{ padding: "5px 12px", borderRadius: 20, fontSize: 11, cursor: "pointer", background: quickReviewReason === r ? "var(--danger-bg)" : "var(--surface2)", color: quickReviewReason === r ? "var(--danger)" : "var(--text-muted)", border: quickReviewReason === r ? "1px solid var(--danger-border)" : "1px solid transparent" }}>
                        {r}
                      </button>
                    ))}
                  </div>
                )}

                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <button onClick={handleLeaveWithReview}
                    style={{ width: "100%", background: "var(--primary)", border: "none", color: "#fff", fontWeight: 700, padding: 12, borderRadius: 12, cursor: "pointer", fontSize: 14 }}>
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

      {/* 채용 제안 거절 확인 모달 (커스텀) */}
      {showRejectConfirmModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", padding: 20, backdropFilter: "blur(4px)" }}>
          <div style={{ background: "var(--surface)", borderRadius: 20, padding: 24, width: "100%", maxWidth: 320, textAlign: "center", border: "1px solid var(--border)", boxShadow: "0 10px 25px rgba(0,0,0,0.3)" }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>⚠️</div>
            <h3 style={{ fontSize: 16, fontWeight: 900, margin: "0 0 10px", color: "var(--text)" }}>채용 제안 거절</h3>
            <p style={{ fontSize: 13, color: "var(--text-muted)", margin: "0 0 20px", lineHeight: 1.6 }}>
              정말로 채용 제안을 거절하시겠습니까?<br />
              <span style={{ color: "var(--danger)", fontWeight: 600 }}>거절 시 대화방이 종료되며<br />더 이상 대화할 수 없습니다.</span>
            </p>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => {
                handleProgress("hire_reject");
                setShowRejectConfirmModal(false);
                setShowHireProposalModal(false);
              }}
                style={{ flex: 1, background: "var(--danger-bg)", border: "1px solid var(--danger-border)", color: "var(--danger)", fontWeight: 700, padding: 14, borderRadius: 12, cursor: "pointer", fontSize: 14 }}>
                거절하기
              </button>
              <button onClick={() => setShowRejectConfirmModal(false)}
                style={{ flex: 1, background: "var(--surface2)", border: "1px solid var(--border)", color: "var(--text-muted)", fontWeight: 600, padding: 14, borderRadius: 12, cursor: "pointer", fontSize: 14 }}>
                취소
              </button>
            </div>
          </div>
        </div>
      )}
      {/* 미성년자 나이 감지 경고 모달 */}
      {showMinorWarningModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", backdropFilter: "blur(6px)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div style={{ background: "var(--surface)", border: "1.5px solid #f59e0b", borderRadius: 20, padding: 24, width: "100%", maxWidth: 380, boxShadow: "0 25px 50px -12px rgba(0,0,0,0.5)", textAlign: "center" }}>
            <div style={{ fontSize: 44, marginBottom: 8 }}>⚠️</div>
            <h3 style={{ fontSize: 17, fontWeight: 900, color: "var(--text)", margin: "0 0 8px" }}>미성년자 (만 18세 미만) 확인</h3>
            <p style={{ fontSize: 13, color: "var(--text-muted)", lineHeight: 1.6, margin: "0 0 16px" }}>
              입력하신 생년월일 기준 <strong style={{ color: "#ea580c" }}>만 {detectedMinorAge}세 (연소근로자)</strong>입니다.<br /><br />
              📌 근로기준법상 만 18세 미만 근로자는 <strong style={{ color: "#ea580c" }}>보호자(친권자/후견인) 동의서 작성이 법적 필수</strong>입니다.
            </p>
            <div style={{ background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.3)", borderRadius: 12, padding: 10, fontSize: 11, color: "#d97706", marginBottom: 20 }}>
              💡 날짜 오입력(오타)인 경우 [생년월일 수정]을 눌러 다시 선택해 주세요.
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => {
                setSignBirth("");
                setShowMinorWarningModal(false);
              }} style={{ flex: 1, background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 12, padding: 12, fontSize: 13, fontWeight: 600, color: "var(--text-muted)", cursor: "pointer" }}>
                ✏️ 생년월일 수정
              </button>
              <button onClick={() => {
                setShowMinorWarningModal(false);
              }} style={{ flex: 1, background: "linear-gradient(135deg,#f59e0b,#d97706)", border: "none", borderRadius: 12, padding: 12, fontSize: 13, fontWeight: 700, color: "#fff", cursor: "pointer" }}>
                네, 맞습니다
              </button>
            </div>
          </div>
        </div>
      )}
      {ToastUI}
    </main>
  );
}
