"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { cardStyle, btnPrimary, btnSecondary, btnDanger } from "@/lib/styles";

const THEMES = [{ id: "purple", label: "퍼플", from: "#7c3aed", to: "#ec4899" }];

const STYLES = [
  { id: "friendly", label: "친근하게 😊", desc: "편안하고 따뜻한 대화" },
  { id: "professional", label: "전문적으로 💼", desc: "정확하고 실용적인 조언" },
  { id: "direct", label: "직설적으로 ⚡", desc: "간결하고 핵심만" },
];

const SPEECH = [
  { id: "formal", label: "존댓말", desc: "~요, ~습니다" },
  { id: "casual", label: "반말", desc: "~야, ~해줄게" },
];

export default function PazSettingsPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [theme, setTheme] = useState("purple");
  const [style, setStyle] = useState("friendly");
  const [speech, setSpeech] = useState("formal");
  const [autoSpeak, setAutoSpeak] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState<"history" | "memory" | null>(null);
  const [toast, setToast] = useState("");

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 3000);
  };

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) { router.push("/login"); return; }
      setUser(data.user);
      loadSettings(data.user.id);
    });
  }, []);

  async function loadSettings(userId: string) {
    const { data } = await supabase.from("users")
      .select("paz_theme, paz_style, paz_speech, paz_auto_speak")
      .eq("id", userId).maybeSingle();
    if (data) {
      setTheme(data.paz_theme || "purple");
      setStyle(data.paz_style || "friendly");
      setSpeech(data.paz_speech || "formal");
      setAutoSpeak(data.paz_auto_speak || false);
    }
  }

  async function saveSettings() {
    if (!user) return;
    setSaving(true);
    await supabase.from("users").update({
      paz_theme: theme,
      paz_style: style,
      paz_speech: speech,
      paz_auto_speak: autoSpeak,
    }).eq("id", user.id);
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  async function resetHistory() {
    if (!user) return;
    await supabase.from("paz_chats").delete().eq("user_id", user.id);
    setShowResetConfirm(null);
    showToast("대화 이력이 초기화됐어요.");
  }

  async function resetMemory() {
    if (!user) return;
    await supabase.from("users").update({ paz_knowledge: null }).eq("id", user.id);
    setShowResetConfirm(null);
    showToast("장기 기억이 초기화됐어요.");
  }

  const currentTheme = THEMES.find(t => t.id === theme) || THEMES[0];

  return (
    <main style={{ minHeight: "100vh", background: "var(--bg)", maxWidth: 480, margin: "0 auto", paddingBottom: 40 }}>

      {/* 토스트 */}
      {toast && (
        <div style={{ position: "fixed", top: 20, left: "50%", transform: "translateX(-50%)", background: "rgba(24,24,27,0.97)", border: "1px solid var(--border)", color: "#fff", fontSize: 13, padding: "12px 20px", borderRadius: 20, zIndex: 300, whiteSpace: "nowrap" }}>
          {toast}
        </div>
      )}

      {/* 헤더 */}
      <div style={{ padding: "16px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 12, background: "var(--surface)", position: "sticky", top: 0, zIndex: 10 }}>
        <button onClick={() => router.back()} style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", padding: 4 }}>
          <i className="ti ti-arrow-left" style={{ fontSize: 20, display: "block" }} aria-hidden="true" />
        </button>
        <span style={{ fontSize: 16, fontWeight: 700, color: "var(--text)" }}>PAZ 설정</span>
      </div>

      <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 16 }}>

        {/* PAZ 미리보기 */}
        <div style={{ ...cardStyle, padding: 20, display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ width: 56, height: 56, borderRadius: "50%", background: `linear-gradient(135deg, ${currentTheme.from}, ${currentTheme.to})`, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: `0 4px 16px ${currentTheme.from}55`, flexShrink: 0 }}>
            <i className="ti ti-robot" style={{ fontSize: 26, color: "#fff" }} aria-hidden="true" />
          </div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text)" }}>PAZ</div>
            <div style={{ fontSize: 12, color: "var(--text-muted)" }}>AI 인사·커리어 에이전트</div>
          </div>
        </div>

        

        {/* 대화 스타일 */}
        <div style={{ ...cardStyle }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: "var(--text)", margin: "0 0 12px" }}>대화 스타일</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {STYLES.map(st => (
              <button key={st.id} onClick={() => setStyle(st.id)}
                style={{ display: "flex", alignItems: "center", gap: 12, background: style === st.id ? "var(--surface2)" : "none", border: `1px solid ${style === st.id ? currentTheme.from : "var(--border)"}`, borderRadius: 12, padding: "10px 12px", cursor: "pointer", textAlign: "left" }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, color: "var(--text)", fontWeight: style === st.id ? 700 : 400 }}>{st.label}</div>
                  <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{st.desc}</div>
                </div>
                {style === st.id && <span style={{ color: currentTheme.from }}>✓</span>}
              </button>
            ))}
          </div>
        </div>

        {/* 말투 */}
        <div style={{ ...cardStyle }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: "var(--text)", margin: "0 0 12px" }}>말투</p>
          <div style={{ display: "flex", gap: 8 }}>
            {SPEECH.map(sp => (
              <button key={sp.id} onClick={() => setSpeech(sp.id)}
                style={{ flex: 1, background: speech === sp.id ? `linear-gradient(135deg, ${currentTheme.from}, ${currentTheme.to})` : "var(--surface2)", border: "none", borderRadius: 12, padding: "12px", cursor: "pointer", color: speech === sp.id ? "#fff" : "var(--text-muted)", fontWeight: speech === sp.id ? 700 : 400, fontSize: 13 }}>
                <div>{sp.label}</div>
                <div style={{ fontSize: 10, opacity: 0.7, marginTop: 2 }}>{sp.desc}</div>
              </button>
            ))}
          </div>
        </div>

        {/* 자동 읽기 */}
        <div style={{ ...cardStyle, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <p style={{ fontSize: 13, fontWeight: 700, color: "var(--text)", margin: "0 0 2px" }}>자동 읽기 (TTS)</p>
            <p style={{ fontSize: 11, color: "var(--text-muted)", margin: 0 }}>PAZ 답변을 자동으로 음성으로 읽어줘요</p>
          </div>
          <button onClick={() => setAutoSpeak(!autoSpeak)}
            style={{ width: 48, height: 28, borderRadius: 14, background: autoSpeak ? `linear-gradient(135deg, ${currentTheme.from}, ${currentTheme.to})` : "var(--surface2)", border: "none", cursor: "pointer", position: "relative", transition: "background 0.2s", flexShrink: 0 }}>
            <div style={{ position: "absolute", top: 3, left: autoSpeak ? 23 : 3, width: 22, height: 22, borderRadius: "50%", background: "#fff", transition: "left 0.2s", boxShadow: "0 1px 4px rgba(0,0,0,0.3)" }} />
          </button>
        </div>

        {/* 저장 버튼 */}
        <button onClick={saveSettings} disabled={saving}
          style={{ ...btnPrimary, fontSize: 15, opacity: saving ? 0.7 : 1 }}>
          {saved ? "✅ 저장됐어요!" : saving ? "저장 중..." : "설정 저장하기"}
        </button>

        {/* 데이터 관리 */}
        <div style={{ ...cardStyle }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: "var(--text)", margin: "0 0 12px" }}>데이터 관리</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <button onClick={() => setShowResetConfirm("history")}
              style={{ ...btnDanger, textAlign: "left" as const, borderRadius: 12 }}>
              🗑 대화 이력 전체 삭제
            </button>
            <button onClick={() => setShowResetConfirm("memory")}
              style={{ ...btnDanger, textAlign: "left" as const, borderRadius: 12 }}>
              🧠 장기 기억 초기화
            </button>
          </div>
        </div>
      </div>

      {/* 초기화 확인 모달 */}
      {showResetConfirm && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
          <div style={{ background: "var(--surface)", borderRadius: 20, padding: 24, width: "100%", maxWidth: 320 }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, margin: "0 0 8px", color: "var(--text)" }}>
              {showResetConfirm === "history" ? "대화 이력 삭제" : "장기 기억 초기화"}
            </h3>
            <p style={{ fontSize: 13, color: "var(--text-muted)", margin: "0 0 20px", lineHeight: 1.6 }}>
              {showResetConfirm === "history" ? "PAZ와 나눈 모든 대화가 삭제돼요. 되돌릴 수 없어요." : "PAZ가 기억하고 있는 내용이 초기화돼요. 되돌릴 수 없어요."}
            </p>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => setShowResetConfirm(null)}
                style={{ ...btnSecondary, flex: 1, borderRadius: 12 }}>취소</button>
              <button onClick={showResetConfirm === "history" ? resetHistory : resetMemory}
                style={{ ...btnDanger, flex: 1, borderRadius: 12, background: "#ef4444", color: "#fff" }}>초기화</button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}