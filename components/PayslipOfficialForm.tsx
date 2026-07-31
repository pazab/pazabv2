"use client";

import React from "react";

/* ──────────────────────────────────────────────
   임금명세서 표준 서식 컴포넌트
   ※ 근로기준법 시행령 제27조의2 / 시행규칙 별지 제27호의2 기재사항 기준
   ※ 인쇄 전용 — 화면 편집 UI 아님
   ────────────────────────────────────────────── */

export interface PayslipDeductionItem {
  label: string;
  amount: number;
  method?: string; // 계산방법 (예: "세전급여 × 4.5%")
}

export interface PayslipEarningItem {
  label: string;
  amount: number;
  method?: string; // 계산방법 (예: "160h × 10,320원")
}

export interface PayslipFormData {
  bizName?: string;
  bizRegNo?: string;
  bizAddr?: string;
  ceo?: string;
  workerName?: string;
  workerBirth?: string;
  year: number;
  month: number;
  payDate?: string; // 지급일 (YYYY-MM-DD)
  issuedAt?: string; // 발행일 (YYYY-MM-DD)
  periodStart?: string;
  periodEnd?: string;
  workDays: number;
  totalHours: number;
  overtimeHours: number;
  wage: number;
  wageType: "hourly" | "monthly" | "daily";
  earnings: PayslipEarningItem[];
  totalPay: number;
  deductions: PayslipDeductionItem[];
  totalDeductions: number;
  netPay: number;
}

const STYLES = `
@import url('https://fonts.googleapis.com/css2?family=Noto+Serif+KR:wght@400;700;900&display=swap');

* { margin:0; padding:0; box-sizing:border-box; }
html, body { height: auto !important; }

.pf {
  width: 210mm;
  padding: 15mm 15mm 12mm;
  font-family: 'Noto Serif KR', '바탕', 'Batang', serif;
  font-size: 9.5pt;
  color: #000;
  background: #fff;
  line-height: 1.5;
}

.pf-title {
  text-align: center;
  margin-bottom: 4px;
}
.pf-title span {
  display: inline-block;
  border: 2.5px solid #000;
  font-size: 15pt;
  font-weight: 900;
  padding: 4px 20px;
  letter-spacing: 4px;
}
.pf-subtitle {
  text-align: center;
  font-size: 10pt;
  font-weight: 700;
  margin: 8px 0 14px;
}

.pf-h {
  font-weight: 700;
  font-size: 10pt;
  margin: 14px 0 4px;
  border-bottom: 1.5px solid #000;
  padding-bottom: 2px;
}

.pf-tbl {
  width: 100%;
  border-collapse: collapse;
  font-size: 9pt;
}
.pf-tbl td, .pf-tbl th {
  border: 1px solid #666;
  padding: 5px 8px;
  vertical-align: middle;
}
.pf-tbl th {
  background: #f2f2f2;
  font-weight: 700;
  text-align: center;
}
.pf-tbl .lbl {
  background: #fafafa;
  font-weight: 700;
  width: 22%;
  white-space: nowrap;
}
.pf-tbl .num {
  text-align: right;
  font-variant-numeric: tabular-nums;
}
.pf-tbl .method {
  color: #555;
  font-size: 8pt;
}

.pf-total-row td {
  font-weight: 900;
  background: #f2f2f2;
  font-size: 9.5pt;
}

.pf-netpay {
  margin-top: 10px;
  border: 2px solid #000;
  border-radius: 4px;
  padding: 10px 14px;
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.pf-netpay .label { font-size: 11pt; font-weight: 700; }
.pf-netpay .amount { font-size: 15pt; font-weight: 900; }

.pf-footer {
  margin-top: 18px;
  font-size: 8pt;
  color: #444;
  line-height: 1.6;
}

.pf-sign {
  margin-top: 16px;
  text-align: right;
  font-size: 9.5pt;
}

@media print {
  @page { size: A4; margin: 15mm 15mm 12mm; }
  html, body { width: 100%; margin: 0; padding: 0; height: auto !important; }
  .pf { width: 100%; padding: 0; }
}
`;

const won = (n: number) => `${Math.round(n).toLocaleString()}원`;

