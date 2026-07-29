"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { addRole } from "@/lib/onboarding";

export default function PersonalityPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<any>(null);
  const [workerResult, setWorkerResult] = useState<any>(null);
  const [employerResult, setEmployerResult] = useState<any>(null);
  const [showRetryModal, setShowRetryModal] = useState<"worker" | "employer" | null>(null);

  useEffect(() => { init(); }, []);

  useEffect(() => {
    if (loading) return;
    const iW = user?.user_type === "worker";
    const iE = user?.user_type === "employer";
    if (iW && !workerResult) router.replace("/interview?type=worker");
    if (iE && !employerResult) router.replace("/interview?type=employer");
  }, [loading, user, workerResult, employerResult]);

  const init = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { router.replace("/login"); return; }
    const { data: userData } = await supabase.from("users")
      .select("id, user_type, nickname, worker_result, employer_result")
      .eq("id", session.user.id).single();
    const wrLocal = localStorage.getItem("interview_result_advanced_worker") || localStorage.getItem("interview_result_basic_worker");
    const erLocal = localStorage.getItem("interview_result_advanced_employer") || localStorage.getItem("interview_result_basic_employer");
    const wr = wrLocal ? JSON.parse(wrLocal) : userData?.worker_result;
    const er = erLocal ? JSON.parse(erLocal) : userData?.employer_result;
    let finalUserData = userData;
    if (userData?.user_type === "worker" && er) {
      const next = await addRole(supabase, session.user.id, "employer");
      finalUserData = { ...userData, user_type: next };
    } else if (userData?.user_type === "employer" && wr) {
      const next = await addRole(supabase, session.user.id, "worker");
      finalUserData = { ...userData, user_type: next };
    }
    setUser(finalUserData);
    setWorkerResult(wr || null);
    setEmployerResult(er || null);
    setLoading(false);
  };

  const handleRetry = (type: "worker" | "employer") => {
    localStorage.removeItem(`interview_result_basic_${type}`);
    localStorage.removeItem(`interview_result_advanced_${type}`);
    router.push(`/interview?type=${type}&retry=true`);
  };

  if (loading) return (
    <main style={{ minHeight: "100vh", background: "var(--bg)", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 40, marginBottom: 12, opacity: 0.6 }}>🧠</div>
        <p style={{ color: "var(--text-muted)", fontSize: 13 }}>불러오는 중...</p>
      </div>
    </main>
  );

  const isBoth = user?.user_type === "both";
  const isWorker = user?.user_type === "worker";
  const isEmployer = user?.user_type === "employer";

  const HEXACO_LABELS = [
    { key: "honesty", label: "정직성", emoji: "🤝" },
    { key: "emotionality", label: "정서성", emoji: "💭" },
    { key: "extraversion", label: "외향성", emoji: "⚡" },
    { key: "agreeableness", label: "원만성", emoji: "🕊️" },
    { key: "conscientiousness", label: "성실성", emoji: "📋" },
    { key: "openness", label: "개방성", emoji: "🌟" },
  ];

  const getHexacoColor = (v: number) => {
    if (v >= 4.5) return "#6ee7b7";
    if (v >= 3.5) return "#8b5cf6";
    if (v >= 2.5) return "#fbbf24";
    return "#f87171";
  };

  const ResultCard = ({ type, result }: { type: "worker" | "employer"; result: any }) => {
    const isW = type === "worker";
    const color = isW ? "#8b5cf6" : "#ec4899";
    const gradient = isW ? "linear-gradient(135deg, #8b5cf6, #7c3aed)" : "linear-gradient(135deg, #ec4899, #be185d)";
    const bgGradient = isW
      ? "linear-gradient(160deg, #1a1035 0%, #2d1b6e 50%, #1e1040 100%)"
      : "linear-gradient(160deg, #1a0a20 0%, #4a1040 50%, #1a0a20 100%)";

    if (!result) return (
      <div style={{ position: "relative", borderRadius: 24, overflow: "hidden", marginBottom: 16, background: bgGradient, padding: 24, minHeight: 180 }}>
        <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse at 30% 20%, rgba(255,255,255,0.04) 0%, transparent 60%)" }} />
        <div style={{ position: "relative" }}>
          <span style={{ fontSize: 12, fontWeight: 700, color, background: `${color}20`, border: `1px solid ${color}40`, padding: "4px 12px", borderRadius: 20 }}>
            {isW ? "⚡ 알바생" : "🏪 사장님"} 성향분석
          </span>
          <p style={{ fontSize: 15, fontWeight: 700, color: "#fff", margin: "16px 0 6px" }}>아직 분석을 하지 않았어요</p>
          <p style={{ fontSize: 13, color: "rgba(255,255,255,0.5)", margin: "0 0 20px" }}>10분 인터뷰로 나와 딱 맞는 상대를 찾아요</p>
          <button onClick={() => router.push(`/interview?type=${type}`)}
            style={{ background: gradient, border: "none", color: "#fff", fontWeight: 700, padding: "12px 20px", borderRadius: 20, cursor: "pointer", fontSize: 14 }}>
            {isW ? "⚡ 알바생 성향분석 시작 →" : "🏪 사장님 성향분석 시작 →"}
          </button>
        </div>
      </div>
    );

    const hexaco = result.hexaco;
    const bestMatches = result.bestMatches || (result.bestMatch ? [{ type: result.bestMatch, reason: "" }] : []);

    return (
      <div style={{ position: "relative", borderRadius: 24, overflow: "hidden", marginBottom: 16 }}>
        {/* 히어로 배경 */}
        <div style={{ position: "relative", background: bgGradient, padding: "28px 24px 24px" }}>
          <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse at 30% 20%, rgba(255,255,255,0.05) 0%, transparent 60%)" }} />
          
          {/* 상단 액션 */}
          <div style={{ position: "relative", display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color, background: `${color}20`, border: `1px solid ${color}40`, padding: "4px 12px", borderRadius: 20 }}>
              {isW ? "⚡ 알바생" : "🏪 사장님"} 성향분석
            </span>
            <button onClick={() => setShowRetryModal(type)}
              style={{ background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.15)", color: "rgba(255,255,255,0.6)", fontSize: 11, padding: "4px 10px", borderRadius: 20, cursor: "pointer" }}>
              ↺ 다시하기
            </button>
          </div>

          {/* 유형 */}
          <div style={{ position: "relative", textAlign: "center", marginBottom: 20 }}>
            <div style={{ fontSize: 64, marginBottom: 8, lineHeight: 1 }}>{result.emoji || (isW ? "⚡" : "🏪")}</div>
            <h2 style={{ fontSize: 22, fontWeight: 900, margin: "0 0 6px", color: "#fff", letterSpacing: "-0.3px" }}>{result.personalityType}</h2>
            <p style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", margin: "0 0 14px", fontStyle: "italic" }}>"{result.tagline}"</p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 5, justifyContent: "center" }}>
              {result.strengths?.slice(0, 3).map((s: string) => (
                <span key={s} style={{ fontSize: 10, background: `${color}25`, border: `1px solid ${color}50`, color: isW ? "#c4b5fd" : "#f9a8d4", padding: "3px 10px", borderRadius: 20 }}>{s}</span>
              ))}
            </div>
          </div>

          {/* MBTI + 성실성 */}
          <div style={{ position: "relative", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 16 }}>
            {[
              { label: "분석 MBTI", value: result.analyzedMbti || "—", valueColor: "#c4b5fd" },
              { label: "성실성", value: hexaco ? (hexaco.conscientiousness || 3).toFixed(1) : "—", valueColor: "#6ee7b7" },
            ].map(item => (
              <div key={item.label} style={{ background: "rgba(0,0,0,0.3)", backdropFilter: "blur(8px)", borderRadius: 16, padding: "12px", textAlign: "center", border: "1px solid rgba(255,255,255,0.08)" }}>
                <p style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", margin: "0 0 4px" }}>{item.label}</p>
                <p style={{ fontSize: 22, fontWeight: 900, margin: 0, color: item.valueColor }}>{item.value}</p>
              </div>
            ))}
          </div>

          {/* HEXACO 바 */}
          {hexaco && (
            <div style={{ position: "relative", background: "rgba(0,0,0,0.25)", backdropFilter: "blur(8px)", borderRadius: 16, padding: "14px", border: "1px solid rgba(255,255,255,0.06)" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {HEXACO_LABELS.map(item => {
                  const val = hexaco[item.key] || 3;
                  const c = getHexacoColor(val);
                  return (
                    <div key={item.key} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 11, color: "rgba(255,255,255,0.6)", width: 72, flexShrink: 0 }}>{item.emoji} {item.label}</span>
                      <div style={{ flex: 1, height: 4, background: "rgba(255,255,255,0.1)", borderRadius: 4, overflow: "hidden" }}>
                        <div style={{ height: "100%", width: `${(val / 5) * 100}%`, background: c, borderRadius: 4 }} />
                      </div>
                      <span style={{ fontSize: 11, fontWeight: 700, color: c, width: 24, textAlign: "right", flexShrink: 0 }}>{val.toFixed(1)}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* 잘 맞는 유형 */}
        {bestMatches.length > 0 && (
          <div style={{ background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.15)", borderTop: "none", padding: "14px 20px" }}>
            <p style={{ fontSize: 10, color: "#6ee7b7", fontWeight: 700, margin: "0 0 4px" }}>✅ 잘 맞는 유형</p>
            <p style={{ fontSize: 14, fontWeight: 700, color: "#86efac", margin: "0 0 2px" }}>{bestMatches[0].type}</p>
            {bestMatches[0].reason && (
              <p style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", margin: 0, lineHeight: 1.5 }}>{bestMatches[0].reason}</p>
            )}
          </div>
        )}

        {/* CTA */}
        <div style={{ background: "rgba(0,0,0,0.3)", padding: "14px 20px", display: "flex", gap: 8, borderTop: "1px solid rgba(255,255,255,0.05)" }}>
          <button onClick={() => router.push(`/result?type=${type}`)}
            style={{ flex: 2, background: gradient, border: "none", color: "#fff", fontWeight: 700, padding: "12px", borderRadius: 14, cursor: "pointer", fontSize: 13 }}>
            결과 자세히 보기 →
          </button>
          <button onClick={() => router.push(`/explore?type=${type}`)}
            style={{ flex: 1, background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.12)", color: "rgba(255,255,255,0.7)", fontWeight: 600, padding: "12px", borderRadius: 14, cursor: "pointer", fontSize: 12 }}>
            {isW ? "공고 탐색" : "구직자 탐색"}
          </button>
        </div>
      </div>
    );
  };

  return (
    <main style={{ minHeight: "100vh", background: "var(--bg)", color: "var(--text)", paddingBottom: 100 }}>
      {/* 헤더 */}
      <div style={{ position: "sticky", top: 0, zIndex: 30, background: "rgba(24,24,27,0.97)", backdropFilter: "blur(12px)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <div style={{ maxWidth: 480, margin: "0 auto", padding: "12px 16px", display: "flex", alignItems: "center", gap: 10 }}>
          <button onClick={() => router.push("/explore")} style={{ background: "none", border: "none", cursor: "pointer", padding: 0 }}>
            <span style={{ fontSize: 17, fontWeight: 900, background: "linear-gradient(135deg, #8b5cf6, #ec4899)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", letterSpacing: "-0.5px" }}>PAZAB</span>
          </button>
          <div style={{ width: 1, height: 14, background: "rgba(255,255,255,0.1)" }} />
          <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-muted)" }}>성향 분석</span>
        </div>
      </div>

      <div style={{ maxWidth: 480, margin: "0 auto", padding: "16px 16px" }}>
        {/* 안내 배너 */}
        <div style={{ background: "rgba(139,92,246,0.08)", border: "1px solid rgba(139,92,246,0.2)", borderRadius: 16, padding: "12px 16px", marginBottom: 20, display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 20 }}>🔬</span>
          <p style={{ fontSize: 12, color: "var(--text-muted)", margin: 0, lineHeight: 1.6 }}>
            HEXACO 심리 모델 기반 AI 분석으로 <span style={{ color: "#c4b5fd", fontWeight: 600 }}>나와 잘 맞는 상대</span>를 찾아요
          </p>
        </div>

        {isBoth && (
          <>
            <ResultCard type="worker" result={workerResult} />
            <ResultCard type="employer" result={employerResult} />
          </>
        )}
        {isWorker && <ResultCard type="worker" result={workerResult} />}
        {isEmployer && <ResultCard type="employer" result={employerResult} />}

        {!isBoth && (
          <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 16, padding: "16px", marginTop: 8, textAlign: "center" }}>
            <p style={{ fontSize: 13, color: "var(--text-muted)", margin: "0 0 12px" }}>
              {isWorker ? "🏪 사장님으로도 활동하고 싶으신가요?" : "⚡ 알바생으로도 활동하고 싶으신가요?"}
            </p>
            <button onClick={async () => {
              const next = await addRole(supabase, user.id, isWorker ? "employer" : "worker");
              setUser((prev: any) => ({ ...prev, user_type: next }));
            }} style={{ background: "none", border: "1px solid rgba(255,255,255,0.15)", color: "var(--text-muted)", fontSize: 12, fontWeight: 600, padding: "8px 16px", borderRadius: 20, cursor: "pointer" }}>
              {isWorker ? "🏪 사장님 역할 추가하기" : "⚡ 알바생 역할 추가하기"}
            </button>
          </div>
        )}
      </div>

      {/* 다시하기 모달 */}
      {showRetryModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)", zIndex: 100, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
          <div style={{ background: "var(--surface)", borderRadius: "24px 24px 0 0", padding: 28, width: "100%", maxWidth: 480, paddingBottom: "calc(28px + env(safe-area-inset-bottom))" }}>
            <div style={{ width: 36, height: 4, borderRadius: 2, background: "rgba(255,255,255,0.15)", margin: "0 auto 20px" }} />
            <h3 style={{ fontSize: 17, fontWeight: 800, margin: "0 0 8px" }}>성향분석 다시하기</h3>
            <p style={{ fontSize: 14, color: "var(--text-muted)", margin: "0 0 24px", lineHeight: 1.6 }}>
              기존 분석 결과가 새 결과로 업데이트돼요. 다시 하시겠어요?
            </p>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setShowRetryModal(null)}
                style={{ flex: 1, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", color: "var(--text-muted)", fontWeight: 600, padding: 14, borderRadius: 14, cursor: "pointer", fontSize: 14 }}>
                취소
              </button>
              <button onClick={() => { handleRetry(showRetryModal); setShowRetryModal(null); }}
                style={{ flex: 2, background: "linear-gradient(135deg, #8b5cf6, #7c3aed)", border: "none", color: "#fff", fontWeight: 700, padding: 14, borderRadius: 14, cursor: "pointer", fontSize: 14 }}>
                다시 분석하기
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
