"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter, useParams } from "next/navigation";
import { supabase } from "@/lib/supabase";

interface Message { role: "user" | "assistant"; content: string; }

export default function PreMeetPage() {
  const router = useRouter();
  const params = useParams();
  const matchId = params.matchId as string;

  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [myRole, setMyRole] = useState<"worker" | "employer">("worker");
  const [botProfile, setBotProfile] = useState<any>(null);
  const [myProfile, setMyProfile] = useState<any>(null);
  const [matchInfo, setMatchInfo] = useState<any>(null);
  const [botMode, setBotMode] = useState<"employer" | "worker">("employer");
  const MAX_TURNS = 10;
  const userTurns = messages.filter(m => m.role === "user").length;
  const isMaxReached = userTurns >= MAX_TURNS;

  const [summarizing, setSummarizing] = useState(false);

  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleGoToChat = async () => {
    setSummarizing(true);
    try {
      await fetch("/api/pre-meet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "summarize",
          messages,
          botType: botMode,
          botProfile,
          matchId,
          userId: myProfile?.id,
        }),
      });
    } catch {}
    router.replace(`/chat/${matchId}`);
  };

  useEffect(() => { init(); }, []);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const init = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { router.push("/login"); return; }

    const uid = session.user.id;

    // 매치 정보 조회
    const { data: match } = await supabase
      .from("matches")
      .select("*")
      .eq("id", matchId)
      .single();

    if (!match) { router.back(); return; }
    setMatchInfo(match);

    // 내 역할 파악
    const role = match.worker_id === uid ? "worker" : "employer";
    setMyRole(role);

    // 봇 역할 = 상대방
    const botRole = role === "worker" ? "employer" : "worker";
    setBotMode(botRole);

    // 내 프로필
    const { data: myData } = await supabase.from("users").select("*").eq("id", uid).single();
    setMyProfile(myData);

    // 상대방 프로필 + 공고 정보
    const counterpartId = role === "worker" ? match.employer_id : match.worker_id;
    const { data: counterData } = await supabase.from("users").select("*").eq("id", counterpartId).single();

    if (botRole === "employer") {
      // 사장님 봇 → 공고 정보도 가져오기
      const { data: jobData } = await supabase
        .from("employer_profiles")
        .select("*")
        .eq("user_id", counterpartId)
        .single();
      setBotProfile({ ...counterData, ...jobData, result: counterData?.employer_result });
    } else {
      // 알바생 봇
      const { data: workerData } = await supabase
        .from("worker_profiles")
        .select("*")
        .eq("user_id", counterpartId)
        .single();
      setBotProfile({ ...counterData, ...workerData, result: counterData?.worker_result });
    }

    // 오프너 메시지
    const openerMsg = botRole === "employer"
      ? `안녕하세요! 저는 ${counterData?.nickname || "사장님"}을 대신하는 파잡봇이에요 🤖\n매장에 대해 궁금한 점이 있으면 편하게 물어보세요!\n근무 환경, 분위기, 업무 내용 등 뭐든지 OK예요 😊`
      : `안녕하세요! 저는 ${counterData?.nickname || "지원자"}를 대신하는 파잡봇이에요 🤖\n지원자에 대해 궁금한 점이 있으면 편하게 물어보세요!\n성향, 경력, 희망 조건 등 뭐든지 OK예요 😊`;

    setMessages([{ role: "assistant", content: openerMsg }]);
    setLoading(false);
  };

  const sendMessage = async (overrideText?: string) => {
    const text = overrideText || input.trim();
    if (!text || sending) return;
    setInput("");

    const newMessages: Message[] = [...messages, { role: "user", content: text }];
    setMessages(newMessages);
    setSending(true);

    try {
      const res = await fetch("/api/pre-meet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: newMessages,
          botType: botMode,
          botProfile,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setMessages(prev => [...prev, { role: "assistant", content: data.message }]);
      }
    } catch {}
    setSending(false);
    inputRef.current?.focus();
  };

  const isWorkerBot = botMode === "worker";
  const themeColor = isWorkerBot ? "#8b5cf6" : "#ec4899";
  const themeGradient = isWorkerBot
    ? "linear-gradient(135deg, #8b5cf6, #7c3aed)"
    : "linear-gradient(135deg, #ec4899, #be185d)";
  const botName = botProfile
    ? (isWorkerBot ? `${botProfile.nickname || botProfile.name || "지원자"} 봇` : `${botProfile.business_name || "매장"} 봇`)
    : "파잡봇";
  const botEmoji = isWorkerBot ? "⚡" : "🏪";

  if (loading) return (
    <main style={{ minHeight: "100vh", background: "var(--bg)", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 36, marginBottom: 12 }}>🤖</div>
        <p style={{ color: "var(--text-muted)" }}>파잡봇 준비 중...</p>
      </div>
    </main>
  );

  return (
    <main style={{ height: "100vh", background: "var(--bg)", color: "var(--text)", display: "flex", flexDirection: "column", maxWidth: 480, margin: "0 auto", position: "relative" }}>

      {/* 헤더 */}
      <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 12, background: "rgba(24,24,27,0.97)", backdropFilter: "blur(12px)" }}>
        <button onClick={() => router.back()} style={{ background: "none", border: "none", color: "var(--text-muted)", fontSize: 20, cursor: "pointer" }}>←</button>
        <div style={{ width: 40, height: 40, borderRadius: "50%", background: themeGradient, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0 }}>
          🤖
        </div>
        <div style={{ flex: 1 }}>
          <p style={{ fontSize: 14, fontWeight: 700, margin: 0 }}>{botName}</p>
          <p style={{ fontSize: 11, color: "var(--text-muted)", margin: 0 }}>AI 사전 미팅 {botEmoji}</p>
        </div>
        <button onClick={handleGoToChat} disabled={summarizing || messages.length < 2}
          style={{ background: messages.length >= 2 ? themeGradient : "var(--surface2)", border: "none", color: messages.length >= 2 ? "#fff" : "var(--text-muted)", fontSize: 12, fontWeight: 600, padding: "6px 14px", borderRadius: 20, cursor: messages.length >= 2 ? "pointer" : "default" }}>
          {summarizing ? "요약 중..." : "💬 채팅 시작"}
        </button>
      </div>

      {/* 안내 배너 */}
      <div style={{ background: `${themeColor}15`, borderBottom: `1px solid ${themeColor}30`, padding: "10px 16px", display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 16 }}>💡</span>
        <p style={{ fontSize: 12, color: "var(--text-muted)", margin: 0, lineHeight: 1.5 }}>
          {myRole === "worker"
            ? "매장에 대해 궁금한 것을 자유롭게 물어보세요. AI가 사장님을 대신해 답변해요."
            : "지원자에 대해 궁금한 것을 자유롭게 물어보세요. AI가 지원자를 대신해 답변해요."}
        </p>
      </div>

      {/* 메시지 목록 */}
      <div style={{ flex: 1, overflowY: "auto", padding: "16px" }}>
        {messages.map((msg, i) => (
          <div key={i} style={{ display: "flex", justifyContent: msg.role === "user" ? "flex-end" : "flex-start", marginBottom: 12, alignItems: "flex-end", gap: 8 }}>
            {msg.role === "assistant" && (
              <div style={{ width: 32, height: 32, borderRadius: "50%", background: themeGradient, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, flexShrink: 0 }}>
                🤖
              </div>
            )}
            <div style={{
              maxWidth: "78%",
              background: msg.role === "user" ? "linear-gradient(135deg, #3f3f46, #27272a)" : "var(--surface)",
              border: msg.role === "user" ? "none" : `1px solid ${themeColor}30`,
              borderRadius: msg.role === "user" ? "18px 18px 4px 18px" : "4px 18px 18px 18px",
              padding: "10px 14px",
              fontSize: 14,
              lineHeight: 1.6,
              color: "var(--text)",
              whiteSpace: "pre-line",
            }}>
              {msg.content}
            </div>
          </div>
        ))}

        {/* 로딩 */}
        {sending && (
          <div style={{ display: "flex", alignItems: "flex-end", gap: 8, marginBottom: 12 }}>
            <div style={{ width: 32, height: 32, borderRadius: "50%", background: themeGradient, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}>🤖</div>
            <div style={{ background: "var(--surface)", border: `1px solid ${themeColor}30`, borderRadius: "4px 18px 18px 18px", padding: "12px 16px" }}>
              <div style={{ display: "flex", gap: 4 }}>
                {[0, 1, 2].map(i => (
                  <div key={i} style={{ width: 6, height: 6, borderRadius: "50%", background: themeColor, animation: `bounce 1.2s ${i * 0.2}s infinite` }} />
                ))}
              </div>
            </div>
          </div>
        )}

        {/* 추천 질문 (처음에만) */}
        {messages.length === 1 && (
          <div style={{ marginTop: 8 }}>
            <p style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 8 }}>💬 이런 것도 물어볼 수 있어요</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {(myRole === "worker" ? [
                "매장 분위기가 어때요?",
                "교육은 어떻게 진행되나요?",
                "야근이나 추가 근무가 자주 있나요?",
                "식사 제공되나요?",
              ] : [
                "왜 이 일을 하려고 하나요?",
                "이전 알바 경험이 있나요?",
                "장기로 일할 생각이 있나요?",
                "어떤 환경에서 일할 때 가장 좋은가요?",
              ]).map(q => (
                <button key={q} onClick={() => sendMessage(q)}
                  style={{ background: "var(--surface)", border: `1px solid ${themeColor}30`, borderRadius: 20, padding: "8px 14px", fontSize: 12, color: "var(--text-muted)", cursor: "pointer", textAlign: "left" }}>
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        <div ref={bottomRef} />

        {/* 대화 중 언제든 채팅 시작 가능 (2턴 이상) */}
        {!isMaxReached && userTurns >= 2 && (
          <div style={{ textAlign: "center", margin: "8px 0" }}>
            <button onClick={handleGoToChat} disabled={summarizing}
              style={{ background: "none", border: `1px solid ${themeColor}40`, color: themeColor, fontSize: 12, padding: "7px 16px", borderRadius: 20, cursor: "pointer" }}>
              {summarizing ? "요약 중..." : "✓ 충분해요, 채팅 시작하기"}
            </button>
          </div>
        )}

        {/* 10턴 도달 시 종료 */}
        {isMaxReached && (
          <div style={{ margin: "12px 0", textAlign: "center" }}>
            <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 16, padding: "16px", display: "inline-block", maxWidth: "90%" }}>
              <p style={{ fontSize: 13, color: "var(--text-muted)", margin: "0 0 12px", lineHeight: 1.6 }}>
                질문 횟수를 모두 사용했어요 😊<br />이제 직접 대화해보세요!
              </p>
              <button onClick={handleGoToChat} disabled={summarizing}
                style={{ background: isWorkerBot ? "linear-gradient(135deg, #8b5cf6, #7c3aed)" : "linear-gradient(135deg, #ec4899, #be185d)", border: "none", color: "#fff", fontWeight: 700, padding: "10px 20px", borderRadius: 20, cursor: "pointer", fontSize: 13 }}>
                {summarizing ? "요약 전송 중..." : "💬 채팅 시작하기 →"}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 입력창 */}
      <div style={{ borderTop: "1px solid var(--border)", padding: "10px 16px", background: "rgba(24,24,27,0.97)", backdropFilter: "blur(12px)", paddingBottom: "calc(10px + env(safe-area-inset-bottom))" }}>
        {isMaxReached ? (
          <div style={{ textAlign: "center", padding: "8px 0" }}>
            <p style={{ fontSize: 12, color: "var(--text-muted)", margin: 0 }}>AI 사전미팅이 종료됐어요</p>
          </div>
        ) : (
        <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
          <input ref={inputRef} type="text" value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
            placeholder={`궁금한 것을 물어보세요... (${MAX_TURNS - userTurns}회 남음)`}
            style={{ flex: 1, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 20, padding: "10px 16px", color: "var(--text)", fontSize: 14, outline: "none" }} />
          <button onClick={() => sendMessage()} disabled={!input.trim() || sending}
            style={{ width: 42, height: 42, borderRadius: "50%", background: input.trim() ? themeGradient : "var(--surface2)", border: "none", color: "#fff", fontSize: 18, cursor: input.trim() ? "pointer" : "default", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            ↑
          </button>
        </div>
        )}
      </div>

      <style>{`
        @keyframes bounce { 0%, 80%, 100% { transform: translateY(0); } 40% { transform: translateY(-6px); } }
      `}</style>
    </main>
  );
}
