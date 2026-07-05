"use client";

import React from "react";

/* ──────────────────────────────────────────────
   공식 표준근로계약서 HTML/CSS 1:1 복제 컴포넌트
   ※ 고용노동부 개정 표준근로계약서 양식 기반
   ※ 인쇄 전용 — 화면 편집 UI 아님
   ────────────────────────────────────────────── */

interface FormData {
  [key: string]: any;
}

/* ── 유틸 ── */
const B = ({ children, w }: { children?: React.ReactNode; w?: string }) => (
  <span
    style={{
      display: "inline-block",
      minWidth: w || "60px",
      borderBottom: "1px solid #000",
      textAlign: "center",
      padding: "0 4px",
      lineHeight: 1.4,
    }}
  >
    {children || "\u00A0"}
  </span>
);

const Chk = ({ on }: { on?: boolean }) => (
  <span style={{ fontSize: "13pt", verticalAlign: "middle" }}>
    {on ? "☑" : "☐"}
  </span>
);

/* ── 공통 CSS 문자열 ── */
const STYLES = `
@import url('https://fonts.googleapis.com/css2?family=Noto+Serif+KR:wght@400;700;900&display=swap');

* { margin:0; padding:0; box-sizing:border-box; }

.of {
  width: 210mm;
  min-height: 297mm;
  padding: 18mm 18mm 15mm;
  font-family: 'Noto Serif KR', '바탕', 'Batang', serif;
  font-size: 10pt;
  color: #000;
  background: #fff;
  line-height: 1.9;
}

.of-title {
  text-align: center;
  margin-bottom: 10px;
}
.of-title span {
  display: inline-block;
  border: 2.5px solid #000;
  font-size: 15pt;
  font-weight: 900;
  padding: 5px 24px;
  letter-spacing: 5px;
}

.of-party {
  text-indent: 40px;
  margin-bottom: 6px;
  font-size: 10pt;
}

.of-h {
  font-weight: 700;
  margin-top: 6px;
  margin-bottom: 1px;
  font-size: 10pt;
}

.of-sub {
  padding-left: 18px;
  font-size: 9.5pt;
}

.of-note {
  padding-left: 24px;
  font-size: 8pt;
  color: #333;
}

.of-tbl {
  width: 100%;
  border-collapse: collapse;
  margin: 4px 0;
  font-size: 8.5pt;
}
.of-tbl td, .of-tbl th {
  border: 1px solid #000;
  padding: 2px 4px;
  text-align: center;
  vertical-align: middle;
  height: 18px;
}
.of-tbl th {
  background: none;
  font-weight: 400;
}

.of-sign {
  margin-top: 14px;
  font-size: 10pt;
  line-height: 2.0;
}

.of-sign-label {
  display: inline-block;
  width: 80px;
  text-align: right;
  letter-spacing: 6px;
  margin-right: 4px;
}

.of-sign-label2 {
  display: inline-block;
  width: 80px;
  text-align: right;
  letter-spacing: 2px;
  margin-right: 4px;
}

.of-date-center {
  text-align: center;
  margin-top: 12px;
  font-size: 10pt;
}

.of-page2 {
  page-break-before: always;
}

@media print {
  @page { size: A4; margin: 0; }
  html, body { width: 210mm; }
  .of { padding: 18mm 18mm 15mm; }
}
`;

/* ══════════════════════════════════════════════
   표준근로계약서 (무기계약 / 기간제) — Page 1 & 2
   ══════════════════════════════════════════════ */
