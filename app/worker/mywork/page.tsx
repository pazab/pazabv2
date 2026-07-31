"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import AppHeader from "@/components/AppHeader";
import { useToast } from "@/lib/useToast";

export default function MyWorkPage() {
  const router = useRouter();
  const { showToast, ToastUI } = useToast();
  const [userId, setUserId] = useState<string>("");
  const [current, setCurrent] = useState<any[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  const [tab, setTab] = useState<"current" | "history">("current");
  const [loading, setLoading] = useState(true);
  const [showContractRequestModal, setShowContractRequestModal] = useState(false);
  const [selectedMember, setSelectedMember] = useState<any>(null);
  const [requesting, setRequesting] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then((res) => {
      const user = res.data.user;
      if (!user) { router.push("/login"); return; }
      setUserId(user.id);
      loadMyWork(user.id);
    });
  }, []);

  async function loadMyWork(workerId: string) {
    setLoading(true);

    // 현재 소속 (active)
    const { data: activeData } = await supabase
      .from("team_members")
      .select(`id, match_id, hire_date, wage, work_days, work_hours, status, employer_id,
        users!team_members_employer_id_fkey (nickname, avatar_url)`)
      .eq("worker_id", workerId)
      .eq("status", "active")
      .order("hire_date", { ascending: false });

    // employer_profiles 별도 조회
    type TmRow = { id: string; employer_id: string; [key: string]: unknown };
    const employerIds = (activeData || []).map((d: TmRow) => d.employer_id);
    const { data: profileData } = employerIds.length > 0
      ? await supabase.from("employer_profiles").select("user_id, business_name, business_type, region").in("user_id", employerIds)
      : { data: [] };

    // 근무 이력 (resigned/fired)
    const { data: historyData } = await supabase
      .from("team_members")
      .select(`id, hire_date, wage, work_days, status, created_at, employer_id,
        users!team_members_employer_id_fkey (nickname, avatar_url)`)
      .eq("worker_id", workerId)
      .neq("status", "active")
      .order("hire_date", { ascending: false });

    const histEmployerIds = (historyData || []).map((d: TmRow) => d.employer_id);
    const { data: histProfileData } = histEmployerIds.length > 0
      ? await supabase.from("employer_profiles").select("user_id, business_name, business_type, region").in("user_id", histEmployerIds)
      : { data: [] };


    // 계약서 상태 조회 — match_id 또는 team_member_id 기반
    const activeMemberIds = (activeData || []).map((d: TmRow) => d.id).filter(Boolean);
    const historyMemberIds = (historyData || []).map((d: TmRow) => d.id).filter(Boolean);
    const allMemberIds = [...activeMemberIds, ...historyMemberIds];

    const { data: contractsData } = allMemberIds.length > 0
      ? await supabase.from("contracts")
          .select("id, match_id, team_member_id, worker_signed, employer_signed")
          .in("team_member_id", allMemberIds)
          .neq("status", "superseded")
          .order("created_at", { ascending: false })
      : { data: [] };

    setCurrent((activeData || []).map((d: TmRow) => {
      const contract = (contractsData || []).find((c: any) => c.team_member_id === d.id);
      const contractStatus = !contract ? "none" : contract.worker_signed ? "done" : "pending";
      return {
        ...d,
        employer: (d as any).users,
        profile: (profileData || []).find((p: any) => p.user_id === d.employer_id),
        contractStatus,
        contractSigned: contract?.worker_signed || false,
        contractId: contract?.id || null,
      };
    }));
    setHistory((historyData || []).map((d: TmRow) => {
      const contract = (contractsData || []).find((c: any) => c.team_member_id === d.id);
      const contractStatus = !contract ? "none" : contract.worker_signed ? "done" : "pending";
      return {
        ...d,
        employer: (d as any).users,
        profile: (histProfileData || []).find((p: any) => p.user_id === d.employer_id),
        contractStatus,
        contractSigned: contract?.worker_signed || false,
        contractId: contract?.id || null,
      };
    }));
    setLoading(false);
  }

  // 이번달 출근일 계산
  async function getMonthAttendance(teamMemberId: string) {
    const now = new Date();
    const monthStart = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}-01`;
    const { data } = await supabase.from("attendance")
      .select("status")
      .eq("team_member_id", teamMemberId)
      .gte("work_date", monthStart);
    return data?.filter((a: { status: string }) => a.status === "normal" || a.status === "late").length || 0;
  }

  async function handleContractBtn(m: any) {
    if (m.contractStatus === "none") {
      // 계약서 없으면 요청 모달
      setSelectedMember(m);
      setShowContractRequestModal(true);
    } else {
      // 계약서 있으면 (서명대기/완료) → 뷰어로
      if (m.contractId) {
        router.push(`/contract/view?contractId=${m.contractId}`);
      } else if (m.match_id) {
        router.push(`/contract/view?matchId=${m.match_id}`);
      }
    }
  }

  async function sendContractRequest() {
    if (!selectedMember) return;
    setRequesting(true);
    try {
      // 채팅에 계약서 작성 요청 메시지 전송
      await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          matchId: selectedMember.match_id,
          senderId: userId,
          receiverId: selectedMember.employer_id,
          message: "📄 근로계약서 작성을 요청드려요.\n채팅방 상단 [계약서] 버튼을 눌러 작성해주시면 감사하겠습니다 😊",
          messageType: "system",
        }),
      });
      setShowContractRequestModal(false);
      showToast("✅ 사장님께 계약서 작성 요청을 보냈어요!");
    } catch (e) {
      showToast("요청 전송에 실패했어요. 채팅으로 직접 요청해주세요.", "error");
    }
    setRequesting(false);
  }

  const businessTypeEmoji: Record<string, string> = {
    "카페/음료": "☕", "식당/음식점": "🍽️", "편의점/마트": "🏪",
    "뷰티/미용": "💄", "물류/배송": "📦", "사무/행정": "💼",
    "판매/매장": "🛍️", "이벤트/행사": "🎪", "교육/돌봄": "📚",
  };

  return (
    <main style={{ minHeight:"100vh", background:"var(--bg)", paddingBottom:40 }}>
      {ToastUI}
      <AppHeader title="내 근무" showBack showBellAndMenu />

      {/* 계약서 미작성 모달 */}
      {showContractRequestModal && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.7)", zIndex:200, display:"flex", alignItems:"flex-end", justifyContent:"center" }}>
          <div style={{ background:"var(--surface)", borderRadius:"20px 20px 0 0", padding:24, width:"100%", maxWidth:480 }}>
            <div style={{ textAlign:"center", marginBottom:20 }}>
              <div style={{ fontSize:44, marginBottom:10 }}>📄</div>
              <p style={{ fontSize:16, fontWeight:700, color:"var(--text)", margin:"0 0 8px" }}>아직 근로계약서가 없어요</p>
              <p style={{ fontSize:13, color:"var(--text-muted)", lineHeight:1.7, margin:0 }}>
                근로계약서는 사장님이 작성해요.<br/>
                법적으로 근로 시작 전 근로조건을<br/>
                서면으로 명시해야 해요.
              </p>
            </div>
            <div style={{ background:"rgba(245,158,11,0.1)", border:"1px solid rgba(245,158,11,0.3)", borderRadius:12, padding:"10px 14px", marginBottom:20, fontSize:12, color:"#f59e0b", lineHeight:1.6 }}>
              ⚠️ 계약서 미작성 시 급여 분쟁 등 법적 보호를 받기 어려울 수 있어요.
            </div>
            <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
              <button onClick={sendContractRequest} disabled={requesting}
                style={{ background:"linear-gradient(135deg,#7c3aed,#ec4899)", border:"none", borderRadius:14, padding:14, color:"#fff", fontSize:14, fontWeight:700, cursor:"pointer" }}>
                {requesting ? "요청 중..." : "📨 사장님께 작성 요청 보내기"}
              </button>
              <button onClick={() => router.push(`/chat?employer=${selectedMember?.employer_id}`)}
                style={{ background:"var(--surface2)", border:"1px solid var(--border)", borderRadius:14, padding:14, color:"var(--text-muted)", fontSize:13, cursor:"pointer" }}>
                💬 채팅으로 직접 요청하기
              </button>
              <button onClick={() => setShowContractRequestModal(false)}
                style={{ background:"none", border:"none", padding:10, color:"var(--text-muted)", fontSize:13, cursor:"pointer" }}>
                닫기
              </button>
            </div>
          </div>
        </div>
      )}

      <div style={{ padding:"16px", maxWidth:600, margin:"0 auto" }}>
        {/* 탭 */}
        <div style={{ display:"flex", background:"var(--surface2)", borderRadius:12, padding:3, marginBottom:16, gap:2 }}>
          {([
            { id:"current", label:`현재 소속 ${current.length}` },
            { id:"history", label:`근무 이력 ${history.length}` },
          ] as const).map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              style={{ flex:1, background:tab===t.id ? "var(--surface)" : "none", border:"none", borderRadius:10, padding:"8px 4px", fontSize:12, fontWeight:tab===t.id ? 700 : 400, color:tab===t.id ? "var(--text)" : "var(--text-muted)", cursor:"pointer", transition:"all 0.15s" }}>
              {t.label}
            </button>
          ))}
        </div>

        {loading ? (
          <div style={{ textAlign:"center", padding:"60px 0", color:"var(--text-muted)" }}>로딩 중...</div>
        ) : (
          <>
            {/* 현재 소속 */}
            {tab === "current" && (
              <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
                {current.length === 0 ? (
                  <div style={{ background:"var(--surface)", border:"1px solid var(--border)", borderRadius:14, padding:"12px 16px", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                    <span style={{ color:"var(--text-muted)", fontSize:13 }}>소속 매장이 없어요</span>
                    <button onClick={() => router.push("/explore")}
                      style={{ background:"linear-gradient(135deg,#7c3aed,#ec4899)", border:"none", borderRadius:20, padding:"5px 14px", fontSize:12, fontWeight:700, color:"#fff", cursor:"pointer", whiteSpace:"nowrap" }}>
                      공고 탐색 →
                    </button>
                  </div>
                ) : current.map(m => (
                  <div key={m.id} style={{ background:"var(--surface)", borderRadius:16, border:"1px solid var(--border)", overflow:"hidden" }}>
                    {/* 매장 헤더 */}
                    <div style={{ background:"linear-gradient(135deg,#7c3aed20,#ec489920)", padding:"14px 16px", borderBottom:"1px solid var(--border)" }}>
                      <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                        <span style={{ fontSize:24 }}>{businessTypeEmoji[m.profile?.business_type] || "🏪"}</span>
                        <div>
                          <p style={{ fontSize:15, fontWeight:700, color:"var(--text)", margin:"0 0 2px" }}>
                            {m.profile?.business_name || m.employer?.nickname || "매장"}
                          </p>
                          <p style={{ fontSize:12, color:"var(--text-muted)", margin:0 }}>
                            {m.profile?.business_type} · {m.profile?.region || "위치 미정"}
                          </p>
                        </div>
                        <span style={{ marginLeft:"auto", fontSize:11, background:"#10b98120", color:"#10b981", borderRadius:6, padding:"3px 8px", fontWeight:600 }}>재직중</span>
                      </div>
                    </div>

                    {/* 근무 정보 */}
                    <div style={{ padding:"12px 16px" }}>
                      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:12 }}>
                        {[
                          { label:"입사일", value: m.hire_date },
                          { label:"시급", value: m.wage ? `${m.wage.toLocaleString()}원` : "미정" },
                          { label:"근무 요일", value: m.work_days || "미정" },
                          { label:"근무 시간", value: m.work_hours ? `${m.work_hours}시간/일` : "미정" },
                        ].map(row => (
                          <div key={row.label} style={{ background:"var(--surface2)", borderRadius:10, padding:"10px 12px" }}>
                            <p style={{ fontSize:10, color:"var(--text-muted)", margin:"0 0 3px" }}>{row.label}</p>
                            <p style={{ fontSize:13, fontWeight:600, color:"var(--text)", margin:0 }}>{row.value}</p>
                          </div>
                        ))}
                      </div>

                      <div style={{ display:"flex", gap:8 }}>
                        <button onClick={() => router.push(`/chat?employer=${m.employer_id}`)}
                          style={{ flex:1, background:"var(--surface2)", border:"1px solid var(--border)", borderRadius:10, padding:"10px", fontSize:13, color:"var(--text-muted)", cursor:"pointer" }}>
                          💬 채팅
                        </button>
                        {m.match_id && (
                          <button onClick={() => handleContractBtn(m)}
                            style={{
                              flex:1, border:"none", borderRadius:10, padding:"10px", fontSize:13, fontWeight:700, cursor:"pointer",
                              background: m.contractStatus==="done" ? "rgba(16,185,129,0.15)" :
                                          m.contractStatus==="pending" ? "rgba(245,158,11,0.15)" : "rgba(239,68,68,0.15)",
                              color: m.contractStatus==="done" ? "#10b981" :
                                     m.contractStatus==="pending" ? "#f59e0b" : "#ef4444",
                            }}>
                            {m.contractStatus==="done" ? "📄 정상계약 완료" :
                             m.contractStatus==="pending" ? "⏳ 서명 대기" : "⚠️ 계약서 미작성"}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* 근무 이력 */}
            {tab === "history" && (
              <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                {history.length === 0 ? (
                  <div style={{ background:"var(--surface)", border:"1px solid var(--border)", borderRadius:14, padding:"12px 16px" }}>
                    <span style={{ color:"var(--text-muted)", fontSize:13 }}>근무 이력이 없어요</span>
                  </div>
                ) : history.map(m => (
                  <div key={m.id} style={{ background:"var(--surface)", borderRadius:16, border:"1px solid var(--border)", display:"flex", flexDirection:"column", padding:"14px 16px", gap:12 }}>
                    <div style={{ display:"flex", gap:12, alignItems:"center" }}>
                      <span style={{ fontSize:24, flexShrink:0 }}>{businessTypeEmoji[m.profile?.business_type] || "🏪"}</span>
                      <div style={{ flex:1 }}>
                        <p style={{ fontSize:14, fontWeight:600, color:"var(--text)", margin:"0 0 3px" }}>
                          {m.profile?.business_name || m.employer?.nickname || "매장"}
                        </p>
                        <p style={{ fontSize:12, color:"var(--text-muted)", margin:"0 0 4px" }}>
                          {m.profile?.business_type} · {m.hire_date || "입사일 미정"} ~
                        </p>
                        <span style={{ fontSize:11, background:"var(--surface2)", borderRadius:6, padding:"2px 8px", color:"var(--text-muted)", fontWeight:600 }}>
                          퇴직
                        </span>
                      </div>
                      {m.wage && <span style={{ fontSize:13, fontWeight:700, color:"var(--text)", flexShrink:0 }}>{m.wage.toLocaleString()}원</span>}
                    </div>

                    <div style={{ display:"flex", gap:8, borderTop:"1px solid var(--border)", paddingTop:10 }}>
                      <button onClick={() => {
                        if (m.contractId) {
                          router.push(`/contract/view?contractId=${m.contractId}`);
                        } else if (m.match_id) {
                          router.push(`/contract/view?matchId=${m.match_id}`);
                        } else {
                          router.push(`/contract/view?memberId=${m.id}`);
                        }
                      }}
                        style={{ flex:1, background:"var(--surface2)", border:"1px solid var(--border)", borderRadius:10, padding:"6px", fontSize:11, color:"var(--text-muted)", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", gap:4 }}>
                        📄 근로계약서 조회
                      </button>
                      <button onClick={() => {
                        if (m.contractStatus === "none") {
                          alert("⚠️ 발행된 임금명세서 내역이 없습니다.");
                          return;
                        }
                        router.push(`/payslip?id=${m.id}&tab=mywork`);
                      }}
                        style={{ flex:1, background:"var(--surface2)", border:"1px solid var(--border)", borderRadius:10, padding:"6px", fontSize:11, color:"var(--text-muted)", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", gap:4 }}>
                        📋 급여내역 조회
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}
