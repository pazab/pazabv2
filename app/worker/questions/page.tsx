"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { Suspense } from "react";

const CATEGORIES = ["전체", "경력", "성격", "출근가능일", "근무일정", "근무기간", "신뢰도", "지원동기", "강점", "기타"];

function WorkerQuestionsContent() {
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
      supabase.from("worker_profiles").select("worker_type, bio, job_title").eq("id", profileId).single(),
      supabase.from("bot_chat_logs").select("*").eq("worker_profile_id", profileId).order("created_at", { ascending: false }),
    ]);
    setProfile(profRes.data);
    setLogs(logsRes.data || []);
    setLoading(false);
  };

  const catCounts = logs.reduce((acc, log) => {
    acc[log.category || "기타"] = (acc[log.category || "기타"] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const filtered = selectedCat === "전체" ? logs : logs.filter(l => (l.category || "기타") === selectedCat);

  const questionFreq = logs.reduce((acc, log) => {
    const key = log.question?.slice(0, 30) || "";
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const topQuestions = (Object.entries(questionFreq) as [string, number][])
    .sort(([,a], [,b]) => b - a).slice(0, 5);

  if (loading) return (
    <main style={{ minHeight: "100vh", background: "var(--bg)", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <p style={{ color: "var(--text-muted)" }}>불러오는 중...</p>
    </main>
  );

  return (
    <main style={{ minHeight: "100vh", background: "var(--bg)", color: "var(--text)", paddingBottom: 40, maxWidth: 480, margin: "0 auto" }}>
      <div style={{ position: "sticky", top: 0, zIndex: 20, background: "rgba(24,24,27,0.97)", backdropFilter: "blur(12px)", borderBottom: "1px solid var(--border)", padding: "14px 16px", display: "flex", alignItems: "center", gap: 8 }}>
        <button onClick={() => router.back()} style={{ background: "none", border: "none", color: "var(--text-muted)", fontSize: 20, cursor: "pointer", padding: 0 }}>←</button>
        <span style={{ width: 1, height: 14, background: "var(--border)", display: "inline-block" }} />
        <span style={{ fontSize: 17, fontWeight: 900, background: "linear-gradient(135deg, #8b5cf6, #ec4899)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>PAZAB</span>
        <span style={{ width: 1, height: 14, background: "var(--border)", display: "inline-block" }} />
        <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-muted)" }}>사장님들의 질문</span>
      </div>

      <div style={{ padding: "16px" }}>
        {/* 프로필 정보 */}
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14, padding: "12px 16px", marginBottom: 16, display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: "linear-gradient(135deg, #8b5cf6, #7c3aed)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>⚡</div>
          <div>
            <p style={{ fontSize: 14, fontWeight: 700, margin: 0 }}>{profile?.job_title || profile?.worker_type || "내 구직 공고"}</p>
            <p style={{ fontSize: 12, color: "var(--text-muted)", margin: 0 }}>총 {logs.length}개 질문</p>
          </div>
        </div>

        {logs.length === 0 ? (
          <div style={{ textAlign: "center", padding: "60px 0" }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>🤖</div>
            <p style={{ fontSize: 14, color: "var(--text-muted)", lineHeight: 1.7 }}>
              아직 사장님들이 질문하지 않았어요.<br />
              채용 제안을 받으면 사장님들이<br />AI 봇으로 먼저 물어볼 수 있어요 😊
            </p>
          </div>
        ) : (
          <>
            {/* 카테고리 통계 */}
            <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14, padding: 16, marginBottom: 16 }}>
              <h3 style={{ fontSize: 14, fontWeight: 700, margin: "0 0 12px" }}>📊 사장님들이 궁금해한 것</h3>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {(Object.entries(catCounts) as [string, number][]).sort(([,a], [,b]) => b - a).map(([cat, count]) => (
                  <div key={cat} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 12, color: "var(--text-muted)", minWidth: 70 }}>{cat}</span>
                    <div style={{ flex: 1, background: "var(--surface2)", borderRadius: 4, height: 8 }}>
                      <div style={{ height: 8, borderRadius: 4, background: "linear-gradient(135deg, #8b5cf6, #7c3aed)", width: `${(count / logs.length) * 100}%` }} />
                    </div>
                    <span style={{ fontSize: 12, fontWeight: 700, minWidth: 24, textAlign: "right" }}>{count}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* TOP 질문 */}
            {topQuestions.length > 0 && (
              <div style={{ background: "rgba(139,92,246,0.08)", border: "1px solid rgba(139,92,246,0.2)", borderRadius: 14, padding: 16, marginBottom: 16 }}>
                <h3 style={{ fontSize: 14, fontWeight: 700, margin: "0 0 10px" }}>🔥 자주 받은 질문 TOP {topQuestions.length}</h3>
                {topQuestions.map(([q, cnt], i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, fontSize: 13 }}>
                    <span style={{ fontSize: 11, background: "rgba(139,92,246,0.2)", color: "#c4b5fd", padding: "1px 6px", borderRadius: 10, fontWeight: 700, flexShrink: 0 }}>{cnt}회</span>
                    <span style={{ color: "var(--text-muted)" }}>{q}{q.length >= 30 ? "..." : ""}</span>
                  </div>
                ))}
                <div style={{ background: "rgba(139,92,246,0.08)", border: "1px solid rgba(139,92,246,0.2)", borderRadius: 10, padding: "10px 12px", marginTop: 10 }}>
                  <p style={{ fontSize: 12, color: "var(--text-muted)", margin: 0, lineHeight: 1.6 }}>
                    💡 자주 받는 질문은 프로필에 미리 작성해두면<br />사장님들이 더 빨리 파악할 수 있어요!
                  </p>
                </div>
              </div>
            )}

            {/* 카테고리 필터 */}
            <div style={{ display: "flex", gap: 6, overflowX: "auto", marginBottom: 14, paddingBottom: 4, scrollbarWidth: "none" }}>
              {CATEGORIES.filter(c => c === "전체" || catCounts[c]).map(cat => (
                <button key={cat} onClick={() => setSelectedCat(cat)}
                  style={{ padding: "5px 12px", borderRadius: 20, fontSize: 12, cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0, background: selectedCat === cat ? "rgba(139,92,246,0.15)" : "var(--surface)", border: `1px solid ${selectedCat === cat ? "rgba(139,92,246,0.4)" : "var(--border)"}`, color: selectedCat === cat ? "#c4b5fd" : "var(--text-muted)", fontWeight: selectedCat === cat ? 700 : 400 }}>
                  {cat} {cat !== "전체" && catCounts[cat] ? `(${catCounts[cat]})` : ""}
                </button>
              ))}
            </div>

            {/* 질문 목록 */}
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {filtered.map(log => (
                <div key={log.id}
                  style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "12px 14px", cursor: "pointer" }}
                  onClick={() => setExpanded(expanded === log.id ? null : log.id)}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                        <span style={{ fontSize: 10, background: "rgba(139,92,246,0.15)", color: "#c4b5fd", padding: "1px 6px", borderRadius: 10 }}>{log.category || "기타"}</span>
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
          </>
        )}
      </div>
    </main>
  );
}

export default function WorkerQuestionsPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: "100vh", background: "var(--bg)", display: "flex", alignItems: "center", justifyContent: "center" }}><p style={{ color: "var(--text-muted)" }}>로딩 중...</p></div>}>
      <WorkerQuestionsContent />
    </Suspense>
  );
}
