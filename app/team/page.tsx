"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { Suspense } from "react";


function calcHexacoCompatibility(a: any, b: any): number {
  if (!a || !b) return 0;
  const keys = ["honesty", "emotionality", "extraversion", "agreeableness", "conscientiousness", "openness"];
  const diffs = keys.map(k => Math.abs((a[k] || 3) - (b[k] || 3)));
  const avgDiff = diffs.reduce((s, d) => s + d, 0) / keys.length;
  return Math.round(100 - (avgDiff / 4) * 100);
}

function getCompatEmoji(score: number) {
  if (score >= 85) return "💕";
  if (score >= 70) return "😊";
  if (score >= 55) return "🤝";
  return "😅";
}

function getCompatLabel(score: number) {
  if (score >= 85) return "찰떡궁합";
  if (score >= 70) return "잘 맞아요";
  if (score >= 55) return "무난해요";
  return "조율 필요";
}

function TeamContent() {
  const router = useRouter();
  const sp = useSearchParams();
  const profileId = sp.get("profileId") || "";
  const userIdParam = sp.get("userId") || "";

  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<any>(null);
  const [employer, setEmployer] = useState<any>(null);
  const [members, setMembers] = useState<any[]>([]);

  useEffect(() => { if (profileId || userIdParam) init(); }, [profileId, userIdParam]);

  const init = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { router.replace("/login"); return; }

    let ep: any = null;
    let targetUserId = userIdParam;

    if (profileId) {
      const { data } = await supabase.from("employer_profiles")
        .select("*, users(employer_result, nickname, email, avatar_url)")
        .eq("id", profileId).single();
      ep = data;
      targetUserId = data?.user_id;
    } else if (userIdParam) {
      const { data } = await supabase.from("employer_profiles")
        .select("*, users(employer_result, nickname, email, avatar_url)")
        .eq("user_id", userIdParam)
        .eq("is_deleted", false)
        .order("created_at", { ascending: false })
        .limit(1).single();
      ep = data;
    }

    if (!ep) { setLoading(false); return; }
    setProfile(ep);
    setEmployer(ep.users);

    // team_members에서 직접 조회 (초대 코드 등록 팀원 포함)
    const { data: teamMembers } = await supabase
      .from("team_members")
      .select("worker_id")
      .eq("employer_id", targetUserId)
      .eq("status", "active");

    if (!teamMembers?.length) { setLoading(false); return; }

    const uniqueWorkerIds = [...new Set(teamMembers.map((m: any) => m.worker_id))];
    const { data: workers } = await supabase
      .from("users")
      .select("id, nickname, email, avatar_url, worker_result")
      .in("id", uniqueWorkerIds);

    setMembers(workers || []);
    setLoading(false);
  };

  if (loading) return (
    <main style={{ minHeight: "100vh", background: "var(--bg)", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <p style={{ color: "var(--text-muted)" }}>팀 불러오는 중...</p>
    </main>
  );

  const employerHexaco = employer?.employer_result?.hexaco;
  const employerType = employer?.employer_result?.personalityType;
  const employerMbti = employer?.employer_result?.analyzedMbti;

  return (
    <main style={{ minHeight: "100vh", background: "var(--bg)", color: "var(--text)", maxWidth: 480, margin: "0 auto", paddingBottom: 80 }}>
      {/* 헤더 */}
      <div style={{ position: "sticky", top: 0, zIndex: 20, background: "rgba(24,24,27,0.97)", backdropFilter: "blur(12px)", borderBottom: "1px solid var(--border)", padding: "14px 16px", display: "flex", alignItems: "center", gap: 8 }}>
        <button onClick={() => router.back()} style={{ background: "none", border: "none", color: "var(--text-muted)", fontSize: 20, cursor: "pointer", padding: 0 }}>←</button>
        <span style={{ width: 1, height: 14, background: "var(--border)", display: "inline-block" }} />
        <span style={{ fontSize: 17, fontWeight: 900, background: "linear-gradient(135deg, #8b5cf6, #ec4899)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>PAZAB</span>
        <span style={{ width: 1, height: 14, background: "var(--border)", display: "inline-block" }} />
        <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-muted)" }}>팀 성향 대시보드</span>
      </div>

      <div style={{ padding: "20px 16px" }}>
        {/* 공고 정보 */}
        <div style={{ background: "linear-gradient(135deg, rgba(139,92,246,0.15), rgba(236,72,153,0.1))", border: "1px solid rgba(139,92,246,0.3)", borderRadius: 20, padding: 20, marginBottom: 16 }}>
          <p style={{ fontSize: 11, color: "#c4b5fd", margin: "0 0 4px", fontWeight: 600 }}>🏪 매장</p>
          <h2 style={{ fontSize: 18, fontWeight: 900, margin: "0 0 4px" }}>{profile?.business_name}</h2>
          <p style={{ fontSize: 13, color: "var(--text-muted)", margin: "0 0 10px" }}>{profile?.region} · {profile?.business_type}</p>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <span style={{ fontSize: 20 }}>{employer?.employer_result?.emoji || "🏪"}</span>
            <div>
              <p style={{ fontSize: 12, fontWeight: 700, margin: 0 }}>{employerType || "미분석"}</p>
              {employerMbti && <p style={{ fontSize: 11, color: "#c4b5fd", margin: 0 }}>{employerMbti}</p>}
            </div>
          </div>
        </div>

        {/* 팀원 없을 때 */}
        {members.length === 0 ? (
          <div style={{ textAlign: "center", padding: "40px 0" }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>👥</div>
            <p style={{ fontSize: 15, fontWeight: 700, marginBottom: 8 }}>아직 채용된 팀원이 없어요</p>
            <p style={{ fontSize: 13, color: "var(--text-muted)" }}>알바생을 채용하면 팀 성향 분석을 볼 수 있어요!</p>
          </div>
        ) : (
          <>
            {/* 팀 요약 */}
            <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 16, padding: 16, marginBottom: 16 }}>
              <p style={{ fontSize: 13, fontWeight: 700, margin: "0 0 10px" }}>👥 팀 구성</p>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                {/* 사장님 */}
                <div style={{ textAlign: "center" }}>
                  <div style={{ width: 44, height: 44, borderRadius: "50%", background: "linear-gradient(135deg, #8b5cf6, #7c3aed)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, margin: "0 auto 4px" }}>
                    {employer?.employer_result?.emoji || "🏪"}
                  </div>
                  <p style={{ fontSize: 10, color: "var(--text-muted)", margin: 0 }}>사장님</p>
                </div>

                <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}>
                  {members.map((_, i) => (
                    <div key={i} style={{ height: 1, flex: 1, background: "var(--border)" }} />
                  ))}
                </div>

                {/* 팀원들 */}
                {members.map(m => (
                  <div key={m.id} style={{ textAlign: "center", width: 52 }}>
                    <div style={{ width: 44, height: 44, borderRadius: "50%", background: "linear-gradient(135deg, #ec4899, #be185d)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, margin: "0 auto 4px" }}>
                      {m.worker_result?.emoji || "⚡"}
                    </div>
                    <p style={{ fontSize: 9, color: "var(--text-muted)", margin: 0, maxWidth: 52, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", wordBreak: "break-all" }}>{m.nickname || (m.users?.email ? m.users.email.split("@")[0] : m.email ? m.email.split("@")[0] : "팀원")}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* 팀원별 궁합 */}
            <p style={{ fontSize: 13, fontWeight: 700, margin: "0 0 10px" }}>💕 사장님 ↔ 팀원 궁합</p>
            {members.map(m => {
              const workerHexaco = m.worker_result?.hexaco;
              const score = calcHexacoCompatibility(employerHexaco, workerHexaco);
              const workerType = m.worker_result?.personalityType;
              const workerMbti = m.worker_result?.analyzedMbti;
              const hasData = !!(employerHexaco && workerHexaco);

              return (
                <div key={m.id} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 16, padding: 16, marginBottom: 10 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <div style={{ width: 40, height: 40, borderRadius: "50%", background: "linear-gradient(135deg, #ec4899, #be185d)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>
                        {m.worker_result?.emoji || "⚡"}
                      </div>
                      <div>
                        <p style={{ fontSize: 14, fontWeight: 700, margin: 0 }}>{m.nickname || (m.users?.email ? m.users.email.split("@")[0] : m.email ? m.email.split("@")[0] : "팀원")}</p>
                        <p style={{ fontSize: 11, color: "var(--text-muted)", margin: 0 }}>
                          {workerType || "미분석"}{workerMbti ? ` · ${workerMbti}` : ""}
                        </p>
                      </div>
                    </div>
                    {hasData ? (
                      <div style={{ textAlign: "right" }}>
                        <p style={{ fontSize: 22, fontWeight: 900, margin: 0, color: score >= 70 ? "#86efac" : score >= 55 ? "#fbbf24" : "#f87171" }}>
                          {score}점
                        </p>
                        <p style={{ fontSize: 11, color: "var(--text-muted)", margin: 0 }}>{getCompatEmoji(score)} {getCompatLabel(score)}</p>
                      </div>
                    ) : (
                      <p style={{ fontSize: 11, color: "var(--text-muted)" }}>성향분석 필요</p>
                    )}
                  </div>

                  {/* HEXACO 비교 바 */}
                  {hasData && (() => {
                    const keys = [
                      { key: "honesty", label: "정직성" },
                      { key: "emotionality", label: "정서성" },
                      { key: "extraversion", label: "외향성" },
                      { key: "agreeableness", label: "원만성" },
                      { key: "conscientiousness", label: "성실성" },
                      { key: "openness", label: "개방성" },
                    ];
                    return (
                      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        {keys.map(({ key, label }) => {
                          const eVal = (employerHexaco[key] || 3) / 5;
                          const wVal = (workerHexaco[key] || 3) / 5;
                          return (
                            <div key={key}>
                              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
                                <span style={{ fontSize: 10, color: "var(--text-muted)" }}>{label}</span>
                                <span style={{ fontSize: 10, color: "var(--text-muted)" }}>
                                  {(employerHexaco[key] || 3).toFixed(1)} · {(workerHexaco[key] || 3).toFixed(1)}
                                </span>
                              </div>
                              <div style={{ position: "relative", height: 6, background: "var(--surface2)", borderRadius: 3 }}>
                                <div style={{ position: "absolute", left: 0, top: 0, height: "100%", width: `${eVal * 100}%`, background: "rgba(139,92,246,0.5)", borderRadius: 3 }} />
                                <div style={{ position: "absolute", left: 0, top: 0, height: "100%", width: `${wVal * 100}%`, background: "rgba(236,72,153,0.4)", borderRadius: 3 }} />
                              </div>
                            </div>
                          );
                        })}
                        <div style={{ display: "flex", gap: 12, marginTop: 4 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                            <div style={{ width: 10, height: 4, borderRadius: 2, background: "rgba(139,92,246,0.5)" }} />
                            <span style={{ fontSize: 9, color: "var(--text-muted)" }}>사장님</span>
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                            <div style={{ width: 10, height: 4, borderRadius: 2, background: "rgba(236,72,153,0.4)" }} />
                            <span style={{ fontSize: 9, color: "var(--text-muted)" }}>{m.nickname || (m.users?.email ? m.users.email.split("@")[0] : m.email ? m.email.split("@")[0] : "팀원")}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              );
            })}

            {/* 팀 전체 분석 */}
            {members.length >= 2 && (() => {
              const allHexacos = members.map(m => m.worker_result?.hexaco).filter(Boolean);
              if (allHexacos.length < 2) return null;
              const keys = ["honesty", "emotionality", "extraversion", "agreeableness", "conscientiousness", "openness"];
              const avgs = keys.map(k => allHexacos.reduce((s: number, h: any) => s + (h[k] || 3), 0) / allHexacos.length);
              const strongest = keys[avgs.indexOf(Math.max(...avgs))];
              const weakest = keys[avgs.indexOf(Math.min(...avgs))];
              const labelMap: Record<string, string> = { honesty: "정직성", emotionality: "정서성", extraversion: "외향성", agreeableness: "원만성", conscientiousness: "성실성", openness: "개방성" };
              return (
                <div style={{ background: "rgba(139,92,246,0.08)", border: "1px solid rgba(139,92,246,0.2)", borderRadius: 16, padding: 16, marginTop: 4 }}>
                  <p style={{ fontSize: 13, fontWeight: 700, margin: "0 0 8px" }}>🔍 팀 전체 분석</p>
                  <p style={{ fontSize: 13, color: "var(--text-muted)", margin: "0 0 6px", lineHeight: 1.7 }}>
                    팀 강점: <span style={{ color: "#c4b5fd", fontWeight: 600 }}>{labelMap[strongest]}</span>이 높은 팀이에요
                  </p>
                  <p style={{ fontSize: 13, color: "var(--text-muted)", margin: 0, lineHeight: 1.7 }}>
                    보완 필요: <span style={{ color: "#f9a8d4", fontWeight: 600 }}>{labelMap[weakest]}</span> 성향의 팀원이 있으면 균형 잡혀요
                  </p>
                </div>
              );
            })()}
          </>
        )}
      </div>
      
    </main>
  );
}

export default function TeamPage() {
  return (
    <Suspense fallback={
      <main style={{ minHeight: "100vh", background: "var(--bg)", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <p style={{ color: "var(--text-muted)" }}>로딩 중...</p>
      </main>
    }>
      <TeamContent />
    </Suspense>
  );
}
