"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import DaetaSosHome from "@/components/daeta/DaetaSosHome";
import { getEmployerContext } from "@/lib/permissions";

// 내 SOS 현황 전용 화면 — /daeta 홈의 "내 SOS 진행 중" 배너를 누르면 옴.
// 다른 사이트(당근알바/알바몬 등)처럼 "내가 올린 것 관리"를 "남의 것 둘러보기"와 화면 자체로
// 분리해서, /daeta 안에서 겪었던 sticky 겹침·스크롤 방향·탭 제스처 충돌을 구조적으로 없앰.
export default function DaetaMyPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [effectiveEmployerId, setEffectiveEmployerId] = useState<string | null>(null);
  const [userType, setUserType] = useState("worker");

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.replace("/login");
        return;
      }

      const { data } = await supabase.from("users").select("user_type").eq("id", user.id).single();
      const userTypeTemp = data?.user_type || "worker";
      setUserType(userTypeTemp);

      let employerId = user.id;
      let employer = userTypeTemp === "employer" || userTypeTemp === "both";

      // 사장님 본인이 아니면, sos_request 권한을 가진 매니저인지 확인해서 소속 사장님 id로 대체
      if (!employer) {
        const ctx = await getEmployerContext(supabase, user.id);
        if (ctx?.isManager && ctx.permissions.sos_request) {
          employer = true;
          employerId = ctx.employerId;
        }
      }

      if (!employer) {
        // 사장님이 아니면 이 화면에서 관리할 게 없음 — 대타 홈으로 되돌림
        router.replace("/daeta");
        return;
      }

      setUserId(user.id);
      setEffectiveEmployerId(employerId);
      setReady(true);
    }
    init();
  }, [router]);

  if (!ready || !userId) return null;

  return (
    <DaetaSosHome
      userId={effectiveEmployerId || userId}
      userType={userType}
      roleView="employer"
      mode="myOnly"
      onOpenDeck={() => router.push("/daeta")}
    />
  );
}
