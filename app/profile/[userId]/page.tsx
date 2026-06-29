"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { getMatchLevel } from "@/lib/utils";

const GRADE_INFO: Record<string, { label: string; emoji: string; color: string }> = {
  bronze: { label: "브론즈", emoji: "🥉", color: "#fb923c" },
  silver: { label: "실버", emoji: "🥈", color: "#94a3b8" },
  gold: { label: "골드", emoji: "🥇", color: "#fbbf24" },
  platinum: { label: "플래티넘", emoji: "💎", color: "#60a5fa" },
};

export default function ProfilePage() {
  const router = useRouter();
  const params = useParams();
  const targetId = params.userId as string;

  const [myId, setMyId] = useState<string | null>(null);
  const [targetUser, setTargetUser] = useState<any>(null);
  const [workerProfile, setWorkerProfile] = useState<any>(null);
  const [employerProfiles, setEmployerProfiles] = useState<any[]>([]);
  const [matchScore, setMatchScore] = useState<number | null>(null);
  const [existingMatch, setExistingMatch] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"worker" | "employer">("worker");

  useEffect(() => { init(); }, [targetId]);

  const init = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (session) setMyId(session.user.id);

    // 유저 정보
    const { data: user } = await supabase
      .from("users")
      .select("*")
      .eq("id", targetId)
      .single();
    setTargetUser(user);

    // 알바생 프로필
    const { data: wp } = await supabase
      .from("worker_profiles")
      .select("*")
      .eq("user_id", targetId)
      .maybeSingle();
    setWorkerProfile(wp);

    // 사장님 공고
    const { data: eps } = await supabase
      .from("employer_profiles")
      .select("*")
      .eq("user_id", targetId);
    setEmployerProfiles(eps || []);

    // 기본 탭 설정 - 성향은 어느쪽이든 있으면 표시
    if (!wp && eps?.length) setActiveTab("employer");

    // 매칭 점수 + 기존 매치
    if (session) {
      try {
        const res = await fetch("/api/match", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId: session.user.id, userType: "worker" }),
        });
        const data = await res.json();
        if (data.success) {
          const found = data.results?.find((r: any) => r.id === targetId || r.user_id === targetId);
          if (found) setMatchScore(found.match_score);
        }
      } catch {}

      const { data: match } = await supabase
        .from("matches")
        .select("id, status, progress_status")
        .or(`and(employer_id.eq.${targetId},worker_id.eq.${session.user.id}),and(employer_id.eq.${session.user.id},worker_id.eq.${targetId})`)
        .maybeSingle();
      if (match) setExistingMatch(match);
    }

    setLoading(false);
  };

  const isMe = myId === targetId;
  const hasWorker = !!workerProfile;
  const hasEmployer = employerProfiles.length > 0;
  const grade = GRADE_INFO[targetUser?.grade || "bronze"];

  // 성향 데이터 - worker 우선, 없으면 employer
  const big5 = workerProfile?.big5_data || employerProfiles[0]?.bio5_data || null;
  const personalityType = workerProfile?.worker_type || employerProfiles[0]?.employer_type || null;

  if (loading) return (
    <main style={{ minHeight: "100vh", background: "var(--bg)", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <p style={{ color: "var(--text-muted)" }}>불러오는 중...</p>
    </main>
  );

  if (!targetUser) return (
    <main style={{ minHeight: "100vh", background: "var(--bg)", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <p style={{ color: "var(--text-muted)" }}>유저를 찾을 수 없어요</p>
    </main>
  );

  return (
    <main style={{ minHeight: "100vh", background: "linear-gradient(to bottom, #181528 0%, #09090b 60%)", color: "var(--text)", paddingBottom: 100 }}>
      {/* 헤더 */}
      <div style={{ position: "sticky", top: 0, zIndex: 20, background: "rgba(24,24,27,0.85)", backdropFilter: "blur(12px)", borderBottom: "1px solid var(--border)", padding: "12px 16px", display: "flex", alignItems: "center", gap: 12 }}>
        <button onClick={() => router.back()}
          style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", color: "var(--text)", fontSize: 18, width: 36, height: 36, borderRadius: 10, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
          ←
        </button>
        <span style={{ fontSize: 16, fontWeight: 700 }}>프로필</span>
      </div>

      <div style={{ maxWidth: 640, margin: "0 auto", padding: "20px 16px", display: "flex", flexDirection: "column", gap: 14 }}>

        {/* 프로필 상단 */}
        <div style={{ background: "linear-gradient(135deg, rgba(139,92,246,0.12), rgba(236,72,153,0.06))", backdropFilter: "blur(12px)", border: "1px solid rgba(139,92,246,0.25)", borderRadius: 20, padding: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 16 }}>
            {/* 아바타 */}
            <div style={{ width: 72, height: 72, borderRadius: "50%", overflow: "hidden", flexShrink: 0, border: "2px solid rgba(255,255,255,0.15)" }}>
              {targetUser.avatar_url ? (
                <img src={targetUser.avatar_url} alt="avatar" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              ) : (
                <div style={{ width: "100%", height: "100%", background: "var(--primary-light)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 30 }}>
                  {hasEmployer ? "🏪" : "⚡"}
                </div>
              )}
            </div>
            <div style={{ flex: 1 }}>
              {/* 닉네임 */}
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4, flexWrap: "wrap" }}>
                <h2 style={{ fontSize: 20, fontWeight: 900, margin: 0 }}>{targetUser.nickname || targetUser.name}</h2>
                {hasWorker && <span style={{ fontSize: 11, background: "rgba(139,92,246,0.15)", color: "#c4b5fd", padding: "2px 8px", borderRadius: 20, border: "1px solid rgba(139,92,246,0.3)" }}>⚡ 알바생</span>}
                {hasEmployer && <span style={{ fontSize: 11, background: "rgba(236,72,153,0.15)", color: "#f9a8d4", padding: "2px 8px", borderRadius: 20, border: "1px solid rgba(236,72,153,0.3)" }}>🏪 사장님</span>}
              </div>
              {/* 등급 + 신뢰점수 */}
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 12, color: grade.color, fontWeight: 700 }}>{grade.emoji} {grade.label}</span>
                <span style={{ fontSize: 12, color: "var(--text-muted)" }}>신뢰 {targetUser.trust_score || 50}점</span>
              </div>
            </div>
            {/* 궁합 점수 */}
            {matchScore != null && !isMe && (() => {
              const level = getMatchLevel(matchScore);
              return (
                <div style={{ textAlign: "center", flexShrink: 0 }}>
                  <div style={{ fontSize: 24, fontWeight: 900, color: level.color }}>{matchScore}</div>
                  <div style={{ fontSize: 9, color: level.color, fontWeight: 600 }}>{level.emoji} {level.label}</div>
                </div>
              );
            })()}
          </div>

          {/* 성향 유형 한줄 요약만 */}
          {personalityType && (
            <div style={{ background: "rgba(0,0,0,0.25)", borderRadius: 12, padding: "8px 14px", border: "1px solid rgba(255,255,255,0.04)" }}>
              <span style={{ fontSize: 12, color: "var(--text-muted)" }}>성향 유형 · </span>
              <span style={{ fontSize: 13, fontWeight: 700, color: "#c4b5fd" }}>{personalityType}</span>
            </div>
          )}
        </div>

        {/* 성향 분석 결과 */}
        {(personalityType || big5) && (
          <>
            {/* 성향 유형 카드 */}
            <div style={{ background: "rgba(255,255,255,0.03)", backdropFilter: "blur(12px)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 20, padding: 20, textAlign: "center" }}>
              <div style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "rgba(0,0,0,0.2)", borderRadius: 20, padding: "4px 12px", marginBottom: 12 }}>
                <span style={{ fontSize: 11, color: "#c4b5fd", fontWeight: 600 }}>🔬 행동심리 분석 결과</span>
              </div>
              {personalityType && (
                <>
                  <div style={{ fontSize: 52, marginBottom: 8 }}>
                    {workerProfile?.big5_data ? "⚡" : "🏪"}
                  </div>
                  <h2 style={{ fontSize: 22, fontWeight: 900, margin: "0 0 4px" }}>{personalityType}</h2>
                </>
              )}
              {/* 강점 태그 */}
              {(workerProfile?.strengths || employerProfiles[0]?.tags) && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center", marginTop: 12 }}>
                  {(workerProfile?.strengths || []).map((s: string) => (
                    <span key={s} style={{ background: "var(--primary-light)", border: "1px solid var(--primary-border)", color: "#c4b5fd", fontSize: 12, borderRadius: 20, padding: "5px 12px" }}>{s}</span>
                  ))}
                </div>
              )}
            </div>

            {/* Big5 성향 분석 */}
            {big5 && (
              <div style={{ background: "rgba(255,255,255,0.03)", backdropFilter: "blur(12px)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 20, padding: 20 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
                  <h3 style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>📊 행동심리 성향 분석</h3>
                  <span style={{ fontSize: 11, background: "rgba(34,197,94,0.1)", color: "#86efac", padding: "2px 8px", borderRadius: 20, border: "1px solid rgba(34,197,94,0.2)" }}>과학적 근거</span>
                </div>
                {[
                  { label: "성실성", desc: "약속·책임감", value: big5.conscientiousness },
                  { label: "외향성", desc: "에너지·사교", value: big5.extraversion },
                  { label: "친화성", desc: "협동·배려", value: big5.agreeableness },
                  { label: "개방성", desc: "창의·호기심", value: big5.openness },
                  { label: "안정성", desc: "감정조절", value: 5 - big5.neuroticism },
                ].map(item => (
                  <div key={item.label} style={{ marginBottom: 12 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 6 }}>
                      <div>
                        <span style={{ color: "var(--text-sub)", fontWeight: 600 }}>{item.label}</span>
                        <span style={{ color: "var(--text-muted)", fontSize: 11, marginLeft: 6 }}>{item.desc}</span>
                      </div>
                      <span style={{ color: "var(--text-muted)" }}>{item.value}/5</span>
                    </div>
                    <div style={{ background: "rgba(255,255,255,0.06)", borderRadius: 4, height: 6 }}>
                      <div style={{ background: item.value >= 4 ? "linear-gradient(90deg, #8b5cf6, #ec4899)" : "var(--primary)", height: 6, borderRadius: 4, width: `${(item.value / 5) * 100}%`, transition: "width 0.8s ease" }} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
        {hasWorker && hasEmployer && (
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => setActiveTab("worker")}
              style={{ flex: 1, padding: "12px", borderRadius: 12, border: "1px solid rgba(255,255,255,0.05)", fontSize: 13, fontWeight: 600, cursor: "pointer", background: activeTab === "worker" ? "linear-gradient(135deg, #8b5cf6, #7c3aed)" : "rgba(255,255,255,0.04)", color: activeTab === "worker" ? "#fff" : "var(--text-muted)" }}>
              ⚡ 알바생 정보
            </button>
            <button onClick={() => setActiveTab("employer")}
              style={{ flex: 1, padding: "12px", borderRadius: 12, border: "1px solid rgba(255,255,255,0.05)", fontSize: 13, fontWeight: 600, cursor: "pointer", background: activeTab === "employer" ? "linear-gradient(135deg, #ec4899, #be185d)" : "rgba(255,255,255,0.04)", color: activeTab === "employer" ? "#fff" : "var(--text-muted)" }}>
              🏪 사장님 정보
            </button>
          </div>
        )}

        {/* 알바생 정보 */}
        {((hasWorker && !hasEmployer) || (hasWorker && activeTab === "worker")) && workerProfile && (
          <div style={{ background: "rgba(255,255,255,0.03)", backdropFilter: "blur(12px)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 20, padding: 20 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, margin: "0 0 14px", color: "#c4b5fd" }}>⚡ 구직 정보</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {workerProfile.desired_type && (
                <div style={{ display: "flex", gap: 8 }}>
                  <span style={{ fontSize: 12, color: "var(--text-muted)", width: 60, flexShrink: 0 }}>희망직종</span>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>{workerProfile.desired_type}</span>
                </div>
              )}
              {workerProfile.desired_region && (
                <div style={{ display: "flex", gap: 8 }}>
                  <span style={{ fontSize: 12, color: "var(--text-muted)", width: 60, flexShrink: 0 }}>희망지역</span>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>📍 {workerProfile.desired_region}</span>
                </div>
              )}
              {workerProfile.desired_wage && (
                <div style={{ display: "flex", gap: 8 }}>
                  <span style={{ fontSize: 12, color: "var(--text-muted)", width: 60, flexShrink: 0 }}>희망시급</span>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>💰 {workerProfile.desired_wage.toLocaleString()}원↑</span>
                </div>
              )}
              {workerProfile.work_days && (
                <div style={{ display: "flex", gap: 8 }}>
                  <span style={{ fontSize: 12, color: "var(--text-muted)", width: 60, flexShrink: 0 }}>가능요일</span>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>📅 {workerProfile.work_days}</span>
                </div>
              )}
              {workerProfile.work_hours && (
                <div style={{ display: "flex", gap: 8 }}>
                  <span style={{ fontSize: 12, color: "var(--text-muted)", width: 60, flexShrink: 0 }}>가능시간</span>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>⏰ {workerProfile.work_hours}</span>
                </div>
              )}
              {workerProfile.experience && (
                <div style={{ display: "flex", gap: 8 }}>
                  <span style={{ fontSize: 12, color: "var(--text-muted)", width: 60, flexShrink: 0 }}>경력</span>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>
                    {workerProfile.experience === "있음" ? `📋 ${workerProfile.experience_months || 0}개월` : "신입"}
                  </span>
                </div>
              )}
              <button onClick={() => router.push(`/worker/${targetId}`)}
                style={{ marginTop: 4, background: "rgba(139,92,246,0.1)", border: "1px solid rgba(139,92,246,0.2)", color: "#c4b5fd", fontSize: 12, fontWeight: 600, padding: "8px", borderRadius: 10, cursor: "pointer" }}>
                구직 정보 상세 보기 →
              </button>
            </div>
          </div>
        )}

        {/* 사장님 정보 */}
        {((hasEmployer && !hasWorker) || (hasEmployer && activeTab === "employer")) && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {employerProfiles.map(ep => (
              <div key={ep.id} style={{ background: "rgba(255,255,255,0.03)", backdropFilter: "blur(12px)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 20, padding: 20 }}>
                <h3 style={{ fontSize: 14, fontWeight: 700, margin: "0 0 14px", color: "#f9a8d4" }}>🏪 {ep.business_name}</h3>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {ep.business_type && (
                    <div style={{ display: "flex", gap: 8 }}>
                      <span style={{ fontSize: 12, color: "var(--text-muted)", width: 60, flexShrink: 0 }}>업종</span>
                      <span style={{ fontSize: 13, fontWeight: 600 }}>{ep.business_type}</span>
                    </div>
                  )}
                  {ep.region && (
                    <div style={{ display: "flex", gap: 8 }}>
                      <span style={{ fontSize: 12, color: "var(--text-muted)", width: 60, flexShrink: 0 }}>위치</span>
                      <span style={{ fontSize: 13, fontWeight: 600 }}>📍 {ep.region}</span>
                    </div>
                  )}
                  {ep.wage && (
                    <div style={{ display: "flex", gap: 8 }}>
                      <span style={{ fontSize: 12, color: "var(--text-muted)", width: 60, flexShrink: 0 }}>시급</span>
                      <span style={{ fontSize: 13, fontWeight: 600 }}>💰 {ep.wage.toLocaleString()}원</span>
                    </div>
                  )}
                  {ep.work_days && (
                    <div style={{ display: "flex", gap: 8 }}>
                      <span style={{ fontSize: 12, color: "var(--text-muted)", width: 60, flexShrink: 0 }}>근무요일</span>
                      <span style={{ fontSize: 13, fontWeight: 600 }}>📅 {ep.work_days}</span>
                    </div>
                  )}
                  {ep.work_hours && (
                    <div style={{ display: "flex", gap: 8 }}>
                      <span style={{ fontSize: 12, color: "var(--text-muted)", width: 60, flexShrink: 0 }}>근무시간</span>
                      <span style={{ fontSize: 13, fontWeight: 600 }}>⏰ {ep.work_hours}</span>
                    </div>
                  )}
                  <button onClick={() => router.push(`/job/${ep.id}`)}
                    style={{ marginTop: 4, background: "rgba(236,72,153,0.1)", border: "1px solid rgba(236,72,153,0.2)", color: "#f9a8d4", fontSize: 12, fontWeight: 600, padding: "8px", borderRadius: 10, cursor: "pointer" }}>
                    공고 상세 보기 →
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

      </div>
    </main>
  );
}
