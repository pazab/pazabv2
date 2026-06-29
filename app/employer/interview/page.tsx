"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { Suspense } from "react";

function InterviewContent() {
  const router = useRouter();
  const sp = useSearchParams();
  const profileId = sp.get("profileId") || "";
  const mode = sp.get("mode") || "normal"; // normal | update

  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<any>(null);
  const [uncertainQuestions, setUncertainQuestions] = useState<any[]>([]);
  const [messages, setMessages] = useState<{ role: "user" | "assistant"; content: string }[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showSaveConfirm, setShowSaveConfirm] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const MAX_TURNS = 15;
  const userTurns = messages.filter(m => m.role === "user").length;
  const canFinish = userTurns >= 5;

  useEffect(() => { if (profileId) load(); }, [profileId]);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const load = async (forceReset = false) => {
    const { data: ep } = await supabase.from("employer_profiles")
      .select("*").eq("id", profileId).single();
    if (!ep) { setLoading(false); return; }
    setProfile(ep);

    // 이미 완료됐어도 update 모드면 진행
    if (ep.bot_interview_done && !forceReset && mode !== "update") {
      setDone(true);
      setLoading(false);
      return;
    }

    const bk = ep.bot_knowledge;
    const isUpdate = (forceReset && bk) || mode === "update";

    // mode=update 시 미답변 질문 가져오기
    let unanswered: any[] = [];
    if (mode === "update") {
      const { data: logs } = await supabase.from("bot_chat_logs")
        .select("question, category")
        .eq("employer_profile_id", profileId)
        .eq("bot_uncertain", true)
        .order("created_at", { ascending: false })
        .limit(10);
      unanswered = logs || [];
      setUncertainQuestions(unanswered);
    }

    // 부족한 항목 파악
    const missing: string[] = [];
    if (bk) {
      if (!bk.busyHours) missing.push("바쁜 시간대");
      if (!bk.training) missing.push("교육 방식");
      if (!bk.meal) missing.push("식사 제공 여부");
      if (!bk.ownerPresence) missing.push("사장님 상주 여부");
      if (!bk.teamSize) missing.push("팀 구성");
      if (!bk.goodFit) missing.push("잘 맞는 알바생");
    }

    let opener = "";
    if (mode === "update" && unanswered.length > 0) {
      opener = `안녕하세요 사장님! 😊\n\n알바생들이 **${ep.business_name}** 봇에게 물어봤는데 제가 답을 못한 질문들이 있어요.\n\n${unanswered.slice(0, 3).map((q, i) => `${i+1}. "${q.question}"`).join("\n")}\n\n하나씩 여쭤볼게요! 😊\n\n**${unanswered[0].question}**`;
    } else if (mode === "update" && unanswered.length === 0) {
      opener = `안녕하세요 사장님! 😊\n\n아직 봇이 답 못한 질문은 없어요 👍\n\n혹시 추가로 알려주실 정보가 있으면 말씀해주세요!\n최근 바뀐 내용이 있나요?`;
    } else if (isUpdate) {
      const firstQ = missing.length > 0
        ? `아직 **${missing[0]}**에 대한 정보가 없어요. ${missing[0]}은 어떻게 되나요?`
        : `혹시 최근에 바뀐 내용이 있나요?`;
      opener = `안녕하세요 사장님! 다시 오셨군요 😊\n\n📋 **기존 정보 요약**\n${bk?.summary || bk?.mainTasks?.join(", ") || "이전 인터뷰 내용"}\n\n추가로 보완해드릴게요!\n\n${firstQ}`;
    } else {
      opener = `안녕하세요 사장님! 저는 파잡 AI 어시스턴트예요 🤖\n\n**${ep.business_name}** 매장을 더 잘 소개하기 위해 몇 가지 여쭤볼게요.\n알바생들이 자주 궁금해하는 내용들이에요!\n\n먼저, **매장에서 알바생이 주로 하는 업무**가 어떻게 되나요? 구체적으로 알려주시면 더 좋아요 😊`;
    }

    setMessages([{ role: "assistant", content: opener }]);
    setLoading(false);
  };

  const send = async (overrideText?: string) => {
    const text = overrideText || input.trim();
    if (!text || sending || userTurns >= MAX_TURNS) return;
    setInput("");
    setSending(true);

    const newMessages = [...messages, { role: "user" as const, content: text }];
    setMessages(newMessages);

    try {
      const res = await fetch("/api/employer-interview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: newMessages,
          profile,
          turnCount: userTurns + 1,
          maxTurns: MAX_TURNS,
          mode,
          uncertainQuestions: mode === "update" ? uncertainQuestions : [],
          maxQuestions: mode === "update" ? uncertainQuestions.length : MAX_TURNS,
        }),
      });
      const data = await res.json();
      if (data.message) {
        setMessages(prev => [...prev, { role: "assistant", content: data.message }]);

        // 저장 확인 메시지 표시 조건
        const isFinishMsg = /반영하겠습니다|모두 확인했어요|전달해드리겠습니다|알려드리겠습니다|해결되었습니다|모두.*해결|반영할게요|봇에.*반영/.test(data.message);
        const isAllAnswered = mode === "update" && uncertainQuestions.length > 0 && userTurns >= uncertainQuestions.length;
        if ((isFinishMsg || isAllAnswered) && !saving && userTurns >= 1) {
          setTimeout(() => {
            setMessages(prev => [...prev, {
              role: "assistant",
              content: "대화 내용을 저장할까요? 저장하면 봇이 더 잘 답변할 수 있어요 😊"
            }]);
            setShowSaveConfirm(true);
          }, 1000);
        }
      }
    } catch {}
    setSending(false);
    setTimeout(() => inputRef.current?.focus(), 100);
  };

  const handleFinish = async () => {
    setSaving(true);
    try {
      // 대화 내용 정리 → bot_knowledge 저장
      const res = await fetch("/api/employer-interview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages,
          profile,
          action: "save",
        }),
      });
      const data = await res.json();

      if (data.knowledge) {
        await supabase.from("employer_profiles").update({
          bot_knowledge: data.knowledge,
          bot_interview_done: true,
          bot_last_checked_at: new Date().toISOString(),
        }).eq("id", profileId);

        // uncertain 질문들 resolved 처리
        await supabase.from("bot_chat_logs")
          .update({ bot_uncertain: false })
          .eq("employer_profile_id", profileId)
          .eq("bot_uncertain", true);
      }

      setDone(true);
      router.replace("/mypage?section=jobs&toast=bot_updated");
    } catch {}
    setSaving(false);
  };

  if (loading) return (
    <main style={{ minHeight: "100vh", background: "var(--bg)", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <p style={{ color: "var(--text-muted)" }}>불러오는 중...</p>
    </main>
  );

  const themeGradient = "linear-gradient(135deg, #ec4899, #be185d)";

  return (
    <main style={{ height: "100vh", background: "var(--bg)", color: "var(--text)", display: "flex", flexDirection: "column", maxWidth: 480, margin: "0 auto" }}>
      {/* 헤더 */}
      <div style={{ padding: "14px 16px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between", background: "rgba(24,24,27,0.97)", backdropFilter: "blur(12px)", position: "sticky", top: 0, zIndex: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button onClick={() => {
            if (!done && canFinish && !showSaveConfirm) {
              setMessages(prev => [...prev, { role: "assistant", content: "잠깐! 대화 내용을 저장하고 나가시겠어요? 😊" }]);
              setShowSaveConfirm(true);
            } else {
              router.back();
            }
          }} style={{ background: "none", border: "none", color: "var(--text-muted)", fontSize: 20, cursor: "pointer", padding: 0 }}>←</button>
          <span style={{ width: 1, height: 14, background: "var(--border)", display: "inline-block" }} />
          <span style={{ fontSize: 17, fontWeight: 900, background: "linear-gradient(135deg, #8b5cf6, #ec4899)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>PAZAB</span>
          <span style={{ width: 1, height: 14, background: "var(--border)", display: "inline-block" }} />
          <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-muted)" }}>매장 AI봇 설정</span>
        </div>
        {/* 진행도 */}
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div style={{ width: 60, height: 4, background: "var(--surface2)", borderRadius: 4 }}>
            <div style={{ height: 4, borderRadius: 4, background: themeGradient, width: `${Math.min((userTurns / MAX_TURNS) * 100, 100)}%`, transition: "width 0.3s" }} />
          </div>
          <span style={{ fontSize: 10, color: "var(--text-muted)" }}>{userTurns < 5 ? `${5 - userTurns}개 더` : `${userTurns}/${MAX_TURNS}`}</span>
        </div>
      </div>

      {done ? (
        // 완료 화면
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24, textAlign: "center" }}>
          <div style={{ fontSize: 64, marginBottom: 16 }}>🎉</div>
          <h2 style={{ fontSize: 22, fontWeight: 900, marginBottom: 8 }}>
            {mode === "update" ? "봇에 반영됐어요!" : "매장봇 설정 완료!"}
          </h2>
          <p style={{ fontSize: 14, color: "var(--text-muted)", lineHeight: 1.7, marginBottom: 28 }}>
            {mode === "update"
              ? `이제 ${profile?.business_name} 봇이\n더 정확하게 답변할 수 있어요 😊`
              : `${profile?.business_name} 매장봇이 준비됐어요.\n알바생들의 질문에 자세히 답할 수 있어요 😊`
            }
          </p>
          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 16, padding: 16, width: "100%", marginBottom: 20, textAlign: "left" }}>
            <p style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>🤖 봇이 답변할 수 있는 내용</p>
            {[
              "주요 업무 및 역할",
              "근무 환경 및 분위기",
              "교육/온보딩 방식",
              "바쁜 시간대 정보",
              "식사 및 복지",
              "사장님 상주 여부",
            ].map(item => (
              <div key={item} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, fontSize: 13, color: "var(--text-muted)" }}>
                <span style={{ color: "#86efac" }}>✓</span> {item}
              </div>
            ))}
          </div>
          <button onClick={() => router.replace("/mypage?section=jobs")}
            style={{ width: "100%", background: themeGradient, border: "none", color: "#fff", fontWeight: 700, padding: 14, borderRadius: 14, fontSize: 15, cursor: "pointer" }}>
            내 공고 확인하기 →
          </button>
          <button onClick={() => { setDone(false); setMessages([]); load(true); }}
            style={{ marginTop: 10, background: "none", border: "none", color: "var(--text-muted)", fontSize: 13, cursor: "pointer" }}>
            다시 설정하기
          </button>
        </div>
      ) : (
        <>
          {/* 매장 정보 배너 */}
          <div style={{ padding: "10px 16px", background: "rgba(236,72,153,0.08)", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: themeGradient, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0 }}>🏪</div>
            <div>
              <p style={{ fontSize: 13, fontWeight: 700, margin: 0 }}>{profile?.business_name}</p>
              <p style={{ fontSize: 11, color: "var(--text-muted)", margin: 0 }}>{profile?.region} · {profile?.business_type}</p>
            </div>
          </div>

          {/* 대화창 */}
          <div style={{ flex: 1, overflowY: "auto", padding: "16px", display: "flex", flexDirection: "column", gap: 12 }}>
            {messages.map((msg, i) => (
              <div key={i} style={{ display: "flex", justifyContent: msg.role === "user" ? "flex-end" : "flex-start" }}>
                {msg.role === "assistant" && (
                  <div style={{ width: 30, height: 30, borderRadius: "50%", background: themeGradient, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, flexShrink: 0, marginRight: 8, alignSelf: "flex-end" }}>🤖</div>
                )}
                <div style={{
                  maxWidth: "78%",
                  background: msg.role === "user" ? themeGradient : "var(--surface)",
                  border: msg.role === "user" ? "none" : "1px solid var(--border)",
                  borderRadius: msg.role === "user" ? "18px 18px 4px 18px" : "4px 18px 18px 18px",
                  padding: "10px 14px", fontSize: 13, lineHeight: 1.6, whiteSpace: "pre-line",
                  color: msg.role === "user" ? "#fff" : "var(--text)",
                }}>
                  {msg.content.split("**").map((part, idx) =>
                    idx % 2 === 1 ? <strong key={idx}>{part}</strong> : part
                  )}
                </div>
              </div>
            ))}

            {sending && (
              <div style={{ display: "flex", alignItems: "flex-end", gap: 8 }}>
                <div style={{ width: 30, height: 30, borderRadius: "50%", background: themeGradient, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}>🤖</div>
                <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "4px 18px 18px 18px", padding: "12px 16px" }}>
                  <div style={{ display: "flex", gap: 4 }}>
                    {[0,1,2].map(i => (
                      <div key={i} style={{ width: 6, height: 6, borderRadius: "50%", background: "#ec4899",
                        animation: `bounce 1.2s ${i * 0.2}s infinite` }} />
                    ))}
                  </div>
                </div>
              </div>
            )}

            {userTurns >= MAX_TURNS && !saving && (
              <div style={{ textAlign: "center", marginTop: 8 }}>
                <p style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 10 }}>대화가 완료됐어요! 저장해주세요.</p>
              </div>
            )}
            {/* 저장 확인 버튼 */}
            {showSaveConfirm && !saving && (
              <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: "4px 0" }}>
                <button onClick={handleFinish}
                  style={{ width: "100%", background: "linear-gradient(135deg, #16a34a, #15803d)", border: "none", color: "#fff", fontWeight: 700, padding: "12px", borderRadius: 12, cursor: "pointer", fontSize: 14 }}>
                  💾 저장하고 내 공고로
                </button>
                <button onClick={() => setShowSaveConfirm(false)}
                  style={{ width: "100%", background: "var(--surface2)", border: "1px solid var(--border)", color: "var(--text-muted)", fontWeight: 600, padding: "10px", borderRadius: 12, cursor: "pointer", fontSize: 13 }}>
                  더 얘기하기
                </button>
              </div>
            )}

            <div ref={bottomRef} />
          </div>

          {/* 하단 영역 */}
          <div style={{ borderTop: "1px solid var(--border)", background: "rgba(24,24,27,0.97)", paddingBottom: "calc(0px + env(safe-area-inset-bottom))" }}>
            {/* 저장 버튼 */}
            {(canFinish || (mode === "update" && userTurns >= 1)) && (
              <div style={{ padding: "8px 16px 4px" }}>
                <button onClick={handleFinish} disabled={saving}
                  style={{ width: "100%", background: saving ? "var(--surface2)" : "linear-gradient(135deg, #16a34a, #15803d)", border: "none", color: "#fff", fontWeight: 700, padding: "10px", borderRadius: 12, cursor: saving ? "default" : "pointer", fontSize: 13 }}>
                  {saving ? "💾 저장 중..." : "💾 저장하고 내 공고로"}
                </button>
              </div>
            )}
            {/* 입력창 - 15턴 미만만 표시 */}
            {userTurns < MAX_TURNS && (
              <div style={{ padding: "8px 16px 10px", display: "flex", gap: 8 }}>
                <input ref={inputRef} type="text" value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); send(); } }}
                  placeholder="답변을 입력하세요..."
                  style={{ flex: 1, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 20, padding: "10px 16px", color: "var(--text)", fontSize: 13, outline: "none" }} />
                <button onClick={() => send()} disabled={!input.trim() || sending}
                  style={{ width: 40, height: 40, borderRadius: "50%", background: input.trim() ? themeGradient : "var(--surface2)", border: "none", color: "#fff", fontSize: 16, cursor: input.trim() ? "pointer" : "default", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  ↑
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </main>
  );
}

export default function EmployerInterviewPage() {
  return (
    <Suspense fallback={
      <div style={{ minHeight: "100vh", background: "var(--bg)", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <p style={{ color: "var(--text-muted)" }}>로딩 중...</p>
      </div>
    }>
      <InterviewContent />
    </Suspense>
  );
}
