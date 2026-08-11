"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import AppHeader from "@/components/AppHeader";
import UserProfileBottomSheet from "@/components/UserProfileBottomSheet";

import { getTrustGrade } from "@/lib/utils";

export default function TeamPage() {
  const router = useRouter();
  const [members, setMembers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeQuickProfile, setActiveQuickProfile] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then((res) => {
      const user = res.data.user;
      if (!user) { router.push("/login"); return; }
      loadTeam(user.id);
    });
  }, []);

  async function loadTeam(employerId: string) {
    setLoading(true);
    const { data } = await supabase
      .from("team_members")
      .select(`id, worker_id, employer_id, match_id, hire_date, status, wage, work_days, work_hours, contract_status,
        users!team_members_worker_id_fkey (nickname, avatar_url, worker_result, email, trust_score)`)
      .eq("employer_id", employerId)
      .eq("status", "active")
      .order("hire_date", { ascending: false });

    if (!data) { setLoading(false); return; }

    const now = new Date();
    const monthStart = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}-01`;
    const ids = data.map((m: Record<string, unknown>) => m.id as string);
    const workerIds = data.map((m: any) => m.worker_id).filter(Boolean);

    const { data: contracts } = workerIds.length > 0
      ? await supabase.from("contracts")
          .select("id, created_at, start_date, end_date, worker_signed, employer_signed, status, contract_data, worker_id, wage, wage_type, work_days, work_hours")
          .eq("employer_id", employerId).in("worker_id", workerIds)
          .neq("status", "cancelled")
          .order("created_at", { ascending: false })
      : { data: [] };

    const { data: att } = await supabase.from("attendance")
      .select("team_member_id, status")
      .in("team_member_id", ids)
      .gte("work_date", monthStart);

    setMembers(data.map((m: any) => {
      const mContracts = (contracts || []).filter((c: any) => c.worker_id === m.worker_id);
      
      let wage = m.wage;
      let wage_type = "hourly";
      let work_days = m.work_days;
      let work_hours = m.work_hours;

      const contract = mContracts.find((c: any) => c.status === "active") || mContracts[0];
      if (contract) {
        const cd = contract.contract_data;
        if (cd?.wageType) wage_type = cd.wageType === "month" ? "monthly" : cd.wageType === "day" ? "daily" : "hourly";
        else if (contract.wage_type) wage_type = contract.wage_type;
        if (cd?.wage) wage = parseInt(String(cd.wage).replace(/,/g, ""));
        else if (contract.wage) wage = contract.wage;
        if (cd) {
          if (cd.workDaysMode === "text" && cd.workDaysText) work_days = cd.workDaysText;
          else {
            const days = ["월", "화", "수", "목", "금", "토", "일"]
              .filter((_, i) => (cd as any)[`workDays${["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][i]}`])
              .join("·");
            if (days) work_days = days;
          }
          if (cd.workStart && cd.workEnd) {
            work_hours = `${cd.workStart} ~ ${cd.workEnd}`;
          } else if (cd.dailyHours) {
            work_hours = cd.dailyHours;
          }
        } else {
          if (contract.work_days) work_days = contract.work_days;
          if (contract.work_hours) work_hours = contract.work_hours;
        }
      }

      return {
        ...m,
        wage,
        wage_type,
        work_days,
        work_hours,
        worker: m.users,
        this_month: att?.filter((a: { team_member_id: string; status: string }) => a.team_member_id === m.id && (a.status === "normal" || a.status === "late")).length || 0,
        late: att?.filter((a: { team_member_id: string; status: string }) => a.team_member_id === m.id && a.status === "late").length || 0,
        contractStatus: m.contract_status === "active" ? "done"
          : m.contract_status === "pending" ? "pending" : "none",
      };
    }));
    setLoading(false);
  }

  const emoji: Record<string, string> = {
    "폭풍처리형":"⚡","꼼꼼탐정형":"🔍","공감마스터형":"💕",
    "돌격대장형":"🚀","묵묵수행형":"🎯","분위기메이커형":"🌟",
    "균형조율형":"⚖️","창의탐험형":"🎨","장인기질형":"🔨",
    "안정추구형":"🛡️","소통달인형":"💬","열정폭발형":"🔥",
    "완벽주의형":"✨","리더십형":"👑","팀플레이어형":"🤝",
  };

  return (
    <main style={{ minHeight:"100vh", background:"var(--bg)", maxWidth:480, margin:"0 auto", paddingBottom:80 }}>
      <AppHeader title="팀 관리" showBack />

      <div style={{ padding:"16px" }}>
        <div style={{ background:"linear-gradient(135deg,#7c3aed,#ec4899)", borderRadius:16, padding:"16px 20px", marginBottom:20, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
          <div>
            <p style={{ fontSize:12, color:"rgba(255,255,255,0.7)", margin:"0 0 2px" }}>현재 팀원</p>
            <p style={{ fontSize:30, fontWeight:900, color:"#fff", margin:0 }}>{members.length}명</p>
          </div>
          <div style={{ textAlign:"right" }}>
            <p style={{ fontSize:12, color:"rgba(255,255,255,0.7)", margin:"0 0 2px" }}>이번달 평균 출근</p>
            <p style={{ fontSize:24, fontWeight:700, color:"#fff", margin:0 }}>
              {members.length > 0 ? Math.round(members.reduce((s,m) => s+m.this_month, 0)/members.length) : 0}일
            </p>
          </div>
        </div>

        {loading ? (
          <div style={{ textAlign:"center", padding:"60px 0", color:"var(--text-muted)" }}>로딩 중...</div>
        ) : members.length === 0 ? (
          <div style={{ textAlign:"center", padding:"60px 0" }}>
            <div style={{ fontSize:48, marginBottom:12 }}>👥</div>
            <p style={{ color:"var(--text-muted)", fontSize:14 }}>아직 팀원이 없어요</p>
          </div>
        ) : (
          <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
            {members.map(m => {
              const name = m.worker?.nickname || m.worker?.name || (m.worker?.email ? m.worker.email.split("@")[0] : "팀원");
              const trust = m.worker?.trust_score;
              const trustGrade = trust != null ? getTrustGrade(trust) : null;
              return (
                <div key={m.id} onClick={() => router.push(`/employer/team/${m.id}`)}
                  style={{ background:"var(--surface)", borderRadius:16, padding:16, border:"1px solid var(--border)", cursor:"pointer", display:"flex", gap:14, alignItems:"center" }}>
                  <div onClick={(e) => { e.stopPropagation(); if (m.worker_id) setActiveQuickProfile(m.worker_id); }}
                    style={{ width:52, height:52, borderRadius:"50%", background:"linear-gradient(135deg,#7c3aed,#ec4899)", overflow:"hidden", flexShrink:0, display:"flex", alignItems:"center", justifyContent:"center", fontSize:22, cursor:"pointer" }}>
                    {m.worker?.avatar_url
                      ? <img src={m.worker.avatar_url} style={{ width:"100%", height:"100%", objectFit:"cover" }} />
                      : <span style={{ color:"#fff", fontWeight:700 }}>{name[0]?.toUpperCase()}</span>}
                  </div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:3 }}>
                      <span style={{ fontSize:15, fontWeight:700, color:"var(--text)" }}>{name}</span>
                      {trustGrade && <span style={{ fontSize:11, color:trustGrade.color, fontWeight:700 }}>{trustGrade.emoji}</span>}
                    </div>
                    <p style={{ fontSize:12, color:"var(--text-muted)", margin:"0 0 6px" }}>
                      {m.work_days || "요일 미정"} · {m.wage ? `${m.wage_type === "monthly" ? "월급" : m.wage_type === "daily" ? "일급" : m.wage_type === "weekly" ? "주급" : "시급"} ${m.wage.toLocaleString()}원` : "급여 미정"}
                    </p>
                    <div style={{ display:"flex", gap:6, flexWrap:"wrap" as const }}>
                      <span style={{ fontSize:11, background:"#7c3aed20", color:"#7c3aed", borderRadius:6, padding:"2px 7px" }}>이번달 {m.this_month}일</span>
                      {m.late > 0 && <span style={{ fontSize:11, background:"#ef444420", color:"#ef4444", borderRadius:6, padding:"2px 7px" }}>지각 {m.late}회</span>}
                      <span style={{ fontSize:11, background:"#10b98120", color:"#10b981", borderRadius:6, padding:"2px 7px" }}>입사 {m.hire_date}</span>
                      <span style={{
                        fontSize:11, borderRadius:6, padding:"2px 7px",
                        background: m.contractStatus==="done" ? "#10b98120" : m.contractStatus==="pending" ? "#f59e0b20" : "#ef444420",
                        color: m.contractStatus==="done" ? "#10b981" : m.contractStatus==="pending" ? "#f59e0b" : "#ef4444",
                      }}>
                        {m.contractStatus==="done" ? "📄 계약완료" : m.contractStatus==="pending" ? "⏳ 서명대기" : "⚠️ 계약서미작성"}
                      </span>
                    </div>
                  </div>
                  <span style={{ color:"var(--text-muted)", fontSize:18 }}>›</span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {activeQuickProfile && (
        <UserProfileBottomSheet
          userId={activeQuickProfile}
          onClose={() => setActiveQuickProfile(null)}
        />
      )}
    </main>
  );
}
