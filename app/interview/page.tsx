"use client";

import { useState, useEffect, useRef, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";

const MAX_TURNS = 5;

interface Message {
  role: "user" | "assistant";
  content: string;
}

function InterviewContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const userType = (searchParams.get("type") || "worker") as "worker" | "employer";
  const isRetry = searchParams.get("retry") === "true";
  const isWorker = userType === "worker";
  const themeColor = isWorker ? "#8b5cf6" : "#ec4899";
  const themeGradient = isWorker
    ? "linear-gradient(135deg, #8b5cf6, #7c3aed)"
    : "linear-gradient(135deg, #ec4899, #be185d)";

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [turnCount, setTurnCount] = useState(0);
  const [selfMbti, setSelfMbti] = useState("");
  const [mbtiAsked, setMbtiAsked] = useState(false);
  const [started, setStarted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading, analyzing]);

  const startInterview = async () => {
    setStarted(true);
    setLoading(true);
    setError(null);
    try {
      const seed: Message[] = [{ role: "user", content: "인터뷰 시작해줘" }];
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: seed, userType, mode: "interview" }),
      });
      if (!res.ok) throw new Error("서버 오류");
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "오류");
      setMessages([{ role: "assistant", content: data.message }]);
    } catch {
      setError("인터뷰를 시작할 수 없어요. 다시 시도해주세요.");
      setStarted(false);
    } finally {
      setLoading(false);
    }
  };

  const sendMessage = async (text: string) => {
    if (!text.trim() || loading || analyzing) return;
    setInput("");
    const newMessages: Message[] = [...messages, { role: "user", content: text }];
    setMessages(newMessages);
    const newTurn = turnCount + 1;
    setTurnCount(newTurn);

    const isLastTurn = newTurn >= MAX_TURNS;

    if (isLastTurn) {
      await analyzeResult(newMessages);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: newMessages,
          userType,
          mode: "interview",
          forceFinish: isLastTurn,
        }),
      });
      if (!res.ok) throw new Error("서버 오류");
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "오류");

      if (data.isReady || isLastTurn) {
        await analyzeResult([...newMessages, { role: "assistant", content: data.message || "" }]);
      } else {
        setMessages((prev) => [...prev, { role: "assistant", content: data.message }]);
        if (!mbtiAsked && newTurn === 2) {
          setMbtiAsked(true);
        }
      }
    } catch {
      setError("응답을 받지 못했어요. 다시 시도해주세요.");
      setTurnCount((t) => t - 1);
      setMessages(messages);
    } finally {
      setLoading(false);
    }
  };

  const analyzeResult = async (finalMessages: Message[]) => {
    setAnalyzing(true);
    setError(null);
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: finalMessages,
          userType,
          selfMbti: selfMbti || "모름",
          mode: "analyze",
        }),
      });
      if (!res.ok) throw new Error("서버 오류");
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "오류");

      localStorage.setItem(`interview_result_basic_${userType}`, JSON.stringify(data.result));

      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        const updateField = userType === "worker" ? "worker_result" : "employer_result";
        await supabase.from("users").update({ [updateField]: data.result }).eq("id", session.user.id);
      }

      router.replace(`/result?type=${userType}`);
    } catch {
      setError("분석 중 오류가 발생했어요. 잠시 후 다시 시도해주세요.");
      setAnalyzing(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  const progressPct = Math.min((turnCount / MAX_TURNS) * 100, 100);

  if (!started) {
    return (
      <main style={{ minHeight: "100vh", background: "var(--bg)", color: "var(--text)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "24px 20px" }}>
        <div style={{ maxWidth: 420, width: "100%", textAlign: "center" }}>
          <div style={{ fontSize: 64, marginBottom: 16 }}>{isWorker ? "⚡" : "🏪"}</div>
          <h1 style={{ fontSize: 22, fontWeight: 900, margin: "0 0 10px", letterSpacing: "-0.5px" }}>
            {isWorker ? "알바생 성향 분석" : "사장님 성향 분석"}
          </h1>
          <p style={{ fontSize: 14, color: "var(--text-muted)", margin: "0 0 8px", lineHeight: 1.7 }}>
            AI와 짧은 대화 {MAX_TURNS}턴으로<br />
            나에게 딱 맞는 상대를 찾아드려요
          </p>
          <div style={{ display: "flex", gap: 8, justifyContent: "center", marginBottom: 28, flexWrap: "wrap" }}>
            {["HEXACO 성격 분석", "직업 가치관", "매칭 유형"].map((tag) => (
              <span key={tag} style={{ fontSize: 11, background: `${themeColor}18`, border: `1px solid ${themeColor}40`, color: themeColor, padding: "4px 10px", borderRadius: 20, fontWeight: 600 }}>
                {tag}
              </span>
            ))}
          </div>

          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 16, padding: "14px 16px", marginBottom: 24, textAlign: "left" }}>
            <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "0 0 8px", fontWeight: 700 }}>💬 진행 방식</p>
            <p style={{ fontSize: 13, color: "var(--text)", margin: 0, lineHeight: 1.7 }}>
              AI가 한 번에 질문 1개씩 물어봐요.<br />
              솔직하게 답변할수록 정확한 결과가 나와요.
            </p>
          </div>

          {isRetry && (
            <p style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 16, background: "rgba(255,200,0,0.08)", border: "1px solid rgba(255,200,0,0.2)", borderRadius: 12, padding: "10px 14px" }}>
              ↺ 이전 결과를 지우고 다시 분석해요
            </p>
          )}

          <button
            onClick={startInterview}
            style={{ width: "100%", background: themeGradient, border: "none", color: "#fff", fontWeight: 800, padding: "16px", borderRadius: 16, cursor: "pointer", fontSize: 16, letterSpacing: "-0.3px" }}
          >
            {isWorker ? "⚡ 알바 성향 분석 시작" : "🏪 사장님 성향 분석 시작"}
          </button>
          <button
            onClick={() => router.back()}
            style={{ marginTop: 12, background: "none", border: "none", color: "var(--text-muted)", fontSize: 13, cursor: "pointer", padding: "8px" }}
          >
            돌아가기
          </button>
        </div>
      </main>
    );
  }

  return (
    <main style={{ minHeight: "100vh", background: "var(--bg)", color: "var(--text)", display: "flex", flexDirection: "column" }}>
      {/* 헤더 */}
      <div style={{ position: "sticky", top: 0, zIndex: 30, background: "var(--nav-bg, var(--surface))", backdropFilter: "blur(12px)", borderBottom: "1px solid var(--border)" }}>
        <div style={{ maxWidth: 480, margin: "0 auto", padding: "10px 16px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <button onClick={() => router.back()} style={{ background: "none", border: "none", cursor: "pointer", padding: "4px 8px 4px 0", color: "var(--text-muted)", fontSize: 18 }}>←</button>
              <span style={{ fontSize: 14, fontWeight: 700 }}>
                {isWorker ? "⚡ 알바 성향 분석" : "🏪 사장님 성향 분석"}
              </span>
            </div>
            <span style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 600 }}>
              {Math.min(turnCount, MAX_TURNS)}/{MAX_TURNS}턴
            </span>
          </div>
          {/* 진행 바 */}
          <div style={{ height: 4, background: "var(--progress-track, rgba(0,0,0,0.1))", borderRadius: 4, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${progressPct}%`, background: themeGradient, borderRadius: 4, transition: "width 0.4s ease" }} />
          </div>
        </div>
      </div>

      {/* 채팅 영역 */}
      <div style={{ flex: 1, overflowY: "auto", padding: "16px", maxWidth: 480, margin: "0 auto", width: "100%" }}>
        {messages.map((msg, i) => (
          <div key={i} style={{ display: "flex", justifyContent: msg.role === "user" ? "flex-end" : "flex-start", marginBottom: 12 }}>
            {msg.role === "assistant" && (
              <div style={{ width: 32, height: 32, borderRadius: "50%", background: themeGradient, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, marginRight: 8, flexShrink: 0, marginTop: 2 }}>
                🤖
              </div>
            )}
            <div style={{
              maxWidth: "78%",
              background: msg.role === "user"
                ? themeGradient
                : "var(--surface)",
              border: msg.role === "user" ? "none" : "1px solid var(--border)",
              color: msg.role === "user" ? "#fff" : "var(--text)",
              padding: "10px 14px",
              borderRadius: msg.role === "user" ? "18px 18px 4px 18px" : "18px 18px 18px 4px",
              fontSize: 14,
              lineHeight: 1.6,
              whiteSpace: "pre-wrap",
            }}>
              {msg.content}
            </div>
          </div>
        ))}

        {/* 로딩 버블 */}
        {(loading || analyzing) && (
          <div style={{ display: "flex", justifyContent: "flex-start", marginBottom: 12 }}>
            <div style={{ width: 32, height: 32, borderRadius: "50%", background: themeGradient, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, marginRight: 8, flexShrink: 0, marginTop: 2 }}>
              🤖
            </div>
            <div style={{ background: "var(--surface)", border: "1px solid var(--border)", padding: "12px 16px", borderRadius: "18px 18px 18px 4px" }}>
              {analyzing ? (
                <span style={{ fontSize: 13, color: "var(--text-muted)" }}>분석 중... ✨</span>
              ) : (
                <span style={{ display: "flex", gap: 4 }}>
                  {[0, 1, 2].map((i) => (
                    <span key={i} style={{ width: 6, height: 6, borderRadius: "50%", background: themeColor, display: "inline-block", animation: `bounce 1.2s ease-in-out ${i * 0.2}s infinite` }} />
                  ))}
                </span>
              )}
            </div>
          </div>
        )}

        {error && (
          <div style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 12, padding: "10px 14px", marginBottom: 12, fontSize: 13, color: "#f87171" }}>
            {error}
            <button onClick={() => setError(null)} style={{ marginLeft: 8, background: "none", border: "none", color: "#f87171", cursor: "pointer", fontSize: 11, textDecoration: "underline" }}>닫기</button>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* MBTI 빠른입력 (턴2) */}
      {mbtiAsked && !selfMbti && turnCount === 2 && (
        <div style={{ maxWidth: 480, margin: "0 auto", width: "100%", padding: "0 16px 8px" }}>
          <p style={{ fontSize: 11, color: "var(--text-muted)", margin: "0 0 6px" }}>MBTI를 알고 있다면 입력해주세요 (선택)</p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {["ISTJ","ISFJ","INFJ","INTJ","ISTP","ISFP","INFP","INTP","ESTP","ESFP","ENFP","ENTP","ESTJ","ESFJ","ENFJ","ENTJ","모름"].map((m) => (
              <button key={m} onClick={() => setSelfMbti(m)}
                style={{ fontSize: 11, padding: "4px 10px", borderRadius: 20, cursor: "pointer", border: `1px solid ${selfMbti === m ? themeColor : "var(--border)"}`, background: selfMbti === m ? `${themeColor}20` : "var(--surface)", color: selfMbti === m ? themeColor : "var(--text-muted)", fontWeight: selfMbti === m ? 700 : 400 }}>
                {m}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 입력창 */}
      <div style={{ borderTop: "1px solid var(--border)", background: "var(--nav-bg, var(--surface))", padding: "10px 16px", paddingBottom: "calc(10px + env(safe-area-inset-bottom))", maxWidth: 480, margin: "0 auto", width: "100%" }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={analyzing ? "분석 중..." : loading ? "기다려주세요..." : "답변을 입력하세요"}
            disabled={loading || analyzing || !started}
            style={{ flex: 1, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 24, padding: "10px 16px", fontSize: 14, color: "var(--text)", outline: "none" }}
          />
          <button
            onClick={() => sendMessage(input)}
            disabled={!input.trim() || loading || analyzing}
            style={{ width: 42, height: 42, borderRadius: "50%", background: !input.trim() || loading || analyzing ? "var(--surface)" : themeGradient, border: `1px solid ${!input.trim() || loading || analyzing ? "var(--border)" : "transparent"}`, color: !input.trim() || loading || analyzing ? "var(--text-muted)" : "#fff", cursor: !input.trim() || loading || analyzing ? "default" : "pointer", fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}
          >
            ↑
          </button>
        </div>
        {turnCount > 0 && turnCount < MAX_TURNS && (
          <p style={{ fontSize: 11, color: "var(--text-muted)", margin: "6px 0 0", textAlign: "center" }}>
            {MAX_TURNS - turnCount}턴 남았어요
          </p>
        )}
      </div>

      <style>{`
        @keyframes bounce {
          0%, 60%, 100% { transform: translateY(0); }
          30% { transform: translateY(-4px); }
        }
      `}</style>
    </main>
  );
}

export default function InterviewPage() {
  return (
    <Suspense fallback={
      <main style={{ minHeight: "100vh", background: "var(--bg)", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <p style={{ color: "var(--text-muted)", fontSize: 13 }}>불러오는 중...</p>
      </main>
    }>
      <InterviewContent />
    </Suspense>
  );
}
