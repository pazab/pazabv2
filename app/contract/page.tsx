"use client";
import React, { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useToast } from "@/lib/useToast";
import { supabase } from "@/lib/supabase";
import ContractOfficialForm, { getOfficialFormHTML } from "@/components/ContractOfficialForm";

// 인라인 편집 필드
function E({ v, onChange, w="80px", ph="" }: { v:string; onChange:(s:string)=>void; w?:string; ph?:string }) {
  const ref = React.useRef<HTMLSpanElement>(null);
  return (
    <span contentEditable suppressContentEditableWarning
      ref={ref}
      onFocus={e => {
        // 포커스 시 placeholder면 내용 비우기
        if (!v && e.currentTarget.textContent === ph) {
          e.currentTarget.textContent = "";
        }
      }}
      onBlur={e => {
        const text = e.currentTarget.textContent || "";
        onChange(text === ph ? "" : text);
      }}
      style={{ display:"inline-block", minWidth:w, borderBottom:"1px solid #222",
        padding:"0 2px", outline:"none",
        background: v ? "rgba(255,252,180,0.7)" : "rgba(255,252,180,0.3)",
        cursor:"text", fontFamily:"inherit", fontSize:"inherit", lineHeight:"inherit" }}>
      {v || <span style={{ color:"#aaa", fontStyle:"italic", pointerEvents:"none" }}>{ph}</span>}
    </span>
  );
}

function CB({ checked, onChange, label }: { checked:boolean; onChange:(v:boolean)=>void; label:string }) {
  return (
    <label style={{ display:"inline-flex", alignItems:"center", gap:2, cursor:"pointer", marginRight:6, fontSize:"9pt" }}>
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} style={{ width:12, height:12 }} />
      {label}
    </label>
  );
}

type CT = "parttime"|"standard_unlimited"|"standard_fixed"|"minor";
const DAYS = ["월","화","수","목","금","토","일"];
const DAYKEYS = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];

