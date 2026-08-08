"use client";
import { useState } from "react";

export interface LoveCall {
  id: string; status: string; match_score: number; message: string;
  created_at: string; counterpart: any;
  employer_id: string; worker_id: string;
  isSent: boolean;
  myRole: string;
  [key: string]: any;
}

export interface ConfirmModalState {
  title: string; desc: string; confirmLabel: string; confirmColor?: string;
  onConfirm: () => void;
}

// mypage와 /mypage/applications가 공유하는 지원/러브콜 데이터+액션. 원래 app/mypage/page.tsx에
// 로컬로만 있던 걸 두 화면이 같이 쓰게 되면서 추출함(중복 구현 방지).
// confirmModal은 훅이 소유하지 않고 호출부(setConfirmModal)에 위임 — mypage 메인 페이지는 이 훅과 무관한
// 다른 확인모달(게시물 삭제 등)도 같은 state를 공유해서 쓰기 때문.
export function useLoveCalls(userId: string | null, setConfirmModal: (state: ConfirmModalState | null) => void) {
  const [loveCalls, setLoveCalls] = useState<LoveCall[]>([]);
  const [loveCallLoading, setLoveCallLoading] = useState(false);
  const [respondingId, setRespondingId] = useState<string | null>(null);
  const [matchModal, setMatchModal] = useState<{ matchId: string } | null>(null);

  const fetchLoveCalls = async (uid: string, uType: string) => {
    setLoveCallLoading(true);
    try {
      const res = await fetch(`/api/lovecall?userId=${uid}&userType=${uType}`);
      const data = await res.json();
      if (data.success) {
        setLoveCalls(data.data || []);
      }
      return data;
    } catch (err) {
      console.error(err);
      return null;
    } finally {
      setLoveCallLoading(false);
    }
  };

  const handleRespond = async (matchId: string, action: "accept" | "reject") => {
    setRespondingId(matchId);
    try {
      const res = await fetch("/api/lovecall", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ matchId, action }),
      });
      const data = await res.json();
      if (data.success) {
        const nextStatus = action === "accept" ? "accepted" : "rejected";
        setLoveCalls(prev => prev.map(lc =>
          lc.id === matchId ? { ...lc, status: nextStatus, progress_status: nextStatus } : lc
        ));
        if (action === "accept") {
          const lc = loveCalls.find(l => l.id === matchId);
          if (lc && userId) {
            await fetch("/api/chat", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                matchId,
                senderId: userId,
                receiverId: lc.myRole === "worker" ? lc.employer_id : lc.worker_id,
                message: "🎉 매칭이 성사됐어요! 서로 인사를 나눠보세요 😊",
                messageType: "system",
              }),
            });
          }
          setMatchModal({ matchId });
        }
      }
    } catch (err) { console.error(err); }
    finally { setRespondingId(null); }
  };

  const handleProgress = async (matchId: string, action: string) => {
    try {
      const res = await fetch("/api/lovecall", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ matchId, action }),
      });
      const data = await res.json();
      if (data.success) {
        setLoveCalls(prev => prev.map(lc =>
          lc.id === matchId ? { ...lc, progress_status: action === "interview" ? "interviewing" : action === "hire" ? "hired" : "failed" } : lc
        ));
      }
    } catch (err) { console.error(err); }
  };

  const handleCancel = (matchId: string) => {
    setConfirmModal({
      title: "지원을 취소할까요?",
      desc: "취소 기록은 남아있고, 나중에 삭제할 수 있어요.",
      confirmLabel: "네, 취소할게요",
      confirmColor: "var(--danger)",
      onConfirm: async () => {
        try {
          const res = await fetch("/api/lovecall", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ matchId, action: "cancel" }),
          });
          const data = await res.json();
          if (data.success) {
            setLoveCalls(prev => prev.map(lc => lc.id === matchId ? { ...lc, status: "cancelled", progress_status: "cancelled" } : lc));
          } else {
            alert("취소 실패: " + (data.error || "알 수 없는 오류"));
          }
        } catch (err) { console.error(err); }
        setConfirmModal(null);
      },
    });
  };

  const handleDelete = (matchId: string) => {
    setConfirmModal({
      title: "기록을 삭제할까요?",
      desc: "삭제하면 복구할 수 없어요.",
      confirmLabel: "삭제하기",
      confirmColor: "var(--danger)",
      onConfirm: async () => {
        try {
          const res = await fetch(`/api/lovecall?matchId=${matchId}`, { method: "DELETE" });
          const data = await res.json();
          if (data.success) {
            setLoveCalls(prev => prev.filter(lc => lc.id !== matchId));
          } else {
            alert("삭제 실패: " + (data.error || "알 수 없는 오류"));
          }
        } catch (err) { console.error(err); }
        setConfirmModal(null);
      },
    });
  };

  return {
    loveCalls, loveCallLoading, respondingId,
    matchModal, setMatchModal,
    fetchLoveCalls, handleRespond, handleProgress, handleCancel, handleDelete,
  };
}
