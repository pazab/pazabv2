"use client";
import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import AppHeader from "@/components/AppHeader";

function PayslipContent() {
  const router = useRouter();
  const sp = useSearchParams();
  const teamMemberId = sp.get("tmId") || "";
  const payslipId = sp.get("id") || "";
  const fromTab = sp.get("tab") || "payslip";

  const [user, setUser] = useState<any>(null);
  const [userType, setUserType] = useState<string>("");
  const [member, setMember] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{msg:string;type:"success"|"error"|"info"} | null>(null);

  const showToast = (msg: string, type: "success"|"error"|"info" = "success") => {
    setToast({msg, type});
    setTimeout(() => setToast(null), 2500);
  };

  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [attendance, setAttendance] = useState<any[]>([]);
  const [memo, setMemo] = useState("");
  const [existingPayslip, setExistingPayslip] = useState<any>(null);

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) { router.push("/login"); return; }
      setUser(data.user);
      const { data: ud } = await supabase.from("users").select("user_type").eq("id", data.user.id).single();
      setUserType(ud?.user_type || "worker");
      if (payslipId) {
        await loadExistingPayslip(payslipId);
      } else if (teamMemberId) {
        await loadMember(teamMemberId);
      }
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    if (member) loadAttendanceWithMember(member, year, month);
  }, [year, month, member?.id]);

  async function loadExistingPayslip(id: string) {
    const { data } = await supabase.from("payslips")
      .select("*, team_members(*, users!team_members_worker_id_fkey(nickname, email, avatar_url))")
      .eq("id", id).single();
    if (data) {
      setExistingPayslip(data);
      setYear(data.year);
      setMonth(data.month);
      setMemo(data.memo || "");
      const m = { ...data.team_members, worker: data.team_members?.users };
      setMember(m);
      setAttendance(data.attendance_data || []);
    }
  }

  async function loadMember(tmId: string) {
    const { data } = await supabase.from("team_members")
      .select("*, users!team_members_worker_id_fkey(nickname, email, avatar_url)")
      .eq("id", tmId).single();
    if (data) {
      const m = { ...data, worker: data.users };
      setMember(m);
      // year/month 클로저 문제 방지 - 현재 날짜로 직접 계산
      const nowY = new Date().getFullYear();
      const nowM = new Date().getMonth() + 1;
      await loadAttendanceWithMember(m, nowY, nowM);
    }
  }

  async function loadAttendanceWithMember(m: any, y: number, mo: number) {
    const monthStr = `${y}-${String(mo).padStart(2,"0")}`;
    const lastDay = new Date(y, mo, 0).getDate(); // 해당 월 마지막 날
    const lastDateStr = `${monthStr}-${String(lastDay).padStart(2,"0")}`;
    const { data } = await supabase.from("attendance")
      .select("work_date, status, actual_hours, check_in, check_out")
      .eq("team_member_id", m.id)
      .gte("work_date", `${monthStr}-01`)
      .lte("work_date", lastDateStr)
      .order("work_date");
    setAttendance(data || []);
  }

  const isEmployer = userType === "employer" || userType === "both";
  const isWorker = userType === "worker" || userType === "both";

  const wage = member?.wage || 0;
  const contractHours = member?.work_hours ? parseFloat(member.work_hours) : 8;
  const workDays = attendance.filter(a => ["normal","late","early_leave"].includes(a.status));
  const totalHours = workDays.reduce((s, a) => s + (a.actual_hours || contractHours), 0);
  const overtimeHours = Math.max(0, totalHours - workDays.length * contractHours);
  const basePay = Math.round((totalHours - overtimeHours) * wage);
  const overtimePay = Math.round(overtimeHours * wage * 1.5);
  const totalPay = basePay + overtimePay;

  async function issuePayslip() {
    if (!member || !user) return;
    if (!wage) { showToast("시급 정보가 없어요. 계약서를 먼저 작성해주세요.", "error"); return; }
    if (workDays.length === 0) { showToast("해당 월 근태 기록이 없어요.", "error"); return; }

    const confirmed = window.confirm(
      `📄 ${year}년 ${month}월 급여 명세서 발행

` +
      `👤 ${member.worker?.nickname || "팀원"}
` +
      `⏱ 총 근무시간: ${totalHours.toFixed(1)}시간
` +
      `💰 지급액: ${totalPay.toLocaleString()}원

` +
      `발행하면 직원에게 채팅 알림이 가요.
계속할까요?`
    );
    if (!confirmed) return;

    setSaving(true);
    const payload = {
      employer_id: member.employer_id,
      worker_id: member.worker_id,
      team_member_id: member.id,
      match_id: member.match_id,
      year, month,
      wage,
      total_hours: totalHours,
      overtime_hours: overtimeHours,
      base_pay: basePay,
      overtime_pay: overtimePay,
      total_pay: totalPay,
      work_days: workDays.length,
      attendance_data: attendance,
      memo,
      status: "issued",
      issued_at: new Date().toISOString(),
    };

    let payslipData: any = null;
    if (existingPayslip) {
      const { data } = await supabase.from("payslips").update(payload).eq("id", existingPayslip.id).select("id").single();
      payslipData = data;
    } else {
      const { data } = await supabase.from("payslips").insert(payload).select("id").single();
      payslipData = data;
    }

    if (payslipData && member.match_id) {
      const workerName = member.worker?.nickname || "팀원";
      await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          matchId: member.match_id,
          senderId: user.id,
          receiverId: member.worker_id,
          message: `📋 ${year}년 ${month}월 급여 명세서가 발행됐어요!

💰 지급액: ${totalPay.toLocaleString()}원
⏱ 총 근무: ${totalHours.toFixed(1)}시간 (${workDays.length}일)

명세서를 확인해주세요.`,
          messageType: "system",
        }),
      }).catch(() => {});
    }

    showToast(`✅ ${year}년 ${month}월 급여 명세서가 발행됐어요!`);
    router.push(`/employer/team/${member.id}`);
    setSaving(false);
  }

  const statusLabel: Record<string,string> = { normal:"정상", late:"지각", early_leave:"조퇴", absent:"결근", off:"휴무" };
  const statusColor: Record<string,string> = { normal:"#10b981", late:"#f59e0b", early_leave:"#f59e0b", absent:"#ef4444", off:"#6b7280" };

  if (loading) return (
    <main style={{ minHeight:"100vh", background:"var(--bg)", display:"flex", alignItems:"center", justifyContent:"center" }}>
      <p style={{ color:"var(--text-muted)" }}>로딩 중...</p>
    </main>
  );

  return (
    <main style={{ minHeight:"100vh", background:"var(--bg)", maxWidth:480, margin:"0 auto", paddingBottom:80 }}>
      <AppHeader title="급여 명세서" showBack onBack={() => router.replace(`/myteam?tab=${fromTab}`)} />
      <div style={{ padding:16 }}>

        {/* 직원 정보 */}
        {member && (
          <div style={{ background:"var(--surface)", borderRadius:14, padding:14, border:"1px solid var(--border)", marginBottom:14, display:"flex", gap:12, alignItems:"center" }}>
            <div style={{ width:44, height:44, borderRadius:"50%", background:"linear-gradient(135deg,#7c3aed,#ec4899)", overflow:"hidden", display:"flex", alignItems:"center", justifyContent:"center", fontSize:18, flexShrink:0 }}>
              {member.worker?.avatar_url
                ? <img src={member.worker.avatar_url} style={{ width:"100%", height:"100%", objectFit:"cover" }} />
                : <span style={{ color:"#fff", fontWeight:700 }}>{(member.worker?.nickname || member.worker?.email || "?")[0].toUpperCase()}</span>}
            </div>
            <div>
              <p style={{ fontSize:14, fontWeight:700, color:"var(--text)", margin:"0 0 2px" }}>
                {member.worker?.nickname || member.worker?.email?.split("@")[0] || "팀원"}
              </p>
              <p style={{ fontSize:11, color:"var(--text-muted)", margin:0 }}>
                시급 {wage ? wage.toLocaleString()+"원" : "미설정"} · {member.work_days || "요일 미정"}
              </p>
            </div>
          </div>
        )}

        {/* 월 선택 */}
        <div style={{ background:"var(--surface)", borderRadius:14, padding:14, border:"1px solid var(--border)", marginBottom:14 }}>
          <p style={{ fontSize:12, fontWeight:700, color:"var(--text)", margin:"0 0 10px" }}>📅 명세서 기간</p>
          <div style={{ display:"flex", gap:8 }}>
            <select value={year} onChange={e => setYear(Number(e.target.value))}
              style={{ flex:1, background:"var(--surface2)", border:"1px solid var(--border)", borderRadius:10, padding:"10px", fontSize:14, color:"var(--text)", outline:"none" }}>
              {[now.getFullYear()-1, now.getFullYear()].map(y => <option key={y} value={y}>{y}년</option>)}
            </select>
            <select value={month} onChange={e => setMonth(Number(e.target.value))}
              style={{ flex:1, background:"var(--surface2)", border:"1px solid var(--border)", borderRadius:10, padding:"10px", fontSize:14, color:"var(--text)", outline:"none" }}>
              {Array.from({length:12}, (_,i) => i+1).map(m => <option key={m} value={m}>{m}월</option>)}
            </select>
          </div>
        </div>

        {/* 급여 계산 */}
        <div style={{ background:"linear-gradient(135deg,#7c3aed,#ec4899)", borderRadius:16, padding:16, marginBottom:14 }}>
          <p style={{ fontSize:12, color:"rgba(255,255,255,0.8)", margin:"0 0 12px" }}>{year}년 {month}월 급여 내역</p>
          <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
            {[
              { label:"근무일수", value:`${workDays.length}일` },
              { label:"총 근무시간", value:`${totalHours.toFixed(1)}시간` },
              { label:`기본급 (${totalHours.toFixed(1) }h × ${wage.toLocaleString()}원)`, value:`${basePay.toLocaleString()}원` },
              ...(overtimeHours > 0 ? [{ label:`초과수당 (${overtimeHours.toFixed(1)}h × 1.5)`, value:`${overtimePay.toLocaleString()}원` }] : []),
            ].map(r => (
              <div key={r.label} style={{ display:"flex", justifyContent:"space-between" }}>
                <span style={{ fontSize:12, color:"rgba(255,255,255,0.8)" }}>{r.label}</span>
                <span style={{ fontSize:12, color:"#fff", fontWeight:600 }}>{r.value}</span>
              </div>
            ))}
            <div style={{ borderTop:"1px solid rgba(255,255,255,0.3)", paddingTop:10, display:"flex", justifyContent:"space-between" }}>
              <span style={{ fontSize:14, fontWeight:700, color:"#fff" }}>💰 총 지급액</span>
              <span style={{ fontSize:18, fontWeight:900, color:"#fff" }}>{totalPay.toLocaleString()}원</span>
            </div>
          </div>
        </div>

        {/* 날짜별 상세 */}
        <div style={{ background:"var(--surface)", borderRadius:14, padding:14, border:"1px solid var(--border)", marginBottom:14 }}>
          <p style={{ fontSize:12, fontWeight:700, color:"var(--text)", margin:"0 0 10px" }}>📋 일별 근무 내역</p>
          {attendance.length === 0 ? (
            <p style={{ fontSize:13, color:"var(--text-muted)", textAlign:"center", padding:"16px 0" }}>근태 기록이 없어요</p>
          ) : attendance.map(a => (
            <div key={a.work_date} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"7px 0", borderBottom:"1px solid var(--border)" }}>
              <div>
                <span style={{ fontSize:12, fontWeight:600, color:"var(--text)" }}>{a.work_date}</span>
                {a.check_in && (
                  <span style={{ fontSize:11, color:"var(--text-muted)", marginLeft:8 }}>
                    {new Date(a.check_in).toLocaleTimeString("ko-KR",{hour:"2-digit",minute:"2-digit"})}
                    ~{a.check_out ? new Date(a.check_out).toLocaleTimeString("ko-KR",{hour:"2-digit",minute:"2-digit"}) : "-"}
                  </span>
                )}
              </div>
              <div style={{ display:"flex", gap:8, alignItems:"center" }}>
                <span style={{ fontSize:11, color:statusColor[a.status]||"#888" }}>{statusLabel[a.status]||a.status}</span>
                {a.actual_hours && <span style={{ fontSize:11, color:"#7c3aed", fontWeight:600 }}>{a.actual_hours}h</span>}
              </div>
            </div>
          ))}
        </div>

        {/* 메모 */}
        <div style={{ background:"var(--surface)", borderRadius:14, padding:14, border:"1px solid var(--border)", marginBottom:16 }}>
          <p style={{ fontSize:12, fontWeight:700, color:"var(--text)", margin:"0 0 4px" }}>메모</p>
          {isWorker && !isEmployer ? (
            <p style={{ fontSize:13, color:"var(--text-muted)", margin:0 }}>{memo || "특이사항 없음"}</p>
          ) : (
            <textarea value={memo} onChange={e => setMemo(e.target.value)}
              placeholder="특이사항이나 추가 내용을 입력해주세요"
              rows={3}
              style={{ width:"100%", background:"var(--surface2)", border:"1px solid var(--border)", borderRadius:10, padding:"10px 12px", fontSize:13, color:"var(--text)", outline:"none", resize:"none", boxSizing:"border-box" as const }} />
          )}
        </div>

        {/* 사장님: 발행 버튼 */}
        {isEmployer && (
          <>
            <button onClick={issuePayslip} disabled={saving || !wage}
              style={{ width:"100%", background: wage ? "linear-gradient(135deg,#7c3aed,#ec4899)" : "var(--surface2)", border:"none", borderRadius:14, padding:14, color: wage ? "#fff" : "var(--text-muted)", fontSize:15, fontWeight:700, cursor: wage ? "pointer" : "default" }}>
              {saving ? "발행 중..." : existingPayslip ? "📋 명세서 재발행" : "📋 급여 명세서 발행"}
            </button>
            {!wage && <p style={{ fontSize:12, color:"#ef4444", textAlign:"center", marginTop:8 }}>⚠️ 시급 정보가 없어요. 계약서를 먼저 작성해주세요.</p>}
          </>
        )}

        {/* 알바생: 확인 버튼 */}
        {isWorker && !isEmployer && existingPayslip && (
          existingPayslip.confirmed_at ? (
            <div style={{ background:"#10b98120", borderRadius:14, padding:14, textAlign:"center" }}>
              <p style={{ fontSize:13, color:"#10b981", margin:"0 0 4px", fontWeight:700 }}>✅ 확인 완료</p>
              <p style={{ fontSize:11, color:"var(--text-muted)", margin:0 }}>
                {new Date(existingPayslip.confirmed_at).toLocaleDateString("ko-KR")} 확인함
              </p>
            </div>
          ) : (
            <button onClick={async () => {
              const confirmedAt = new Date().toISOString();
              const { error } = await supabase.from("payslips")
                .update({ confirmed_at: confirmedAt })
                .eq("id", existingPayslip.id);
              if (error) { showToast("저장 오류: " + error.message, "error"); return; }
              setExistingPayslip((p: any) => ({ ...p, confirmed_at: confirmedAt }));
              showToast("✅ 급여 명세서를 확인했어요!", "success");
            }}
              style={{ width:"100%", background:"linear-gradient(135deg,#10b981,#059669)", border:"none", borderRadius:14, padding:14, color:"#fff", fontSize:15, fontWeight:700, cursor:"pointer" }}>
              ✅ 확인했어요
            </button>
          )
        )}
        {isWorker && !isEmployer && !existingPayslip && (
          <p style={{ fontSize:13, color:"var(--text-muted)", textAlign:"center", padding:"16px 0" }}>
            사장님이 급여 명세서를 발행하면 여기서 확인할 수 있어요
          </p>
        )}
      </div>
      {/* 토스트 알림 */}
      {toast && (
        <div style={{ position:"fixed", bottom:100, left:"50%", transform:"translateX(-50%)", zIndex:999,
          background: toast.type==="error" ? "#ef4444" : toast.type==="info" ? "#3b82f6" : "#10b981",
          color:"#fff", borderRadius:12, padding:"12px 20px", fontSize:13, fontWeight:600,
          boxShadow:"0 4px 20px rgba(0,0,0,0.3)", maxWidth:320, textAlign:"center" as const }}>
          {toast.msg}
        </div>
      )}
    </main>
  );
}

export default function PayslipPage() {
  return (
    <Suspense fallback={<div style={{ minHeight:"100vh", background:"var(--bg)", display:"flex", alignItems:"center", justifyContent:"center" }}><p style={{ color:"var(--text-muted)" }}>로딩 중...</p></div>}>
      <PayslipContent />
    </Suspense>
  );
}
