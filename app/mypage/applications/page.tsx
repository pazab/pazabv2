"use client";
import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import AppHeader from "@/components/AppHeader";
import LoveCallSection from "@/components/LoveCallSection";
import ConfirmModal from "@/components/ConfirmModal";
import MatchSuccessModal from "@/components/MatchSuccessModal";
import { useLoveCalls, type ConfirmModalState } from "@/lib/useLoveCalls";

function ApplicationsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tab = (searchParams.get("tab") as "worker" | "employer") || "worker";
  const isEmployer = tab === "employer";

  const [userId, setUserId] = useState<string | null>(null);
  const [toastMsg, setToastMsg] = useState("");
  const [confirmModal, setConfirmModal] = useState<ConfirmModalState | null>(null);
  const {
    loveCalls, loveCallLoading, respondingId,
    matchModal, setMatchModal,
    fetchLoveCalls, handleRespond, handleCancel, handleDelete,
  } = useLoveCalls(userId, setConfirmModal);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const uid = data.user?.id || null;
      setUserId(uid);
      if (uid) fetchLoveCalls(uid, "both");
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const received = loveCalls.filter(lc => lc.myRole === tab && !lc.isSent);
  const sent = loveCalls.filter(lc => lc.myRole === tab && lc.isSent);

  const onNavigate = (lc: any) => isEmployer
    ? router.push(`/worker/${lc.worker_id}`)
    : router.push(lc.counterpart?.job_id ? `/job/${lc.counterpart.job_id}` : `/store/${lc.counterpart?.id}`);

  return (
    <main style={{ minHeight: "100vh", background: "var(--bg)", color: "var(--text)", paddingBottom: 80 }}>
      <AppHeader title={isEmployer ? "받은 지원 · 보낸 채용 제안" : "받은 채용 제안 · 보낸 지원"} showBack onBack={() => router.push("/mypage")} />

      <div style={{ maxWidth: 480, margin: "0 auto", padding: 16 }}>
        {loveCallLoading ? (
          <p style={{ textAlign: "center", color: "var(--text-muted)", marginTop: 40 }}>불러오는 중...</p>
        ) : received.length === 0 && sent.length === 0 ? (
          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 16, padding: "20px 16px", textAlign: "center" }}>
            <p style={{ color: "var(--text-muted)", fontSize: 13, margin: "0 0 10px" }}>
              {isEmployer ? "아직 지원/제안 내역이 없어요" : "아직 지원 내역이 없어요"}
            </p>
            {!isEmployer && (
              <button onClick={() => router.push("/explore?type=worker")}
                style={{ background: "var(--chip-pink-bg)", border: "1px solid var(--chip-pink-border)", color: "var(--pink-text)", padding: "7px 18px", borderRadius: 20, cursor: "pointer", fontSize: 12, fontWeight: 700 }}>
                매장 둘러보기 →
              </button>
            )}
          </div>
        ) : (
          <>
            {received.length > 0 && (
              <LoveCallSection
                title={isEmployer ? "📥 받은 지원" : "📥 받은 채용 제안"}
                calls={received}
                showRespond={true}
                respondingId={respondingId}
                onRespond={handleRespond}
                onCancel={handleCancel}
                onNavigate={onNavigate}
                onDelete={handleDelete}
                router={router}
              />
            )}
            {sent.length > 0 && (
              <LoveCallSection
                title={isEmployer ? "📤 보낸 채용 제안" : "📤 보낸 지원"}
                calls={sent}
                showRespond={false}
                respondingId={respondingId}
                onRespond={handleRespond}
                onCancel={handleCancel}
                onNavigate={onNavigate}
                onDelete={handleDelete}
                router={router}
              />
            )}
          </>
        )}
      </div>

      {confirmModal && (
        <ConfirmModal
          title={confirmModal.title}
          desc={confirmModal.desc}
          confirmLabel={confirmModal.confirmLabel}
          confirmColor={confirmModal.confirmColor}
          onConfirm={confirmModal.onConfirm}
          onCancel={() => setConfirmModal(null)}
        />
      )}

      {matchModal && (
        <MatchSuccessModal
          matchId={matchModal.matchId}
          router={router}
          onClose={() => setMatchModal(null)}
          onToast={(msg) => { setToastMsg(msg); setTimeout(() => setToastMsg(""), 3000); }}
        />
      )}

      {toastMsg && (
        <div style={{ position: "fixed", bottom: 90, left: "50%", transform: "translateX(-50%)", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "10px 18px", fontSize: 13, color: "var(--text)", zIndex: 200, boxShadow: "var(--shadow-elevate)" }}>
          {toastMsg}
        </div>
      )}
    </main>
  );
}

export default function ApplicationsPage() {
  return (
    <Suspense fallback={null}>
      <ApplicationsContent />
    </Suspense>
  );
}