export default function PayslipOfficialForm({ data }: { data: PayslipFormData }) {
  const d = data;
  const wageLabel = d.wageType === "hourly" ? "시급" : d.wageType === "daily" ? "일급" : "월급";

  return (
    <div className="pf">
      <style dangerouslySetInnerHTML={{ __html: STYLES }} />

      <div className="pf-title"><span>임금명세서</span></div>
      <p className="pf-subtitle">{d.year}년 {d.month}월분 ({d.periodStart || `${d.year}-${String(d.month).padStart(2, "0")}-01`} ~ {d.periodEnd || ""})</p>

      {/* 사업장/근로자 정보 */}
      <table className="pf-tbl">
        <tbody>
          <tr>
            <td className="lbl">사업장명</td>
            <td>{d.bizName || "-"}</td>
            <td className="lbl">사업자등록번호</td>
            <td>{d.bizRegNo || "-"}</td>
          </tr>
          <tr>
            <td className="lbl">사업장 주소</td>
            <td colSpan={3}>{d.bizAddr || "-"}</td>
          </tr>
          <tr>
            <td className="lbl">성명</td>
            <td>{d.workerName || "-"}</td>
            <td className="lbl">생년월일</td>
            <td>{d.workerBirth || "-"}</td>
          </tr>
          <tr>
            <td className="lbl">임금지급일</td>
            <td>{d.payDate || "-"}</td>
            <td className="lbl">{wageLabel} 기준액</td>
            <td className="num">{won(d.wage)}</td>
          </tr>
        </tbody>
      </table>

      {/* 근로일수/시간 */}
      <p className="pf-h">근로일수 및 근로시간</p>
      <table className="pf-tbl">
        <thead>
          <tr>
            <th>근로일수</th>
            <th>총 근로시간</th>
            <th>연장근로시간</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className="num" style={{ textAlign: "center" }}>{d.workDays}일</td>
            <td className="num" style={{ textAlign: "center" }}>{d.totalHours.toFixed(1)}시간</td>
            <td className="num" style={{ textAlign: "center" }}>{d.overtimeHours.toFixed(1)}시간</td>
          </tr>
        </tbody>
      </table>

      {/* 지급 내역 */}
      <p className="pf-h">임금 지급 내역 (구성항목별 금액 및 계산방법)</p>
      <table className="pf-tbl">
        <thead>
          <tr>
            <th style={{ width: "22%" }}>지급 항목</th>
            <th>계산방법</th>
            <th style={{ width: "22%" }}>금액</th>
          </tr>
        </thead>
        <tbody>
          {d.earnings.map((e, i) => (
            <tr key={i}>
              <td>{e.label}</td>
              <td className="method">{e.method || "-"}</td>
              <td className="num">{won(e.amount)}</td>
            </tr>
          ))}
          <tr className="pf-total-row">
            <td colSpan={2}>지급액 합계 (세전)</td>
            <td className="num">{won(d.totalPay)}</td>
          </tr>
        </tbody>
      </table>

      {/* 공제 내역 */}
      <p className="pf-h">공제 내역 (항목별 금액 및 계산방법)</p>
      <table className="pf-tbl">
        <thead>
          <tr>
            <th style={{ width: "22%" }}>공제 항목</th>
            <th>계산방법</th>
            <th style={{ width: "22%" }}>금액</th>
          </tr>
        </thead>
        <tbody>
          {d.deductions.length === 0 ? (
            <tr><td colSpan={3} style={{ textAlign: "center", color: "#888" }}>공제 항목 없음</td></tr>
          ) : d.deductions.map((e, i) => (
            <tr key={i}>
              <td>{e.label}</td>
              <td className="method">{e.method || "-"}</td>
              <td className="num">{won(e.amount)}</td>
            </tr>
          ))}
          <tr className="pf-total-row">
            <td colSpan={2}>공제액 합계</td>
            <td className="num">-{won(d.totalDeductions)}</td>
          </tr>
        </tbody>
      </table>

      {/* 차인지급액 */}
      <div className="pf-netpay">
        <span className="label">차인지급액 (실수령액)</span>
        <span className="amount">{won(d.netPay)}</span>
      </div>

      <div className="pf-sign">
        발행일 : {d.issuedAt || `${d.year}-${String(d.month).padStart(2, "0")}`} &nbsp;&nbsp;&nbsp; 사업주(대표자) {d.ceo || ""} (인)
      </div>

      <p className="pf-footer">
        ※ 본 임금명세서는 근로기준법 제48조 및 같은 법 시행령 제27조의2에 따라 교부됩니다.<br />
        ※ 본 명세서는 파잡(PAZAB) 근태·급여 관리 플랫폼을 통해 자동 생성되었습니다.
      </p>
    </div>
  );
}
