"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import AppHeader from "@/components/AppHeader";
import { REGIONS, parseRegion } from "@/lib/regions";

export default function SettingsPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [notifyLovecall, setNotifyLovecall] = useState(true);
  const [notifyChat, setNotifyChat] = useState(true);
  const [notifyPaz, setNotifyPaz] = useState(true);
  const [saving, setSaving] = useState(false);

  // 내 정보
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [sido, setSido] = useState("");
  const [gugun, setGugun] = useState("");
  const [infoSaving, setInfoSaving] = useState(false);
  const [infoSaved, setInfoSaved] = useState(false);

  const APP_VERSION = "1.0.0";

  useEffect(() => {
    supabase.auth.getUser().then((res) => {
      const user = res.data.user;
      if (!user) { router.push("/login"); return; }
      setUser(user);
      loadSettings(user.id);
    });
  }, []);

  async function loadSettings(userId: string) {
    type UserSettings = { notify_lovecall: boolean; notify_chat: boolean; notify_paz: boolean; nickname: string; phone: string; birth_date: string; region: string };
    const result = await supabase.from("users")
      .select("notify_lovecall, notify_chat, notify_paz, nickname, phone, birth_date, region")
      .eq("id", userId).maybeSingle();
    const data = result.data as UserSettings | null;
    if (data) {
      setNotifyLovecall(data.notify_lovecall ?? true);
      setNotifyChat(data.notify_chat ?? true);
      setNotifyPaz(data.notify_paz ?? true);
      setName(data.nickname || "");
      setPhone(data.phone || "");
      setBirthDate(data.birth_date || "");
      const { sido: s, gugun: g } = parseRegion(data.region || "");
      setSido(s);
      setGugun(g);
    }
  }

  async function saveNotify(key: string, value: boolean) {
    if (!user) return;
    setSaving(true);
    await supabase.from("users").update({ [key]: value }).eq("id", user.id);
    setSaving(false);
  }

  async function saveInfo() {
    if (!user) return;
    setInfoSaving(true);
    const region = [sido, gugun].filter(Boolean).join(" ");
    await supabase.from("users").update({
      name: name || null,
      phone: phone || null,
      birth_date: birthDate || null,
      region: region || null,
    }).eq("id", user.id);
    setInfoSaving(false);
    setInfoSaved(true);
    setTimeout(() => setInfoSaved(false), 2000);
  }

  const inputStyle: React.CSSProperties = {
    width: "100%", background: "var(--surface2)", border: "1px solid var(--border)",
    borderRadius: 10, padding: "10px 12px", color: "var(--text)", fontSize: 14,
    outline: "none", boxSizing: "border-box",
  };
  const selectStyle: React.CSSProperties = { ...inputStyle, appearance: "none" };

  function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
    return (
      <button onClick={() => onChange(!value)}
        style={{
          width: 44, height: 26, borderRadius: 13, border: "none", cursor: "pointer",
          background: value ? "linear-gradient(135deg, #7c3aed, #ec4899)" : "var(--surface2)",
          position: "relative", transition: "background 0.2s", flexShrink: 0,
        }}>
        <div style={{
          position: "absolute", top: 3, left: value ? 21 : 3,
          width: 20, height: 20, borderRadius: "50%", background: "#fff",
          transition: "left 0.2s", boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
        }} />
      </button>
    );
  }

  function Section({ title, children }: { title: string; children: React.ReactNode }) {
    return (
      <div style={{ marginBottom: 24 }}>
        <p style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", letterSpacing: 1, textTransform: "uppercase", margin: "0 0 8px 4px" }}>{title}</p>
        <div style={{ background: "var(--surface)", borderRadius: 16, border: "1px solid var(--border)", overflow: "hidden" }}>
          {children}
        </div>
      </div>
    );
  }

  function Row({ icon, label, sub, right, onClick, danger }: any) {
    return (
      <div onClick={onClick}
        style={{ background: "none", borderBottom: "1px solid var(--border)", padding: "14px 16px", display: "flex", alignItems: "center", gap: 12, cursor: onClick ? "pointer" : "default", textAlign: "left" }}
        onMouseEnter={e => onClick && ((e.currentTarget as HTMLElement).style.background = "var(--surface2)")}
        onMouseLeave={e => ((e.currentTarget as HTMLElement).style.background = "none")}>
        <span style={{ fontSize: 18, flexShrink: 0 }}>{icon}</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, color: danger ? "#ef4444" : "var(--text)", fontWeight: 500 }}>{label}</div>
          {sub && <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>{sub}</div>}
        </div>
        {right}
      </div>
    );
  }

  return (
    <main style={{ minHeight: "100vh", background: "var(--bg)", paddingBottom: 40 }}>
      <AppHeader title="설정" showBack />

      <div style={{ maxWidth: 480, margin: "0 auto", padding: "20px 16px" }}>

        {/* 내 정보 */}
        <div style={{ marginBottom: 24 }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", letterSpacing: 1, textTransform: "uppercase", margin: "0 0 8px 4px" }}>내 정보</p>
          <div style={{ background: "var(--surface)", borderRadius: 16, border: "1px solid var(--border)", padding: "16px" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div>
                <label style={{ fontSize: 11, color: "var(--text-muted)", display: "block", marginBottom: 4 }}>이름</label>
                <input style={inputStyle} value={name} onChange={e => setName(e.target.value)} placeholder="실명" />
              </div>
              <div>
                <label style={{ fontSize: 11, color: "var(--text-muted)", display: "block", marginBottom: 4 }}>연락처</label>
                <input style={inputStyle} value={phone} onChange={e => setPhone(e.target.value)} placeholder="010-0000-0000" />
              </div>
              <div>
                <label style={{ fontSize: 11, color: "var(--text-muted)", display: "block", marginBottom: 4 }}>생년월일</label>
                <input style={inputStyle} type="date" value={birthDate} onChange={e => setBirthDate(e.target.value)} />
              </div>
              <div>
                <label style={{ fontSize: 11, color: "var(--text-muted)", display: "block", marginBottom: 4 }}>거주 지역 <span style={{ fontSize: 10 }}>(매장·구직 등록 시 자동채움)</span></label>
                <div style={{ display: "flex", gap: 8 }}>
                  <select style={{ ...selectStyle, flex: 1 }} value={sido} onChange={e => { setSido(e.target.value); setGugun(""); }}>
                    <option value="">시/도</option>
                    {Object.keys(REGIONS).map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                  <select style={{ ...selectStyle, flex: 1 }} value={gugun} onChange={e => setGugun(e.target.value)} disabled={!sido}>
                    <option value="">구/군</option>
                    {(REGIONS[sido] || []).map(g => <option key={g} value={g}>{g}</option>)}
                  </select>
                </div>
              </div>
              <button onClick={saveInfo} disabled={infoSaving}
                style={{ background: infoSaved ? "#059669" : "linear-gradient(135deg,#7c3aed,#ec4899)", border: "none", borderRadius: 12, padding: "12px", color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer", transition: "background 0.2s" }}>
                {infoSaved ? "✓ 저장됐어요" : infoSaving ? "저장 중..." : "저장"}
              </button>
            </div>
          </div>
        </div>

        {/* 계정 */}
        <Section title="계정">
          <Row icon="📧" label="이메일" sub={user?.email} />
          <Row icon="🤖" label="PAZ 설정" sub="아바타, 이름, 테마 변경" onClick={() => router.push("/paz/settings")} right={<span style={{ color: "var(--text-muted)", fontSize: 14 }}>›</span>} />
          <Row icon="🚪" label="로그아웃" onClick={async () => { await supabase.auth.signOut(); router.push("/"); }} right={<span style={{ color: "var(--text-muted)", fontSize: 14 }}>›</span>} />
        </Section>

        {/* 알림 */}
        <Section title="알림">
          <Row icon="💌" label="러브콜 알림" sub="새 러브콜 도착 시 알림"
            right={<Toggle value={notifyLovecall} onChange={v => { setNotifyLovecall(v); saveNotify("notify_lovecall", v); }} />} />
          <Row icon="💬" label="채팅 알림" sub="새 메시지 도착 시 알림"
            right={<Toggle value={notifyChat} onChange={v => { setNotifyChat(v); saveNotify("notify_chat", v); }} />} />
          <Row icon="🤖" label="PAZ 알림" sub="PAZ 선제적 메시지 알림"
            right={<Toggle value={notifyPaz} onChange={v => { setNotifyPaz(v); saveNotify("notify_paz", v); }} />} />
        </Section>

        {/* 법적/정보 */}
        <Section title="정보">
          <Row icon="🔒" label="개인정보처리방침" onClick={() => router.push("/privacy")} right={<span style={{ color: "var(--text-muted)", fontSize: 14 }}>›</span>} />
          <Row icon="📄" label="서비스 이용약관" onClick={() => router.push("/terms")} right={<span style={{ color: "var(--text-muted)", fontSize: 14 }}>›</span>} />
          <Row icon="📱" label="앱 버전" sub={`v${APP_VERSION}`} right={<span style={{ fontSize: 12, color: "var(--text-muted)" }}>최신버전</span>} />
        </Section>

        {/* 계정 삭제 */}
        <Section title="위험 구역">
          <Row icon="🗑" label="계정 삭제" sub="모든 데이터가 삭제돼요" danger onClick={() => router.push("/delete-account")} right={<span style={{ color: "#ef4444", fontSize: 14 }}>›</span>} />
        </Section>

        {saving && (
          <p style={{ textAlign: "center", fontSize: 12, color: "var(--text-muted)" }}>저장 중...</p>
        )}
      </div>
    </main>
  );
}
