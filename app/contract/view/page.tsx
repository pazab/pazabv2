"use client";
import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useToast } from "@/lib/useToast";
import { supabase } from "@/lib/supabase";
import ContractOfficialForm, { getOfficialFormHTML } from "@/components/ContractOfficialForm";

function ContractViewContent() {
  const router = useRouter();
  const sp = useSearchParams();
  const contractId = sp.get("id") || sp.get("contractId") || "";
  const matchId = sp.get("matchId") || "";
  const memberId = sp.get("memberId") || "";
  const fromTab = sp.get("tab") || "";

    const { showToast, ToastUI } = useToast();
  const [contract, setContract] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [agreeing, setAgreeing] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [userRole, setUserRole] = useState<"employer"|"worker"|null>(null);
  const [showAgreeModal, setShowAgreeModal] = useState(false);
  const [showReviseModal, setShowReviseModal] = useState(false);
  const [reviseMsg, setReviseMsg] = useState("");

  useEffect(() => {
    loadContract();
  }, []);

  async function loadContract() {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.push("/login"); return; }

    // contractId 또는 matchId로 조회
    let query = supabase.from("contracts")
      .select("*")
      .order("created_at", { ascending: false });

    if (contractId) {
      query = query.eq("id", contractId);
    } else if (memberId) {
      query = query.eq("team_member_id", memberId).neq("status", "superseded");
    } else if (matchId) {
      query = query.eq("team_member_id", matchId).neq("status", "superseded");
    }

    const { data } = await query.limit(1).maybeSingle();
    if (data) {
      setContract(data);
      setUserRole(data.employer_id === user.id ? "employer" : "worker");
    } else if (memberId) {
      // 계약서 없음 — team_members에서 역할 확인 후 작성 페이지로
      const { data: tm } = await supabase.from("team_members")
        .select("employer_id").eq("id", memberId).maybeSingle();
      if (tm?.employer_id === user.id) {
        router.replace(`/contract?memberId=${memberId}`);
      }
    }
    setLoading(false);
  }

  async function handleAgree() {
    if (!contract) return;
    setAgreeing(true);
    const res = await fetch("/api/contract", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "sign",
        contractId: contract.id,
        teamMemberId: contract.team_member_id || memberId || null,
        matchId: contract.match_id || matchId || null,
        workerId: contract.worker_id || null,
        employerId: contract.employer_id || null,
        isHired: true,
      }),
    });
    if (res.ok) {
      showToast("✅ 계약서에 동의했어요!");
      setShowAgreeModal(false);
      setTimeout(() => router.replace("/myteam"), 800);
    } else {
      showToast("서명 처리 중 오류가 발생했어요.", "error");
    }
    setAgreeing(false);
  }

  async function handleRevise() {
    if (!contract || !reviseMsg.trim()) return;
    // 채팅으로 수정 요청 메시지 전송
    if (contract.match_id) {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            matchId: contract.match_id,
            senderId: user.id,
            receiverId: userRole === "worker" ? contract.employer_id : contract.worker_id,
            message: `📝 계약서 수정 요청\n\n${reviseMsg}`,
            messageType: "system",
          }),
        });
      }
    }
    showToast("✅ 수정 요청을 전달했어요!");
    setShowReviseModal(false);
    setReviseMsg("");
  }

  const downloadPDF = async () => {
    const el = document.getElementById("official-form-render");
    if (!el) return;
    try {
      setDownloading(true);
      const { default: jsPDF } = await import("jspdf");
      const { default: html2canvas } = await import("html2canvas");

      const canvas = await html2canvas(el, {
        scale: 2.5,
        useCORS: true,
        backgroundColor: "#ffffff",
        width: 794,
      });

      const imgData = canvas.toDataURL("image/png");
      const pdf = new jsPDF("p", "mm", "a4");
      const imgWidth = 210;
      const pageHeight = 295;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      let heightLeft = imgHeight;
      let position = 0;

      pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;

      while (heightLeft >= 0) {
        position = heightLeft - imgHeight;
        pdf.addPage();
        pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight);
        heightLeft -= pageHeight;
      }

      const cd = contract?.contract_data || {};
      pdf.save(`근로계약서_${cd.biz || "파잡"}_${cd.worker || "근로자"}.pdf`);
    } catch (e: any) {
      alert("PDF 생성 중 오류 발생: " + e.message);
    } finally {
      setDownloading(false);
    }
  };

  const print = () => {
    const el = document.getElementById("official-form-render");
    if (!el) return;
    const w = window.open("", "_blank", "width=900,height=1200");
    if (!w) return;
    w.document.write(getOfficialFormHTML(el.innerHTML));
    w.document.close();
    setTimeout(() => w.print(), 600);
  };

  if (loading) return (
    <main style={{ minHeight:"100vh", background:"var(--bg)", display:"flex", alignItems:"center", justifyContent:"center" }}>
      <p style={{ color:"var(--text-muted)" }}>로딩 중...</p>
      {ToastUI}
    </main>
  );

  if (!loading && !contract) return (
    <main style={{ minHeight:"100vh", background:"var(--bg)", maxWidth:480, margin:"0 auto" }}>
      <div style={{ position:"sticky", top:0, zIndex:20, background:"rgba(24,24,27,0.97)", backdropFilter:"blur(12px)", borderBottom:"1px solid var(--border)", padding:"12px 16px", display:"flex", alignItems:"center", gap:10 }}>
        <button onClick={() => router.back()} style={{ background:"none", border:"none", color:"var(--text-muted)", fontSize:20, cursor:"pointer" }}>←</button>
        <span style={{ fontSize:16, fontWeight:700, color:"var(--text)" }}>근로계약서</span>
      </div>
      <div style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:"60px 24px", textAlign:"center" }}>
        <div style={{ fontSize:56, marginBottom:16 }}>📄</div>
        <p style={{ fontSize:16, fontWeight:700, color:"var(--text)", marginBottom:8 }}>아직 근로계약서가 없어요</p>
        <p style={{ fontSize:13, color:"var(--text-muted)", lineHeight:1.7, marginBottom:24 }}>
          사장님이 아직 계약서를 작성하지 않았어요.<br/>
          채팅으로 작성 요청을 드려보세요.
        </p>
        <div style={{ background:"rgba(245,158,11,0.1)", border:"1px solid rgba(245,158,11,0.3)", borderRadius:12, padding:"12px 16px", marginBottom:24, fontSize:12, color:"#f59e0b", lineHeight:1.6, width:"100%" }}>
          ⚠️ 계약서 미작성 시 급여 분쟁 등 법적 보호를 받기 어려울 수 있어요.
        </div>
        <button onClick={() => router.back()}
          style={{ width:"100%", background:"linear-gradient(135deg,#7c3aed,#ec4899)", border:"none", borderRadius:14, padding:14, color:"#fff", fontSize:14, fontWeight:700, cursor:"pointer" }}>
          돌아가기
        </button>
      </div>
    </main>
  );

  const f = contract.contract_data || {};
  const ct = f.contractType || "parttime";
  const titles: Record<string,string> = {
    parttime: "단시간근로자 표준근로계약서",
    standard_unlimited: "표준근로계약서 (기간의 정함이 없는 경우)",
    standard_fixed: "표준근로계약서 (기간의 정함이 있는 경우)",
    minor: "연소근로자 표준근로계약서",
  };

  const selectedDaysList = ["월","화","수","목","금","토","일"].filter((_,i) =>
    f[[`workDaysMon`,`workDaysTue`,`workDaysWed`,`workDaysThu`,`workDaysFri`,`workDaysSat`,`workDaysSun`][i]]
  );
  const selectedDays = f.workDaysMode === "text" ? f.workDaysText : selectedDaysList.join("·");

  return (
    <main style={{ minHeight:"100vh", background:"var(--bg)", color:"var(--text)", maxWidth:480, margin:"0 auto", paddingBottom:100 }}>
      {/* 헤더 */}
      <div style={{ position:"sticky", top:0, zIndex:20, background:"rgba(24,24,27,0.97)", backdropFilter:"blur(12px)", borderBottom:"1px solid var(--border)", padding:"12px 16px", display:"flex", alignItems:"center", gap:10 }}>
        <button onClick={() => router.back()}
          style={{ background:"none", border:"none", color:"var(--text-muted)", fontSize:20, cursor:"pointer", padding:"0 4px" }}>←</button>
        <span style={{ fontSize:16, fontWeight:700, color:"var(--text)" }}>근로계약서</span>
        <div style={{ flex:1 }} />
        {/* 상태 배지 */}
        <span style={{
          fontSize:11, borderRadius:8, padding:"3px 8px", fontWeight:600,
          background: contract.status === "active" && contract.worker_signed ? "#10b98120" : "#f59e0b20",
          color: contract.status === "active" && contract.worker_signed ? "#10b981" : "#f59e0b",
        }}>
          {contract.worker_signed ? "✅ 쌍방 서명 완료" : contract.employer_signed ? "⏳ 근로자 서명 대기" : "미서명"}
        </span>
      </div>

      <div style={{ padding:"12px 12px 0" }}>
        {/* 계약서 본문 (읽기 전용) */}
        <div id="contract-view" style={{ background:"#fff", borderRadius:10, padding:"16px 14px", border:"1px solid #ccc", overflowX:"auto" }}>
          <div style={{ fontFamily:"'Noto Sans KR',sans-serif", fontSize:"9.5pt", color:"#000", lineHeight:1.6 }}>
            <div style={{ fontSize:"17pt", fontWeight:900, textAlign:"center", letterSpacing:4, marginBottom:4 }}>{titles[ct]}</div>
            <div style={{ fontSize:"8.5pt", textAlign:"center", color:"#444", marginBottom:16, borderBottom:"2px solid #000", paddingBottom:8 }}>
              (「근로기준법」 제17조에 따른 서면 근로계약)
            </div>
            <div style={{ fontSize:"8pt", textAlign:"center", color:"#555", marginBottom:14 }}>
              사업주와 근로자는 다음과 같이 근로계약을 체결한다.
            </div>

            {/* 1. 계약 기간 / 개시일 */}
            <div style={{ fontSize:"10pt", fontWeight:700, borderLeft:"3px solid #000", paddingLeft:6, margin:"14px 0 6px" }}>1. 근로계약기간</div>
            <div style={{ paddingLeft:16, fontSize:"9pt", lineHeight:2 }}>
              {ct === "standard_unlimited" ? (
                <span>근로개시일: <strong>{f.startDate || "-"}</strong> 부터</span>
              ) : (
                <span>근로계약기간: <strong>{f.startDate || "-"}</strong> 부터 <strong>{f.endDate || "-"}</strong> 까지</span>
              )}
            </div>

            {/* 2. 근무장소 */}
            <div style={{ fontSize:"10pt", fontWeight:700, borderLeft:"3px solid #000", paddingLeft:6, margin:"14px 0 6px" }}>2. 근무장소</div>
            <div style={{ paddingLeft:16, fontSize:"9pt", lineHeight:2 }}>
              {f.workPlace || "-"}
            </div>

            {/* 3. 업무내용 */}
            <div style={{ fontSize:"10pt", fontWeight:700, borderLeft:"3px solid #000", paddingLeft:6, margin:"14px 0 6px" }}>3. 업무의 내용</div>
            <div style={{ paddingLeft:16, fontSize:"9pt", lineHeight:2 }}>
              {f.jobDesc || "-"}
            </div>

            {/* 4. 소정근로시간 / 근무 요일 */}
            {ct !== "parttime" ? (
              <>
                <div style={{ fontSize:"10pt", fontWeight:700, borderLeft:"3px solid #000", paddingLeft:6, margin:"14px 0 6px" }}>4. 소정근로시간</div>
                <div style={{ paddingLeft:16, fontSize:"9pt", lineHeight:2 }}>
                  <strong>{f.workStart || "-"}</strong> 부터 <strong>{f.workEnd || "-"}</strong> 까지 &nbsp;
                  (휴게시간: <strong>{f.breakStart || "-"}</strong> ~ <strong>{f.breakEnd || "-"}</strong>)
                  <div style={{ marginTop:2 }}>
                    (1일 소정근로시간: <strong>{f.dailyHours || "-"}</strong>시간, &nbsp;
                    1주 소정근로시간: <strong>{f.weeklyHours || "-"}</strong>시간)
                  </div>
                </div>

                <div style={{ fontSize:"10pt", fontWeight:700, borderLeft:"3px solid #000", paddingLeft:6, margin:"14px 0 6px" }}>5. 근무일 / 휴일</div>
                <div style={{ paddingLeft:16, fontSize:"9pt", lineHeight:2 }}>
                  매주 <strong>{f.workDaysText || "-"}</strong>일 근무
                  {f.workDaysMode === "check" && selectedDaysList.length > 0 && ` (근무일: ${selectedDaysList.join("·")})`}, &nbsp;
                  주휴일 매주 <strong>{f.weeklyHoliday || "-"}</strong>요일
                  <div style={{ fontSize:"7.5pt", color:"#666", marginTop:2 }}>
                    • 공휴일(대체공휴일 포함)은 근로기준법이 정하는 바에 따르며, 근로자의 날은 유급휴일로 함
                  </div>
                </div>
              </>
            ) : (
              <>
                <div style={{ fontSize:"10pt", fontWeight:700, borderLeft:"3px solid #000", paddingLeft:6, margin:"14px 0 6px" }}>4. 근로일 및 근로일별 근로시간</div>
                <div style={{ paddingLeft:16, fontSize:"9pt", lineHeight:2, overflowX:"auto", marginBottom:4 }}>
                  <table style={{ width:"100%", minWidth:320, borderCollapse:"collapse", marginBottom:6, tableLayout:"fixed" }}>
                    <tbody>
                      <tr>
                        <td style={{ border:"1px solid #555", padding:"4px 6px", width:"75px", background:"#f5f5f5", fontWeight:600, textAlign:"center" }}>근무일</td>
                        {selectedDaysList.map(d => (
                          <td key={d} style={{ border:"1px solid #555", padding:"4px 6px", background:"#f5f5f5", fontWeight:600, textAlign:"center" }}>{d}요일</td>
                        ))}
                      </tr>
                      <tr>
                        <td style={{ border:"1px solid #555", padding:"4px 6px", background:"#fff", fontSize:"8.5pt", textAlign:"center" }}>시작 시간</td>
                        {selectedDaysList.map(d => {
                          const idx = ["월","화","수","목","금","토","일"].indexOf(d);
                          const key = `workStart${["Mon","Tue","Wed","Thu","Fri","Sat","Sun"][idx]}`;
                          return (
                            <td key={d} style={{ border:"1px solid #555", padding:"4px 6px", textAlign:"center" }}>{f[key] || "-"}</td>
                          );
                        })}
                      </tr>
                      <tr>
                        <td style={{ border:"1px solid #555", padding:"4px 6px", background:"#fff", fontSize:"8.5pt", textAlign:"center" }}>종료 시간</td>
                        {selectedDaysList.map(d => {
                          const idx = ["월","화","수","목","금","토","일"].indexOf(d);
                          const key = `workEnd${["Mon","Tue","Wed","Thu","Fri","Sat","Sun"][idx]}`;
                          return (
                            <td key={d} style={{ border:"1px solid #555", padding:"4px 6px", textAlign:"center" }}>{f[key] || "-"}</td>
                          );
                        })}
                      </tr>
                      <tr>
                        <td style={{ border:"1px solid #555", padding:"4px 6px", background:"#fff", fontSize:"8.5pt", textAlign:"center" }}>휴게 (분)</td>
                        {selectedDaysList.map(d => {
                          const idx = ["월","화","수","목","금","토","일"].indexOf(d);
                          const key = `breakTime${["Mon","Tue","Wed","Thu","Fri","Sat","Sun"][idx]}`;
                          return (
                            <td key={d} style={{ border:"1px solid #555", padding:"4px 6px", textAlign:"center" }}>{f[key] || "-"}분</td>
                          );
                        })}
                      </tr>
                    </tbody>
                  </table>
                  <div style={{ marginTop:4 }}>
                    주휴일: 매주 <strong>{f.weeklyHoliday || "-"}</strong>요일
                  </div>
                  <div style={{ fontSize:"7.5pt", color:"#666", marginTop:2 }}>
                    • 공휴일(대체공휴일 포함)은 근로기준법이 정하는 바에 따르며, 근로자의 날은 유급휴일로 함
                  </div>
                </div>
              </>
            )}

            {/* 5 / 6. 임금 조건 */}
            <div style={{ fontSize:"10pt", fontWeight:700, borderLeft:"3px solid #000", paddingLeft:6, margin:"14px 0 6px" }}>{ct === "parttime" ? "5" : "6"}. 임금</div>
            <div style={{ paddingLeft:16, fontSize:"9pt", lineHeight:2 }}>
              <div>
                • {f.wageType === "hour" ? "시간급" : f.wageType === "day" ? "일급" : "월급"}: <strong>{f.wage || "-"}</strong> 원
              </div>
              <div>
                • 상여금: {f.hasBonus ? `있음 (${f.bonusAmount || "-"} 원)` : "없음"}
              </div>
              <div>
                • 그 밖의 수당(약정수당): {f.hasExtraWage ? `있음 (${f.extraWageDetails || "-"})` : "없음"}
              </div>
              {ct === "parttime" && (
                <div>
                  • 초과근로에 대한 가산임금률: <strong>{f.overtimePremiumRate || "-"}</strong> %
                </div>
              )}
              <div>
                • 임금지급일: 매월(매주 또는 매일) <strong>{f.payDay || "-"}</strong> 일 (휴일의 경우는 전날 지급)
              </div>
              <div>
                • 지급방법: {f.payMethod === "계좌이체" ? "근로자 명의 계좌 입금" : "근로자에게 직접 지급"}
              </div>
            </div>

            {/* 6 / 7. 연차유급휴가 */}
            <div style={{ fontSize:"10pt", fontWeight:700, borderLeft:"3px solid #000", paddingLeft:6, margin:"14px 0 6px" }}>{ct === "parttime" ? "6" : "7"}. 연차유급휴가</div>
            <div style={{ paddingLeft:16, fontSize:"9pt", lineHeight:2 }}>
              {ct === "parttime" ? (
                "• 통상근로자의 근로시간에 비례하여 연차유급휴가를 부여함"
              ) : (
                "• 연차유급휴가는 근로기준법에서 정하는 바에 따라 부여함"
              )}
            </div>

            {/* 연소근로자 전용 가족관계증명서 */}
            {ct === "minor" && (
              <>
                <div style={{ fontSize:"10pt", fontWeight:700, borderLeft:"3px solid #000", paddingLeft:6, margin:"14px 0 6px" }}>8. 가족관계증명서 및 동의서 구비</div>
                <div style={{ paddingLeft:16, fontSize:"9pt", lineHeight:2 }}>
                  • 가족관계기록사항에 관한 증명서 제출 여부: <strong>{f.hasFamilyCert ? "제출함" : "미제출"}</strong><br/>
                  • 친권자 또는 후견인 동의서 구비 여부: <strong>{f.hasParentConsent ? "구비함" : "미구비"}</strong>
                </div>
              </>
            )}

            {/* 7 / 8 / 9. 사회보험 */}
            <div style={{ fontSize:"10pt", fontWeight:700, borderLeft:"3px solid #000", paddingLeft:6, margin:"14px 0 6px" }}>{ct === "minor" ? "9" : ct === "parttime" ? "7" : "8"}. 사회보험 적용여부</div>
            <div style={{ paddingLeft:16, fontSize:"9pt", display:"flex", gap:16, flexWrap:"wrap", marginTop:2 }}>
              {[
                { key:"insEmp", label:"고용보험" },
                { key:"insAcc", label:"산재보험" },
                { key:"insPension", label:"국민연금" },
                { key:"insHealth", label:"건강보험" },
              ].map(ins => (
                <span key={ins.key} style={{ display:"inline-flex", alignItems:"center", gap:4 }}>
                  <span style={{ display:"inline-block", width:12, height:12, border:"1px solid #555", textAlign:"center", lineHeight:"12px", fontSize:"9pt" }}>
                    {f[ins.key] ? "✓" : ""}
                  </span>
                  {ins.label}
                </span>
              ))}
            </div>

            {/* 8 / 9 / 10. 교부 의무 */}
            <div style={{ fontSize:"10pt", fontWeight:700, borderLeft:"3px solid #000", paddingLeft:6, margin:"14px 0 6px" }}>{ct === "minor" ? "10" : ct === "parttime" ? "8" : "9"}. 근로계약서 교부</div>
            <div style={{ paddingLeft:16, fontSize:"9pt", lineHeight:2 }}>
              • 사업주는 근로계약을 체결함과 동시에 본 계약서를 사본하여 근로자의 교부요구와 관계없이 근로자에게 교부함(근로기준법 제17조 이행)
            </div>

            {/* 9 / 10 / 11. 성실 이행 */}
            <div style={{ fontSize:"10pt", fontWeight:700, borderLeft:"3px solid #000", paddingLeft:6, margin:"14px 0 6px" }}>{ct === "minor" ? "11" : ct === "parttime" ? "9" : "10"}. 근로계약 등의 성실한 이행의무</div>
            <div style={{ paddingLeft:16, fontSize:"9pt", lineHeight:2 }}>
              • 사업주와 근로자는 각자가 근로계약, 취업규칙, 단체협약을 지키고 성실하게 이행하여야 함
            </div>

            {/* 10 / 11 / 12. 기타 */}
            <div style={{ fontSize:"10pt", fontWeight:700, borderLeft:"3px solid #000", paddingLeft:6, margin:"14px 0 6px" }}>{ct === "minor" ? "12" : ct === "parttime" ? "10" : "11"}. 그 밖의 사항</div>
            <div style={{ paddingLeft:16, fontSize:"9pt", lineHeight:2 }}>
              {ct === "minor" ? (
                "• 13세 이상 15세 미만인 자에 대해서는 고용노동부장관의 취직인허증을 교부받아야 함. 이 계약에 정함이 없는 사항은 근로기준법 및 관련 법령에 따름"
              ) : (
                "• 이 계약에 정하지 않은 사항은 근로관계법령이 정하는 바에 따름"
              )}
            </div>

            {/* 날짜 및 서명 */}
            <div style={{ marginTop:30, borderTop:"1px solid #eee", paddingTop:16 }}>
              <div style={{ textAlign:"center", marginBottom:18, fontSize:"9.5pt" }}>
                <strong>{f.contractDate || "-"}</strong>
              </div>

              <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
                {/* 사업주 서명 */}
                <div style={{ background:"#f9f9f9", border:"1px solid #ddd", borderRadius:8, padding:10 }}>
                  <span style={{ fontWeight:700, fontSize:"10pt", display:"block", marginBottom:4 }}>사 업 주 (구인자)</span>
                  <div style={{ display:"flex", flexDirection:"column", gap:2, fontSize:"9pt" }}>
                    <div>사업체명 : <strong>{f.biz || "-"}</strong> (사업자번호: {f.bizRegNo || "-"})</div>
                    <div>대 표 자 : <strong>{f.ceo || "-"}</strong> &nbsp;
                      <span style={{ color: contract.employer_signed ? "#10b981" : "#aaa", fontSize:"8pt", fontWeight:700 }}>
                        {contract.employer_signed ? "(서명 완료)" : "(미서명)"}
                      </span>
                    </div>
                    <div>주    소 : {[f.bizAddr, f.bizAddrDetail].filter(Boolean).join(" ") || "-"}</div>
                    <div>연 락 처 : {f.ceoPhone || "-"}</div>
                  </div>
                </div>

                {/* 근로자 서명 */}
                <div style={{ background:"#f9f9f9", border:"1px solid #ddd", borderRadius:8, padding:10 }}>
                  <span style={{ fontWeight:700, fontSize:"10pt", display:"block", marginBottom:4 }}>근 로 자 (구직자)</span>
                  <div style={{ display:"flex", flexDirection:"column", gap:2, fontSize:"9pt" }}>
                    <div>성    명 : <strong>{f.worker || "-"}</strong> &nbsp;
                      <span style={{ color: contract.worker_signed ? "#10b981" : "#f59e0b", fontSize:"8pt", fontWeight:700 }}>
                        {contract.worker_signed ? "(서명 완료)" : "(서명 대기)"}
                      </span>
                    </div>
                    <div>생년월일 : {f.workerBirth || "-"}</div>
                    <div>주    소 : {f.workerAddr || "-"}</div>
                    <div>연 락 처 : {f.workerPhone || "-"}</div>
                  </div>
                </div>

                {/* 친권자 서명 (연소자만) */}
                {ct === "minor" && (
                  <div style={{ background:"#fff3cd", border:"1px solid #ffeeba", borderRadius:8, padding:12, marginTop:4 }}>
                    <span style={{ fontWeight:700, fontSize:"10.5pt", display:"block", color:"#856404", marginBottom:6, textAlign:"center" }}>
                      👨‍👩‍👦 친권자 (후견인) 동의서
                    </span>
                    <p style={{ fontSize:"8.5pt", color:"#666", lineHeight:1.4, marginBottom:8, textAlign:"center" }}>
                      위 연소근로자의 근로계약 체결 및 근로 행위에 동의합니다.
                    </p>
                    <div style={{ display:"flex", flexDirection:"column", gap:2, fontSize:"9pt" }}>
                      <div>친권자 성명 : <strong>{f.parentName || "-"}</strong> (관계: {f.parentRel || "-"})</div>
                      <div>생년월일 : {f.parentBirth || "-"}</div>
                      <div>주    소 : {f.parentAddr || "-"}</div>
                      <div>연 락 처 : {f.parentTel || "-"} &nbsp;
                        <span style={{ color: contract.worker_signed ? "#10b981" : "#f59e0b", fontSize:"8pt", fontWeight:700 }}>
                          {contract.worker_signed ? "(동의 서명 완료)" : "(서명 대기)"}
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <p style={{ fontSize:"7.5pt", color:"#bbb", textAlign:"center", marginTop:16, borderTop:"1px solid #eee", paddingTop:8 }}>
              ※ 본 계약서는 파잡(PAZAB) AI 매칭 플랫폼을 통해 작성되었습니다.
            </p>
          </div>
          {/* 공식 양식 숨김 렌더 (인쇄/PDF용) */}
          <div id="official-form-render" style={{position:"absolute",left:"-9999px",top:0,zIndex:-1,background:"#fff"}}>
            <ContractOfficialForm data={f} contractType={ct} />
          </div>
        </div>
      </div>

      {/* 하단 버튼 */}
      <div style={{ position:"fixed", bottom:0, left:0, right:0, padding:"10px 16px 14px", background:"rgba(24,24,27,0.97)", backdropFilter:"blur(12px)", borderTop:"1px solid var(--border)", maxWidth:480, margin:"0 auto" }}>
        {userRole === "worker" && !contract.worker_signed ? (
          <div style={{ display:"flex", gap:8 }}>
            <button onClick={() => setShowReviseModal(true)}
              style={{ flex:1, background:"var(--surface2)", border:"1px solid var(--border)", color:"var(--text)", fontWeight:600, padding:14, borderRadius:14, fontSize:13, cursor:"pointer" }}>
              ✏️ 수정요청
            </button>
            <button onClick={() => setShowAgreeModal(true)}
              style={{ flex:2, background:"linear-gradient(135deg,#10b981,#059669)", border:"none", color:"#fff", fontWeight:700, padding:14, borderRadius:14, fontSize:14, cursor:"pointer" }}>
              ✅ 동의합니다
            </button>
          </div>
        ) : userRole === "employer" ? (
          <div style={{ display:"flex", gap:6 }}>
            <button onClick={print}
              style={{ flex:1, background:"var(--surface2)", border:"1px solid var(--border)", color:"var(--text)", fontWeight:600, padding:"12px 6px", borderRadius:12, fontSize:12, cursor:"pointer" }}>
              📄 화면인쇄
            </button>
            <button onClick={downloadPDF} disabled={downloading}
              style={{ flex:1.8, background:"linear-gradient(135deg,#7c3aed,#ec4899)", border:"none", color:"#fff", fontWeight:700, padding:"12px 6px", borderRadius:12, fontSize:12, cursor:"pointer" }}>
              {downloading ? "생성 중..." : "📥 공식 양식 PDF"}
            </button>
          </div>
        ) : (
          <div style={{ display:"flex", gap:8 }}>
            <button onClick={print}
              style={{ flex:1, background:"var(--surface2)", border:"1px solid var(--border)", color:"var(--text)", fontWeight:600, padding:14, borderRadius:14, fontSize:13, cursor:"pointer" }}>
              📄 화면인쇄
            </button>
            <button onClick={downloadPDF} disabled={downloading}
              style={{ flex:1, background:"linear-gradient(135deg,#7c3aed,#ec4899)", border:"none", color:"#fff", fontWeight:700, padding:14, borderRadius:14, fontSize:14, cursor:"pointer" }}>
              {downloading ? "생성 중..." : "📥 공식 양식 PDF"}
            </button>
          </div>
        )}
      </div>

      {/* 동의 확인 모달 */}
      {showAgreeModal && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.75)", zIndex:300, display:"flex", alignItems:"center", justifyContent:"center", padding:24 }}>
          <div style={{ background:"var(--surface)", borderRadius:20, padding:24, width:"100%", maxWidth:360 }}>
            <div style={{ textAlign:"center", marginBottom:16 }}>
              <div style={{ fontSize:36, marginBottom:8 }}>📄</div>
              <p style={{ fontSize:16, fontWeight:700, color:"var(--text)", margin:"0 0 10px" }}>계약서 동의</p>
              <div style={{ background:"var(--surface2)", borderRadius:12, padding:12, textAlign:"left", fontSize:12, color:"var(--text-muted)", lineHeight:1.7 }}>
                <p style={{ margin:"0 0 6px", fontWeight:600, color:"var(--text)" }}>✅ 동의 전 확인사항</p>
                <p style={{ margin:"0 0 4px" }}>• 본 동의는 전자문서법에 따라 법적 효력이 있어요</p>
                <p style={{ margin:"0 0 4px" }}>• 동의 후에는 새 계약서 발행이 필요해요</p>
                <p style={{ margin:0 }}>• 내용을 충분히 확인 후 동의해주세요</p>
              </div>
            </div>
            <div style={{ display:"flex", gap:8 }}>
              <button onClick={() => setShowAgreeModal(false)}
                style={{ flex:1, background:"var(--surface2)", border:"1px solid var(--border)", borderRadius:12, padding:12, fontSize:14, color:"var(--text-muted)", cursor:"pointer" }}>
                다시 확인
              </button>
              <button onClick={handleAgree} disabled={agreeing}
                style={{ flex:1, background:"linear-gradient(135deg,#10b981,#059669)", border:"none", borderRadius:12, padding:12, fontSize:14, fontWeight:700, color:"#fff", cursor:"pointer" }}>
                {agreeing ? "처리 중..." : "✅ 동의합니다"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 수정 요청 모달 */}
      {showReviseModal && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.75)", zIndex:300, display:"flex", alignItems:"center", justifyContent:"center", padding:24 }}>
          <div style={{ background:"var(--surface)", borderRadius:20, padding:24, width:"100%", maxWidth:360 }}>
            <div style={{ marginBottom:16 }}>
              <p style={{ fontSize:16, fontWeight:700, color:"var(--text)", margin:"0 0 6px" }}>✏️ 수정 요청</p>
              <p style={{ fontSize:12, color:"var(--text-muted)", margin:"0 0 12px" }}>수정이 필요한 내용을 작성해주세요.<br/>사장님께 채팅으로 전달돼요.</p>
              <textarea value={reviseMsg} onChange={e => setReviseMsg(e.target.value)}
                placeholder="예) 시급을 10,500원으로 변경 요청합니다."
                rows={4}
                style={{ width:"100%", background:"var(--surface2)", border:"1px solid var(--border)", borderRadius:12, padding:"10px 12px", fontSize:13, color:"var(--text)", outline:"none", resize:"none", boxSizing:"border-box" as const }} />
            </div>
            <div style={{ display:"flex", gap:8 }}>
              <button onClick={() => { setShowReviseModal(false); setReviseMsg(""); }}
                style={{ flex:1, background:"var(--surface2)", border:"1px solid var(--border)", borderRadius:12, padding:12, fontSize:14, color:"var(--text-muted)", cursor:"pointer" }}>
                취소
              </button>
              <button onClick={handleRevise} disabled={!reviseMsg.trim()}
                style={{ flex:1, background: reviseMsg.trim() ? "linear-gradient(135deg,#7c3aed,#ec4899)" : "var(--surface2)", border:"none", borderRadius:12, padding:12, fontSize:14, fontWeight:700, color: reviseMsg.trim() ? "#fff" : "var(--text-muted)", cursor: reviseMsg.trim() ? "pointer" : "default" }}>
                전달하기
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

export default function ContractViewPage() {
  return (
    <Suspense fallback={<div style={{ minHeight:"100vh", background:"var(--bg)", display:"flex", alignItems:"center", justifyContent:"center" }}><p style={{ color:"var(--text-muted)" }}>로딩 중...</p></div>}>
      <ContractViewContent />
    </Suspense>
  );
}
