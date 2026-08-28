"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import ResumeEditForm from "@/components/worker/ResumeEditForm";
import GalleryEditForm from "@/components/worker/GalleryEditForm";

function WorkerProfileContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isEdit = searchParams.get("edit") === "true";
  const profileId = searchParams.get("profileId") || ""; // 수정할 프로필 id (관리자가 남의 프로필 수정할 때 사용)
  const returnTo = searchParams.get("return") || "explore";
  const sectionParam = searchParams.get("section") || "";
  const galleryOnly = searchParams.get("start") === "gallery";

  const [loading, setLoading] = useState(true);
  const [success, setSuccess] = useState(false);
  const [warning, setWarning] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => { checkAuth(); }, []);

  const checkAuth = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { router.push("/login"); return; }
    setUserId(session.user.id);

    const currentParams = new URLSearchParams(window.location.search);
    const currIsEdit = currentParams.get("edit") === "true";
    const currIsNew = currentParams.get("new") === "true";
    const currProfileId = currentParams.get("profileId") || "";
    const currReturnTo = currentParams.get("return") || "explore";
    const currSectionParam = currentParams.get("section") || "";

    if (currIsNew) { setLoading(false); return; }

    // "이미 프로필 있는데 edit 없이 들어옴" 리다이렉트 판정
    const query = supabase.from("worker_profiles").select("id");
    const { data } = currProfileId
      ? await query.eq("id", currProfileId).maybeSingle()
      : await query.eq("user_id", session.user.id).order("created_at", { ascending: false }).limit(1).maybeSingle();

    if (data && !currIsEdit && !currReturnTo.startsWith("%2F") && !currReturnTo.startsWith("/")) {
      router.replace(
        currReturnTo === "mypage" ? `/mypage${currSectionParam ? `?section=${currSectionParam}` : ""}` :
        currReturnTo === "interview" ? "/interview" :
        "/explore?type=worker"
      );
      return;
    }

    setLoading(false);
  };

  const finishAndRedirect = (warningMsg?: string) => {
    setSuccess(true);
    if (warningMsg) setWarning(warningMsg);
    const mypageUrl = `/mypage${sectionParam ? `?section=${sectionParam}` : ""}`;
    const decodedReturn = returnTo ? decodeURIComponent(returnTo) : "";
    setTimeout(() => router.replace(
      returnTo === "mypage" ? mypageUrl :
      returnTo === "interview" ? "/interview" :
      returnTo === "result" ? "/result?type=worker&level=1" :
      decodedReturn.startsWith("/") ? decodedReturn :
      "/explore?type=worker"
    ), warningMsg ? 3500 : 1500);
  };

  if (loading) return (
    <main style={{ minHeight: "100vh", background: "var(--bg)", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <p style={{ color: "var(--text-muted)" }}>불러오는 중...</p>
    </main>
  );

  return (
    <main style={{ minHeight: "100vh", background: "var(--bg)", color: "var(--text)", paddingBottom: 100 }}>
      {/* 헤더 */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 16px", borderBottom: "1px solid var(--border)", position: "sticky", top: 0, background: "rgba(24,24,27,0.97)", backdropFilter: "blur(12px)", zIndex: 10 }}>
        <button onClick={() => router.back()} style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", padding: 4 }}>
          <i className="ti ti-arrow-left" style={{ fontSize: 20, display: "block" }} aria-hidden="true" />
        </button>
        <span style={{ fontSize: 16, fontWeight: 700 }}>{galleryOnly ? "구직카드 사진" : isEdit ? "이력서 수정" : "이력서 작성"}</span>
      </div>

      <div style={{ maxWidth: 480, margin: "0 auto", padding: "24px 16px" }}>
        {success ? (
          <div style={{ textAlign: "center", padding: "60px 0" }}>
            <div style={{ fontSize: 56, marginBottom: 16 }}>{warning ? "⚠️" : "✅"}</div>
            <h2 style={{ fontSize: 22, fontWeight: 900, margin: "0 0 8px" }}>저장됐어요!</h2>
            {warning && (
              <p style={{ color: "var(--warning, #f59e0b)", fontSize: 13, margin: "0 0 8px", padding: "0 20px" }}>{warning}</p>
            )}
            <p style={{ color: "var(--text-muted)", fontSize: 14 }}>잠시 후 이동합니다</p>
          </div>
        ) : !userId ? null : galleryOnly ? (
          <GalleryEditForm userId={userId} profileId={profileId || undefined} onSaved={finishAndRedirect} />
        ) : (
          <ResumeEditForm userId={userId} profileId={profileId || undefined} onSaved={finishAndRedirect} />
        )}
      </div>
    </main>
  );
}

export default function WorkerProfile() {
  return (
    <Suspense fallback={
      <div style={{ minHeight: "100vh", background: "var(--bg)", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <p style={{ color: "var(--text-muted)" }}>불러오는 중...</p>
      </div>
    }>
      <WorkerProfileContent />
    </Suspense>
  );
}
