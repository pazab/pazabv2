"use client";

import { useState, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Suspense } from "react";
import { supabase } from "@/lib/supabase";

interface ProfileResult {
  personalityType: string; emoji: string; tagline: string;
  selfMbti?: string; analyzedMbti?: string; mbtiConfidence?: number;
  mbtiMatch?: boolean; mbtiComment?: string;
  big5?: any; hexaco?: any;
  workValues?: any; managementValues?: any;
  bestMatches?: { type: string; reason: string }[];
  worstMatches?: { type: string; reason: string }[];
  bestMatch?: string; worstMatch?: string;
  recommendedJobs?: string[];
  recommendedWorkerTypes?: string[];
  strengths?: string[];
  caution?: string;
  noShowRisk?: string; honestyRisk?: string;
}

const HEXACO_LABELS = [
  { key: "honesty", label: "정직성", emoji: "🤝", desc: "약속 이행" },
  { key: "emotionality", label: "정서성", emoji: "💭", desc: "스트레스 대처" },
  { key: "extraversion", label: "외향성", emoji: "⚡", desc: "소통 스타일" },
  { key: "agreeableness", label: "원만성", emoji: "🕊️", desc: "갈등 해결" },
  { key: "conscientiousness", label: "성실성", emoji: "📋", desc: "규칙·책임감" },
  { key: "openness", label: "개방성", emoji: "🌟", desc: "유연성" },
];

const MBTI_COMPATIBILITY: Record<string, { best: string[]; good: string[]; caution: string[]; desc: string }> = {
  ISTJ: { best: ["ESFP","ESTP"], good: ["ISFJ","ESTJ","INTJ","ISTP"], caution: ["ENFP","ENTP"], desc: "원칙과 책임감이 강한 당신은 활발한 유형과 균형을 이뤄요" },
  ISFJ: { best: ["ESFP","ESTP"], good: ["ISTJ","ESFJ","INFJ","ISFP"], caution: ["ENTP","ENTJ"], desc: "따뜻하고 헌신적인 당신은 에너지 넘치는 유형과 잘 맞아요" },
  INFJ: { best: ["ENFP","ENTP"], good: ["INTJ","INFP","ISFJ","ENFJ"], caution: ["ESTP","ESFP"], desc: "깊은 통찰력을 가진 당신은 창의적인 유형과 시너지를 내요" },
  INTJ: { best: ["ENFP","ENTP"], good: ["INFJ","ENTJ","ISTJ","INTP"], caution: ["ESFJ","ESFP"], desc: "전략적 사고의 당신은 열정적이고 창의적인 유형과 잘 맞아요" },
  ISTP: { best: ["ESFJ","ESTJ"], good: ["ISFP","ESTP","ISTJ","INTP"], caution: ["ENFJ","ESFJ"], desc: "냉철하고 실용적인 당신은 따뜻하고 체계적인 유형과 균형을 이뤄요" },
  ISFP: { best: ["ENFJ","ESFJ"], good: ["INFP","ISFJ","ISTP","ESFP"], caution: ["ENTJ","ESTJ"], desc: "자유롭고 감성적인 당신은 리더십 있는 유형과 잘 맞아요" },
  INFP: { best: ["ENFJ","ENTJ"], good: ["INFJ","ENFP","ISFP","INTP"], caution: ["ESTJ","ESTP"], desc: "이상적이고 공감능력이 높은 당신은 결단력 있는 유형과 잘 맞아요" },
  INTP: { best: ["ENTJ","ESTJ"], good: ["INTJ","ENTP","INTP","INFP"], caution: ["ESFJ","ESFP"], desc: "논리적이고 분석적인 당신은 실행력 강한 유형과 시너지를 내요" },
  ESTP: { best: ["ISFJ","ISTJ"], good: ["ISTP","ESFP","ENTP","ESTJ"], caution: ["INFJ","INFP"], desc: "행동파인 당신은 차분하고 안정적인 유형과 균형을 이뤄요" },
  ESFP: { best: ["ISFJ","ISTJ"], good: ["ISFP","ESTP","ENFP","ESFJ"], caution: ["INTJ","INFJ"], desc: "활기차고 사교적인 당신은 신중하고 체계적인 유형과 잘 맞아요" },
  ENFP: { best: ["INFJ","INTJ"], good: ["ENFJ","INFP","ESFP","ENTP"], caution: ["ISTJ","ISFJ"], desc: "열정적이고 창의적인 당신은 깊이 있는 사고형과 잘 맞아요" },
  ENTP: { best: ["INFJ","INTJ"], good: ["INTP","ENFP","ENTJ","ESTP"], caution: ["ISFJ","ISTJ"], desc: "도전적이고 혁신적인 당신은 통찰력 있는 유형과 시너지를 내요" },
  ESTJ: { best: ["ISFP","ISTP"], good: ["ISTJ","ESFJ","ENTJ","INTP"], caution: ["INFP","ISFP"], desc: "체계적이고 리더십 있는 당신은 유연하고 감성적인 유형과 균형을 이뤄요" },
  ESFJ: { best: ["ISFP","ISTP"], good: ["ISFJ","ESTJ","ENFJ","ESFP"], caution: ["INTP","INTJ"], desc: "사교적이고 배려심 있는 당신은 독립적인 유형과 서로 배울 게 많아요" },
  ENFJ: { best: ["INFP","ISFP"], good: ["INFJ","ENFP","ESFJ","ENTJ"], caution: ["ISTP","INTP"], desc: "카리스마 있는 당신은 섬세하고 감성적인 유형과 잘 맞아요" },
  ENTJ: { best: ["INFP","INTP"], good: ["INTJ","ENFJ","ESTJ","ENTP"], caution: ["ISFP","ISFJ"], desc: "추진력 있는 리더인 당신은 창의적이고 분석적인 유형과 시너지를 내요" },
};

