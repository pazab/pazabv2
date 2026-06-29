"use client";
import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import AppHeader from "@/components/AppHeader";
import { useToast } from "@/lib/useToast";
import { cardStyle, cardGradientStyle, btnPrimary, btnSecondary } from "@/lib/styles";
import { shareInvite } from "@/lib/inviteShare";

function generateCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return "PAZ-" + Array.from({length:4}, () => chars[Math.floor(Math.random()*chars.length)]).join("");
}

function InviteContent() {
  const router = useRouter();
  const sp = useSearchParams();

  const [user, setUser] = useState<any>(null);
  const [userType, setUserType] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [myProfiles, setMyProfiles] = useState<any[]>([]);
  const [selProfile, setSelProfile] = useState<string>("");
  const [bizName, setBizName] = useState<string>("");
  const [wage, setWage] = useState<string>("");
  const [workDays, setWorkDays] = useState<string>("");
  const [startTime, setStartTime] = useState<string>("09:00");
  const [endTime, setEndTime] = useState<string>("18:00");

  const parseWorkHours = (wh: string) => {
    const parts = (wh || "").split("~").map(s => s.trim());
    if (parts.length === 2 && parts[0] && parts[1]) {
      setStartTime(parts[0]);
      setEndTime(parts[1]);
    } else {
      setStartTime("09:00");
      setEndTime("18:00");
    }
  };
  const [viewMode, setViewMode] = useState<"employer"|"worker"|null>(null);
  const [generating, setGenerating] = useState(false);
  const [generatedCode, setGeneratedCode] = useState<string>("");
  const [myCodes, setMyCodes] = useState<any[]>([]);
  const [kakaoResults, setKakaoResults] = useState<any[]>([]);
  const [directInput, setDirectInput] = useState(false);
  const [inputCode, setInputCode] = useState(sp.get("code") || "");
  const [codeInfo, setCodeInfo] = useState<any>(null);
  const [codeError, setCodeError] = useState<string>("");
  const [joining, setJoining] = useState(false);
  const { showToast, ToastUI } = useToast();

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: authData }) => {
      const u = authData.user;
      if (!u) { router.push("/login"); return; }
      setUser(u);
      const { data: ud } = await supabase.from("users").select("user_type, onboarding_data").eq("id", u.id).single();
      const ut = ud?.user_type || "worker";
      setUserType(ut);
      // URL에 code 파라미터 있으면 worker 모드로 시작, 아니면 역할에 따라
      const urlCode = new URLSearchParams(window.location.search).get("code");
      if (urlCode) setViewMode("worker");
      else setViewMode(ut === "employer" || ut === "both" ? "employer" : "worker");
      if (ut === "employer" || ut === "both") {
        const { data: profiles } = await supabase.from("employer_profiles")
          .select("id, business_name, wage, work_days, work_hours")
          .eq("user_id", u.id).order("created_at", { ascending: false });
        const p = profiles || [];
        setMyProfiles(p);
        if (p.length > 0) {
          setSelProfile(p[0].id);
          setBizName(p[0].business_name || "");
          setWage(p[0].wage ? String(p[0].wage) : "");
          setWorkDays(p[0].work_days || "");
          parseWorkHours(p[0].work_hours || "");
        } else if (ud?.onboarding_data) {
          // employer_profiles가 없으면 onboarding_data로 자동 생성 (기존 가입자 마이그레이션)
          const od = ud.onboarding_data as any;
          const bizName = od.biz_name || od.region || "";
          const { data: created } = await supabase.from("employer_profiles").insert({
            user_id: u.id,
            business_name: bizName,
            business_type: od.industries?.[0] || null,
            region: od.region || null,
            sido: od.sido || null,
            sigungu: od.sigungu || null,
            eupmyeondong: od.eupmyeondong || od.region?.split(" ").slice(-1)[0] || null,
            lat: od.lat || null,
            lng: od.lng || null,
          }).select("id, business_name, wage, work_days, work_hours").single();
          if (created) {
            setMyProfiles([created]);
            setSelProfile(created.id);
            setBizName(created.business_name || "");
          } else {
            setBizName(bizName);
          }
        }
        const { data: codes } = await supabase.from("invite_codes")
          .select("*").eq("employer_id", u.id)
          .order("created_at", { ascending: false }).limit(20);
        setMyCodes(codes || []);
      }
      setLoading(false);
    });
  }, []);

  const isExpired = (d: string) => new Date(d) < new Date();
  const isUsed = (c: any) => !!c.used_by;

  async function createCode() {
    if (!user || !bizName.trim()) { showToast("매장명을 입력해주세요!", "error"); return; }
    setGenerating(true);
    const code = generateCode();
    const { error } = await supabase.from("invite_codes").insert({
      code, employer_id: user.id,
      employer_profile_id: selProfile || null,
      biz_name: bizName,
      wage: wage ? parseInt(wage) : null,
      work_days: workDays || null,
      work_hours: `${startTime} ~ ${endTime}`,
      expires_at: new Date(Date.now() + 7*24*60*60*1000).toISOString(),
    });
    if (!error) {
      setGeneratedCode(code);
      const { data: codes } = await supabase.from("invite_codes")
        .select("*").eq("employer_id", user.id)
        .order("created_at", { ascending: false }).limit(20);
      setMyCodes(codes || []);
    } else { showToast("오류: " + error.message, "error"); }
    setGenerating(false);
  }

  async function copyCode(code: string, customBizName?: string) {
    const nick = user?.nickname || user?.name || "사장님";
    const store = customBizName || bizName || "매장";
    try {
      const result = await shareInvite({
        storeName: store,
        nick,
        code
      });
      if (result === "shared") {
        showToast("💬 카카오톡/외부 공유창을 열었습니다.");
      } else {
        showToast("📋 초대 메시지가 클립보드에 복사되었습니다!");
      }
    } catch (err) {
      navigator.clipboard.writeText(code);
      showToast("✅ 코드 복사 완료!");
    }
  }

  async function checkCode(code: string) {
    if (code.length !== 8) return;
    setCodeError(""); setCodeInfo(null);
    const { data, error } = await supabase.from("invite_codes")
      .select("*, users!invite_codes_employer_id_fkey(nickname)")
      .eq("code", code.toUpperCase()).maybeSingle();
    if (error) { setCodeError("조회 오류: " + error.message); return; }
    if (!data) { setCodeError("유효하지 않은 코드예요."); return; }
    if (data.used_by) { setCodeError("이미 사용된 코드예요."); return; }
    if (isExpired(data.expires_at)) { setCodeError("만료된 코드예요."); return; }
    let ep = null;
    if (data.employer_profile_id) {
      const { data: epd } = await supabase.from("employer_profiles")
        .select("business_name, business_type, region").eq("id", data.employer_profile_id).maybeSingle();
      ep = epd;
    }
    setCodeInfo({ ...data, employer_profiles: ep });
  }

  async function joinTeam() {
    if (!codeInfo || !user) return;
    setJoining(true);
    try {
      const { data: existing } = await supabase.from("team_members")
        .select("id, status")
        .eq("employer_id", codeInfo.employer_id)
        .eq("worker_id", user.id)
        .eq("status", "active")
        .maybeSingle();

      if (existing) {
        showToast("이미 이 사장님의 팀원이에요!", "info");
        setJoining(false); return;
      }

      const { data: match, error: mErr } = await supabase.from("matches").insert({
        employer_id: codeInfo.employer_id,
        worker_id: user.id,
        employer_profile_id: codeInfo.employer_profile_id || null,
        status: "accepted",
        progress_status: "hired",
        hire_confirmed_by_employer: true,
        hire_confirmed_by_worker: true,
        match_score: 0,
      }).select("id").single();

      if (mErr) { showToast("matches 오류: " + mErr.message, "error"); setJoining(false); return; }
      if (!match) { showToast("match 생성 실패", "error"); setJoining(false); return; }

      const { data: tmData, error: tmErr } = await supabase.from("team_members").insert({
        employer_id: codeInfo.employer_id,
        worker_id: user.id,
        match_id: match.id,
        hire_date: new Date().toISOString().split("T")[0],
        status: "active",
        wage: codeInfo.wage || null,
        work_days: codeInfo.work_days || null,
        work_hours: codeInfo.work_hours || null,
      }).select("id").single();
      if (tmErr) { showToast("team_members 오류: " + tmErr.message, "error"); setJoining(false); return; }

      // 4. 계약서 초안 자동 생성 (Draft Contract)
      const bizN = codeInfo.employer_profiles?.business_name || codeInfo.biz_name || "매장";
      const todayStr = new Date().toISOString().split("T")[0];
      const initialContractData = {
        biz: bizN,
        startDate: todayStr,
        wage: codeInfo.wage ? String(codeInfo.wage) : "10030",
        contractType: "parttime",
        workDaysMode: "check",
        // 요일 설정 매핑
        workDaysMon: codeInfo.work_days?.includes("월") || false,
        workDaysTue: codeInfo.work_days?.includes("화") || false,
        workDaysWed: codeInfo.work_days?.includes("수") || false,
        workDaysThu: codeInfo.work_days?.includes("목") || false,
        workDaysFri: codeInfo.work_days?.includes("금") || false,
        workDaysSat: codeInfo.work_days?.includes("토") || false,
        workDaysSun: codeInfo.work_days?.includes("일") || false,
      };

      const { error: cErr } = await supabase.from("contracts").insert({
        employer_id: codeInfo.employer_id,
        worker_id: user.id,
        team_member_id: tmData?.id || null,
        match_id: match.id,
        wage: codeInfo.wage || null,
        work_hours: codeInfo.work_hours || null,
        contract_type: "parttime",
        status: "draft",
        employer_signed: false,
        worker_signed: false,
        contract_data: initialContractData,
      });
      if (cErr) {
        console.error("Draft contract auto-creation failed:", cErr);
      }

      await supabase.from("invite_codes")
        .update({ used_by: user.id, used_at: new Date().toISOString() })
        .eq("id", codeInfo.id);

      // 닉네임 조회
      const { data: userData } = await supabase.from("users")
        .select("nickname, real_name").eq("id", user.id).single();
      const workerName = userData?.nickname || userData?.real_name || "새 팀원";

      // 채팅방 시스템 메시지 (채팅방 자동 생성됨)
      await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          matchId: match.id,
          senderId: user.id,
          receiverId: codeInfo.employer_id,
          message: `👋 ${workerName}님이 초대 코드로 ${bizN} 팀원으로 등록됐어요!\n📄 [계약서] 버튼을 눌러 근로계약서를 작성해주세요.`,
          messageType: "system",
        }),
      }).catch(() => {});

      showToast(`✅ ${bizN} 팀원으로 등록됐어요!`);
      router.push(`/chat/${match.id}`);
    } catch(e: any) {
      showToast("오류: " + e.message, "error");
    }
    setJoining(false);
  }

  if (loading) return (
    <main style={{ minHeight:"100vh", background:"var(--bg)", display:"flex", alignItems:"center", justifyContent:"center" }}>
      <p style={{ color:"var(--text-muted)" }}>로딩 중...</p>
      {ToastUI}
    </main>
  );

  const isEmployer = userType === "employer" || userType === "both";
  const isWorker = userType === "worker" || userType === "both";

  async function switchToEmployerMode() {
    if (!isEmployer) {
      await supabase.from("users").update({ user_type: "both" }).eq("id", user.id);
      setUserType("both");
    }
    // employer_profiles 조회
    const { data: profiles } = await supabase.from("employer_profiles")
      .select("id, business_name, wage, work_days, work_hours")
      .eq("user_id", user.id).order("created_at", { ascending: false });
    const p = profiles || [];
    if (p.length > 0) {
      setMyProfiles(p);
      setSelProfile(p[0].id);
      setBizName(p[0].business_name || "");
      setWage(p[0].wage ? String(p[0].wage) : "");
      setWorkDays(p[0].work_days || "");
      parseWorkHours(p[0].work_hours || "");
    } else {
      // onboarding_data 폴백으로 employer_profiles 자동 생성
      const { data: ud } = await supabase.from("users").select("onboarding_data").eq("id", user.id).single();
      const od = (ud?.onboarding_data || {}) as any;
      const bizName = od.biz_name || od.region || "";
      const { data: created } = await supabase.from("employer_profiles").insert({
        user_id: user.id,
        business_name: bizName,
        business_type: od.industries?.[0] || null,
        region: od.region || null,
        sido: od.sido || null,
        sigungu: od.sigungu || null,
        eupmyeondong: od.eupmyeondong || od.region?.split(" ").slice(-1)[0] || null,
        lat: od.lat || null,
        lng: od.lng || null,
      }).select("id, business_name, wage, work_days, work_hours").single();
      if (created) {
        setMyProfiles([created]);
        setSelProfile(created.id);
        setBizName(created.business_name || "");
      } else {
        setBizName(bizName);
      }
    }
    const { data: codes } = await supabase.from("invite_codes")
      .select("*").eq("employer_id", user.id)
      .order("created_at", { ascending: false }).limit(20);
    setMyCodes(codes || []);
    setViewMode("employer");
  }

  const seen = new Set<string>();
  const uniqueProfiles = myProfiles.filter(p => { if(seen.has(p.business_name)) return false; seen.add(p.business_name); return true; });
  const validCodes = myCodes.filter(c => !isUsed(c) && !isExpired(c.expires_at));
  const oldCodes = myCodes.filter(c => isUsed(c) || isExpired(c.expires_at));

  return (
    <main style={{ minHeight:"100vh", background:"var(--bg)", paddingBottom:60 }}>
      <AppHeader title="초대 코드" showBack />
      <div style={{ maxWidth:480, margin:"0 auto", padding:16 }}>

        {/* 의도 선택 탭 */}
        <div style={{ display:"flex", background:"var(--surface2)", borderRadius:14, padding:4, marginBottom:20, gap:3 }}>
          <button
            type="button"
            onClick={switchToEmployerMode}
            style={{
              flex:1, border:"none", borderRadius:11, padding:"11px 8px",
              background: viewMode==="employer" ? "linear-gradient(135deg,#7c3aed,#ec4899)" : "none",
              color: viewMode==="employer" ? "#fff" : "var(--text-muted)",
              fontSize:13, fontWeight: viewMode==="employer" ? 700 : 400,
              cursor:"pointer", transition:"all 0.18s",
            }}>
            🎫 코드 보내기
            <span style={{ display:"block", fontSize:10, marginTop:2, opacity:0.8 }}>직원 초대 (사장님)</span>
          </button>
          <button
            type="button"
            onClick={() => setViewMode("worker")}
            style={{
              flex:1, border:"none", borderRadius:11, padding:"11px 8px",
              background: viewMode==="worker" ? "linear-gradient(135deg,#7c3aed,#ec4899)" : "none",
              color: viewMode==="worker" ? "#fff" : "var(--text-muted)",
              fontSize:13, fontWeight: viewMode==="worker" ? 700 : 400,
              cursor:"pointer", transition:"all 0.18s",
            }}>
            📥 코드 입력하기
            <span style={{ display:"block", fontSize:10, marginTop:2, opacity:0.8 }}>사장님께 받은 코드</span>
          </button>
        </div>

        {viewMode === "employer" && (
          <div style={{ marginBottom:24 }}>
            <div style={{ background:"linear-gradient(135deg,#7c3aed,#ec4899)", borderRadius:16, padding:"16px 20px", marginBottom:16 }}>
              <p style={{ fontSize:13, color:"rgba(255,255,255,0.8)", margin:"0 0 4px" }}>공고·매칭 없이</p>
              <p style={{ fontSize:17, fontWeight:900, color:"#fff", margin:"0 0 4px" }}>기존 직원 바로 등록</p>
              <p style={{ fontSize:12, color:"rgba(255,255,255,0.7)", margin:0 }}>코드를 공유하면 직원이 직접 등록해요</p>
            </div>

            <div style={{ ...cardStyle, marginBottom:12 }}>
              <p style={{ fontSize:12, fontWeight:700, color:"var(--text)", margin:"0 0 12px" }}>근무 정보</p>

              <div style={{ marginBottom:12 }}>
                <p style={{ fontSize:11, color:"var(--text-muted)", margin:"0 0 6px" }}>매장명 <span style={{ color:"#ef4444" }}>*</span></p>
                {uniqueProfiles.length > 0 && (
                  <div style={{ display:"flex", flexDirection:"column", gap:5, marginBottom:8 }}>
                    {uniqueProfiles.map((p:any) => (
                      <button key={p.id} type="button" onClick={() => {
                        setSelProfile(p.id); setBizName(p.business_name);
                        setWage(p.wage ? String(p.wage) : "");
                        setWorkDays(p.work_days || ""); parseWorkHours(p.work_hours || "");
                        setKakaoResults([]); setDirectInput(false);
                      }} style={{ background:bizName===p.business_name?"linear-gradient(135deg,#7c3aed20,#ec489920)":"var(--surface2)", border:`1.5px solid ${bizName===p.business_name?"#7c3aed":"var(--border)"}`, borderRadius:10, padding:"9px 12px", textAlign:"left" as const, cursor:"pointer", display:"flex", alignItems:"center", gap:8 }}>
                        <span>🏪</span>
                        <span style={{ fontSize:13, fontWeight:bizName===p.business_name?700:400, color:"var(--text)" }}>{p.business_name}</span>
                        {bizName===p.business_name && <span style={{ marginLeft:"auto", color:"#7c3aed" }}>✓</span>}
                      </button>
                    ))}
                  </div>
                )}
                <div style={{ position:"relative" }}>
                  <input type="text" value={bizName}
                    onChange={async e => {
                      const v = e.target.value;
                      setBizName(v);
                      setSelProfile("");
                      if (v.length < 2) { setKakaoResults([]); return; }
                      try {
                        const REST_KEY = process.env.NEXT_PUBLIC_KAKAO_REST_KEY || "02e1711115a492598ea97b18764fc597";
                        const res = await fetch(`https://dapi.kakao.com/v2/local/search/keyword.json?query=${encodeURIComponent(v)}&size=5`, { headers: { Authorization: `KakaoAK ${REST_KEY}` } });
                        const d = await res.json();
                        setKakaoResults(d.documents || []);
                      } catch {}
                    }}
                    placeholder="매장명 검색 또는 직접 입력..."
                    style={{ width:"100%", background:"var(--surface2)", border:"1px solid var(--border)", borderRadius:10, padding:"10px 12px", fontSize:13, color:"var(--text)", outline:"none", boxSizing:"border-box" as const }} />
                  {kakaoResults.length > 0 && (
                    <div style={{ position:"absolute", top:"calc(100% + 4px)", left:0, right:0, background:"var(--surface)", border:"1px solid var(--border)", borderRadius:12, zIndex:50, overflow:"hidden", boxShadow:"0 8px 24px rgba(0,0,0,0.3)" }}>
                      {kakaoResults.map((place:any, i:number) => (
                        <button key={i} type="button" onClick={() => { setBizName(place.place_name); setSelProfile(""); setKakaoResults([]); }}
                          style={{ width:"100%", background:"none", border:"none", padding:"10px 14px", cursor:"pointer", textAlign:"left" as const, borderBottom:i<kakaoResults.length-1?"1px solid var(--border)":"none" }}>
                          <p style={{ fontSize:13, fontWeight:600, margin:"0 0 2px", color:"var(--text)" }}>{place.place_name}</p>
                          <p style={{ fontSize:11, color:"var(--text-muted)", margin:0 }}>{place.road_address_name || place.address_name}</p>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                {bizName && <p style={{ fontSize:11, color:"#7c3aed", margin:"6px 0 0" }}>✓ 설정된 매장명: {bizName}</p>}
              </div>

              <div style={{ marginBottom:12 }}>
                <p style={{ fontSize:11, color:"var(--text-muted)", margin:"0 0 6px" }}>시급 (원)</p>
                <input type="text" value={wage} onChange={e => setWage(e.target.value.replace(/\D/g,""))} placeholder="10,030"
                  style={{ width:"100%", background:"var(--surface2)", border:"1px solid var(--border)", borderRadius:10, padding:"10px 12px", fontSize:14, color:"var(--text)", outline:"none", boxSizing:"border-box" as const }} />
                {wage && parseInt(wage) < 10030 && <p style={{ fontSize:11, color:"#f59e0b", margin:"4px 0 0" }}>⚠️ 최저임금(10,030원)보다 낮아요</p>}
              </div>

              <div style={{ marginBottom:12 }}>
                <p style={{ fontSize:11, color:"var(--text-muted)", margin:"0 0 6px" }}>근무 요일</p>
                <div style={{ display:"flex", gap:5, flexWrap:"wrap" as const }}>
                  {["월","화","수","목","금","토","일"].map(d => {
                    const sel = workDays.split("·").filter(Boolean).includes(d);
                    return <button key={d} type="button" onClick={() => { const days = workDays.split("·").filter(Boolean); setWorkDays(sel ? days.filter(x=>x!==d).join("·") : [...days,d].join("·")); }} style={{ padding:"6px 11px", borderRadius:20, border:`1.5px solid ${sel?"#7c3aed":"var(--border)"}`, background:sel?"#7c3aed":"none", color:sel?"#fff":"var(--text-muted)", fontSize:13, fontWeight:sel?700:400, cursor:"pointer" }}>{d}</button>;
                  })}
                </div>
              </div>

              <div>
                <p style={{ fontSize:11, color:"var(--text-muted)", margin:"0 0 6px" }}>근무 시간 <span style={{ color:"#ef4444" }}>*</span></p>
                <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                  <input type="time" value={startTime} onChange={e => setStartTime(e.target.value)}
                    style={{ flex:1, background:"var(--surface2)", border:"1px solid var(--border)", borderRadius:10, padding:"8px 10px", fontSize:13, color:"var(--text)", outline:"none" }} />
                  <span style={{ color:"var(--text-muted)", fontSize:13 }}>~</span>
                  <input type="time" value={endTime} onChange={e => setEndTime(e.target.value)}
                    style={{ flex:1, background:"var(--surface2)", border:"1px solid var(--border)", borderRadius:10, padding:"8px 10px", fontSize:13, color:"var(--text)", outline:"none" }} />
                </div>
              </div>
            </div>

            <div style={{ background:"rgba(245,158,11,0.08)", border:"1px solid rgba(245,158,11,0.2)", borderRadius:12, padding:"10px 14px", marginBottom:12, fontSize:12, color:"#f59e0b" }}>
              📌 직원이 파잡에 가입되어 있어야 코드를 사용할 수 있어요.
            </div>

            <button type="button" onClick={createCode} disabled={generating}
              style={{ ...btnPrimary, marginBottom:12, fontSize:15 }}>
              {generating ? "생성 중..." : "🎫 초대 코드 생성"}
            </button>

            {generatedCode && (
              <div style={{ ...cardStyle, border:"2px solid #7c3aed40", marginBottom:16, textAlign:"center" }}>
                <p style={{ fontSize:12, color:"var(--text-muted)", margin:"0 0 4px" }}>직원에게 이 코드를 알려주세요</p>
                <p style={{ fontSize:13, fontWeight:700, color:"var(--text)", margin:"0 0 8px" }}>🏪 {bizName}</p>
                <p style={{ fontSize:32, fontWeight:900, color:"#7c3aed", letterSpacing:3, margin:"0 0 8px" }}>{generatedCode}</p>
                <p style={{ fontSize:11, color:"var(--text-muted)", margin:"0 0 12px" }}>7일 후 만료 · 1회 사용</p>
                <button type="button" onClick={() => copyCode(generatedCode)} style={{ ...btnPrimary, width:"auto", padding:"10px 20px", fontSize:13 }}>📋 초대 메시지 복사</button>
              </div>
            )}

            {validCodes.length > 0 && (
              <div style={{ marginBottom:8 }}>
                <p style={{ fontSize:13, fontWeight:700, color:"var(--text)", marginBottom:8 }}>유효한 코드</p>
                {validCodes.map((c:any) => (
                  <div key={c.id} style={{ ...cardStyle, border:"1px solid #7c3aed30", marginBottom:6, padding:"10px 14px", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                    <div>
                      <span style={{ fontSize:15, fontWeight:700, color:"#7c3aed", letterSpacing:2 }}>{c.code}</span>
                      <p style={{ fontSize:11, color:"var(--text-muted)", margin:"2px 0 0" }}>{c.biz_name} · {new Date(c.expires_at).toLocaleDateString("ko-KR")} 까지</p>
                    </div>
                    <button type="button" onClick={() => copyCode(c.code, c.biz_name)} style={{ background:"var(--surface2)", border:"1px solid var(--border)", borderRadius:8, padding:"6px 10px", fontSize:12, color:"var(--text-muted)", cursor:"pointer" }}>복사</button>
                  </div>
                ))}
              </div>
            )}

            {oldCodes.length > 0 && (
              <details>
                <summary style={{ fontSize:12, color:"var(--text-muted)", cursor:"pointer", padding:"6px 0" }}>만료/사용된 코드 {oldCodes.length}개</summary>
                {oldCodes.map((c:any) => (
                  <div key={c.id} style={{ background:"var(--surface)", borderRadius:10, padding:"8px 12px", border:"1px solid var(--border)", opacity:0.5, marginTop:4, display:"flex", justifyContent:"space-between" }}>
                    <span style={{ fontSize:14, fontWeight:700, color:"var(--text-muted)", letterSpacing:2 }}>{c.code}</span>
                    <span style={{ fontSize:11, color:"var(--text-muted)" }}>{isUsed(c)?"✅ 사용됨":"⏰ 만료됨"}</span>
                  </div>
                ))}
              </details>
            )}
          </div>
        )}

        {viewMode === "worker" && (
          <div>
            <p style={{ fontSize:15, fontWeight:700, color:"var(--text)", marginBottom:4 }}>초대 코드 입력</p>
            <p style={{ fontSize:13, color:"var(--text-muted)", marginBottom:14 }}>사장님께 받은 코드를 입력하세요</p>
            <input type="text" value={inputCode}
              onChange={e => { const v = e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g,""); setInputCode(v); setCodeInfo(null); setCodeError(""); }}
              placeholder="PAZ-XXXX" maxLength={8}
              style={{ width:"100%", background:"var(--surface2)", border:`2px solid ${inputCode.length===8?"#7c3aed":codeError?"#ef4444":"var(--border)"}`, borderRadius:14, padding:"14px", color:"var(--text)", fontSize:22, fontWeight:900, outline:"none", letterSpacing:4, textAlign:"center" as const, boxSizing:"border-box" as const, marginBottom:6 }} />
            <p style={{ fontSize:11, color:"var(--text-muted)", textAlign:"center" as const, marginBottom:12 }}>{inputCode.length}/8 자리</p>
            <button type="button" onClick={() => checkCode(inputCode)} disabled={inputCode.length !== 8}
              style={{ ...(inputCode.length===8 ? btnPrimary : btnSecondary), marginBottom:12, fontSize:14 }}>
              {inputCode.length===8 ? "🔍 코드 확인하기" : "코드를 입력해주세요"}
            </button>
            {codeError && <div style={{ background:"rgba(239,68,68,0.1)", border:"1px solid rgba(239,68,68,0.3)", borderRadius:10, padding:"10px 14px", marginBottom:12, fontSize:13, color:"#ef4444" }}>⚠️ {codeError}</div>}
            {codeInfo && (
              <div>
                <div style={{ ...cardGradientStyle, marginBottom:12 }}>
                  <p style={{ fontSize:12, color:"var(--text-muted)", margin:"0 0 4px" }}>초대 매장</p>
                  <p style={{ fontSize:16, fontWeight:700, color:"var(--text)", margin:"0 0 8px" }}>🏪 {codeInfo.employer_profiles?.business_name || codeInfo.biz_name || codeInfo.users?.nickname || "매장"}</p>
                  <div style={{ display:"flex", gap:6, flexWrap:"wrap" as const }}>
                    {codeInfo.wage && <span style={{ fontSize:12, background:"#7c3aed20", color:"#7c3aed", borderRadius:8, padding:"3px 10px" }}>시급 {Number(codeInfo.wage).toLocaleString()}원</span>}
                    {codeInfo.work_days && <span style={{ fontSize:12, background:"#7c3aed20", color:"#7c3aed", borderRadius:8, padding:"3px 10px" }}>{codeInfo.work_days}요일</span>}
                    {codeInfo.work_hours && <span style={{ fontSize:12, background:"#7c3aed20", color:"#7c3aed", borderRadius:8, padding:"3px 10px" }}>{codeInfo.work_hours}시간/일</span>}
                  </div>
                  <p style={{ fontSize:11, color:"var(--text-muted)", margin:"8px 0 0" }}>만료: {new Date(codeInfo.expires_at).toLocaleDateString("ko-KR")}</p>
                </div>
                <button type="button" onClick={joinTeam} disabled={joining}
                  style={{ ...btnPrimary, background:"linear-gradient(135deg,#10b981,#059669)", fontSize:15 }}>
                  {joining ? "등록 중..." : "✅ 팀원으로 등록하기"}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  );
}

export default function InvitePage() {
  return (
    <Suspense fallback={<div style={{ minHeight:"100vh", background:"var(--bg)", display:"flex", alignItems:"center", justifyContent:"center" }}><p style={{ color:"var(--text-muted)" }}>로딩 중...</p></div>}>
      <InviteContent />
    </Suspense>
  );
}
