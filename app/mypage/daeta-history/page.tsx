"use client";
import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import AppHeader from "@/components/AppHeader";
import DaetaHistoryView from "@/components/daeta/DaetaHistoryView";
import RoleToggleButton from "@/components/RoleToggleButton";
import { useActiveRole } from "@/lib/useActiveRole";

function DaetaHistoryContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get("tab");
  const focusMatchId = searchParams.get("matchId") || undefined;

  const [userId, setUserId] = useState<string | null>(null);
  const [userType, setUserType] = useState<string>("");
  // both 계정의 현재 모드를 마이페이지/홈 상단 헤더 스위치와 같은 전역 상태(useActiveRole,
  // localStorage 공유)로 관리 — 예전엔 이 페이지만 로컬 state라 여기서 바꿔도 다른 화면엔
  // 반영이 안 되고, 반대로 헤더에서 바꾼 것도 여기 들어오면 리셋됐음.
  const { activeRole, setActiveRole, isBoth } = useActiveRole(userType);

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      const uid = data.user?.id || null;
      setUserId(uid);
      if (uid) {
        const { data: u } = await supabase.from("users").select("user_type").eq("id", uid).maybeSingle();
        setUserType(u?.user_type || "worker");
      }
    });
  }, []);

  // ?tab=worker|employer 딥링크(예: 채팅방 "대타 관리하기") — mypage/myteam과 동일 패턴
  useEffect(() => {
    if (isBoth && (tabParam === "worker" || tabParam === "employer")) setActiveRole(tabParam);
  }, [isBoth, tabParam, setActiveRole]);

  return (
    <main style={{ minHeight: "100vh", background: "var(--bg)", color: "var(--text)", paddingBottom: 80 }}>
      <AppHeader title="대타 이력" showBack onBack={() => router.push("/mypage")}
        rightActions={isBoth ? <RoleToggleButton activeRole={activeRole} onChange={setActiveRole} /> : undefined} />
      <div style={{ maxWidth: 480, margin: "0 auto", padding: 16 }}>
        {userId && <DaetaHistoryView userId={userId} userType={activeRole} embedded focusMatchId={focusMatchId} />}
      </div>
    </main>
  );
}

export default function DaetaHistoryPage() {
  return (
    <Suspense fallback={null}>
      <DaetaHistoryContent />
    </Suspense>
  );
}