function StandardForm({ d, isFixed }: { d: FormData; isFixed: boolean }) {
  const splitDate = (s: string) => {
    if (!s) return ["", "", ""];
    const p = s.replace(/[년월일]/g, ".").split(".").map((x: string) => x.trim()).filter(Boolean);
    return [p[0] || "", p[1] || "", p[2] || ""];
  };
  const [sy, sm, sd] = splitDate(d.startDate);
  const [ey, em, ed] = splitDate(d.endDate);
  const [cy, cm, cd] = splitDate(d.contractDate);

  const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const DAYS_KO = ["월", "화", "수", "목", "금", "토", "일"];
  const selDays = DAYS_KO.filter((_, i) => d[`workDays${DAYS[i]}`]).join("·");
  const daysCnt = d.workDaysMode === "text" ? d.workDaysText : DAYS.filter(dd => d[`workDays${dd}`]).length.toString();

  const ws = d.workStart || "";
  const we = d.workEnd || "";
  const bs = d.breakStart || "";
  const be = d.breakEnd || "";
  const [wsH, wsM] = ws.includes(":") ? ws.split(":") : ["", ""];
  const [weH, weM] = we.includes(":") ? we.split(":") : ["", ""];
  const [bsH, bsM] = bs.includes(":") ? bs.split(":") : ["", ""];
  const [beH, beM] = be.includes(":") ? be.split(":") : ["", ""];

  const wageLabel = d.wageType === "hour" ? "시간" : d.wageType === "day" ? "일" : "월";

  return (
    <div className="of">
      {/* 제목 */}
      <div className="of-title">
        <span>{isFixed ? "표준근로계약서(기간의 정함이 있는 경우)" : "표준근로계약서(기간의 정함이 없는 경우)"}</span>
      </div>

      {/* 당사자 */}
      <p className="of-party">
        <B w="100px">{d.biz}</B>(이하 &ldquo;사업주&rdquo;라 함)과(와){" "}
        <B w="80px">{d.worker}</B>(이하 &ldquo;근로자&rdquo;라 함)은 다음과 같이 근로계약을 체결한다.
      </p>

      {/* 1. 계약기간 */}
      <p className="of-h">
        {isFixed ? (
          <>1. 근로계약기간 : <B w="40px">{sy}</B>년 <B w="25px">{sm}</B>월 <B w="25px">{sd}</B>일부터 <B w="40px">{ey}</B>년 <B w="25px">{em}</B>월 <B w="25px">{ed}</B>일까지</>
        ) : (
          <>1. 근로개시일 : <B w="40px">{sy}</B>년 <B w="25px">{sm}</B>월 <B w="25px">{sd}</B>일부터</>
        )}
      </p>

      {/* 2~3 */}
      <p className="of-h">2. 근 무 장 소 : <B w="260px">{d.workPlace}</B></p>
      <p className="of-h">3. 업무의 내용 : <B w="260px">{d.jobDesc}</B></p>

      {/* 4. 소정근로시간 */}
      <p className="of-h">
        4. 소정근로시간 : <B w="20px">{wsH}</B>시<B w="20px">{wsM}</B>분 ~ <B w="20px">{weH}</B>시<B w="20px">{weM}</B>분
        {" "}(휴게: <B w="20px">{bsH}</B>시 <B w="20px">{bsM}</B>분 ~ <B w="20px">{beH}</B>시 <B w="20px">{beM}</B>분)
        {" "}(1일 <B w="20px">{d.dailyHours}</B>시간, 1주 <B w="20px">{d.weeklyHours}</B>시간)
      </p>

      {/* 5. 근무일/휴일 */}
      <p className="of-h">
        5. 근무일/휴일 : 매주 <B w="20px">{daysCnt}</B>일 근무(필요시, 근무요일 <B w="60px">{selDays}</B>), 주휴일 매주 <B w="20px">{d.weeklyHoliday}</B>요일
      </p>
      <p className="of-sub">- 공휴일(대체공휴일 포함)은 근로기준법이 정하는 바에 따르며, 근로자의 날은 유급휴일로 함</p>

      {/* 6. 임금 */}
      <p className="of-h">6. 임 &nbsp;&nbsp;금</p>
      <p className="of-sub">- 월(일, 시간)급 : <B w="120px">{d.wage ? `${wageLabel}급 ${d.wage}` : ""}</B>원</p>
      <p className="of-sub">
        - 상여금 : 있음 (<Chk on={d.hasBonus} />) <B w="120px">{d.hasBonus ? d.bonusAmount : ""}</B>원, &nbsp;없음 (<Chk on={!d.hasBonus} />)
      </p>
      <p className="of-sub">
        - 그 밖의 수당(약정수당) : 있음 [<Chk on={d.hasExtraWage} />], &nbsp;없음 [<Chk on={!d.hasExtraWage} />]
      </p>
      {d.hasExtraWage && d.extraWageDetails && (
        <p className="of-sub" style={{ paddingLeft: 36 }}>· <B w="200px">{d.extraWageDetails}</B></p>
      )}
      <p className="of-sub">- 임금지급일 : 매월(매주 또는 매일) <B w="30px">{d.payDay}</B>일(휴일의 경우는 전날 지급)</p>
      <p className="of-sub">
        - 지급방법 : 근로자에게 직접(현금)지급 [<Chk on={d.payMethod === "현금"} />], 근로자 명의 계좌에 입금 [<Chk on={d.payMethod !== "현금"} />]
      </p>

      {/* 7. 연차 */}
      <p className="of-h">7. 연차유급휴가</p>
      <p className="of-sub">- 연차유급휴가는 근로기준법에서 정하는 바에 따라 부여함</p>

      {/* 8. 사회보험 */}
      <p className="of-h">8. 사회보험 적용여부</p>
      <p className="of-sub">
        - 4대 사회보험(고용보험<Chk on={d.insEmp} />, 산재보험<Chk on={d.insAcc} />, 국민연금<Chk on={d.insPension} />, 건강보험<Chk on={d.insHealth} />) 적용(가입)을 원칙으로 함
      </p>
      <p className="of-note">
        ※ (참고) 적용(가입) 예외에 해당하는 경우에는 예외 사항 및 사유를 기재
        <br />&nbsp;&nbsp;&nbsp;&nbsp;(예외 사유 해당 여부는 근로복지공단, 국민연금공단, 국민건강보험공단 누리집 참조)
      </p>

      {/* 9. 교부 */}
      <p className="of-h">9. 근로계약서 교부</p>
      <p className="of-sub">
        - 사업주는 근로계약을 체결함과 동시에 본 계약서를 사본하여 근로자의 교부요구와 관계없이 근로자에게 교부함(근로기준법 제17조 이행)
      </p>

      {/* 10. 성실이행 */}
      <p className="of-h">10. 근로계약, 취업규칙 등의 성실한 이행의무</p>
      <p className="of-sub">
        - 사업주와 근로자는 각자가 근로계약, 취업규칙, 단체협약을 지키고 성실하게 이행하여야 함
      </p>

      {/* 11. 기타 */}
      <p className="of-h">11. 그 밖의 사항</p>
      <p className="of-sub">- 이 계약에 정함이 없는 사항은 근로관계법령에 따름</p>

      {/* 날짜 */}
      <p className="of-date-center">
        <B w="40px">{cy}</B>년 &nbsp;&nbsp;&nbsp;&nbsp;<B w="25px">{cm}</B>월 &nbsp;&nbsp;&nbsp;&nbsp;<B w="25px">{cd}</B>일
      </p>

      {/* 서명 — 사업주 */}
      <div className="of-sign">
        <p>(사업주) <span className="of-sign-label2">사업체명</span>: <B w="160px">{d.biz}{d.bizRegNo ? ` (${d.bizRegNo})` : ""}</B> &nbsp;(전화 : <B w="100px">{d.ceoPhone}</B>)</p>
        <p><span className="of-sign-label">주 소</span>: <B w="300px">{[d.bizAddr, d.bizAddrDetail].filter(Boolean).join(" ")}</B></p>
        <p><span className="of-sign-label">대 표 자</span>: <B w="100px">{d.ceo}</B> &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;(서명)</p>
      </div>

      {/* 서명 — 근로자 */}
      <div className="of-sign">
        <p>(근로자) <span className="of-sign-label">주 소</span>: <B w="300px">{[d.workerAddr, d.workerAddrDetail].filter(Boolean).join(" ")}</B></p>
        <p><span className="of-sign-label">연 락 처</span>: <B w="120px">{d.workerPhone}</B></p>
        <p><span className="of-sign-label">성 명</span>: <B w="100px">{d.worker}</B> &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;(서명)</p>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════
   단시간근로자 표준근로계약서 — Page 6
   ══════════════════════════════════════════════ */
function ParttimeForm({ d }: { d: FormData }) {
  const splitDate = (s: string) => {
    if (!s) return ["", "", ""];
    const p = s.replace(/[년월일]/g, ".").split(".").map((x: string) => x.trim()).filter(Boolean);
    return [p[0] || "", p[1] || "", p[2] || ""];
  };
  const [sy, sm, sd] = splitDate(d.startDate);
  const [cy, cm, cd] = splitDate(d.contractDate);

  const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const DAYS_KO = ["월", "화", "수", "목", "금", "토", "일"];
  const selDays = DAYS.filter(dd => d[`workDays${dd}`]);

  // 근무 테이블 데이터 생성
  const tableData = selDays.slice(0, 6).map(dd => {
    const ws = d[`workStart${dd}`] || "";
    const we = d[`workEnd${dd}`] || "";
    const bt = d[`breakTime${dd}`] || "0";
    const [wsH, wsM] = ws.includes(":") ? ws.split(":") : ["", ""];
    const [weH, weM] = we.includes(":") ? we.split(":") : ["", ""];

    let hours = "";
    try {
      const sh = parseInt(wsH) * 60 + parseInt(wsM);
      const eh = parseInt(weH) * 60 + parseInt(weM);
      const btMin = parseInt(bt);
      const total = (eh - sh - btMin) / 60;
      hours = total > 0 ? total.toFixed(1).replace(/\.0$/, "") : "";
    } catch { /* ignore */ }

    let bsH = "12", bsM = "00", beH = "12", beM = "30";
    try {
      const btVal = parseInt(bt);
      if (btVal === 60) { beH = "13"; beM = "00"; }
      else if (btVal > 0) { beH = String(12 + Math.floor(btVal / 60)); beM = String(btVal % 60).padStart(2, "0"); }
    } catch { /* ignore */ }

    return {
      day: DAYS_KO[DAYS.indexOf(dd)],
      hours,
      wsH, wsM,
      weH, weM,
      bsH, bsM, beH, beM,
    };
  });

  const wageLabel = d.wageType === "hour" ? "시간" : d.wageType === "day" ? "일" : "월";

  return (
    <div className="of">
      {/* 제목 */}
      <div className="of-title">
        <span>단시간근로자 표준근로계약서</span>
      </div>

      {/* 당사자 */}
      <p className="of-party">
        <B w="100px">{d.biz}</B>(이하 &ldquo;사업주&rdquo;라 함)과(와){" "}
        <B w="80px">{d.worker}</B>(이하 &ldquo;근로자&rdquo;라 함)은 다음과 같이 근로계약을 체결한다.
      </p>

      {/* 1. 근로개시일 */}
      <p className="of-h">
        1. 근로개시일 : <B w="40px">{sy}</B>년 <B w="25px">{sm}</B>월 <B w="25px">{sd}</B>일부터
      </p>
      <p className="of-note" style={{ marginBottom: 2 }}>
        ※ 근로계약기간을 정하는 경우에는 &ldquo;<B w="30px">{sy}</B>년 <B w="20px">{sm}</B>월 <B w="20px">{sd}</B>일부터{" "}
        {d.endDate ? (<><B w="30px">{splitDate(d.endDate)[0]}</B>년 <B w="20px">{splitDate(d.endDate)[1]}</B>월 <B w="20px">{splitDate(d.endDate)[2]}</B>일까지</>) : "___년 ___월 ___일까지"}&rdquo; 등으로 기재
      </p>

      {/* 2~3 */}
      <p className="of-h">2. 근 무 장 소 : <B w="260px">{d.workPlace}</B></p>
      <p className="of-h">3. 업무의 내용 : <B w="260px">{d.jobDesc}</B></p>

      {/* 4. 근로일 및 근로일별 근로시간 */}
      <p className="of-h">4. 근로일 및 근로일별 근로시간</p>

      <table className="of-tbl">
        <tbody>
          <tr>
            <td style={{ width: "16%" }}>&nbsp;</td>
            {tableData.map((td, i) => (
              <td key={`h${i}`} style={{ width: `${84 / Math.max(tableData.length, 1)}%` }}>({td.day})요일</td>
            ))}
            {tableData.length < 6 && Array.from({ length: 6 - tableData.length }).map((_, i) => (
              <td key={`he${i}`} style={{ width: `${84 / 6}%` }}>(&nbsp;&nbsp;)요일</td>
            ))}
          </tr>
          <tr>
            <td>근로시간</td>
            {tableData.map((td, i) => <td key={`hr${i}`}>{td.hours ? `${td.hours}시간` : ""}</td>)}
            {tableData.length < 6 && Array.from({ length: 6 - tableData.length }).map((_, i) => <td key={`hre${i}`}>&nbsp;시간</td>)}
          </tr>
          <tr>
            <td>업무 시작</td>
            {tableData.map((td, i) => <td key={`ws${i}`}>{td.wsH}시 {td.wsM}분</td>)}
            {tableData.length < 6 && Array.from({ length: 6 - tableData.length }).map((_, i) => <td key={`wse${i}`}>시 &nbsp;분</td>)}
          </tr>
          <tr>
            <td>업무 종료</td>
            {tableData.map((td, i) => <td key={`we${i}`}>{td.weH}시 {td.weM}분</td>)}
            {tableData.length < 6 && Array.from({ length: 6 - tableData.length }).map((_, i) => <td key={`wee${i}`}>시 &nbsp;분</td>)}
          </tr>
          <tr>
            <td>휴게 시간</td>
            {tableData.map((td, i) => (
              <td key={`bk${i}`} style={{ fontSize: "7.5pt", lineHeight: 1.3 }}>
                {td.bsH}시{td.bsM}분<br />~ {td.beH}시{td.beM}분
              </td>
            ))}
            {tableData.length < 6 && Array.from({ length: 6 - tableData.length }).map((_, i) => (
              <td key={`bke${i}`} style={{ fontSize: "7.5pt", lineHeight: 1.3 }}>
                시&nbsp;분<br />~ 시&nbsp;분
              </td>
            ))}
          </tr>
        </tbody>
      </table>

      <p className="of-sub">ㅇ 주휴일 : 매주 <B w="20px">{d.weeklyHoliday}</B>요일</p>
      <p className="of-sub" style={{ fontSize: "8.5pt" }}>ㅇ 공휴일(대체공휴일 포함)은 근로기준법이 정하는 바에 따르며, 근로자의 날은 유급휴일로 함</p>

      {/* 5. 임금 */}
      <p className="of-h">5. 임 &nbsp;&nbsp;금</p>
      <p className="of-sub">- {wageLabel}(일, 월)급 : <B w="120px">{d.wage}</B>원</p>
      <p className="of-sub">
        - 상여금 : 있음 (<Chk on={d.hasBonus} />) <B w="120px">{d.hasBonus ? d.bonusAmount : ""}</B>원, &nbsp;없음 (<Chk on={!d.hasBonus} />)
      </p>
      <p className="of-sub">
        - 그 밖의 수당(약정수당) : 있음 [<Chk on={d.hasExtraWage} />], &nbsp;없음 [<Chk on={!d.hasExtraWage} />]
      </p>
      {d.hasExtraWage && d.extraWageDetails && (
        <p className="of-sub" style={{ paddingLeft: 36 }}>· <B w="200px">{d.extraWageDetails}</B></p>
      )}
      <p className="of-sub">- 초과근로에 대한 가산임금률 : <B w="30px">{d.overtimePremiumRate || "50"}</B> %</p>
      <p className="of-note" style={{ paddingLeft: 30, marginBottom: 2 }}>
        ※ 단시간근로자와 사용자 사이에 근로하기로 정한 시간을 초과하여 근로하면 법정 근로시간 내라도 통상임금의 100분의 50 이상의 가산임금 지급(&apos;14.9.19. 시행)
      </p>
      <p className="of-sub">- 임금지급일 : 매월(매주 또는 매일) <B w="30px">{d.payDay}</B>일(휴일의 경우는 전날 지급)</p>
      <p className="of-sub">
        - 지급방법 : 근로자에게 직접(현금)지급 [<Chk on={d.payMethod === "현금"} />], 근로자 명의 계좌에 입금 [<Chk on={d.payMethod !== "현금"} />]
      </p>

      {/* 6. 연차 */}
      <p className="of-h">6. 연차유급휴가 : 통상근로자의 근로시간에 비례하여 연차유급휴가 부여</p>

      {/* 7. 사회보험 */}
      <p className="of-h">7. 사회보험 적용여부</p>
      <p className="of-sub">
        - 4대 사회보험(고용보험<Chk on={d.insEmp} />, 산재보험<Chk on={d.insAcc} />, 국민연금<Chk on={d.insPension} />, 건강보험<Chk on={d.insHealth} />) 적용(가입)을 원칙으로 함
      </p>
      <p className="of-note">
        ※ (참고) 적용(가입) 예외에 해당하는 경우에는 적용(가입) 항목 등을 명확히 기재
        <br />&nbsp;&nbsp;&nbsp;&nbsp;(예외 사유 해당 여부는 근로복지공단, 국민연금공단, 국민건강보험공단 누리집 참조)
      </p>

      {/* 8. 교부 */}
      <p className="of-h">8. 근로계약서 교부</p>
      <p className="of-sub">
        - &ldquo;사업주&rdquo;는 근로계약을 체결함과 동시에 본 계약서를 사본하여 &ldquo;근로자&rdquo;의 교부요구와 관계없이 &ldquo;근로자&rdquo;에게 교부함(근로기준법 제17조 이행)
      </p>

      {/* 9. 성실이행 */}
      <p className="of-h">9. 근로계약, 취업규칙 등의 성실한 이행의무</p>
      <p className="of-sub">
        - 사업주와 근로자는 각자가 근로계약, 취업규칙, 단체협약을 지키고 성실하게 이행하여야 함
      </p>

      {/* 10. 기타 */}
      <p className="of-h">10. 그 밖의 사항</p>
      <p className="of-sub">- 이 계약에 정함이 없는 사항은 근로관계법령에 따름</p>

      {/* 날짜 */}
      <p className="of-date-center">
        <B w="40px">{cy}</B>년 &nbsp;&nbsp;&nbsp;&nbsp;<B w="25px">{cm}</B>월 &nbsp;&nbsp;&nbsp;&nbsp;<B w="25px">{cd}</B>일
      </p>

      {/* 서명 — 사업주 */}
      <div className="of-sign">
        <p>(사업주) <span className="of-sign-label2">사업체명</span>: <B w="160px">{d.biz}{d.bizRegNo ? ` (${d.bizRegNo})` : ""}</B> &nbsp;(전화 : <B w="100px">{d.ceoPhone}</B>)</p>
        <p><span className="of-sign-label">주 소</span>: <B w="300px">{[d.bizAddr, d.bizAddrDetail].filter(Boolean).join(" ")}</B></p>
        <p><span className="of-sign-label">대 표 자</span>: <B w="100px">{d.ceo}</B> &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;(서명)</p>
      </div>

      {/* 서명 — 근로자 */}
      <div className="of-sign">
        <p>(근로자) <span className="of-sign-label">주 소</span>: <B w="300px">{[d.workerAddr, d.workerAddrDetail].filter(Boolean).join(" ")}</B></p>
        <p><span className="of-sign-label">연 락 처</span>: <B w="120px">{d.workerPhone}</B></p>
        <p><span className="of-sign-label">성 명</span>: <B w="100px">{d.worker}</B> &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;(서명)</p>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════
   연소근로자 표준근로계약서 — Page 3 + 4(동의서)
   ══════════════════════════════════════════════ */
function MinorForm({ d }: { d: FormData }) {
  const splitDate = (s: string) => {
    if (!s) return ["", "", ""];
    const p = s.replace(/[년월일]/g, ".").split(".").map((x: string) => x.trim()).filter(Boolean);
    return [p[0] || "", p[1] || "", p[2] || ""];
  };
  const [sy, sm, sd] = splitDate(d.startDate);
  const [cy, cm, cd] = splitDate(d.contractDate);

  const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const DAYS_KO = ["월", "화", "수", "목", "금", "토", "일"];
  const selDays = DAYS_KO.filter((_, i) => d[`workDays${DAYS[i]}`]).join("·");
  const daysCnt = d.workDaysMode === "text" ? d.workDaysText : DAYS.filter(dd => d[`workDays${dd}`]).length.toString();

  const ws = d.workStart || "";
  const we = d.workEnd || "";
  const bs = d.breakStart || "";
  const be = d.breakEnd || "";
  const [wsH, wsM] = ws.includes(":") ? ws.split(":") : ["", ""];
  const [weH, weM] = we.includes(":") ? we.split(":") : ["", ""];
  const [bsH, bsM] = bs.includes(":") ? bs.split(":") : ["", ""];
  const [beH, beM] = be.includes(":") ? be.split(":") : ["", ""];

  const wageLabel = d.wageType === "hour" ? "시간" : d.wageType === "day" ? "일" : "월";

  return (
    <>
      <div className="of">
        <div className="of-title">
          <span>연소근로자(18세 미만인 자) 표준근로계약서</span>
        </div>

        <p className="of-party">
          <B w="100px">{d.biz}</B>(이하 &ldquo;사업주&rdquo;라 함)과(와){" "}
          <B w="80px">{d.worker}</B>(이하 &ldquo;근로자&rdquo;라 함)은 다음과 같이 근로계약을 체결한다.
        </p>

        <p className="of-h">1. 근로개시일 : <B w="40px">{sy}</B>년 <B w="25px">{sm}</B>월 <B w="25px">{sd}</B>일부터</p>
        <p className="of-note">※ (참고) 근로계약기간을 정하는 경우에는 &ldquo;년 월 일부터 년 월 일까지&rdquo; 등으로 기재</p>

        <p className="of-h">2. 근 무 장 소 : <B w="260px">{d.workPlace}</B></p>
        <p className="of-h">3. 업무의 내용 : <B w="260px">{d.jobDesc}</B></p>

        <p className="of-h">
          4. 소정근로시간 : <B w="20px">{wsH}</B>시<B w="20px">{wsM}</B>분 ~ <B w="20px">{weH}</B>시<B w="20px">{weM}</B>분
          {" "}(휴게: <B w="20px">{bsH}</B>시 <B w="20px">{bsM}</B>분 ~ <B w="20px">{beH}</B>시 <B w="20px">{beM}</B>분)
          {" "}(1일 <B w="20px">{d.dailyHours}</B>시간, 1주 <B w="20px">{d.weeklyHours}</B>시간)
        </p>
        <p className="of-note">※ (참고) 18세 미만인 자의 근로시간은 1일 7시간, 1주에 35시간을 초과하지 못함</p>

        <p className="of-h">5. 근무일/휴일 : 매주 <B w="20px">{daysCnt}</B>일 근무(필요시, 근무요일 <B w="60px">{selDays}</B>), 주휴일 매주 <B w="20px">{d.weeklyHoliday}</B>요일</p>
        <p className="of-sub">- 공휴일(대체공휴일 포함)은 근로기준법이 정하는 바에 따르며, 근로자의 날은 유급휴일로 함</p>

        <p className="of-h">6. 임 &nbsp;&nbsp;금</p>
        <p className="of-note" style={{ marginBottom: 2 }}>※ (참고) 연소근로자의 경우에도 고용노동부장관이 매년 고시하는 최저임금을 준수하여야 함</p>
        <p className="of-sub">- 월(일, 시간)급 : <B w="120px">{d.wage ? `${wageLabel}급 ${d.wage}` : ""}</B>원</p>
        <p className="of-sub">- 상여금 : 있음 (<Chk on={d.hasBonus} />) <B w="100px">{d.hasBonus ? d.bonusAmount : ""}</B>원, 없음 (<Chk on={!d.hasBonus} />)</p>
        <p className="of-sub">- 그 밖의 수당(약정수당) : 있음 [<Chk on={d.hasExtraWage} />], 없음 [<Chk on={!d.hasExtraWage} />]</p>
        <p className="of-sub">- 임금지급일 : 매월(매주 또는 매일) <B w="30px">{d.payDay}</B>일(휴일의 경우는 전날 지급)</p>
        <p className="of-sub">- 지급방법 : 근로자에게 직접(현금)지급 [<Chk on={d.payMethod === "현금"} />], 근로자 명의 계좌에 입금 [<Chk on={d.payMethod !== "현금"} />]</p>

        <p className="of-h">7. 연차유급휴가 : 근로기준법에서 정하는 바에 따라 부여함</p>

        <p className="of-h">8. 가족관계증명서 및 동의서</p>
        <p className="of-sub">- 가족관계기록사항에 관한 증명서 제출 여부: <B w="60px">{d.hasFamilyCert !== false ? "제출함" : "미제출"}</B></p>
        <p className="of-sub">- 친권자 또는 후견인의 동의서 구비 여부: <B w="60px">{d.hasParentConsent !== false ? "구비함" : "미구비"}</B></p>

        <p className="of-h">9. 사회보험 적용여부</p>
        <p className="of-sub">- 4대 사회보험(고용보험<Chk on={d.insEmp} />, 산재보험<Chk on={d.insAcc} />, 국민연금<Chk on={d.insPension} />, 건강보험<Chk on={d.insHealth} />) 적용(가입)을 원칙으로 함</p>

        <p className="of-h">10. 근로계약서 교부</p>
        <p className="of-sub">- 사업주는 근로계약을 체결함과 동시에 본 계약서를 사본하여 근로자의 교부요구와 관계없이 근로자에게 교부함(근로기준법 제17조, 제67조 이행)</p>

        <p className="of-h">11. 근로계약, 취업규칙 등의 성실한 이행의무</p>
        <p className="of-sub">- 사업주와 근로자는 각자가 근로계약, 취업규칙, 단체협약을 지키고 성실하게 이행하여야 함</p>

        <p className="of-h">12. 그 밖의 사항</p>
        <p className="of-sub">- 13세 이상 15세 미만인 자에 대해서는 고용노동부장관으로부터 취직인허증을 교부받아야 하며, 이 계약에 정함이 없는 사항은 근로관계법령에 따름</p>

        <p className="of-date-center">
          <B w="40px">{cy}</B>년 &nbsp;&nbsp;&nbsp;&nbsp;<B w="25px">{cm}</B>월 &nbsp;&nbsp;&nbsp;&nbsp;<B w="25px">{cd}</B>일
        </p>

        <div className="of-sign">
          <p>(사업주) <span className="of-sign-label2">사업체명</span>: <B w="160px">{d.biz}</B> &nbsp;(전화 : <B w="100px">{d.ceoPhone}</B>)</p>
          <p><span className="of-sign-label">주 소</span>: <B w="300px">{[d.bizAddr, d.bizAddrDetail].filter(Boolean).join(" ")}</B></p>
          <p><span className="of-sign-label">대 표 자</span>: <B w="100px">{d.ceo}</B> &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;(서명)</p>
        </div>
        <div className="of-sign">
          <p>(근로자) <span className="of-sign-label">주 소</span>: <B w="300px">{[d.workerAddr, d.workerAddrDetail].filter(Boolean).join(" ")}</B></p>
          <p><span className="of-sign-label">연 락 처</span>: <B w="120px">{d.workerPhone}</B></p>
          <p><span className="of-sign-label">성 명</span>: <B w="100px">{d.worker}</B> &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;(서명)</p>
        </div>
      </div>

      {/* ── 친권자 동의서 (2페이지) ── */}
      <div className="of of-page2">
        <div className="of-title"><span>친권자(후견인) 동의서</span></div>

        <p className="of-h" style={{ marginTop: 16 }}>○ 친권자(후견인) 인적사항</p>
        <p className="of-sub"><span className="of-sign-label">성 명</span>: <B w="100px">{d.parentName}</B></p>
        <p className="of-sub"><span className="of-sign-label">생년월일</span>: <B w="120px">{d.parentBirth}</B></p>
        <p className="of-sub"><span className="of-sign-label">주 소</span>: <B w="280px">{d.parentAddr}</B></p>
        <p className="of-sub"><span className="of-sign-label">연 락 처</span>: <B w="120px">{d.parentTel}</B></p>
        <p className="of-sub"><span className="of-sign-label2">연소근로자와의 관계</span>: <B w="60px">{d.parentRel}</B></p>

        <p className="of-h" style={{ marginTop: 16 }}>○ 연소근로자 인적사항</p>
        <p className="of-sub"><span className="of-sign-label">성 명</span>: <B w="100px">{d.worker}</B></p>
        <p className="of-sub"><span className="of-sign-label">생년월일</span>: <B w="120px">{d.workerBirth}</B></p>
        <p className="of-sub"><span className="of-sign-label">주 소</span>: <B w="280px">{[d.workerAddr, d.workerAddrDetail].filter(Boolean).join(" ")}</B></p>
        <p className="of-sub"><span className="of-sign-label">연 락 처</span>: <B w="120px">{d.workerPhone}</B></p>

        <p className="of-h" style={{ marginTop: 16 }}>○ 사업장 개요</p>
        <p className="of-sub"><span className="of-sign-label">회 사 명</span>: <B w="200px">{d.biz}</B></p>
        <p className="of-sub"><span className="of-sign-label">회사주소</span>: <B w="280px">{[d.bizAddr, d.bizAddrDetail].filter(Boolean).join(" ")}</B></p>
        <p className="of-sub"><span className="of-sign-label">대 표 자</span>: <B w="100px">{d.ceo}</B></p>
        <p className="of-sub"><span className="of-sign-label">회사전화</span>: <B w="120px">{d.ceoPhone}</B></p>

        <p style={{ marginTop: 30, textAlign: "center", fontSize: "10pt", lineHeight: 2.2 }}>
          본인은 위 연소근로자 <B w="60px">{d.worker}</B> 가 위 사업장에서<br />
          근로를 하는 것에 대하여 동의합니다.
        </p>

        <p className="of-date-center" style={{ marginTop: 24 }}>
          <B w="40px">{cy}</B>년 &nbsp;&nbsp;&nbsp;&nbsp;<B w="25px">{cm}</B>월 &nbsp;&nbsp;&nbsp;&nbsp;<B w="25px">{cd}</B>일
        </p>
        <p style={{ textAlign: "center", marginTop: 10, fontSize: "10pt" }}>
          친권자(후견인) <B w="80px">{d.parentName}</B> (인)
        </p>
        <p style={{ textAlign: "center", marginTop: 8, fontSize: "9pt", color: "#555" }}>
          첨 부 : 가족관계증명서 1부
        </p>
      </div>
    </>
  );
}

/* ══════════════════════════════════════════════
   메인 Export 컴포넌트
   ══════════════════════════════════════════════ */
export default function ContractOfficialForm({
  data,
  contractType,
}: {
  data: FormData;
  contractType: string;
}) {
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: STYLES }} />
      {contractType === "parttime" && <ParttimeForm d={data} />}
      {contractType === "standard_unlimited" && <StandardForm d={data} isFixed={false} />}
      {contractType === "standard_fixed" && <StandardForm d={data} isFixed={true} />}
      {contractType === "minor" && <MinorForm d={data} />}
    </>
  );
}

/* 인쇄용 HTML 문자열 생성 (window.open 방식) */
export function getOfficialFormHTML(innerHtml: string): string {
  return `<!DOCTYPE html><html lang="ko"><head><meta charset="UTF-8">
<title>표준근로계약서</title>
<style>${STYLES}</style>
</head><body>${innerHtml}</body></html>`;
}
