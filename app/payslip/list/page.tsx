"use client";
import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import AppHeader from "@/components/AppHeader";

function PayslipListContent() {
  const router = useRouter();
  const sp = useSearchParams();
  const tmId = sp.get("tmId") || "";
  const workerId = sp.get("workerId") || "";

  const [user, setUser] = useState<any>(null);
  const [userType, setUserType] = useState<string>("");
  const [payslips, setPayslips] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/login"); return; }
      setUser(user);
      const { data: ud } = await supabase.from("users").select("user_type").eq("id", user.id).single();
      setUserType(ud?.user_type || "worker");
      await loadPayslips(user.id, ud?.user_type || "worker");
      setLoading(false);
    })();
  }, []);

  async function loadPayslips(uid: string, ut: string) {
    let query = supabase.from("payslips")
      .select("*")
      .order("year", { ascending: false })
      .order("month", { ascending: false });

    if (tmId) {
      query = query.eq("team_member_id", tmId);
    } else if (ut === "worker") {
      query = query.eq("worker_id", workerId || uid);
    } else {
      query = query.eq("employer_id", uid);
    }

    const { data } = await query;
    setPayslips(data || []);
  }

  const isEmployer = userType === "employer" || userType === "both";

  if (loading) return (
    <main style={{ minHeight:"100vh", background:"var(--bg)", display:"flex", alignItems:"center", justifyContent:"center" }}>
      <p style={{ color:"var(--text-muted)" }}>로딩 중...</p>
    </main>
  );

  return (
    <main style={{ minHeight:"100vh", background:"var(--bg)", paddingBottom:80 }}>
      <AppHeader title="급여 명세서 목록" showBack />
      <div style={{ maxWidth:480, margin:"0 auto", padding:16 }}>
        {isEmployer && tmId && (
          <button onClick={() => router.push(`/payslip?tmId=${tmId}`)}
            style={{ width:"100%", background:"linear-gradient(135deg,#7c3aed,#ec4899)", border:"none", borderRadius:14, padding:14, color:"#fff", fontSize:14, fontWeight:700, cursor:"pointer", marginBottom:16 }}>
            + 이번달 급여 명세서 발행
          </button>
        )}

        {payslips.length === 0 ? (
          <div style={{ textAlign:"center", padding:"60px 0" }}>
            <div style={{ fontSize:48, marginBottom:12 }}>📋</div>
            <p style={{ color:"var(--text-muted)", fontSize:14 }}>급여 명세서가 없어요</p>
          </div>
        ) : (
          <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
            {payslips.map(p => (
              <div key={p.id} style={{ background:"var(--surface)", borderRadius:14, padding:14, border:"1px solid var(--border)" }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 }}>
                  <span style={{ fontSize:15, fontWeight:700, color:"var(--text)" }}>{p.year}년 {p.month}월</span>
                  <span style={{
                    fontSize: 11,
                    borderRadius: 6,
                    padding: "2px 8px",
                    background: p.status === "confirmed" ? "rgba(16,185,129,0.15)"
                              : p.status === "correction_requested" ? "rgba(239,68,68,0.15)"
                              : "rgba(245,158,11,0.15)",
                    color: p.status === "confirmed" ? "#10b981"
                         : p.status === "correction_requested" ? "#ef4444"
                         : "#f59e0b",
                    fontWeight: 700
                  }}>
                    {p.status === "confirmed" ? "✅ 확인 완료"
                     : p.status === "correction_requested" ? "✏️ 수정 요청됨"
                     : "⏳ 확인 대기중"}
                  </span>
                </div>
                <div style={{ display:"flex", gap:16, marginBottom:10 }}>
                  <div>
                    <p style={{ fontSize:10, color:"var(--text-muted)", margin:"0 0 2px" }}>근무일수</p>
                    <p style={{ fontSize:13, fontWeight:600, color:"var(--text)", margin:0 }}>{p.work_days}일</p>
                  </div>
                  <div>
                    <p style={{ fontSize:10, color:"var(--text-muted)", margin:"0 0 2px" }}>총 근무시간</p>
                    <p style={{ fontSize:13, fontWeight:600, color:"var(--text)", margin:0 }}>{p.total_hours}시간</p>
                  </div>
                  <div>
                    <p style={{ fontSize:10, color:"var(--text-muted)", margin:"0 0 2px" }}>총 지급액</p>
                    <p style={{ fontSize:12, fontWeight:600, color:"var(--text)", margin:0 }}>{Number(p.total_pay || p.total_amount || 0).toLocaleString()}원</p>
                  </div>
                  <div>
                    <p style={{ fontSize:10, color:"var(--text-muted)", margin:"0 0 2px" }}>실수령액</p>
                    <p style={{ fontSize:14, fontWeight:700, color:"#7c3aed", margin:0 }}>{Number(p.net_pay || p.net_amount || p.total_pay || p.total_amount || 0).toLocaleString()}원</p>
                  </div>
                </div>
                <div style={{ display:"flex", gap:6 }}>
                  <button onClick={() => router.push(`/payslip?id=${p.id}`)}
                    style={{ flex:1, background:"var(--surface2)", border:"1px solid var(--border)", borderRadius:8, padding:"8px", fontSize:12, color:"var(--text-muted)", cursor:"pointer" }}>
                    📄 보기
                  </button>
                  {isEmployer && (
                    <button onClick={() => router.push(`/payslip?id=${p.id}`)}
                      style={{ flex:1, background:"linear-gradient(135deg,#7c3aed,#ec4899)", border:"none", borderRadius:8, padding:"8px", fontSize:12, fontWeight:700, color:"#fff", cursor:"pointer" }}>
                      ✏️ 수정/재발행
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}

export default function PayslipListPage() {
  return (
    <Suspense fallback={<div style={{ minHeight:"100vh", background:"var(--bg)", display:"flex", alignItems:"center", justifyContent:"center" }}><p style={{ color:"var(--text-muted)" }}>로딩 중...</p></div>}>
      <PayslipListContent />
    </Suspense>
  );
}