const WORKER_VALUE_LABELS = [
  { key: "money", label: "💰 보상" }, { key: "distance", label: "📍 거리" },
  { key: "atmosphere", label: "🤝 분위기" }, { key: "growth", label: "📚 성장" },
  { key: "autonomy", label: "🦅 자율" }, { key: "stability", label: "🛡️ 안정" },
];
const EMPLOYER_VALUE_LABELS = [
  { key: "performance", label: "🚀 성과" }, { key: "relationship", label: "🤝 관계" },
  { key: "stability", label: "🛡️ 안정" }, { key: "growth", label: "📚 성장" },
  { key: "autonomy", label: "🦅 자율" }, { key: "system", label: "🧩 체계" },
];

function getHexacoColor(v: number) {
  if (v >= 4.5) return "#6ee7b7";
  if (v >= 3.5) return "#8b5cf6";
  if (v >= 2.5) return "#fbbf24";
  return "#f87171";
}

function Section({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 20, padding: 20, marginBottom: 12, ...style }}>
      {children}
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h3 style={{ fontSize: 14, fontWeight: 800, margin: "0 0 14px", color: "var(--text)", letterSpacing: "-0.2px" }}>{children}</h3>;
}

function ResultContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const userType = searchParams.get("type") || "worker";
  const isWorker = userType === "worker";
  const themeColor = isWorker ? "#8b5cf6" : "#ec4899";
  const themeGradient = isWorker ? "linear-gradient(135deg, #8b5cf6, #7c3aed)" : "linear-gradient(135deg, #ec4899, #be185d)";
  const bgGradient = isWorker
    ? "linear-gradient(160deg, #1a1035 0%, #2d1b6e 50%, #1e1040 100%)"
    : "linear-gradient(160deg, #1a0a20 0%, #4a1040 50%, #1a0a20 100%)";
  const RESULT_KEY = `interview_result_basic_${userType}`;

  const [result, setResult] = useState<ProfileResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [showShareModal, setShowShareModal] = useState(false);
  const [shareImage, setShareImage] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);
  const [hasWorkerResult, setHasWorkerResult] = useState(false);
  const [hasEmployerResult, setHasEmployerResult] = useState(false);

  useEffect(() => { loadResult(); checkLogin(); }, [userType]);

  const checkLogin = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    const { data: userData } = await supabase.from("users").select("worker_result, employer_result").eq("id", session.user.id).single();
    setHasWorkerResult(!!(userData?.worker_result || localStorage.getItem("interview_result_basic_worker")));
    setHasEmployerResult(!!(userData?.employer_result || localStorage.getItem("interview_result_basic_employer")));
  };

  const loadResult = async () => {
    setLoading(true);
    const saved = localStorage.getItem(RESULT_KEY) || localStorage.getItem(`interview_result_advanced_${userType}`);
    if (saved) { setResult(JSON.parse(saved)); setLoading(false); return; }
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
      const dbField = userType === "worker" ? "worker_result" : "employer_result";
      const { data: userData } = await supabase.from("users").select(dbField).eq("id", session.user.id).single();
      const dbResult = (userData as any)?.[dbField];
      if (dbResult) { localStorage.setItem(RESULT_KEY, JSON.stringify(dbResult)); setResult(dbResult); setLoading(false); return; }
    }
    router.replace(`/interview?type=${userType}`);
  };

  const handleShare = async () => {
    if (!result) return;
    setSharing(true);
    try {
      const W = 560, H = 1040;
      const canvas = document.createElement("canvas");
      canvas.width = W; canvas.height = H;
      const ctx = canvas.getContext("2d")!;
      const bg = ctx.createLinearGradient(0, 0, W, H);
      bg.addColorStop(0, "#1a0533"); bg.addColorStop(0.5, "#2d1b69"); bg.addColorStop(1, "#18181b");
      ctx.fillStyle = bg; ctx.roundRect(0, 0, W, H, 48); ctx.fill();
      ctx.font = "900 28px sans-serif";
      const grad = ctx.createLinearGradient(40, 0, 200, 0);
      grad.addColorStop(0, "#8b5cf6"); grad.addColorStop(1, "#ec4899");
      ctx.fillStyle = grad; ctx.fillText("PAZAB", 40, 60);
      ctx.font = "120px sans-serif"; ctx.textAlign = "center";
      ctx.fillText(result.emoji || "⚡", W/2, 270);
      ctx.font = "900 52px sans-serif"; ctx.fillStyle = "#ffffff";
      ctx.fillText(result.personalityType, W/2, 340);
      ctx.font = "italic 22px sans-serif"; ctx.fillStyle = "rgba(255,255,255,0.5)";
      ctx.fillText(`"${result.tagline}"`, W/2, 380);
      ctx.font = "16px sans-serif"; ctx.fillStyle = "rgba(255,255,255,0.2)";
      ctx.fillText("pazab.vercel.app", W/2, H - 40);
      setShareImage(canvas.toDataURL("image/png"));
      setShowShareModal(true);
    } catch (e) { console.error(e); }
    setSharing(false);
  };

  const handleDownload = () => {
    if (!shareImage) return;
    const a = document.createElement("a");
    a.href = shareImage; a.download = "pazab-personality.png"; a.click();
  };

  if (loading) return (
    <main style={{ minHeight: "100vh", background: "var(--bg)", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 40, marginBottom: 12, opacity: 0.6 }}>🔬</div>
        <p style={{ color: "var(--text-muted)", fontSize: 13 }}>분석 결과 불러오는 중...</p>
      </div>
    </main>
  );
  if (!result) return null;

  const hexaco = result.hexaco;
  const valueLabels = isWorker ? WORKER_VALUE_LABELS : EMPLOYER_VALUE_LABELS;
  const values = isWorker ? result.workValues : result.managementValues;
  const topValue = values ? Object.entries(values).sort(([,a],[,b]) => (b as number) - (a as number))[0] : null;
  const bestMatches = result.bestMatches || (result.bestMatch ? [{ type: result.bestMatch, reason: "함께하면 최고의 시너지를 발휘해요!" }] : []);
  const worstMatches = result.worstMatches || (result.worstMatch ? [{ type: result.worstMatch, reason: "서로 다른 스타일이지만 배울 점이 있어요!" }] : []);

  return (
    <main style={{ minHeight: "100vh", background: "var(--bg)", color: "var(--text)", paddingBottom: 100 }}>

      {/* 헤더 */}
      <div style={{ position: "sticky", top: 0, zIndex: 30, background: "rgba(24,24,27,0.97)", backdropFilter: "blur(12px)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <div style={{ maxWidth: 480, margin: "0 auto", padding: "12px 16px", display: "flex", alignItems: "center", gap: 10 }}>
          <button onClick={() => router.push("/personality")} style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", padding: 4 }}>
            <i className="ti ti-arrow-left" style={{ fontSize: 20, display: "block" }} aria-hidden="true" />
          </button>
          <div style={{ width: 1, height: 14, background: "rgba(255,255,255,0.1)" }} />
          <button onClick={() => router.push("/myteam")} style={{ background: "none", border: "none", cursor: "pointer", padding: 0 }}>
            <span style={{ fontSize: 17, fontWeight: 900, background: "linear-gradient(135deg, #8b5cf6, #ec4899)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>PAZAB</span>
          </button>
          <div style={{ width: 1, height: 14, background: "rgba(255,255,255,0.1)" }} />
          <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-muted)", flex: 1 }}>성향 분석 결과</span>
          <button onClick={() => router.push(`/interview?type=${userType}&retry=true`)}
            style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", color: "var(--text-muted)", fontSize: 11, padding: "5px 10px", borderRadius: 20, cursor: "pointer" }}>
            다시하기
          </button>
          <button onClick={handleShare} disabled={sharing}
            style={{ background: themeGradient, border: "none", color: "#fff", fontSize: 11, fontWeight: 700, padding: "5px 10px", borderRadius: 20, cursor: "pointer" }}>
            {sharing ? "..." : "📤 공유"}
          </button>
        </div>
      </div>

      {/* 알바생/사장님 탭 */}
      {hasWorkerResult && hasEmployerResult && (
        <div style={{ maxWidth: 480, margin: "0 auto", padding: "8px 16px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
          <div style={{ display: "flex", gap: 6 }}>
            {[{ key: "worker", label: "⚡ 알바생", grad: "linear-gradient(135deg, #8b5cf6, #7c3aed)" },
              { key: "employer", label: "🏪 사장님", grad: "linear-gradient(135deg, #ec4899, #be185d)" }].map(tab => (
              <button key={tab.key} onClick={() => router.push(`/result?type=${tab.key}`)}
                style={{ flex: 1, padding: "8px", borderRadius: 12, border: "none", fontSize: 12, fontWeight: 700, cursor: "pointer",
                  background: userType === tab.key ? tab.grad : "rgba(255,255,255,0.06)",
                  color: userType === tab.key ? "#fff" : "var(--text-muted)" }}>
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <div style={{ maxWidth: 480, margin: "0 auto" }}>

        {/* 히어로 섹션 */}
        <div style={{ position: "relative", background: bgGradient, padding: "36px 24px 28px", marginBottom: 2 }}>
          <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse at 30% 20%, rgba(255,255,255,0.05) 0%, transparent 60%)" }} />
          <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse at 70% 80%, rgba(236,72,153,0.08) 0%, transparent 60%)" }} />
          <div style={{ position: "relative", textAlign: "center" }}>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "rgba(0,0,0,0.3)", borderRadius: 20, padding: "4px 12px", marginBottom: 16, backdropFilter: "blur(8px)" }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: themeColor, display: "inline-block" }} />
              <span style={{ fontSize: 11, color: themeColor === "#8b5cf6" ? "#c4b5fd" : "#f9a8d4", fontWeight: 600 }}>HEXACO 행동심리 분석</span>
            </div>
            <div style={{ fontSize: 80, marginBottom: 10, lineHeight: 1 }}>{result.emoji}</div>
            <h1 style={{ fontSize: 28, fontWeight: 900, margin: "0 0 8px", color: "#fff", letterSpacing: "-0.5px" }}>{result.personalityType}</h1>
            <p style={{ fontSize: 13, color: "rgba(255,255,255,0.5)", margin: "0 0 18px", fontStyle: "italic" }}>"{result.tagline}"</p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, justifyContent: "center", marginBottom: 20 }}>
              {result.strengths?.map(s => (
                <span key={s} style={{ background: `${themeColor}25`, border: `1px solid ${themeColor}50`, color: isWorker ? "#c4b5fd" : "#f9a8d4", fontSize: 12, borderRadius: 20, padding: "4px 12px" }}>{s}</span>
              ))}
            </div>

            {/* MBTI */}
            {result.analyzedMbti && (
              <div style={{ display: "inline-flex", alignItems: "center", gap: 10, background: "rgba(0,0,0,0.3)", backdropFilter: "blur(8px)", borderRadius: 20, padding: "10px 18px", border: "1px solid rgba(255,255,255,0.08)" }}>
                <div>
                  <p style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", margin: "0 0 2px", textAlign: "left" }}>분석 MBTI</p>
                  <span style={{ fontSize: 20, fontWeight: 900, color: "#c4b5fd" }}>{result.analyzedMbti}</span>
                </div>
                {result.selfMbti && result.selfMbti !== "모름" && (
                  <>
                    <div style={{ width: 1, height: 28, background: "rgba(255,255,255,0.1)" }} />
                    <div>
                      <p style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", margin: "0 0 2px", textAlign: "left" }}>본인 MBTI</p>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{ fontSize: 18, fontWeight: 700, color: result.mbtiMatch ? "#86efac" : "#fbbf24" }}>{result.selfMbti}</span>
                        <span style={{ fontSize: 10, color: result.mbtiMatch ? "#86efac" : "#fbbf24", background: result.mbtiMatch ? "rgba(34,197,94,0.15)" : "rgba(251,191,36,0.15)", padding: "2px 6px", borderRadius: 10 }}>
                          {result.mbtiMatch ? "✓ 일치" : "△ 다름"}
                        </span>
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        {/* 공유 버튼 */}
        <button onClick={handleShare} disabled={sharing}
          style={{ width: "100%", background: themeGradient, border: "none", color: "#fff", fontWeight: 700, padding: "15px", fontSize: 14, cursor: "pointer", marginBottom: 2, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
          {sharing ? "생성중..." : "🔗 내 성향 유형 공유하기"}
        </button>

        <div style={{ padding: "12px 16px" }}>

          {/* HEXACO */}
          {hexaco && (
            <Section>
              <SectionTitle>🧠 HEXACO 성향 분석</SectionTitle>
              {/* 레이더 차트 */}
              <div style={{ display: "flex", justifyContent: "center", marginBottom: 16 }}>
                {(() => {
                  const cx = 130, cy = 115, r = 95;
                  const keys = ["honesty","extraversion","conscientiousness","openness","agreeableness","emotionality"];
                  const angles = [-90, -30, 30, 90, 150, 210];
                  const vals = keys.map(k => (hexaco[k] || 3) / 5);
                  const toXY = (angle: number, ratio: number) => ({ x: cx + r * ratio * Math.cos((angle * Math.PI) / 180), y: cy + r * ratio * Math.sin((angle * Math.PI) / 180) });
                  const dataPoints = vals.map((v, i) => toXY(angles[i], v));
                  const dataPath = dataPoints.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ") + " Z";
                  const gridLevels = [0.2, 0.4, 0.6, 0.8, 1.0];
                  const gridPolygons = gridLevels.map(level => angles.map((a) => toXY(a, level)).map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ") + " Z");
                  const labels = [
                    { key: "honesty", emoji: "🤝", label: "정직성", anchor: "middle", dx: 0, dy: -16 },
                    { key: "extraversion", emoji: "⚡", label: "외향성", anchor: "start", dx: 10, dy: -6 },
                    { key: "conscientiousness", emoji: "📋", label: "성실성", anchor: "start", dx: 10, dy: 6 },
                    { key: "openness", emoji: "🌟", label: "개방성", anchor: "middle", dx: 0, dy: 18 },
                    { key: "agreeableness", emoji: "🕊️", label: "원만성", anchor: "end", dx: -10, dy: 6 },
                    { key: "emotionality", emoji: "💭", label: "정서성", anchor: "end", dx: -10, dy: -6 },
                  ];
                  const getColor = (v: number) => v >= 0.9 ? "#6ee7b7" : v >= 0.7 ? "#8b5cf6" : v >= 0.5 ? "#fbbf24" : "#f87171";
                  return (
                    <svg width="280" height="240" viewBox="0 0 260 230" xmlns="http://www.w3.org/2000/svg">
                      <defs>
                        <linearGradient id="radarGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                          <stop offset="0%" stopColor={themeColor} stopOpacity="0.5"/>
                          <stop offset="100%" stopColor={themeColor} stopOpacity="0.2"/>
                        </linearGradient>
                      </defs>
                      {gridPolygons.map((d, i) => <path key={i} d={d} fill="none" stroke={i === 4 ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.05)"} strokeWidth="1" />)}
                      {angles.map((a, i) => { const end = toXY(a, 1); return <line key={i} x1={cx} y1={cy} x2={end.x.toFixed(1)} y2={end.y.toFixed(1)} stroke="rgba(255,255,255,0.07)" strokeWidth="1" />; })}
                      <path d={dataPath} fill="url(#radarGrad)" stroke={themeColor} strokeWidth="2" strokeLinejoin="round" strokeOpacity="0.9" />
                      {dataPoints.map((p, i) => <circle key={i} cx={p.x.toFixed(1)} cy={p.y.toFixed(1)} r="4.5" fill={getColor(vals[i])} stroke="#18181b" strokeWidth="1.5" />)}
                      {labels.map((lb, i) => {
                        const pos = toXY(angles[i], 1.18);
                        const val = hexaco[lb.key] || 3;
                        const c = getColor(val / 5);
                        return (
                          <g key={i}>
                            <text x={(pos.x + lb.dx).toFixed(1)} y={(pos.y + lb.dy).toFixed(1)} textAnchor={lb.anchor as any} fontSize="10" fontWeight="600" fill="rgba(255,255,255,0.7)">{lb.emoji} {lb.label}</text>
                            <text x={(pos.x + lb.dx).toFixed(1)} y={(pos.y + lb.dy + 12).toFixed(1)} textAnchor={lb.anchor as any} fontSize="10" fontWeight="700" fill={c}>{val.toFixed(1)}</text>
                          </g>
                        );
                      })}
                    </svg>
                  );
                })()}
              </div>
              {/* 바 차트 */}
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {HEXACO_LABELS.map(item => {
                  const val = hexaco[item.key] || 3;
                  const color = getHexacoColor(val);
                  return (
                    <div key={item.key}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                        <span style={{ fontSize: 12, color: "rgba(255,255,255,0.7)" }}>{item.emoji} {item.label}</span>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <span style={{ fontSize: 10, color: "var(--text-muted)" }}>{item.desc}</span>
                          <span style={{ fontSize: 12, fontWeight: 700, color }}>{val.toFixed(1)}</span>
                        </div>
                      </div>
                      <div style={{ height: 6, background: "rgba(255,255,255,0.08)", borderRadius: 4, overflow: "hidden" }}>
                        <div style={{ height: "100%", width: `${(val / 5) * 100}%`, background: color, borderRadius: 4, transition: "width 0.5s ease" }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </Section>
          )}

          {/* 가치관 */}
          {values && (
            <Section>
              <SectionTitle>{isWorker ? "💎 직업 가치관" : "💎 운영 가치관"}</SectionTitle>
              {topValue && (
                <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "0 0 14px" }}>
                  가장 중요하게 생각하는 건 <span style={{ color: themeColor, fontWeight: 700 }}>{valueLabels.find(v => v.key === topValue[0])?.label}</span>이에요
                </p>
              )}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                {valueLabels.map(item => {
                  const val = (values as any)[item.key] || 3;
                  const isTop = topValue?.[0] === item.key;
                  return (
                    <div key={item.key} style={{ background: isTop ? `${themeColor}15` : "rgba(255,255,255,0.03)", border: `1px solid ${isTop ? `${themeColor}40` : "rgba(255,255,255,0.06)"}`, borderRadius: 14, padding: "12px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                        <span style={{ fontSize: 12, fontWeight: isTop ? 700 : 400, color: isTop ? themeColor : "var(--text-muted)" }}>{item.label}</span>
                        <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{val}/5</span>
                      </div>
                      <div style={{ height: 4, background: "rgba(255,255,255,0.08)", borderRadius: 4 }}>
                        <div style={{ height: "100%", width: `${(val / 5) * 100}%`, background: isTop ? themeGradient : "rgba(255,255,255,0.2)", borderRadius: 4 }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </Section>
          )}

          {/* 궁합 */}
          {(bestMatches.length > 0 || worstMatches.length > 0) && (
            <Section>
              <SectionTitle>{isWorker ? "💕 사장님 유형 궁합" : "💕 알바생 유형 궁합"}</SectionTitle>
              {bestMatches.length > 0 && (
                <>
                  <p style={{ fontSize: 11, color: "#86efac", fontWeight: 700, margin: "0 0 8px" }}>✅ 잘 맞는 유형</p>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
                    {bestMatches.map((m, i) => (
                      <div key={i} style={{ background: i === 0 ? "rgba(34,197,94,0.1)" : "rgba(34,197,94,0.05)", border: `1px solid ${i === 0 ? "rgba(34,197,94,0.3)" : "rgba(34,197,94,0.12)"}`, borderRadius: 14, padding: "12px 14px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                          <span style={{ fontSize: 13, fontWeight: 700, color: "#86efac" }}>{m.type}</span>
                          {i === 0 && <span style={{ fontSize: 10, background: "rgba(34,197,94,0.2)", color: "#86efac", padding: "1px 6px", borderRadius: 10 }}>최고 궁합 ✨</span>}
                        </div>
                        <p style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", margin: 0, lineHeight: 1.5 }}>{m.reason}</p>
                      </div>
                    ))}
                  </div>
                </>
              )}
              {worstMatches.length > 0 && (
                <>
                  <p style={{ fontSize: 11, color: "#fbbf24", fontWeight: 700, margin: "0 0 8px" }}>⚡ 조율이 필요한 유형</p>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {worstMatches.map((m, i) => (
                      <div key={i} style={{ background: "rgba(251,191,36,0.06)", border: "1px solid rgba(251,191,36,0.18)", borderRadius: 14, padding: "12px 14px" }}>
                        <p style={{ fontSize: 13, fontWeight: 700, margin: "0 0 3px", color: "#fbbf24" }}>{m.type}</p>
                        <p style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", margin: 0, lineHeight: 1.5 }}>{m.reason}</p>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </Section>
          )}

          {/* 추천 직종 */}
          {isWorker && (result.recommendedJobs?.length ?? 0) > 0 && (
            <Section>
              <SectionTitle>🎯 추천 알바 직종</SectionTitle>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {(result.recommendedJobs || []).map((job, i) => (
                  <div key={job} style={{ display: "flex", alignItems: "center", gap: 10, background: "rgba(255,255,255,0.03)", borderRadius: 12, padding: "10px 14px", border: "1px solid rgba(255,255,255,0.06)" }}>
                    <span style={{ width: 22, height: 22, borderRadius: "50%", background: themeGradient, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, color: "#fff", fontWeight: 700, flexShrink: 0 }}>{i + 1}</span>
                    <span style={{ fontSize: 13 }}>{job}</span>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {!isWorker && (result.recommendedWorkerTypes?.length ?? 0) > 0 && (
            <Section>
              <SectionTitle>🎯 잘 맞는 알바 유형</SectionTitle>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {(result.recommendedWorkerTypes || []).map((type, i) => (
                  <div key={type} style={{ display: "flex", alignItems: "center", gap: 10, background: "rgba(255,255,255,0.03)", borderRadius: 12, padding: "10px 14px", border: "1px solid rgba(255,255,255,0.06)" }}>
                    <span style={{ width: 22, height: 22, borderRadius: "50%", background: themeGradient, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, color: "#fff", fontWeight: 700, flexShrink: 0 }}>{i + 1}</span>
                    <span style={{ fontSize: 13 }}>{type}</span>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {/* 환경 조언 */}
          {result.caution && (
            <Section style={{ background: `${themeColor}08`, borderColor: `${themeColor}20` }}>
              <SectionTitle>{isWorker ? "💡 이런 환경이 잘 맞아요" : "💡 이런 알바생과 일하면 좋아요"}</SectionTitle>
              <p style={{ fontSize: 13, color: "rgba(255,255,255,0.6)", margin: 0, lineHeight: 1.7 }}>{result.caution}</p>
            </Section>
          )}

          {/* MBTI 궁합 */}
          {result.analyzedMbti && MBTI_COMPATIBILITY[result.analyzedMbti] && (() => {
            const compat = MBTI_COMPATIBILITY[result.analyzedMbti!];
            return (
              <Section>
                <SectionTitle>💕 MBTI 궁합</SectionTitle>
                <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "0 0 16px", lineHeight: 1.5 }}>{compat.desc}</p>
                {[
                  { label: "💕 최고 궁합", items: compat.best, color: "#f9a8d4", bg: "rgba(236,72,153,0.12)", border: "rgba(236,72,153,0.25)" },
                  { label: "👍 잘 맞는 유형", items: compat.good, color: "#86efac", bg: "rgba(34,197,94,0.08)", border: "rgba(34,197,94,0.2)" },
                  { label: "😅 조심할 유형", items: compat.caution, color: "#fca5a5", bg: "rgba(239,68,68,0.06)", border: "rgba(239,68,68,0.15)" },
                ].map(group => (
                  <div key={group.label} style={{ marginBottom: 12 }}>
                    <p style={{ fontSize: 11, fontWeight: 700, color: group.color, margin: "0 0 6px" }}>{group.label}</p>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {group.items.map(m => (
                        <span key={m} style={{ background: group.bg, border: `1px solid ${group.border}`, color: group.color, fontSize: 12, fontWeight: 700, padding: "5px 12px", borderRadius: 20 }}>{m}</span>
                      ))}
                    </div>
                  </div>
                ))}
                <p style={{ fontSize: 10, color: "var(--text-muted)", margin: "8px 0 0", textAlign: "center" }}>* MBTI 궁합은 재미로만 참고하세요 😊</p>
              </Section>
            );
          })()}

          {/* CTA */}
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 4 }}>
            {isWorker && (
              <button onClick={() => router.push("/worker/profile")}
                style={{ width: "100%", background: themeGradient, border: "none", color: "#fff", fontWeight: 700, padding: "16px", borderRadius: 16, fontSize: 15, cursor: "pointer" }}>
                📋 구직 공고 등록하기 →
              </button>
            )}
            <button onClick={() => router.push(`/explore?type=${userType}`)}
              style={{ width: "100%", background: isWorker ? "rgba(255,255,255,0.06)" : themeGradient, border: isWorker ? "1px solid rgba(255,255,255,0.1)" : "none", color: isWorker ? "var(--text-muted)" : "#fff", fontWeight: isWorker ? 600 : 700, padding: "14px", borderRadius: 16, fontSize: isWorker ? 14 : 15, cursor: "pointer" }}>
              {isWorker ? "⚡ 공고 둘러보기 →" : "🏪 맞는 알바생 찾기 →"}
            </button>
            <button onClick={handleShare} disabled={sharing}
              style={{ width: "100%", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "var(--text-muted)", fontWeight: 600, padding: "14px", borderRadius: 16, fontSize: 14, cursor: "pointer" }}>
              {sharing ? "생성중..." : "🔗 결과 공유하기"}
            </button>
          </div>
        </div>
      </div>

      {/* 공유 모달 */}
      {showShareModal && shareImage && (
        <div onClick={() => setShowShareModal(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", zIndex: 200, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
          <div onClick={e => e.stopPropagation()} style={{ background: "var(--surface)", borderRadius: "24px 24px 0 0", padding: 24, width: "100%", maxWidth: 480, paddingBottom: "calc(24px + env(safe-area-inset-bottom))" }}>
            <div style={{ width: 36, height: 4, borderRadius: 2, background: "rgba(255,255,255,0.15)", margin: "0 auto 20px" }} />
            <h3 style={{ fontSize: 16, fontWeight: 800, margin: "0 0 16px", textAlign: "center" }}>내 성향 공유하기 📤</h3>
            <div style={{ textAlign: "center", marginBottom: 16 }}>
              <img src={shareImage} alt="공유 카드" style={{ width: "100%", maxWidth: 260, borderRadius: 16 }} />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <button onClick={handleDownload}
                style={{ width: "100%", background: themeGradient, border: "none", color: "#fff", fontWeight: 700, padding: 14, borderRadius: 14, cursor: "pointer", fontSize: 14 }}>
                📥 이미지 저장하기
              </button>
              <button onClick={() => setShowShareModal(false)}
                style={{ width: "100%", background: "none", border: "none", color: "var(--text-muted)", fontSize: 13, cursor: "pointer", padding: 8 }}>
                닫기
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

export default function ResultPage() {
  return (
    <Suspense fallback={
      <div style={{ minHeight: "100vh", background: "var(--bg)", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <p style={{ color: "var(--text-muted)" }}>불러오는 중...</p>
      </div>
    }>
      <ResultContent />
    </Suspense>
  );
}
