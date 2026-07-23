"use client";
import { useState, useEffect, useRef, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useToast } from "@/lib/useToast";
import { supabase } from "@/lib/supabase";
import ContractOfficialForm from "@/components/ContractOfficialForm";

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
  const [userRole, setUserRole] = useState<"employer"|"worker"|null>(null);
  const [showAgreeModal, setShowAgreeModal] = useState(false);
  const [showReviseModal, setShowReviseModal] = useState(false);
  const [reviseMsg, setReviseMsg] = useState("");
  const [showPrintPreview, setShowPrintPreview] = useState(false);
  const [previewScale, setPreviewScale] = useState(1);
  const previewWrapRef = useRef<HTMLDivElement>(null);
  const pinchRef = useRef<{ dist: number; scale: number } | null>(null);

  // 알바생 직접 입력/보완 상태 (사장님이 비워둔 항목 채우기용)
  const [workerBirthInput, setWorkerBirthInput] = useState("");
  const [workerPhoneInput, setWorkerPhoneInput] = useState("");
  const [workerAddrInput, setWorkerAddrInput] = useState("");
  const [workerAddrDetailInput, setWorkerAddrDetailInput] = useState("");
  const [workerPostcodeInput, setWorkerPostcodeInput] = useState("");
  const [bankNameInput, setBankNameInput] = useState("");
  const [customBankNameInput, setCustomBankNameInput] = useState("");
  const [bankNumberInput, setBankNumberInput] = useState("");
  const [parentNameInput, setParentNameInput] = useState("");
  const [parentRelInput, setParentRelInput] = useState("");
  const [parentTelInput, setParentTelInput] = useState("");
  const [showMinorWarningModal, setShowMinorWarningModal] = useState(false);
  const [detectedMinorAge, setDetectedMinorAge] = useState<number | null>(null);

  const calcAge = (birthDateStr: string): number | null => {
    if (!birthDateStr) return null;
    const clean = birthDateStr.replace(/\.\s*/g, "-").replace(/\s+/g, "");
    const birth = new Date(clean);
    if (isNaN(birth.getTime())) return null;
    const today = new Date();
    let age = today.getFullYear() - birth.getFullYear();
    const m = today.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) {
      age--;
    }
    return age;
  };

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

      // 알바생 프로필 및 기존 입력값 로드
      const { data: userProf } = await supabase
        .from("users")
        .select("real_name, nickname, birth_date, phone, address, address_detail")
        .eq("id", user.id)
        .maybeSingle();

      const cd = data.contract_data || {};
      setWorkerBirthInput(cd.workerBirth || userProf?.birth_date || "");
      setWorkerPhoneInput(cd.workerPhone || userProf?.phone || "");
      setWorkerAddrInput(cd.workerAddr || userProf?.address || "");
      setWorkerAddrDetailInput(cd.workerAddrDetail || userProf?.address_detail || "");
      setWorkerPostcodeInput(cd.workerPostcode || cd.postcode || "");
      setBankNameInput(cd.bankName || (cd.bankAccount ? cd.bankAccount.split(" ")[0] : ""));
      setBankNumberInput(cd.bankNumber || (cd.bankAccount ? cd.bankAccount.replace(/^[^\s]+\s*/, "") : ""));
      setParentNameInput(cd.parentName || "");
      setParentRelInput(cd.parentRel || "");
      setParentTelInput(cd.parentTel || "");
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

  const openAddressSearch = () => {
    const triggerDaum = () => {
      new (window as any).daum.Postcode({
        oncomplete: (data: any) => {
          const fullAddr = data.roadAddress || data.jibunAddress;
          const zonecode = data.zonecode || ""; // 카카오/다음 우편번호
          setWorkerAddrInput(fullAddr);
          setWorkerPostcodeInput(zonecode);
        },
      }).open();
    };

    if (typeof window !== "undefined" && (window as any).daum?.Postcode) {
      triggerDaum();
    } else {
      const script = document.createElement("script");
      script.src = "//t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js";
      script.onload = triggerDaum;
      document.head.appendChild(script);
    }
  };

  async function handleAgree() {
    if (!contract) return;
    setAgreeing(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      const cd = contract.contract_data || {};

      const finalBankName = bankNameInput === "기타" ? customBankNameInput.trim() : bankNameInput;
      const updatedBankAcc = (finalBankName || bankNumberInput.trim())
        ? `${finalBankName} ${bankNumberInput.trim()}`.trim()
        : cd.bankAccount || "";

      const updatedContractData = {
        ...cd,
        workerBirth: workerBirthInput || cd.workerBirth || null,
        workerPhone: workerPhoneInput || cd.workerPhone || null,
        workerAddr: workerAddrInput || cd.workerAddr || null,
        workerAddrDetail: workerAddrDetailInput || cd.workerAddrDetail || null,
        workerPostcode: workerPostcodeInput || cd.workerPostcode || null,
        bankName: finalBankName || cd.bankName || null,
        bankNumber: bankNumberInput.trim() || cd.bankNumber || null,
        bankAccount: updatedBankAcc || null,
        ...(cd.contractType === "minor" ? {
          parentName: parentNameInput || cd.parentName || null,
          parentRel: parentRelInput || cd.parentRel || null,
          parentTel: parentTelInput || cd.parentTel || null,
        } : {}),
      };

      // 1. Supabase contracts 테이블 업데이트
      const isBothSigned = contract.employer_signed;
      const { error: updateErr } = await supabase
        .from("contracts")
        .update({
          contract_data: updatedContractData,
          worker_signed: true,
          worker_signed_at: new Date().toISOString(),
          status: isBothSigned ? "active" : contract.status,
        })
        .eq("id", contract.id);

      if (updateErr) throw updateErr;

      // 2. 알바생 users 테이블 정보 역Sync
      if (user) {
        await supabase.from("users").update({
          birth_date: workerBirthInput || undefined,
          phone: workerPhoneInput || undefined,
          address: workerAddrInput || undefined,
          address_detail: workerAddrDetailInput || undefined,
          postcode: workerPostcodeInput || undefined,
        }).eq("id", user.id);
      }

      // 3. API patch 호출 (팀원 상태 및 채팅/알림 전송)
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
        showToast("✅ 계약서 작성 완료 및 서명 동의가 완료되었어요!");
        setShowAgreeModal(false);
        setTimeout(() => router.replace("/myteam"), 800);
      } else {
        showToast("서명 처리 중 오류가 발생했어요.", "error");
      }
    } catch (err: any) {
      console.error("Sign error:", err);
      showToast("서명 처리 실패: " + (err.message || err), "error");
    } finally {
      setAgreeing(false);
    }
  }

  async function handleRevise() {
    if (!contract || !reviseMsg.trim()) return;

    let targetMatchId = contract.match_id || matchId;
    if (!targetMatchId && contract.team_member_id) {
      const { data: tm } = await supabase.from("team_members").select("match_id").eq("id", contract.team_member_id).maybeSingle();
      if (tm?.match_id) targetMatchId = tm.match_id;
    }

    const { data: { user } } = await supabase.auth.getUser();
    const targetEmployerId = contract.employer_id;

    if (user && targetEmployerId) {
      // 1. 채팅 시스템 메시지 전송 (matchId가 있는 경우)
      if (targetMatchId) {
        await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            matchId: targetMatchId,
            senderId: user.id,
            receiverId: targetEmployerId,
            message: `📝 근로계약서 수정 요청\n\n"${reviseMsg.trim()}"`,
            messageType: "system",
          }),
        });
      }

      // 2. 사장님에게 인앱 알림 발송
      try {
        await fetch("/api/notifications", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userId: targetEmployerId,
            type: "contract",
            title: "✏️ 근로계약서 수정 요청이 도착했어요!",
            body: `근로자가 계약서 내용 수정을 요청했습니다: "${reviseMsg.trim()}"`,
            data: { url: `/contract?memberId=${contract.team_member_id || ""}&mode=update&from=team` },
          }),
        });
      } catch (e) {
        console.warn("Notification send error:", e);
      }
    }

    showToast("✅ 수정 요청을 전달했어요!");
    setShowReviseModal(false);
    setReviseMsg("");
  }

  const doPrint = () => window.print();
  const openPrintPreview = () => {
    setShowPrintPreview(true);
    // 열릴 때 화면 너비에 맞게 초기 스케일 계산 (setTimeout으로 DOM 렌더 후)
    setTimeout(() => {
      const w = window.innerWidth - 32;
      setPreviewScale(Math.min(1, w / 794));
    }, 50);
  };

  const onPinchStart = (e: React.TouchEvent) => {
    if (e.touches.length !== 2) return;
    const dist = Math.hypot(
      e.touches[0].clientX - e.touches[1].clientX,
      e.touches[0].clientY - e.touches[1].clientY,
    );
    pinchRef.current = { dist, scale: previewScale };
  };
  const onPinchMove = (e: React.TouchEvent) => {
    if (e.touches.length !== 2 || !pinchRef.current) return;
    e.preventDefault();
    const dist = Math.hypot(
      e.touches[0].clientX - e.touches[1].clientX,
      e.touches[0].clientY - e.touches[1].clientY,
    );
    const next = Math.min(2.5, Math.max(0.3, pinchRef.current.scale * (dist / pinchRef.current.dist)));
    setPreviewScale(next);
  };
  const onPinchEnd = () => { pinchRef.current = null; };
  const downloadPDF = openPrintPreview;

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
      <style>{`
        @media print {
          @page { size: A4; margin: 18mm 15mm 15mm; }
          body * { visibility: hidden; }
          #official-form-render, #official-form-render * { visibility: visible; }
          #official-form-render { display: block !important; position: fixed; inset: 0; width: 100%; height: auto; }
        }
        #official-form-render { display: none; }
        .print-preview-scroll::-webkit-scrollbar { width: 4px; }
        .print-preview-scroll::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.2); border-radius: 2px; }
      `}</style>
      {/* 헤더 */}
      <div style={{ position:"sticky", top:0, zIndex:20, background:"rgba(24,24,27,0.97)", backdropFilter:"blur(12px)", borderBottom:"1px solid var(--border)", padding:"12px 16px", display:"flex", alignItems:"center", gap:10 }}>
        <button onClick={() => router.back()}
          style={{ background:"none", border:"none", color:"var(--text-muted)", fontSize:18, cursor:"pointer", padding:"0 4px", display:"flex", alignItems:"center", gap:4 }}>←</button>
        <span style={{ fontSize:16, fontWeight:800, color:"var(--text)" }}>근로계약서</span>
        <div style={{ flex:1 }} />
        {/* 상태 배지 */}
        <span style={{
          fontSize:11, borderRadius:8, padding:"3px 8px", fontWeight:600,
          background: contract.status === "cancelled" ? "rgba(248,113,113,0.2)" : contract.status === "active" && contract.worker_signed ? "#10b98120" : "#f59e0b20",
          color: contract.status === "cancelled" ? "#f87171" : contract.status === "active" && contract.worker_signed ? "#10b981" : "#f59e0b",
        }}>
          {contract.status === "cancelled" ? "🚫 발행 취소됨" : contract.worker_signed ? "✅ 쌍방 서명 완료" : contract.employer_signed ? "⏳ 근로자 서명 대기" : "미서명"}
        </span>
        <button onClick={() => router.back()} aria-label="닫기" title="닫기"
          style={{ background:"var(--surface2)", border:"1px solid var(--border)", color:"var(--text)", width:30, height:30, borderRadius:"50%", fontSize:15, fontWeight:700, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", marginLeft:4 }}>
          ✕
        </button>
      </div>

      <div style={{ padding:"12px 12px 0" }}>
        {/* 취소 상태 경고 배너 */}
        {contract.status === "cancelled" ? (
          <div style={{ background: "rgba(248,113,113,0.1)", border: "1px solid rgba(248,113,113,0.3)", borderRadius: 14, padding: "12px 14px", marginBottom: 12 }}>
            <p style={{ fontSize: 13, fontWeight: 800, color: "#f87171", margin: "0 0 4px" }}>
              🚫 근로계약서 발행 취소됨
            </p>
            <p style={{ fontSize: 11, color: "var(--text-muted)", margin: 0, lineHeight: 1.6 }}>
              이 근로계약서는 사장님에 의해 발행이 취소되었습니다. 더 이상 서명하거나 동의할 수 없습니다.
            </p>
          </div>
        ) : userRole === "worker" && !contract.worker_signed && (
          <div style={{ background: "rgba(124,58,237,0.1)", border: "1px solid rgba(124,58,237,0.3)", borderRadius: 14, padding: "12px 14px", marginBottom: 12 }}>
            <p style={{ fontSize: 13, fontWeight: 800, color: "var(--purple-text)", margin: "0 0 4px" }}>
              ✍️ 근로계약서 확인 및 서명 동의 안내
            </p>
            <p style={{ fontSize: 11, color: "var(--text-muted)", margin: 0, lineHeight: 1.6 }}>
              계약 내용을 확인하신 후 하단 <strong style={{ color: "#10b981" }}>'✅ 동의합니다'</strong>를 클릭하여 사장님이 비워둔 본인 정보(생년월일, 연락처, 주소, 계좌번호 등)를 직접 기입한 뒤 서명을 완료해 주세요.
            </p>
          </div>
        )}

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
                • 지급방법: {f.payMethod === "계좌이체" ? (
                  <span>근로자 명의 계좌 입금 (수령 계좌: {f.bankAccount || (
                    <span style={{ display:"inline-flex", gap:4, alignItems:"center", verticalAlign:"middle" }}>
                      <select value={bankNameInput} onChange={e => setBankNameInput(e.target.value)}
                        style={{ background:"rgba(251,146,60,0.15)", border:"1.5px dashed #f97316", borderRadius:6, padding:"2px 4px", fontSize:"8.5pt", color:"#ea580c", fontWeight:800 }}>
                        <option value="">은행 선택</option>
                        <option value="KB국민">KB국민</option>
                        <option value="신한">신한</option>
                        <option value="우리">우리</option>
                        <option value="하나">하나</option>
                        <option value="카카오뱅크">카카오뱅크</option>
                        <option value="토스뱅크">토스뱅크</option>
                        <option value="NH농협">NH농협</option>
                        <option value="IBK기업">IBK기업</option>
                        <option value="새마을금고">새마을금고</option>
                        <option value="우체국">우체국</option>
                      </select>
                      <input type="text" value={bankNumberInput} onChange={e => setBankNumberInput(e.target.value)} placeholder="👉 계좌번호 직접 입력"
                        style={{ background:"rgba(251,146,60,0.15)", border:"1.5px dashed #f97316", borderRadius:6, padding:"3px 8px", fontSize:"8.5pt", color:"#ea580c", fontWeight:800, outline:"none", width:140 }} />
                    </span>
                  )})</span>
                ) : "근로자에게 직접 지급"}
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
                    <div>생년월일 : {f.workerBirth || (
                      <input type="date" value={workerBirthInput} onChange={e => {
                        const val = e.target.value;
                        setWorkerBirthInput(val);
                        const age = calcAge(val);
                        if (age !== null && age < 18) {
                          setDetectedMinorAge(age);
                          setShowMinorWarningModal(true);
                        }
                      }}
                        style={{ background:"rgba(251,146,60,0.15)", border:"1.5px dashed #f97316", borderRadius:6, padding:"3px 8px", fontSize:"9.5pt", color:"#ea580c", fontWeight:800, outline:"none", marginLeft:4 }} />
                    )}</div>
                    <div>주    소 : {[f.workerAddr, f.workerAddrDetail].filter(Boolean).join(" ") || (
                      <div style={{ display:"inline-flex", flexDirection:"column", gap:4, verticalAlign:"top", marginLeft:4 }}>
                        <span style={{ display:"inline-flex", gap:4, alignItems:"center" }}>
                          <input type="text" value={workerAddrInput} onChange={e => setWorkerAddrInput(e.target.value)} placeholder="👉 도로명/지번 주소 입력"
                            style={{ background:"rgba(251,146,60,0.15)", border:"1.5px dashed #f97316", borderRadius:6, padding:"3px 8px", fontSize:"9pt", color:"#ea580c", fontWeight:800, outline:"none", width:200 }} />
                          <button onClick={openAddressSearch} type="button"
                            style={{ background:"#7c3aed", border:"none", color:"#fff", borderRadius:6, padding:"3px 8px", fontSize:"8.5pt", fontWeight:700, cursor:"pointer" }}>
                            🔍 주소 검색
                          </button>
                        </span>
                        <input type="text" value={workerAddrDetailInput} onChange={e => setWorkerAddrDetailInput(e.target.value)} placeholder="👉 상세주소 입력 (동·호수·층 등)"
                          style={{ background:"rgba(251,146,60,0.15)", border:"1.5px dashed #f97316", borderRadius:6, padding:"3px 8px", fontSize:"9pt", color:"#ea580c", fontWeight:800, outline:"none", width:"100%", boxSizing:"border-box" }} />
                      </div>
                    )}</div>
                    <div>연 락 처 : {f.workerPhone || (
                      <input type="tel" value={workerPhoneInput} onChange={e => setWorkerPhoneInput(e.target.value)} placeholder="👉 여기에 연락처 직접 입력 (010-0000-0000)"
                        style={{ background:"rgba(251,146,60,0.15)", border:"1.5px dashed #f97316", borderRadius:6, padding:"3px 8px", fontSize:"9.5pt", color:"#ea580c", fontWeight:800, outline:"none", width:240, marginLeft:4, boxSizing:"border-box" }} />
                    )}</div>
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
          {/* 인쇄 전용 숨김 레이어 */}
          <div id="official-form-render">
            <ContractOfficialForm data={f} contractType={ct} />
          </div>
        </div>
      </div>

      {/* 하단 버튼 */}
      <div style={{ position:"fixed", bottom:0, left:0, right:0, padding:"10px 16px 14px", background:"rgba(24,24,27,0.97)", backdropFilter:"blur(12px)", borderTop:"1px solid var(--border)", maxWidth:480, margin:"0 auto" }}>
        {contract.status === "cancelled" ? (
          <div style={{ width: "100%", background: "rgba(248,113,113,0.12)", border: "1px solid rgba(248,113,113,0.3)", borderRadius: 14, padding: 14, textAlign: "center", color: "#f87171", fontSize: 13, fontWeight: 700 }}>
            🚫 발행 취소된 계약서입니다
          </div>
        ) : userRole === "worker" && !contract.worker_signed ? (
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
            <button onClick={openPrintPreview}
              style={{ flex:1, background:"var(--surface2)", border:"1px solid var(--border)", color:"var(--text)", fontWeight:600, padding:"12px 6px", borderRadius:12, fontSize:12, cursor:"pointer" }}>
              📄 화면인쇄
            </button>
            <button onClick={downloadPDF}
              style={{ flex:1.8, background:"linear-gradient(135deg,#7c3aed,#ec4899)", border:"none", color:"#fff", fontWeight:700, padding:"12px 6px", borderRadius:12, fontSize:12, cursor:"pointer" }}>
              📥 PDF 저장
            </button>
          </div>
        ) : (
          <div style={{ display:"flex", gap:8 }}>
            <button onClick={openPrintPreview}
              style={{ flex:1, background:"var(--surface2)", border:"1px solid var(--border)", color:"var(--text)", fontWeight:600, padding:14, borderRadius:14, fontSize:13, cursor:"pointer" }}>
              📄 화면인쇄
            </button>
            <button onClick={downloadPDF}
              style={{ flex:1, background:"linear-gradient(135deg,#7c3aed,#ec4899)", border:"none", color:"#fff", fontWeight:700, padding:14, borderRadius:14, fontSize:14, cursor:"pointer" }}>
              📥 PDF 저장
            </button>
          </div>
        )}
      </div>

      {/* 동의 확인 및 근로자 정보 입력 모달 */}
      {showAgreeModal && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.75)", zIndex:300, display:"flex", alignItems:"center", justifyContent:"center", padding:16 }}>
          <div style={{ background:"var(--surface)", borderRadius:24, padding:20, width:"100%", maxWidth:420, maxHeight:"90vh", overflowY:"auto", position:"relative" }}>
            <button onClick={() => setShowAgreeModal(false)} aria-label="닫기" title="닫기"
              style={{ position:"absolute", top:14, right:14, background:"var(--surface2)", border:"1px solid var(--border)", color:"var(--text-muted)", width:28, height:28, borderRadius:"50%", fontSize:14, fontWeight:700, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}>
              ✕
            </button>
            <div style={{ textAlign:"center", marginBottom:16 }}>
              <div style={{ fontSize:36, marginBottom:4 }}>📝</div>
              <h3 style={{ fontSize:16, fontWeight:800, color:"var(--text)", margin:"0 0 4px" }}>입력 정보 확인 및 최종 서명</h3>
              <p style={{ fontSize:11, color:"var(--text-muted)", margin:0 }}>계약서 본문에 기입하신 정보가 맞는지 최종 확인해 주세요.</p>
            </div>

            {/* 입력 정보 요약 카카오 카드 */}
            <div style={{ background:"rgba(16,185,129,0.06)", border:"1.5px solid #10b981", borderRadius:16, padding:14, display:"flex", flexDirection:"column", gap:10, marginBottom:16 }}>
              <div style={{ fontSize:12, display:"flex", justifyContent:"space-between", borderBottom:"1px dashed var(--border)", paddingBottom:6 }}>
                <span style={{ color:"var(--text-muted)", fontWeight:600 }}>👤 성명</span>
                <span style={{ color:"var(--text)", fontWeight:800 }}>{f.worker || "-"}</span>
              </div>
              <div style={{ fontSize:12, display:"flex", justifyContent:"space-between", borderBottom:"1px dashed var(--border)", paddingBottom:6 }}>
                <span style={{ color:"var(--text-muted)", fontWeight:600 }}>🎂 생년월일</span>
                <span style={{ color: workerBirthInput || f.workerBirth ? "#10b981" : "#f97316", fontWeight:800 }}>
                  {workerBirthInput || f.workerBirth || "미입력 (*필수)"}
                </span>
              </div>
              <div style={{ fontSize:12, display:"flex", justifyContent:"space-between", borderBottom:"1px dashed var(--border)", paddingBottom:6 }}>
                <span style={{ color:"var(--text-muted)", fontWeight:600 }}>📱 연락처</span>
                <span style={{ color: workerPhoneInput || f.workerPhone ? "#10b981" : "#f97316", fontWeight:800 }}>
                  {workerPhoneInput || f.workerPhone || "미입력 (*필수)"}
                </span>
              </div>
              <div style={{ fontSize:12, display:"flex", flexDirection:"column", gap:2, borderBottom:"1px dashed var(--border)", paddingBottom:6 }}>
                <div style={{ display:"flex", justifyContent:"space-between" }}>
                  <span style={{ color:"var(--text-muted)", fontWeight:600 }}>🏠 등본지 주소</span>
                  {workerPostcodeInput && <span style={{ fontSize:10, color:"#7c3aed", fontWeight:700 }}>📮 [{workerPostcodeInput}]</span>}
                </div>
                <span style={{ color: workerAddrInput || f.workerAddr ? "#10b981" : "#f97316", fontWeight:800, textAlign:"right", marginTop:2 }}>
                  {[workerAddrInput || f.workerAddr, workerAddrDetailInput || f.workerAddrDetail].filter(Boolean).join(" ") || "미입력 (*필수)"}
                </span>
              </div>
              <div style={{ fontSize:12, display:"flex", justifyContent:"space-between" }}>
                <span style={{ color:"var(--text-muted)", fontWeight:600 }}>🏦 급여 계좌</span>
                <span style={{ color: (bankNameInput || bankNumberInput || f.bankAccount) ? "#10b981" : "#f97316", fontWeight:800 }}>
                  {f.bankAccount || ((bankNameInput === "기타" ? customBankNameInput : bankNameInput) || bankNumberInput ? `${(bankNameInput === "기타" ? customBankNameInput : bankNameInput)} ${bankNumberInput}`.trim() : "미입력")}
                </span>
              </div>
            </div>

            <div style={{ background:"var(--surface2)", borderRadius:12, padding:10, fontSize:11, color:"var(--text-muted)", lineHeight:1.5, marginBottom:16 }}>
              • 본 서명은 전자문서법에 따라 법적 효력을 가지며, 동의 완료 시 즉시 근로계약이 체결됩니다.
            </div>

            <div style={{ display:"flex", gap:8 }}>
              <button onClick={() => setShowAgreeModal(false)}
                style={{ flex:1, background:"var(--surface2)", border:"1px solid var(--border)", borderRadius:12, padding:12, fontSize:13, fontWeight:600, color:"var(--text-muted)", cursor:"pointer" }}>
                ✏️ 다시 수정
              </button>
              <button onClick={handleAgree} disabled={agreeing}
                style={{ flex:2, background:"linear-gradient(135deg,#10b981,#059669)", border:"none", borderRadius:12, padding:12, fontSize:13, fontWeight:700, color:"#fff", cursor:"pointer" }}>
                {agreeing ? "서명 완료 중..." : "✅ 최종 동의 및 서명완료"}
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

      {/* 인쇄 미리보기 모달 */}
      {showPrintPreview && (
        <div style={{ position:"fixed", inset:0, zIndex:400, background:"rgba(0,0,0,0.85)", display:"flex", flexDirection:"column" }}>
          {/* 상단 툴바 */}
          <div style={{ flexShrink:0, display:"flex", alignItems:"center", gap:10, padding:"10px 16px", background:"#18181b", borderBottom:"1px solid #333" }}>
            <button onClick={() => setShowPrintPreview(false)}
              style={{ background:"none", border:"none", color:"#aaa", fontSize:22, cursor:"pointer", lineHeight:1 }}>✕</button>
            <span style={{ flex:1, color:"#fff", fontWeight:700, fontSize:15 }}>계약서 미리보기</span>
            <button onClick={doPrint}
              style={{ background:"linear-gradient(135deg,#7c3aed,#ec4899)", border:"none", borderRadius:10, padding:"8px 20px", color:"#fff", fontWeight:700, fontSize:14, cursor:"pointer" }}>
              🖨️ 인쇄 / PDF 저장
            </button>
          </div>
          {/* 계약서 스크롤 영역 */}
          <div
            ref={previewWrapRef}
            className="print-preview-scroll"
            onTouchStart={onPinchStart}
            onTouchMove={onPinchMove}
            onTouchEnd={onPinchEnd}
            style={{ flex:1, overflow:"auto", padding:"16px", display:"flex", justifyContent:"center", alignItems:"flex-start", touchAction:"pan-x pan-y" }}
          >
            <div style={{
              background:"#fff",
              width:"794px",
              transformOrigin:"top center",
              transform:`scale(${previewScale})`,
              // scale 줄었을 때 컨테이너 높이도 같이 줄도록
              marginBottom: `calc((${previewScale} - 1) * 100%)`,
              boxShadow:"0 4px 32px rgba(0,0,0,0.5)",
              flexShrink: 0,
            }}>
              <ContractOfficialForm data={f} contractType={ct} />
            </div>
          </div>
        </div>
      )}
      {/* 미성년자 나이 감지 경고 모달 */}
      {showMinorWarningModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", backdropFilter: "blur(6px)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div style={{ background: "var(--surface)", border: "1.5px solid #f59e0b", borderRadius: 20, padding: 24, width: "100%", maxWidth: 380, boxShadow: "0 25px 50px -12px rgba(0,0,0,0.5)", textAlign: "center" }}>
            <div style={{ fontSize: 44, marginBottom: 8 }}>⚠️</div>
            <h3 style={{ fontSize: 17, fontWeight: 900, color: "var(--text)", margin: "0 0 8px" }}>미성년자 (만 18세 미만) 확인</h3>
            <p style={{ fontSize: 13, color: "var(--text-muted)", lineHeight: 1.6, margin: "0 0 16px" }}>
              입력하신 생년월일 기준 <strong style={{ color: "#ea580c" }}>만 {detectedMinorAge}세 (연소근로자)</strong>입니다.<br /><br />
              📌 근로기준법상 만 18세 미만 근로자는 <strong style={{ color: "#ea580c" }}>보호자(친권자/후견인) 동의서 작성이 법적 필수</strong>입니다.
            </p>
            <div style={{ background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.3)", borderRadius: 12, padding: 10, fontSize: 11, color: "#d97706", marginBottom: 20 }}>
              💡 날짜 오입력(오타)인 경우 [생년월일 수정]을 눌러 다시 선택해 주세요.
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => {
                setWorkerBirthInput("");
                setShowMinorWarningModal(false);
              }} style={{ flex: 1, background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 12, padding: 12, fontSize: 13, fontWeight: 600, color: "var(--text-muted)", cursor: "pointer" }}>
                ✏️ 생년월일 수정
              </button>
              <button onClick={() => {
                setShowMinorWarningModal(false);
              }} style={{ flex: 1, background: "linear-gradient(135deg,#f59e0b,#d97706)", border: "none", borderRadius: 12, padding: 12, fontSize: 13, fontWeight: 700, color: "#fff", cursor: "pointer" }}>
                네, 맞습니다
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