function ContractContent() {
  const router = useRouter();
  const sp = useSearchParams();
  const matchId = sp.get("matchId") || "";
  const mode = sp.get("mode") || "";
  const fromParam = sp.get("from") || ""; // "chat" | "team" | ""

  const { showToast, ToastUI } = useToast();
  const [loading, setLoading] = useState(true);
  const [matches, setMatches] = useState<any[]>([]);
  const [selMatch, setSelMatch] = useState<any>(null);
  const [ct, setCt] = useState<CT>("parttime");
  const [step, setStep] = useState<"select"|"edit">("select");
  const [saving, setSaving] = useState(false);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [existingContract, setExistingContract] = useState<any>(null);

  const [f, setF] = useState({
    biz:"", bizRegNo:"", ceo:"", ceoPhone:"",
    bizAddr:"", samePlace:true, workPlace:"",
    bizType:"", jobDesc:"",
    worker:"", workerBirth:"", workerPhone:"", workerAddr:"",
    contractType:"fixed",
    startDate:"", endDate:"",
    workDaysMon:false, workDaysTue:false, workDaysWed:false,
    workDaysThu:false, workDaysFri:false, workDaysSat:false, workDaysSun:false,
    workDaysMode:"check", workDaysText:"",
    workStart:"", workEnd:"", breakTime:"30",
    workStartMon:"09:00", workEndMon:"18:00", breakTimeMon:"30",
    workStartTue:"09:00", workEndTue:"18:00", breakTimeTue:"30",
    workStartWed:"09:00", workEndWed:"18:00", breakTimeWed:"30",
    workStartThu:"09:00", workEndThu:"18:00", breakTimeThu:"30",
    workStartFri:"09:00", workEndFri:"18:00", breakTimeFri:"30",
    workStartSat:"09:00", workEndSat:"18:00", breakTimeSat:"30",
    workStartSun:"09:00", workEndSun:"18:00", breakTimeSun:"30",
    weeklyHours:"", dailyHours:"",
    wage:"", payDay:"말일", payMethod:"계좌이체",
    insEmp:false, insAcc:false, insPension:false, insHealth:false,
    contractDate:"",
    school:"", grade:"",
    parentName:"", parentRel:"부", parentBirth:"", parentAddr:"", parentTel:"",
    wageType:"hour",
    hasBonus:false,
    bonusAmount:"",
    hasExtraWage:false,
    extraWageDetails:"",
    weeklyHoliday:"일",
    overtimePremiumRate:"50",
    hasFamilyCert:true,
    hasParentConsent:true,
    breakStart:"12:00",
    breakEnd:"13:00",
  });

  const set = (k:string) => (v:string) => setF(p => ({...p, [k]:v}));
  const setB = (k:string) => (v:boolean) => setF(p => ({...p, [k]:v}));

  const selectedDays = DAYS.filter((_,i) => (f as any)[`workDays${DAYKEYS[i]}`]);

  useEffect(() => { if (matchId) load(); else setLoading(false); }, [matchId]);

  const load = async () => {
    const { data: cur } = await supabase.from("matches")
      .select("employer_id, worker_id").eq("id", matchId).single();
    if (!cur) { setLoading(false); return; }

    const { data: all } = await supabase.from("matches")
      .select("id, employer_id, worker_id, employer_profile_id, created_at, matched_at")
      .eq("employer_id", cur.employer_id).eq("worker_id", cur.worker_id)
      .eq("progress_status","hired").order("created_at",{ascending:false});

    const enriched = await Promise.all((all||[]).map(async (m,i) => {
      let ep = null;
      if (m.employer_profile_id) {
        // 매칭된 공고로 조회
        const { data } = await supabase.from("employer_profiles")
          .select("business_name, business_type, region, wage, work_days, work_hours, biz_reg_number, ceo_name, biz_address, biz_tel")
          .eq("id", m.employer_profile_id).maybeSingle();
        ep = data;
      }
      if (!ep) {
        // 공고 없으면 employer_id로 폴백 (초대 코드로 등록된 경우)
        const { data } = await supabase.from("employer_profiles")
          .select("business_name, business_type, region, wage, work_days, work_hours, biz_reg_number, ceo_name, biz_address, biz_tel")
          .eq("user_id", m.employer_id)
          .order("created_at", { ascending: false })
          .limit(1).maybeSingle();
        ep = data;
      }
      return { ...m, ep, idx:(all?.length||0)-i };
    }));
    setMatches(enriched);

    const [eu, wu] = await Promise.all([
      supabase.from("users").select("nickname, real_name, birth_date, phone, address").eq("id", cur.employer_id).single(),
      supabase.from("users").select("nickname, real_name, birth_date, phone, address").eq("id", cur.worker_id).single(),
    ]);

    const cur2 = enriched.find(m => m.id === matchId) || enriched[0];
    if (cur2) initF(cur2, eu.data, wu.data);

    // mode=update: 기존 계약서 불러와서 바로 편집 화면
    if (mode === "update" && matchId) {
      const { data: existing } = await supabase.from("contracts")
        .select("*").eq("match_id", matchId)
        .order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (existing?.contract_data) {
        setF(existing.contract_data);
        setCt(existing.contract_data.contractType || "parttime");
        setExistingContract(existing);
        setStep("edit"); // 바로 편집 화면으로
      }
    }

    setLoading(false);
  };

  const initF = (m:any, eu:any, wu:any) => {
    setSelMatch(m);
    const ep = m.ep;
    const today = new Date();
    const md = new Date(m.matched_at || m.created_at);
    const wd = ep?.work_days || "";
    const dayFlags: Record<string,boolean> = {};
    DAYS.forEach((d,i) => { dayFlags[`workDays${DAYKEYS[i]}`] = wd.includes(d); });

    // Clean up work_hours for start/end time extraction
    const cleanWorkHours = (ep?.work_hours || "").split("(")[0].trim();
    const [ws,we] = cleanWorkHours.includes("~")
      ? cleanWorkHours.split("~").map((s:string)=>s.trim()) : ["",""];

    // Parse default break time and weekly holiday
    const breakMatch = (ep?.work_hours || "").match(/휴게\s*(\d+)분/);
    const breakHoursMatch = (ep?.work_hours || "").match(/휴게\s*(\d+(\.\d+)?)시간/);
    let defaultBreak = "30";
    if (breakMatch) {
      defaultBreak = breakMatch[1];
    } else if (breakHoursMatch) {
      defaultBreak = String(parseFloat(breakHoursMatch[1]) * 60);
    } else if ((ep?.work_hours || "").includes("휴게 없음")) {
      defaultBreak = "0";
    }

    const holidayMatch = (ep?.work_hours || "").match(/주휴일\s*:\s*([가-힣a-zA-Z]+)/);
    const defaultHoliday = holidayMatch ? holidayMatch[1] : "일";

    const dayHours: Record<string,string> = {};
    DAYKEYS.forEach(dk => {
      dayHours[`workStart${dk}`] = ws || "09:00";
      dayHours[`workEnd${dk}`] = we || "18:00";
      dayHours[`breakTime${dk}`] = defaultBreak;
    });

    setF(p => ({...p,
      biz: ep?.business_name||"",
      bizRegNo: ep?.biz_reg_number||"",
      ceo: ep?.ceo_name||eu?.real_name||eu?.nickname||"",
      ceoPhone: ep?.biz_tel||eu?.phone||"",
      bizAddr: ep?.biz_address||ep?.region||"",
      samePlace: !ep?.biz_address||ep?.biz_address===ep?.region,
      workPlace: ep?.region||"",
      bizType: ep?.business_type||"",
      jobDesc: ep?.business_type ? `${ep.business_type} 관련 업무` : "",
      worker: wu?.real_name||wu?.nickname||"",
      workerBirth: wu?.birth_date ? wu.birth_date.replace(/-/g,". ") : "",
      workerPhone: wu?.phone||"",
      workerAddr: wu?.address||"",
      startDate: `${md.getFullYear()}. ${String(md.getMonth()+1).padStart(2,"0")}. ${String(md.getDate()).padStart(2,"0")}.`,
      ...dayFlags,
      ...dayHours,
      workStart: ws, workEnd: we,
      dailyHours: ws&&we ? String(Math.round((parseInt(we)-parseInt(ws))*10)/10) : "",
      wage: ep?.wage ? Number(ep.wage).toLocaleString() : "",
      weeklyHoliday: defaultHoliday,
      contractDate: `${today.getFullYear()}년  ${String(today.getMonth()+1).padStart(2,"0")}월  ${String(today.getDate()).padStart(2,"0")}일`,
    }));
  };

  const workDaysStr = f.workDaysMode==="text" ? f.workDaysText : selectedDays.join("·");

  // 전화번호 자동 포맷
  const formatPhone = (v: string) => {
    const n = v.replace(/\D/g, "");
    if (n.length <= 3) return n;
    if (n.length <= 7) return `${n.slice(0,3)}-${n.slice(3)}`;
    if (n.length <= 11) return `${n.slice(0,3)}-${n.slice(3,7)}-${n.slice(7)}`;
    return `${n.slice(0,3)}-${n.slice(3,7)}-${n.slice(7,11)}`;
  };

  // 사업자번호 자동 포맷
  const formatBizNo = (v: string) => {
    const n = v.replace(/\D/g, "");
    if (n.length <= 3) return n;
    if (n.length <= 5) return `${n.slice(0,3)}-${n.slice(3)}`;
    return `${n.slice(0,3)}-${n.slice(3,5)}-${n.slice(5,10)}`;
  };

  // 저장 전 검증
  const validate = (): string | null => {
    if (!f.biz.trim()) return "사업체명을 입력해주세요.";
    if (!f.ceo.trim()) return "대표자 성명을 입력해주세요.";
    if (!f.worker.trim()) return "근로자 성명을 입력해주세요.";
    if (!f.startDate.trim()) return "계약 시작일을 입력해주세요.";
    if (!f.wage.trim()) return "시급을 입력해주세요.";
    const wageNum = parseInt(f.wage.replace(/,/g, ""));
    if (isNaN(wageNum) || wageNum < 10030) {
      return `시급이 최저임금(10,030원)보다 낮아요.\n현재 입력: ${f.wage}원`;
    }
    if (f.workDaysMode === "check" && selectedDays.length === 0) {
      return "근무 요일을 선택해주세요.";
    }
    return null;
  };

  const buildPayload = () => ({
    employer_id: selMatch.employer_id,
    worker_id: selMatch.worker_id,
    start_date: f.startDate.replace(/\.\s*/g,"-").replace(/-$/,"").trim()||null,
    end_date: f.contractType!=="unlimited"&&f.endDate
      ? f.endDate.replace(/\.\s*/g,"-").replace(/-$/,"").trim() : null,
    wage: f.wage ? parseInt(f.wage.replace(/,/g,"")) : null,
    work_days: workDaysStr,
    work_hours: f.dailyHours||null,
    contract_data: {...f, contractType: ct},
    status: "pending", // 새 계약서는 pending (알바생 동의 후 active)
    employer_signed: true,
    worker_signed: false,
    signed_at: new Date().toISOString(),
  });

  const doSave = async (saveMode: "overwrite"|"new") => {
    if (!selMatch) return;

    // 저장 전 검증
    const err = validate();
    if (err) { showToast(`⚠️ ${err}`, "error"); return; }

    setShowSaveModal(false);
    setSaving(true);
    const payload = buildPayload();
    let error = null;

    if (saveMode === "overwrite" && existingContract) {
      // 덮어쓰기: 동의 초기화
      const r = await supabase.from("contracts")
        .update({ ...payload, status: "pending", worker_signed: false })
        .eq("id", existingContract.id);
      error = r.error;
    } else {
      // 새 계약서: 기존 계약서들 superseded 처리
      await supabase.from("contracts")
        .update({ status: "superseded" })
        .eq("match_id", selMatch.id)
        .neq("status", "superseded");

      const r = await supabase.from("contracts")
        .insert({ ...payload, match_id: selMatch.id });
      error = r.error;
    }

    if (!error) {
      if (selMatch.employer_id) {
        await supabase.from("users").update({ phone: f.ceoPhone }).eq("id", selMatch.employer_id);
        await supabase.from("employer_profiles").update({
          biz_reg_number: f.bizRegNo, ceo_name: f.ceo, biz_address: f.bizAddr, biz_tel: f.ceoPhone,
        }).eq("user_id", selMatch.employer_id);
      }
      if (selMatch.worker_id) {
        await supabase.from("users").update({ phone: f.workerPhone, address: f.workerAddr }).eq("id", selMatch.worker_id);
      }

      // 채팅에 시스템 메시지 전송
      const sendMatchId = selMatch.id || matchId;
      if (sendMatchId) {
        const { data: { user } } = await supabase.auth.getUser();
        if (user && selMatch.employer_id && selMatch.worker_id) {
          const receiverId = user.id === selMatch.employer_id ? selMatch.worker_id : selMatch.employer_id;
          try {
            const msg = saveMode === "new"
              ? "📄 새 근로계약서가 발행됐어요.\n기존 계약서를 대체하는 새 계약서예요.\n검토 후 동의해주세요."
              : "📄 근로계약서가 수정됐어요. 검토 후 동의해주세요.";
            await fetch("/api/chat", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                matchId: sendMatchId,
                senderId: user.id,
                receiverId,
                message: msg,
                messageType: "system",
              }),
            });
          } catch (msgErr) {
            console.error("채팅 API 오류:", msgErr);
          }
        }
      }
      showToast(saveMode === "overwrite"
        ? "✅ 계약서가 수정됐어요! 알바생 재동의 필요"
        : "✅ 새 계약서가 발행됐어요! 알바생 동의 대기중");

      // from 파라미터 기반 이동
      setTimeout(() => {
        if (fromParam === "chat" && selMatch?.id) {
          router.replace(`/chat/${selMatch.id}`);
        } else if (fromParam === "team") {
          router.back();
        } else {
          // 기본: 채팅창으로 (계약서는 채팅 기반 흐름)
          if (selMatch?.id) router.replace(`/chat/${selMatch.id}`);
          else router.back();
        }
      }, 1000);
    } else showToast("저장 오류: " + error.message, "error");
    setSaving(false);
  };

  const saveContract = async () => {
    if (!selMatch) return;
    const { data: existing } = await supabase.from("contracts")
      .select("id, created_at, contract_data, worker_signed, status")
      .eq("match_id", selMatch.id)
      .neq("status", "superseded")
      .order("created_at", { ascending: false })
      .limit(1).maybeSingle();

    if (existing) {
      if (existing.worker_signed) {
        // 동의 완료 → 무조건 새 계약서 (주의 메시지)
        const confirmed = window.confirm(
          "📄 새 근로계약서 작성\n\n" +
          "⚠️ 주의사항\n" +
          "· 이미 동의가 완료된 계약서가 있어요.\n" +
          "· 새 계약서는 기존 계약서를 대체해요.\n" +
          "· 기존 계약서는 이력으로 보존돼요.\n" +
          "· 알바생이 새 계약서에 다시 동의해야\n" +
          "  법적 효력이 발생해요.\n\n" +
          "계속 진행할까요?"
        );
        if (!confirmed) return;
        doSave("new");
      } else {
        // 미서명 → 선택 모달
        setExistingContract(existing);
        setShowSaveModal(true);
      }
    } else {
      doSave("new");
    }
  };

  const downloadPDF = async () => {
    const el = document.getElementById("official-form-render");
    if (!el) return;
    try {
      setSaving(true);
      const { default: jsPDF } = await import("jspdf");
      const { default: html2canvas } = await import("html2canvas");

      const canvas = await html2canvas(el, {
        scale: 2.5,
        useCORS: true,
        backgroundColor: "#ffffff",
        width: 794, // 210mm at 96dpi
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

      pdf.save(`근로계약서_${f.biz || "파잡"}_${f.worker || "근로자"}.pdf`);
    } catch (e: any) {
      alert("PDF 생성 중 오류 발생: " + e.message);
    } finally {
      setSaving(false);
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

  // ── 계약서 본문 ──
  const ContractBody = () => {
    const titles: Record<CT,string> = {
      parttime: "단시간근로자 표준근로계약서",
      standard_unlimited: "표준근로계약서 (기간의 정함이 없는 경우)",
      standard_fixed: "표준근로계약서 (기간의 정함이 있는 경우)",
      minor: "연소근로자 표준근로계약서",
    };

    return (
      <div style={{fontFamily:"'Noto Sans KR',sans-serif",fontSize:"9.5pt",color:"#000",lineHeight:1.6}}>
        <div className="title">{titles[ct]}</div>
        <div className="subtitle">(「근로기준법」 제17조에 따른 서면 근로계약)</div>
        <div className="law" style={{marginBottom:16}}>사업주와 근로자는 다음과 같이 근로계약을 체결한다.</div>

        {/* 1. 계약 기간 / 개시일 */}
        <div className="section">1. 근로계약기간</div>
        <div className="indent">
          {ct === "standard_unlimited" ? (
            <span>
              근로개시일: <E v={f.startDate} onChange={set("startDate")} w="140px" ph="년   월   일" /> 부터
            </span>
          ) : (
            <span>
              근로계약기간: <E v={f.startDate} onChange={set("startDate")} w="140px" ph="년   월   일" /> 부터 &nbsp;
              <E v={f.endDate} onChange={set("endDate")} w="140px" ph="년   월   일" /> 까지
            </span>
          )}
        </div>

        {/* 2. 근무장소 */}
        <div className="section">2. 근무장소</div>
        <div className="indent">
          <E v={f.workPlace} onChange={set("workPlace")} w="340px" ph="실제 근무할 장소 주소 입력" />
        </div>

        {/* 3. 업무내용 */}
        <div className="section">3. 업무의 내용</div>
        <div className="indent">
          <E v={f.jobDesc} onChange={set("jobDesc")} w="340px" ph="담당 직종 및 상세 업무 내용 입력" />
        </div>

        {/* 4. 소정근로시간 / 근무 요일 */}
        {ct !== "parttime" ? (
          <>
            <div className="section">4. 소정근로시간</div>
            <div className="indent">
              <E v={f.workStart} onChange={set("workStart")} w="45px" ph="09:00" /> 부터 &nbsp;
              <E v={f.workEnd} onChange={set("workEnd")} w="45px" ph="18:00" /> 까지 &nbsp;
              (휴게시간: <E v={f.breakStart} onChange={set("breakStart")} w="45px" ph="12:00" /> ~ &nbsp;
              <E v={f.breakEnd} onChange={set("breakEnd")} w="45px" ph="13:00" />)
              <div style={{marginTop:2}}>
                (1일 소정근로시간: <E v={f.dailyHours} onChange={set("dailyHours")} w="30px" ph="8" />시간, &nbsp;
                1주 소정근로시간: <E v={f.weeklyHours} onChange={set("weeklyHours")} w="30px" ph="40" />시간)
              </div>
            </div>

            <div className="section">5. 근무일 / 휴일</div>
            <div className="indent">
              매주 <E v={f.workDaysText} onChange={set("workDaysText")} w="30px" ph="5" />일 근무
              {f.workDaysMode === "check" && selectedDays.length > 0 && (" (근무일: " + selectedDays.join("·") + ")")}, 주휴일 매주 <E v={f.weeklyHoliday} onChange={set("weeklyHoliday")} w="30px" ph="일" />요일
              <div className="note" style={{marginTop:2}}>
                • 공휴일(대체공휴일 포함)은 근로기준법이 정하는 바에 따르며, 근로자의 날은 유급휴일로 함
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="section">4. 근로일 및 근로일별 근로시간</div>
            <div className="indent" style={{overflowX:"auto", marginBottom:4}}>
              <table style={{width:"100%",minWidth:320,borderCollapse:"collapse",marginBottom:6,tableLayout:"fixed"}}>
                <tbody>
                  <tr>
                    <td className="th2" style={{width:"75px",background:"#f5f5f5",fontWeight:600,textAlign:"center"}}>근무일</td>
                    {selectedDays.map(d => (
                      <td key={d} className="th2" style={{background:"#f5f5f5",fontWeight:600,textAlign:"center"}}>{d}요일</td>
                    ))}
                  </tr>
                  <tr>
                    <td className="th" style={{background:"#fff",fontSize:"8.5pt",textAlign:"center"}}>시작 시간</td>
                    {selectedDays.map(d => {
                      const idx = DAYS.indexOf(d);
                      const key = "workStart" + DAYKEYS[idx];
                      return (
                        <td key={d} style={{textAlign:"center",padding:"4px 2px"}}>
                          <E v={(f as any)[key]} onChange={set(key)} w="42px" ph="09:00" />
                        </td>
                      );
                    })}
                  </tr>
                  <tr>
                    <td className="th" style={{background:"#fff",fontSize:"8.5pt",textAlign:"center"}}>종료 시간</td>
                    {selectedDays.map(d => {
                      const idx = DAYS.indexOf(d);
                      const key = "workEnd" + DAYKEYS[idx];
                      return (
                        <td key={d} style={{textAlign:"center",padding:"4px 2px"}}>
                          <E v={(f as any)[key]} onChange={set(key)} w="42px" ph="18:00" />
                        </td>
                      );
                    })}
                  </tr>
                  <tr>
                    <td className="th" style={{background:"#fff",fontSize:"8.5pt",textAlign:"center"}}>휴게 (분)</td>
                    {selectedDays.map(d => {
                      const idx = DAYS.indexOf(d);
                      const key = "breakTime" + DAYKEYS[idx];
                      return (
                        <td key={d} style={{textAlign:"center",padding:"4px 2px"}}>
                          <E v={(f as any)[key]} onChange={set(key)} w="28px" ph="30" />분
                        </td>
                      );
                    })}
                  </tr>
                </tbody>
              </table>
              <div style={{marginTop:4}}>
                주휴일: 매주 <E v={f.weeklyHoliday} onChange={set("weeklyHoliday")} w="30px" ph="일" />요일
              </div>
              <div className="note" style={{marginTop:2}}>
                • 공휴일(대체공휴일 포함)은 근로기준법이 정하는 바에 따르며, 근로자의 날은 유급휴일로 함
              </div>
            </div>
          </>
        )}

        {/* 5 / 6. 임금 조건 */}
        <div className="section">{ct === "parttime" ? "5" : "6"}. 임금</div>
        <div className="indent">
          <div style={{display:"flex",alignItems:"baseline",gap:8,flexWrap:"wrap"}}>
            <CB checked={f.wageType === "hour"} onChange={v=>v&&set("wageType")("hour")} label="시간급" />
            <CB checked={f.wageType === "day"} onChange={v=>v&&set("wageType")("day")} label="일급" />
            <CB checked={f.wageType === "month"} onChange={v=>v&&set("wageType")("month")} label="월급" />
            &nbsp;: &nbsp;<E v={f.wage} onChange={v => { const n = v.replace(/[^0-9]/g,""); set("wage")(n ? Number(n).toLocaleString() : ""); }} w="80px" ph="10,030" /> 원
          </div>

          <div style={{marginTop:4,display:"flex",alignItems:"baseline",gap:6,flexWrap:"wrap"}}>
            • 상여금: &nbsp;
            <CB checked={f.hasBonus} onChange={setB("hasBonus")} label="있음" />
            <CB checked={!f.hasBonus} onChange={v=>setB("hasBonus")(!v)} label="없음" />
            {f.hasBonus && <>(&nbsp;<E v={f.bonusAmount} onChange={set("bonusAmount")} w="80px" ph="금액 입력" /> 원)</>}
          </div>

          <div style={{marginTop:4,display:"flex",alignItems:"baseline",gap:6,flexWrap:"wrap"}}>
            • 그 밖의 수당(약정수당): &nbsp;
            <CB checked={f.hasExtraWage} onChange={setB("hasExtraWage")} label="있음" />
            <CB checked={!f.hasExtraWage} onChange={v=>setB("hasExtraWage")(!v)} label="없음" />
            {f.hasExtraWage && <>(&nbsp;<E v={f.extraWageDetails} onChange={set("extraWageDetails")} w="200px" ph="예: 식대 10만원" />)</>}
          </div>

          {ct === "parttime" && (
            <div style={{marginTop:4}}>
              • 초과근로에 대한 가산임금률: <E v={f.overtimePremiumRate} onChange={set("overtimePremiumRate")} w="35px" ph="50" /> %
            </div>
          )}

          <div style={{marginTop:4}}>
            • 임금지급일: 매월(매주 또는 매일) <E v={f.payDay} onChange={set("payDay")} w="40px" ph="말일" /> 일 (휴일의 경우는 전날 지급)
          </div>

          <div style={{marginTop:4}}>
            • 지급방법: &nbsp;
            <CB checked={f.payMethod === "계좌이체"} onChange={v=>v&&set("payMethod")("계좌이체")} label="근로자 명의 계좌 입금" />
            <CB checked={f.payMethod === "현금"} onChange={v=>v&&set("payMethod")("현금")} label="근로자에게 직접 지급" />
          </div>
        </div>

        {/* 6 / 7. 연차유급휴가 */}
        <div className="section">{ct === "parttime" ? "6" : "7"}. 연차유급휴가</div>
        <div className="indent">
          {ct === "parttime" ? (
            "• 통상근로자의 근로시간에 비례하여 연차유급휴가를 부여함"
          ) : (
            "• 연차유급휴가는 근로기준법에서 정하는 바에 따라 부여함"
          )}
        </div>

        {/* 연소근로자 전용 가족관계증명서 */}
        {ct === "minor" && (
          <>
            <div className="section">8. 가족관계증명서 및 동의서 구비</div>
            <div className="indent">
              • 가족관계기록사항에 관한 증명서 제출 여부: &nbsp;
              <CB checked={f.hasFamilyCert} onChange={setB("hasFamilyCert")} label="제출함" />
              <CB checked={!f.hasFamilyCert} onChange={v=>setB("hasFamilyCert")(!v)} label="미제출" />
              <br/>
              • 친권자 또는 후견인 동의서 구비 여부: &nbsp;
              <CB checked={f.hasParentConsent} onChange={setB("hasParentConsent")} label="구비함" />
              <CB checked={!f.hasParentConsent} onChange={v=>setB("hasParentConsent")(!v)} label="미구비" />
            </div>
          </>
        )}

        {/* 7 / 8 / 9. 사회보험 */}
        <div className="section">{ct === "minor" ? "9" : ct === "parttime" ? "7" : "8"}. 사회보험 적용여부</div>
        <div className="indent">
          <div className="ins-row" style={{marginTop:2}}>
            {[
              {key:"insEmp", label:"고용보험"},
              {key:"insAcc", label:"산재보험"},
              {key:"insPension", label:"국민연금"},
              {key:"insHealth", label:"건강보험"},
            ].map(ins => (
              <div key={ins.key} className="ins-item">
                <span className="box">{(f as any)[ins.key] ? "✓" : ""}</span>
                {ins.label}
                <CB checked={(f as any)[ins.key]} onChange={setB(ins.key)} label="" />
              </div>
            ))}
          </div>
        </div>

        {/* 8 / 9 / 10. 교부 의무 */}
        <div className="section">{ct === "minor" ? "10" : ct === "parttime" ? "8" : "9"}. 근로계약서 교부</div>
        <div className="indent">
          • 사업주는 근로계약을 체결함과 동시에 본 계약서를 사본하여 근로자의 교부요구와 관계없이 근로자에게 교부함(근로기준법 제17조 이행)
        </div>

        {/* 9 / 10 / 11. 성실 이행 */}
        <div className="section">{ct === "minor" ? "11" : ct === "parttime" ? "9" : "10"}. 근로계약 등의 성실한 이행의무</div>
        <div className="indent">
          • 사업주와 근로자는 각자가 근로계약, 취업규칙, 단체협약을 지키고 성실하게 이행하여야 함
        </div>

        {/* 10 / 11 / 12. 기타 */}
        <div className="section">{ct === "minor" ? "12" : ct === "parttime" ? "10" : "11"}. 그 밖의 사항</div>
        <div className="indent">
          {ct === "minor" ? (
            "• 13세 이상 15세 미만인 자에 대해서는 고용노동부장관의 취직인허증을 교부받아야 함. 이 계약에 정함이 없는 사항은 근로기준법 및 관련 법령에 따름"
          ) : (
            "• 이 계약에 정하지 않은 사항은 근로관계법령이 정하는 바에 따름"
          )}
        </div>

        {/* 날짜 및 서명 */}
        <div className="sign-area" style={{marginTop:30}}>
          <div style={{textAlign:"center",marginBottom:18,fontSize:"9.5pt"}}>
            <E v={f.contractDate} onChange={set("contractDate")} w="180px" ph="년     월     일" />
          </div>
          
          <div style={{display:"flex",flexDirection:"column",gap:12}}>
            {/* 사업주 서명 */}
            <div style={{background:"#f9f9f9",border:"1px solid #ddd",borderRadius:8,padding:10}}>
              <span style={{fontWeight:700,fontSize:"10pt",display:"block",marginBottom:4}}>사 업 주 (구인자)</span>
              <div style={{display:"flex",flexDirection:"column",gap:2,fontSize:"9pt"}}>
                <div>사업체명 : <E v={f.biz} onChange={set("biz")} w="140px" ph="상호 입력" /> &nbsp;
                  (사업자번호: <E v={f.bizRegNo} onChange={v => set("bizRegNo")(formatBizNo(v))} w="100px" ph="000-00-00000" />)
                </div>
                <div>대 표 자 : <E v={f.ceo} onChange={set("ceo")} w="80px" ph="대표자 성명" /> (서명 또는 날인)</div>
                <div>주    소 : <E v={f.bizAddr} onChange={set("bizAddr")} w="280px" ph="사업장 소재지 주소 입력" /></div>
                <div>연 락 처 : <E v={f.ceoPhone} onChange={v => set("ceoPhone")(formatPhone(v))} w="110px" ph="010-0000-0000" /></div>
              </div>
            </div>

            {/* 근로자 서명 */}
            <div style={{background:"#f9f9f9",border:"1px solid #ddd",borderRadius:8,padding:10}}>
              <span style={{fontWeight:700,fontSize:"10pt",display:"block",marginBottom:4}}>근 로 자 (구직자)</span>
              <div style={{display:"flex",flexDirection:"column",gap:2,fontSize:"9pt"}}>
                <div>성    명 : <E v={f.worker} onChange={set("worker")} w="80px" ph="근로자 성명" /> &nbsp;
                  (생년월일: <E v={f.workerBirth} onChange={set("workerBirth")} w="100px" ph="YYYY. MM. DD." />)
                </div>
                <div>주    소 : <E v={f.workerAddr} onChange={set("workerAddr")} w="280px" ph="상세 주소(등본 주소) 입력" /></div>
                <div>연 락 처 : <E v={f.workerPhone} onChange={v => set("workerPhone")(formatPhone(v))} w="110px" ph="010-0000-0000" /> (서명 또는 날인)</div>
              </div>
            </div>

            {/* 연소근로자 친권자 동의서 내장 */}
            {ct === "minor" && (
              <div style={{background:"#fff3cd",border:"1px solid #ffeeba",borderRadius:8,padding:12,marginTop:12}}>
                <span style={{fontWeight:700,fontSize:"10.5pt",display:"block",color:"#856404",marginBottom:6,textAlign:"center"}}>
                  👨‍👩‍👦 친권자 (후견인) 동의서
                </span>
                <p style={{fontSize:"8.5pt",color:"#666",lineHeight:1.4,marginBottom:8,textAlign:"center"}}>
                  본인은 위 연소근로자(만 18세 미만)의 친권자로서,<br/>
                  위 사업장에서의 표준 근로계약 체결 및 근로 행위에 동의합니다.
                </p>
                <div style={{display:"flex",flexDirection:"column",gap:2,fontSize:"9pt"}}>
                  <div>친권자 성명 : <E v={f.parentName} onChange={set("parentName")} w="80px" ph="성명" /> &nbsp;
                    관계 : &nbsp;
                    <CB checked={f.parentRel==="부"} onChange={v=>v&&set("parentRel")("부")} label="부" />
                    <CB checked={f.parentRel==="모"} onChange={v=>v&&set("parentRel")("모")} label="모" />
                    <CB checked={f.parentRel==="기타"} onChange={v=>v&&set("parentRel")("기타")} label="기타" />
                  </div>
                  <div>생년월일 : <E v={f.parentBirth} onChange={set("parentBirth")} w="100px" ph="YYYY. MM. DD." /></div>
                  <div>주    소 : <E v={f.parentAddr} onChange={set("parentAddr")} w="280px" ph="주소 입력" /></div>
                  <div>연 락 처 : <E v={f.parentTel} onChange={v => set("parentTel")(formatPhone(v))} w="110px" ph="010-0000-0000" /> (서명)</div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  if (loading) return (
    <main style={{minHeight:"100vh",background:"var(--bg)",display:"flex",alignItems:"center",justifyContent:"center"}}>
      <p style={{color:"var(--text-muted)"}}>로딩 중...</p>
      {ToastUI}
    </main>
  );

  return (
    <main style={{minHeight:"100vh",background:"var(--bg)",color:"var(--text)",maxWidth:480,margin:"0 auto",paddingBottom:80}}>
      {/* 저장 선택 모달 */}
      {showSaveModal && (
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.7)",zIndex:300,display:"flex",alignItems:"flex-end",justifyContent:"center"}}>
          <div style={{background:"var(--surface)",borderRadius:"20px 20px 0 0",padding:24,width:"100%",maxWidth:480}}>
            <p style={{fontSize:15,fontWeight:700,color:"var(--text)",marginBottom:6}}>기존 계약서가 있어요</p>
            <p style={{fontSize:12,color:"var(--text-muted)",marginBottom:20}}>
              📄 {existingContract?.contract_data?.contractType === "parttime" ? "단시간근로자" :
                  existingContract?.contract_data?.contractType === "minor" ? "연소근로자" : "표준"} 근로계약서
              &nbsp;({new Date(existingContract?.created_at).toLocaleDateString("ko-KR")})
            </p>
            <div style={{display:"flex",flexDirection:"column",gap:8}}>
              <button onClick={() => doSave("overwrite")}
                style={{background:"linear-gradient(135deg,#7c3aed,#ec4899)",border:"none",borderRadius:14,padding:14,color:"#fff",fontSize:14,fontWeight:700,cursor:"pointer"}}>
                ✏️ 기존 계약서 수정 (덮어쓰기)
              </button>
              <button onClick={() => doSave("new")}
                style={{background:"var(--surface2)",border:"1px solid var(--border)",borderRadius:14,padding:14,color:"var(--text)",fontSize:14,fontWeight:600,cursor:"pointer"}}>
                📄 새 계약서로 추가 (재계약)
              </button>
              <button onClick={() => setShowSaveModal(false)}
                style={{background:"none",border:"none",padding:10,color:"var(--text-muted)",fontSize:13,cursor:"pointer"}}>
                취소
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 헤더 */}
      <div style={{position:"sticky",top:0,zIndex:20,background:"rgba(24,24,27,0.97)",backdropFilter:"blur(12px)",borderBottom:"1px solid var(--border)",padding:"12px 16px",display:"flex",alignItems:"center",gap:10}}>
        <button onClick={() => step==="edit" ? setStep("select") : router.back()}
          style={{background:"none",border:"none",color:"var(--text-muted)",fontSize:20,cursor:"pointer",padding:"0 4px"}}>←</button>
        <span style={{fontSize:16,fontWeight:700,color:"var(--text)"}}>근로계약서</span>
      </div>

      {step === "select" ? (
        <div style={{padding:16}}>
          <p style={{fontSize:13,fontWeight:700,color:"var(--text)",marginBottom:12}}>계약서 종류 선택</p>
          {([
            {id:"parttime" as CT, label:"단시간근로자 표준근로계약서", desc:"주 15시간 미만 또는 단시간 알바 (가장 일반적)"},
            {id:"standard_unlimited" as CT, label:"표준근로계약서 (무기계약)", desc:"기간의 정함이 없는 일반 근로계약"},
            {id:"standard_fixed" as CT, label:"표준근로계약서 (기간제)", desc:"근무 기간을 명시하는 계약직 근로계약"},
            {id:"minor" as CT, label:"연소근로자 표준근로계약서", desc:"만 18세 미만 청소년 — 친권자 동의 포함"},
          ]).map(c => (
            <div key={c.id} onClick={() => setCt(c.id)}
              style={{background:ct===c.id ? "linear-gradient(135deg,#7c3aed15,#ec489915)" : "var(--surface)", border:"1.5px solid " + (ct===c.id ? "#7c3aed" : "var(--border)"), borderRadius:14, padding:"14px 16px", marginBottom:10, cursor:"pointer", transition:"all 0.15s"}}>
              <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}>
                <div style={{width:18,height:18,borderRadius:"50%",border:"2px solid " + (ct===c.id ? "#7c3aed" : "var(--border)"),display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                  {ct===c.id && <div style={{width:10,height:10,borderRadius:"50%",background:"#7c3aed"}} />}
                </div>
                <span style={{fontSize:13,fontWeight:700,color:"var(--text)"}}>{c.label}</span>
              </div>
              <p style={{fontSize:11,color:"var(--text-muted)",margin:"0 0 0 26px"}}>{c.desc}</p>
            </div>
          ))}
          {matches.length > 1 && <>
            <p style={{fontSize:13,fontWeight:700,color:"var(--text)",margin:"16px 0 10px"}}>계약 선택</p>
            {matches.map(m => (
              <div key={m.id} onClick={() => { setSelMatch(m); initF(m,null,null); }}
                style={{background:selMatch?.id===m.id?"var(--surface2)":"var(--surface)", border:"1.5px solid " + (selMatch?.id===m.id?"#7c3aed":"var(--border)"), borderRadius:12, padding:"12px 14px", marginBottom:8, cursor:"pointer"}}>
                <span style={{fontSize:13,color:"var(--text)"}}>계약 #{m.idx} — {m.ep?.business_name||"매장"}</span>
              </div>
            ))}
          </>}
          <button onClick={() => setStep("edit")}
            style={{width:"100%",background:"linear-gradient(135deg,#8b5cf6,#7c3aed)",border:"none",color:"#fff",fontWeight:700,padding:16,borderRadius:16,fontSize:15,cursor:"pointer",marginTop:8}}>
            계약서 작성 시작 →
          </button>
        </div>
      ) : (
        <div style={{padding:"12px 12px 80px"}}>
          <div style={{background:"rgba(255,235,59,0.12)",border:"1px solid rgba(255,235,59,0.4)",borderRadius:10,padding:"8px 12px",marginBottom:12,fontSize:12,color:"#fbbf24"}}>
            ✏️ 노란 빈칸을 탭해서 직접 수정 · 저장 후 출력하세요
          </div>
          {/* 근무 장소 토글 (편집 UI) */}
          <div style={{background:"var(--surface2)",borderRadius:10,padding:"8px 12px",marginBottom:10,fontSize:12,color:"var(--text-muted)",display:"flex",alignItems:"center",gap:8}}>
            <CB checked={f.samePlace} onChange={v => { setB("samePlace")(v); if(v) set("workPlace")(f.bizAddr); }} label="근무장소 = 사업장 소재지" />
          </div>
          <div id="contract-print" style={{background:"#fff",borderRadius:10,padding:"16px 14px",border:"1px solid #ccc",overflowX:"auto"}}>
            <ContractBody />
            <p style={{fontSize:"7.5pt",color:"#bbb",textAlign:"center",marginTop:16,borderTop:"1px solid #eee",paddingTop:8}}>
              ※ 본 계약서는 파잡(PAZAB) AI 매칭 플랫폼을 통해 작성되었습니다.
            </p>
          </div>
          {/* 공식 양식 숨김 렌더 (인쇄/PDF용) */}
          <div id="official-form-render" style={{position:"absolute",left:"-9999px",top:0,zIndex:-1,background:"#fff"}}>
            <ContractOfficialForm data={f} contractType={ct} />
          </div>
          <div style={{position:"fixed",bottom:0,left:0,right:0,padding:"10px 16px 14px",background:"rgba(24,24,27,0.97)",backdropFilter:"blur(12px)",borderTop:"1px solid var(--border)",maxWidth:480,margin:"0 auto"}}>
            <div style={{display:"flex",gap:6}}>
              <button onClick={saveContract} disabled={saving}
                style={{flex:1,background:"var(--surface2)",border:"1px solid var(--border)",color:"var(--text)",fontWeight:600,padding:"12px 10px",borderRadius:12,fontSize:12,cursor:"pointer"}}>
                {saving ? "저장 중..." : "💾 저장"}
              </button>
              <button onClick={print}
                style={{flex:1,background:"var(--surface2)",border:"1px solid var(--border)",color:"var(--text)",fontWeight:600,padding:"12px 10px",borderRadius:12,fontSize:12,cursor:"pointer"}}>
                📄 화면인쇄
              </button>
              <button onClick={downloadPDF} disabled={saving}
                style={{flex:2,background:"linear-gradient(135deg,#7c3aed,#ec4899)",border:"none",color:"#fff",fontWeight:700,padding:"12px 10px",borderRadius:12,fontSize:12,cursor:"pointer"}}>
                📥 공식 양식 PDF
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

export default function ContractPage() {
  return (
    <Suspense fallback={<div style={{minHeight:"100vh",background:"var(--bg)",display:"flex",alignItems:"center",justifyContent:"center"}}><p style={{color:"var(--text-muted)"}}>로딩 중...</p></div>}>
      <ContractContent />
    </Suspense>
  );
}
