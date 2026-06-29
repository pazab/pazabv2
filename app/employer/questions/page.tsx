"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { Suspense } from "react";

const CATEGORIES = ["전체", "급여", "교육", "식사", "교통/위치", "분위기", "근무강도", "사장님", "근무일정", "복장", "휴가/휴일", "기타"];

function QuestionsContent() {
  const router = useRouter();
  const sp = useSearchParams();
  const profileId = sp.get("profileId") || "";

  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<any>(null);
  const [logs, setLogs] = useState<any[]>([]);
  const [selectedCat, setSelectedCat] = useState("전체");
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => { if (profileId) load(); }, [profileId]);

  const load = async () => {
    const [profRes, logsRes] = await Promise.all([
      supabase.from("employer_profiles").select("business_name, business_type, bot_last_checked_at").eq("id", profileId).single(),
      supabase.from("bot_chat_logs").select("*").eq("employer_profile_id", profileId).order("created_at", { ascending: false }),
    ]);
    setProfile(profRes.data);

    // 새 질문 표시 (last_checked 이후)
    const lastChecked = profRes.data?.bot_last_checked_at;
    const logsWithNew = (logsRes.data || []).map(log => ({
      ...log,
      isNew: lastChecked ? new Date(log.created_at) > new Date(lastChecked) : true,
    }));
    setLogs(logsWithNew);

    // 확인 시간 업데이트
    await supabase.from("employer_profiles")
      .update({ bot_last_checked_at: new Date().toISOString() })
      .eq("id", profileId);

    setLoading(false);
  };

  // 카테고리별 집계
  const catCounts = logs.reduce((acc, log) => {
    acc[log.category || "기타"] = (acc[log.category || "기타"] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const filtered = selectedCat === "전체" ? logs : logs.filter(l => (l.category || "기타") === selectedCat);

  // 자주 묻는 질문 TOP 5
  const questionFreq = logs.reduce((acc, log) => {
    const key = log.question?.slice(0, 30) || "";
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  const topQuestions = (Object.entries(questionFreq) as [string, number][])
    .sort(([,a], [,b]) => b - a)
    .slice(0, 5);

  if (loading) return (
    <main style={{ minHeight: "100vh", background: "var(--bg)", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <p style={{ color: "var(--text-muted)" }}>불러오는 중...</p>
    </main>
  );

  return (
    <main style={{ minHeight: "100vh", background: "var(--bg)", color: "var(--text)", paddingBottom: 40, maxWidth: 480, margin: "0 auto" }}>
      {/* 헤더 */}
      <div style={{ position: "sticky", top: 0, zIndex: 20, background: "rgba(24,24,27,0.97)", backdropFilter: "blur(12px)", borderBottom: "1px solid var(--border)", padding: "14px 16px", display: "flex", alignItems: "center", gap: 8 }}>
        <button onClick={() => router.back()} style={{ background: "none", border: "none", color: "var(--text-muted)", fontSize: 20, cursor: "pointer", padding: 0 }}>←</button>
        <span style={{ width: 1, height: 14, background: "var(--border)", display: "inline-block" }} />
        <span style={{ fontSize: 17, fontWeight: 900, background: "linear-gradient(135deg, #8b5cf6, #ec4899)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>PAZAB</span>
        <span style={{ width: 1, height: 14, background: "var(--border)", display: "inline-block" }} />
        <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-muted)" }}>받은 질문 분석</span>
      </div>

      <div style={{ padding: "16px" }}>
        {/* 매장 정보 */}
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14, padding: "12px 16px", marginBottom: 16, display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: "linear-gradient(135deg, #ec4899, #be185d)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>🏪</div>
          <div>
            <p style={{ fontSize: 14, fontWeight: 700, margin: 0 }}>{profile?.business_name}</p>
            <p style={{ fontSize: 12, color: "var(--text-muted)", margin: 0 }}>총 {logs.length}개 질문</p>
          </div>
        </div>

        {/* 카테고리 통계 */}
        {logs.length > 0 && (
          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14, padding: 16, marginBottom: 16 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, margin: "0 0 12px" }}>📊 카테고리별 질문</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {(Object.entries(catCounts) as [string, number][]).sort(([,a], [,b]) => b - a).map(([cat, count]) => (
                <div key={cat} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 12, color: "var(--text-muted)", minWidth: 70 }}>{cat}</span>
                  <div style={{ flex: 1, background: "var(--surface2)", borderRadius: 4, height: 8 }}>
                    <div style={{ height: 8, borderRadius: 4, background: "linear-gradient(135deg, #ec4899, #be185d)", width: `${(count / logs.length) * 100}%` }} />
                  </div>
                  <span style={{ fontSize: 12, fontWeight: 700, minWidth: 24, textAlign: "right" }}>{count}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TOP 질문 */}
        {topQuestions.length > 0 && (
          <div style={{ background: "rgba(139,92,246,0.08)", border: "1px solid rgba(139,92,246,0.2)", borderRadius: 14, padding: 16, marginBottom: 16 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, margin: "0 0 10px" }}>🔥 자주 묻는 질문 TOP {topQuestions.length}</h3>
            {topQuestions.map(([q, cnt], i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, fontSize: 13 }}>
                <span style={{ fontSize: 11, background: "rgba(139,92,246,0.2)", color: "#c4b5fd", padding: "1px 6px", borderRadius: 10, fontWeight: 700, flexShrink: 0 }}>{cnt}회</span>
                <span style={{ color: "var(--text-muted)" }}>{q}{q.length >= 30 ? "..." : ""}</span>
              </div>
            ))}
            <button onClick={() => router.replace(`/employer/interview?profileId=${profileId}&mode=update`)}
              style={{ marginTop: 10, width: "100%", background: "rgba(139,92,246,0.15)", border: "1px solid rgba(139,92,246,0.3)", color: "#c4b5fd", fontSize: 12, fontWeight: 600, padding: "8px", borderRadius: 10, cursor: "pointer" }}>
              🤖 이 질문들 봇에 반영하기
            </button>
          </div>
        )}

        {/* 카테고리 필터 */}
        <div style={{ display: "flex", gap: 6, overflowX: "auto", marginBottom: 14, paddingBottom: 4, scrollbarWidth: "none" }}>
          {CATEGORIES.filter(c => c === "전체" || catCounts[c]).map(cat => (
            <button key={cat} onClick={() => setSelectedCat(cat)}
              style={{ padding: "5px 12px", borderRadius: 20, fontSize: 12, cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0, background: selectedCat === cat ? "rgba(236,72,153,0.15)" : "var(--surface)", border: `1px solid ${selectedCat === cat ? "rgba(236,72,153,0.4)" : "var(--border)"}`, color: selectedCat === cat ? "#f9a8d4" : "var(--text-muted)", fontWeight: selectedCat === cat ? 700 : 400 }}>
              {cat} {cat !== "전체" && catCounts[cat] ? `(${catCounts[cat]})` : ""}
            </button>
          ))}
        </div>

        {/* 질문 목록 */}
        {filtered.length === 0 ? (
          <div style={{ textAlign: "center", padding: "40px 0" }}>
            <p style={{ fontSize: 14, color: "var(--text-muted)" }}>아직 질문이 없어요 😊</p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {filtered.map(log => (
              <div key={log.id}
                style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "12px 14px", cursor: "pointer" }}
                onClick={() => setExpanded(expanded === log.id ? null : log.id)}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                      <span style={{ fontSize: 10, background: "rgba(236,72,153,0.15)", color: "#f9a8d4", padding: "1px 6px", borderRadius: 10 }}>{log.category || "기타"}</span>
                      {log.isNew && <span style={{ fontSize: 10, background: "rgba(139,92,246,0.2)", color: "#c4b5fd", padding: "1px 6px", borderRadius: 10, fontWeight: 700 }}>NEW</span>}
                      <span style={{ fontSize: 10, color: "var(--text-muted)" }}>
                        {new Date(log.created_at).toLocaleDateString("ko-KR")}
                      </span>
                    </div>
                    <p style={{ fontSize: 13, margin: 0, lineHeight: 1.5 }}>Q. {log.question}</p>
                  </div>
                  <span style={{ fontSize: 12, color: "var(--text-muted)", flexShrink: 0 }}>{expanded === log.id ? "▲" : "▼"}</span>
                </div>
                {expanded === log.id && (
                  <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--border)" }}>
                    <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "0 0 4px", fontWeight: 600 }}>봇 답변:</p>
                    <p style={{ fontSize: 12, color: "var(--text-sub)", margin: 0, lineHeight: 1.6 }}>{log.answer}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}

export default function QuestionsPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: "100vh", background: "var(--bg)", display: "flex", alignItems: "center", justifyContent: "center" }}><p style={{ color: "var(--text-muted)" }}>로딩 중...</p></div>}>
      <QuestionsContent />
    </Suspense>
  );
}
