"use client";
import { useState, useEffect, useRef, Suspense } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import AppHeader from "@/components/AppHeader";
import { useToast } from "@/lib/useToast";
import { btnPrimary } from "@/lib/styles";
import { shareInvite } from "@/lib/inviteShare";
import TimeWheelPicker from "@/components/TimeWheelPicker";
import { canSendInvite } from "@/lib/permissions";

function generateCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return "PAZ-" + Array.from({length:4}, () => chars[Math.floor(Math.random()*chars.length)]).join("");
}

function InviteContent() {
  const router = useRouter();
  const { showToast, ToastUI } = useToast();

  const [user, setUser] = useState<any>(null);
  const [profiles, setProfiles] = useState<any[]>([]);
  const [selProfile, setSelProfile] = useState<any>(null);

  // 직원 검색
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const [selected, setSelected] = useState<any>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 근무 정보
  const [wage, setWage] = useState("");
  const [workDays, setWorkDays] = useState("");
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("18:00");

  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState<{ nick: string } | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      const u = data.user;
      if (!u) { router.push("/login"); return; }
      setUser(u);

      const { allowed } = await canSendInvite(supabase, u.id);
      if (!allowed) { showToast("초대 권한이 없습니다", "error"); router.push("/"); return; }

      // 매장 목록 로드
      const { data: ps } = await supabase.from("employer_profiles")
        .select("id, business_name, address, sigungu, eupmyeondong, wage, work_days, work_hours")
        .eq("user_id", u.id).order("created_at", { ascending: false });

      if (ps && ps.length > 0) {
        setProfiles(ps);
        selectProfile(ps[0]);
      }
    });
  }, []);

  function selectProfile(p: any) {
    setSelProfile(p);
    setWage(p.wage ? String(p.wage) : "");
    setWorkDays(p.work_days || "");
    const wh = p.work_hours || "";
    const parts = wh.split("~").map((s: string) => s.trim());
    if (parts.length === 2) { setStartTime(parts[0]); setEndTime(parts[1]); }
  }

  const [searching, setSearching] = useState(false);
  const [searchDone, setSearchDone] = useState(false);

  // 직원 검색
  const onQueryChange = (v: string) => {
    setQuery(v);
    setSelected(null);
    setSearchDone(false);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (!v.trim()) { setResults([]); setSearching(false); return; }
    setSearching(true);
    searchTimer.current = setTimeout(async () => {
      const { data } = await supabase.from("users")
        .select("id, nickname, avatar_url, user_type")
        .ilike("nickname", `%${v}%`)
        .neq("id", user?.id)
        .limit(8);
      setResults(data || []);
      setSearching(false);
      setSearchDone(true);
    }, 400);
  };

  const selectUser = (u: any) => {
    setSelected(u);
    setQuery(u.nickname || "");
    setResults([]);
  };

  const workHoursLabel = () => {
    const [sh, sm] = startTime.split(":").map(Number);
    const [eh, em] = endTime.split(":").map(Number);
    if (isNaN(sh) || isNaN(eh)) return "";
    const diff = ((eh * 60 + em) - (sh * 60 + sm) + 1440) % 1440;
    const h = Math.floor(diff / 60), m = diff % 60;
    return diff > 0 ? `⏱ ${h}시간${m > 0 ? ` ${m}분` : ""} 근무` : "";
  };

  async function sendInvite() {
    if (!user) return;
    if (!selProfile) { showToast("매장을 선택해주세요", "error"); return; }
    if (!selected) { showToast("초대할 직원을 검색해서 선택해주세요", "error"); return; }

    // 이미 팀원인지 확인
    const { data: existing } = await supabase.from("team_members")
      .select("id, status").eq("employer_id", user.id).eq("worker_id", selected.id).limit(1);
    if (existing && existing.length > 0) {
      showToast(`@${selected.nickname}님은 이미 팀원이에요`, "error");
      return;
    }

    // 미수락 초대장이 이미 있는지 확인
    const { data: pendingInvite } = await supabase.from("invite_codes")
      .select("id").eq("employer_id", user.id).is("used_at", null)
      .gt("expires_at", new Date().toISOString()).limit(1);
    // (코드별로 특정 유저 지정이 없으므로 중복 발송만 안내)

    setSending(true);

    try {
      const code = generateCode();
      const { error } = await supabase.from("invite_codes").insert({
        code,
        employer_id: user.id,
        employer_profile_id: selProfile.id,
        biz_name: selProfile.business_name,
        wage: wage ? parseInt(wage) : null,
        work_days: workDays || null,
        work_hours: `${startTime} ~ ${endTime}`,
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      });
      if (error) throw error;

      try {
        await fetch("/api/notifications", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userId: selected.id,
            type: "invite",
            title: `${selProfile.business_name}에서 초대장이 왔어요`,
            body: `${wage ? `시급 ${Number(wage).toLocaleString()}원` : ""} ${workDays || ""}`.trim(),
            data: { url: `/i/${code}` },
          }),
        });
        setSent({ nick: selected.nickname });
      } catch {
        await shareInvite({ storeName: selProfile.business_name, nick: selected.nickname, code });
        setSent({ nick: selected.nickname });
      }
    } catch (e: any) {
      showToast("오류: " + e.message, "error");
    }
    setSending(false);
  }

  const inputStyle = {
    width: "100%", background: "var(--surface2)", border: "1px solid var(--border)",
    borderRadius: 10, padding: "10px 12px", fontSize: 13, color: "var(--text)", outline: "none",
    boxSizing: "border-box" as const,
  };

  const profileLocation = (p: any) =>
    [p.eupmyeondong || p.sigungu, p.address].filter(Boolean).join(" · ") || "";

  if (sent) return (
    <main style={{ minHeight: "100vh", background: "var(--bg)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ textAlign: "center", maxWidth: 320 }}>
        <div style={{ fontSize: 56, marginBottom: 16 }}>📨</div>
        <h2 style={{ fontSize: 20, fontWeight: 900, color: "var(--text)", margin: "0 0 8px" }}>
          초대장을 보냈어요!
        </h2>
        <p style={{ fontSize: 14, color: "var(--text-muted)", margin: "0 0 28px", lineHeight: 1.6 }}>
          <span style={{ color: "#8b5cf6", fontWeight: 700 }}>@{sent.nick}</span>님이<br />수락하면 팀원으로 추가돼요
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <button onClick={() => router.push("/myteam")} style={{
            padding: "13px 0", borderRadius: 14, border: "none", cursor: "pointer",
            background: "linear-gradient(135deg, #8b5cf6, #7c3aed)", color: "#fff",
            fontSize: 15, fontWeight: 700,
          }}>
            우리 팀 보러 가기
          </button>
          <button onClick={() => { setSent(null); setSelected(null); setQuery(""); setResults([]); }} style={{
            padding: "13px 0", borderRadius: 14, border: "1px solid var(--border)", cursor: "pointer",
            background: "var(--surface2)", color: "var(--text-muted)",
            fontSize: 14, fontWeight: 600,
          }}>
            한 명 더 초대하기
          </button>
        </div>
      </div>
    </main>
  );

  return (
    <main style={{ minHeight: "100vh", background: "var(--bg)", paddingBottom: 80 }}>
      <AppHeader title="초대장 보내기" showBack />
      {ToastUI}

      <div style={{ maxWidth: 480, margin: "0 auto", padding: 16 }}>

        {/* 매장 선택 */}
        <div style={{ marginBottom: 16 }}>
          <p style={{ fontSize: 11, color: "var(--text-muted)", margin: "0 0 8px" }}>
            매장 선택 <span style={{ color: "#ef4444" }}>*</span>
          </p>
          {profiles.length === 0 ? (
            <div style={{ background: "var(--surface2)", borderRadius: 12, padding: "14px 16px", border: "1px solid var(--border)" }}>
              <p style={{ fontSize: 13, color: "var(--text-muted)", margin: 0 }}>등록된 매장이 없습니다</p>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {profiles.map(p => {
                const isSel = selProfile?.id === p.id;
                return (
                  <button key={p.id} onClick={() => selectProfile(p)} style={{
                    background: isSel ? "rgba(124,58,237,0.08)" : "var(--surface2)",
                    border: `1.5px solid ${isSel ? "#7c3aed" : "var(--border)"}`,
                    borderRadius: 12, padding: "12px 14px", cursor: "pointer",
                    textAlign: "left", display: "flex", alignItems: "center", gap: 10,
                  }}>
                    <div style={{
                      width: 36, height: 36, borderRadius: 10,
                      background: isSel ? "rgba(124,58,237,0.15)" : "var(--surface)",
                      display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                    }}>
                      <i className="ti ti-building-store" style={{ fontSize: 18, color: isSel ? "#7c3aed" : "var(--text-muted)" }} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: isSel ? "#7c3aed" : "var(--text)" }}>
                        {p.business_name || "매장명 없음"}
                      </p>
                      {profileLocation(p) && (
                        <p style={{ margin: "2px 0 0", fontSize: 11, color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          📍 {profileLocation(p)}
                        </p>
                      )}
                    </div>
                    {isSel && <i className="ti ti-circle-check-filled" style={{ fontSize: 18, color: "#7c3aed", flexShrink: 0 }} />}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* 직원 검색 */}
        <div style={{ marginBottom: 16, position: "relative" }}>
          <p style={{ fontSize: 11, color: "var(--text-muted)", margin: "0 0 6px" }}>
            직원 검색 <span style={{ color: "#ef4444" }}>*</span>
            <span style={{ marginLeft: 6, color: "var(--text-muted)", fontWeight: 400 }}>— 앱 닉네임으로 검색</span>
          </p>
          <div style={{ position: "relative" }}>
            <input
              value={query}
              onChange={e => onQueryChange(e.target.value)}
              placeholder="닉네임 검색..."
              style={{
                ...inputStyle,
                paddingLeft: 36,
                paddingRight: selected ? 36 : 12,
                border: selected ? "1.5px solid #7c3aed" : "1px solid var(--border)",
              }}
            />
            <i className="ti ti-search" style={{
              position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)",
              fontSize: 15, color: "var(--text-muted)", pointerEvents: "none",
            }} />
            {selected && (
              <button onClick={() => { setSelected(null); setQuery(""); }}
                style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: 16 }}>✕</button>
            )}
          </div>

          {/* 검색 상태 피드백 */}
          {searching && (
            <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "6px 0 0", paddingLeft: 4 }}>🔍 검색 중...</p>
          )}
          {!searching && searchDone && !selected && query.trim() && results.length === 0 && (
            <p style={{ fontSize: 12, color: "#ef4444", margin: "6px 0 0", paddingLeft: 4 }}>❌ '{query}' 닉네임을 가진 유저가 없어요</p>
          )}
          {!searching && searchDone && !selected && results.length > 0 && (
            <p style={{ fontSize: 12, color: "#f59e0b", margin: "6px 0 0", paddingLeft: 4 }}>👇 {results.length}명 찾았어요 — 아래에서 선택하세요</p>
          )}

          {/* 검색 결과 드롭다운 */}
          {results.length > 0 && (
            <div style={{
              position: "absolute", left: 0, right: 0, top: "calc(100% + 4px)",
              background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12,
              zIndex: 50, overflow: "hidden", boxShadow: "0 8px 24px rgba(0,0,0,0.3)",
            }}>
              {results.map((u: any) => (
                <button key={u.id} onClick={() => selectUser(u)} style={{
                  width: "100%", background: "none", border: "none", padding: "10px 14px",
                  cursor: "pointer", textAlign: "left", display: "flex", alignItems: "center",
                  gap: 10, borderBottom: "1px solid var(--border)",
                }}>
                  <div style={{
                    width: 32, height: 32, borderRadius: "50%", background: "var(--surface2)",
                    display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, overflow: "hidden",
                  }}>
                    {u.avatar_url
                      ? <img src={u.avatar_url} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      : <i className="ti ti-user" style={{ fontSize: 16, color: "var(--text-muted)" }} />}
                  </div>
                  <div style={{ flex: 1 }}>
                    <span style={{ fontSize: 14, color: "var(--text)", fontWeight: 500 }}>@{u.nickname}</span>
                  </div>
                  <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
                    {u.user_type === "worker" ? "알바생" : u.user_type === "employer" ? "사장님" : ""}
                  </span>
                </button>
              ))}
            </div>
          )}

          {/* 선택된 직원 표시 */}
          {selected && (
            <div style={{
              marginTop: 8, display: "flex", alignItems: "center", gap: 8,
              background: "rgba(139,92,246,0.08)", border: "1px solid rgba(139,92,246,0.3)",
              borderRadius: 10, padding: "8px 12px",
            }}>
              <div style={{ width: 28, height: 28, borderRadius: "50%", background: "var(--surface2)", overflow: "hidden", flexShrink: 0 }}>
                {selected.avatar_url
                  ? <img src={selected.avatar_url} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  : <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <i className="ti ti-user" style={{ fontSize: 14, color: "#8b5cf6" }} />
                    </div>}
              </div>
              <span style={{ fontSize: 13, fontWeight: 700, color: "#8b5cf6" }}>✓ @{selected.nickname}</span>
            </div>
          )}
        </div>

        {/* 시급 */}
        <div style={{ marginBottom: 16 }}>
          <p style={{ fontSize: 11, color: "var(--text-muted)", margin: "0 0 6px" }}>시급 (원)</p>
          <input type="text" value={wage} onChange={e => setWage(e.target.value.replace(/\D/g, ""))}
            placeholder="10,030" style={inputStyle} />
          {wage && parseInt(wage) < 10030 && (
            <p style={{ fontSize: 11, color: "#f59e0b", margin: "4px 0 0" }}>⚠️ 최저임금(10,030원)보다 낮아요</p>
          )}
        </div>

        {/* 근무 요일 */}
        <div style={{ marginBottom: 16 }}>
          <p style={{ fontSize: 11, color: "var(--text-muted)", margin: "0 0 6px" }}>근무 요일</p>
          <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
            {["월", "화", "수", "목", "금", "토", "일"].map(d => {
              const sel = workDays.split("·").filter(Boolean).includes(d);
              return (
                <button key={d} onClick={() => {
                  const days = workDays.split("·").filter(Boolean);
                  setWorkDays(sel ? days.filter(x => x !== d).join("·") : [...days, d].join("·"));
                }} style={{
                  padding: "7px 12px", borderRadius: 20,
                  border: `1.5px solid ${sel ? "#7c3aed" : "var(--border)"}`,
                  background: sel ? "#7c3aed" : "none",
                  color: sel ? "#fff" : "var(--text-muted)",
                  fontSize: 13, fontWeight: sel ? 700 : 400, cursor: "pointer",
                }}>
                  {d}
                </button>
              );
            })}
          </div>
        </div>

        {/* 근무 시간 */}
        <div style={{ marginBottom: 24 }}>
          <p style={{ fontSize: 11, color: "var(--text-muted)", margin: "0 0 10px" }}>근무 시간</p>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
            <div style={{ flex: 1 }}>
              <p style={{ fontSize: 10, color: "var(--text-muted)", margin: "0 0 4px", textAlign: "center" }}>시작</p>
              <TimeWheelPicker value={startTime} onChange={setStartTime} />
            </div>
            <span style={{ color: "var(--text-muted)", fontSize: 18, paddingTop: 44 }}>~</span>
            <div style={{ flex: 1 }}>
              <p style={{ fontSize: 10, color: "var(--text-muted)", margin: "0 0 4px", textAlign: "center" }}>종료</p>
              <TimeWheelPicker value={endTime} onChange={setEndTime} />
            </div>
          </div>
          {workHoursLabel() && (
            <p style={{ fontSize: 11, color: "#7c3aed", margin: "8px 0 0", textAlign: "center" }}>{workHoursLabel()}</p>
          )}
        </div>

        <button onClick={sendInvite} disabled={sending || !selected || !selProfile}
          style={{ ...btnPrimary, fontSize: 15, opacity: (!selected || !selProfile) ? 0.5 : 1 }}>
          {sending ? "전송 중..." : "📨 초대장 보내기"}
        </button>

      </div>
    </main>
  );
}

export default function InvitePage() {
  return (
    <Suspense fallback={<div style={{ minHeight: "100vh", background: "var(--bg)", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <p style={{ color: "var(--text-muted)" }}>로딩 중...</p>
    </div>}>
      <InviteContent />
    </Suspense>
  );
}
