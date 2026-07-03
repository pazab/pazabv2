"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { invalidateTaxRatesCache } from "@/lib/taxRates";

const ADMIN_EMAIL = "hellopazab@gmail.com";

interface TaxRateRow {
  id?: string;
  year: number;
  health_insurance_rate: number;
  employment_insurance_rate: number;
  national_pension_rate: number;
  industrial_accident_rate: number;
}

interface MinWageRow {
  id?: string;
  year: number;
  hourly_wage: number;
  note?: string;
}

export default function AdminTaxRatesPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState("");

  const [taxRates, setTaxRates] = useState<TaxRateRow[]>([]);
  const [minWages, setMinWages] = useState<MinWageRow[]>([]);

  const [newTax, setNewTax] = useState<TaxRateRow>({
    year: new Date().getFullYear(),
    health_insurance_rate: 3.545,
    employment_insurance_rate: 0.9,
    national_pension_rate: 4.5,
    industrial_accident_rate: 0,
  });
  const [newWage, setNewWage] = useState<MinWageRow>({
    year: new Date().getFullYear(),
    hourly_wage: 10030,
    note: "",
  });

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || user.email !== ADMIN_EMAIL) {
        router.replace("/");
        return;
      }
      await load();
      setLoading(false);
    })();
  }, []);

  async function load() {
    const [{ data: tr }, { data: mw }] = await Promise.all([
      supabase.from("tax_rates").select("*").order("year", { ascending: false }),
      supabase.from("min_wages").select("*").order("year", { ascending: false }),
    ]);
    if (tr) setTaxRates(tr);
    if (mw) setMinWages(mw);
  }

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(""), 3000);
  }

  async function saveTaxRate() {
    setSaving(true);
    const { error } = await supabase
      .from("tax_rates")
      .upsert(newTax, { onConflict: "year" });
    setSaving(false);
    if (error) { showToast("저장 실패: " + error.message); return; }
    invalidateTaxRatesCache();
    showToast(`${newTax.year}년 세율 저장 완료`);
    await load();
  }

  async function saveMinWage() {
    setSaving(true);
    const { error } = await supabase
      .from("min_wages")
      .upsert(newWage, { onConflict: "year" });
    setSaving(false);
    if (error) { showToast("저장 실패: " + error.message); return; }
    showToast(`${newWage.year}년 최저임금 저장 완료`);
    await load();
  }

  async function deleteTaxRate(year: number) {
    await supabase.from("tax_rates").delete().eq("year", year);
    invalidateTaxRatesCache();
    showToast(`${year}년 세율 삭제`);
    await load();
  }

  async function deleteMinWage(year: number) {
    await supabase.from("min_wages").delete().eq("year", year);
    showToast(`${year}년 최저임금 삭제`);
    await load();
  }

  if (loading) return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <span style={{ color: "var(--text-muted)", fontSize: 13 }}>로딩 중...</span>
    </div>
  );

  const cardStyle: React.CSSProperties = {
    background: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: 16,
    padding: "20px 16px",
    marginBottom: 20,
  };
  const labelStyle: React.CSSProperties = { fontSize: 12, color: "var(--text-muted)", marginBottom: 4, display: "block" };
  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "10px 12px", fontSize: 14,
    background: "var(--surface2)", border: "1px solid var(--border)",
    borderRadius: 10, color: "var(--text)", outline: "none",
    boxSizing: "border-box",
  };
  const rowStyle: React.CSSProperties = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 };

  return (
    <main style={{ minHeight: "100vh", background: "var(--bg)", padding: "24px 16px 80px", maxWidth: 520, margin: "0 auto" }}>
      {toast && (
        <div style={{
          position: "fixed", top: 60, left: "50%", transform: "translateX(-50%)",
          background: "#1a1a2e", color: "#fff", borderRadius: 20,
          padding: "10px 20px", fontSize: 13, zIndex: 999, whiteSpace: "nowrap",
        }}>{toast}</div>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 24 }}>
        <button onClick={() => router.back()} style={{ background: "none", border: "none", color: "var(--text-muted)", fontSize: 20, cursor: "pointer", padding: 0 }}>←</button>
        <h1 style={{ fontSize: 18, fontWeight: 700, color: "var(--text)", margin: 0 }}>세율 · 최저임금 관리</h1>
      </div>

      {/* ── 세율 입력 ── */}
      <div style={cardStyle}>
        <p style={{ fontSize: 13, fontWeight: 700, color: "var(--text)", marginBottom: 14, marginTop: 0 }}>4대보험 세율 추가 / 수정 (근로자 부담 %)</p>
        <div style={rowStyle}>
          <div>
            <span style={labelStyle}>연도</span>
            <input type="number" style={inputStyle} value={newTax.year}
              onChange={e => setNewTax(p => ({ ...p, year: Number(e.target.value) }))} />
          </div>
          <div>
            <span style={labelStyle}>건강보험 %</span>
            <input type="number" step="0.001" style={inputStyle} value={newTax.health_insurance_rate}
              onChange={e => setNewTax(p => ({ ...p, health_insurance_rate: Number(e.target.value) }))} />
          </div>
          <div>
            <span style={labelStyle}>고용보험 %</span>
            <input type="number" step="0.001" style={inputStyle} value={newTax.employment_insurance_rate}
              onChange={e => setNewTax(p => ({ ...p, employment_insurance_rate: Number(e.target.value) }))} />
          </div>
          <div>
            <span style={labelStyle}>국민연금 %</span>
            <input type="number" step="0.001" style={inputStyle} value={newTax.national_pension_rate}
              onChange={e => setNewTax(p => ({ ...p, national_pension_rate: Number(e.target.value) }))} />
          </div>
          <div>
            <span style={labelStyle}>산재보험 % (근로자)</span>
            <input type="number" step="0.001" style={inputStyle} value={newTax.industrial_accident_rate}
              onChange={e => setNewTax(p => ({ ...p, industrial_accident_rate: Number(e.target.value) }))} />
          </div>
        </div>
        <button
          onClick={saveTaxRate}
          disabled={saving}
          style={{ width: "100%", padding: "12px 0", borderRadius: 12, background: "linear-gradient(135deg,#7c3aed,#a855f7)", color: "#fff", border: "none", fontWeight: 700, fontSize: 14, cursor: "pointer" }}
        >
          {saving ? "저장 중..." : "저장"}
        </button>
      </div>

      {/* ── 세율 목록 ── */}
      {taxRates.length > 0 && (
        <div style={cardStyle}>
          <p style={{ fontSize: 13, fontWeight: 700, color: "var(--text)", marginBottom: 12, marginTop: 0 }}>저장된 세율</p>
          {taxRates.map(row => (
            <div key={row.year} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: "1px solid var(--border)" }}>
              <div>
                <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text)" }}>{row.year}년</span>
                <span style={{ fontSize: 11, color: "var(--text-muted)", marginLeft: 8 }}>
                  건강{row.health_insurance_rate}% · 고용{row.employment_insurance_rate}% · 연금{row.national_pension_rate}%
                </span>
              </div>
              <button
                onClick={() => { setNewTax(row); }}
                style={{ background: "none", border: "1px solid var(--border)", borderRadius: 8, padding: "4px 10px", fontSize: 12, color: "var(--text-muted)", cursor: "pointer", marginRight: 6 }}
              >편집</button>
              <button
                onClick={() => deleteTaxRate(row.year)}
                style={{ background: "none", border: "none", color: "#ef4444", fontSize: 18, cursor: "pointer", padding: 0 }}
              >✕</button>
            </div>
          ))}
        </div>
      )}

      {/* ── 최저임금 입력 ── */}
      <div style={cardStyle}>
        <p style={{ fontSize: 13, fontWeight: 700, color: "var(--text)", marginBottom: 14, marginTop: 0 }}>최저시급 추가 / 수정</p>
        <div style={rowStyle}>
          <div>
            <span style={labelStyle}>연도</span>
            <input type="number" style={inputStyle} value={newWage.year}
              onChange={e => setNewWage(p => ({ ...p, year: Number(e.target.value) }))} />
          </div>
          <div>
            <span style={labelStyle}>최저시급 (원)</span>
            <input type="number" style={inputStyle} value={newWage.hourly_wage}
              onChange={e => setNewWage(p => ({ ...p, hourly_wage: Number(e.target.value) }))} />
          </div>
        </div>
        <div style={{ marginBottom: 10 }}>
          <span style={labelStyle}>메모 (고시 날짜 등)</span>
          <input type="text" style={inputStyle} value={newWage.note ?? ""}
            onChange={e => setNewWage(p => ({ ...p, note: e.target.value }))} placeholder="예: 2025-08-05 고용노동부 고시" />
        </div>
        <button
          onClick={saveMinWage}
          disabled={saving}
          style={{ width: "100%", padding: "12px 0", borderRadius: 12, background: "linear-gradient(135deg,#7c3aed,#a855f7)", color: "#fff", border: "none", fontWeight: 700, fontSize: 14, cursor: "pointer" }}
        >
          {saving ? "저장 중..." : "저장"}
        </button>
      </div>

      {/* ── 최저임금 목록 ── */}
      {minWages.length > 0 && (
        <div style={cardStyle}>
          <p style={{ fontSize: 13, fontWeight: 700, color: "var(--text)", marginBottom: 12, marginTop: 0 }}>저장된 최저시급</p>
          {minWages.map(row => (
            <div key={row.year} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: "1px solid var(--border)" }}>
              <div>
                <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text)" }}>{row.year}년</span>
                <span style={{ fontSize: 13, color: "var(--purple-text)", marginLeft: 8, fontWeight: 700 }}>{row.hourly_wage.toLocaleString()}원</span>
                {row.note && <span style={{ fontSize: 11, color: "var(--text-muted)", marginLeft: 6 }}>{row.note}</span>}
              </div>
              <button
                onClick={() => { setNewWage(row); }}
                style={{ background: "none", border: "1px solid var(--border)", borderRadius: 8, padding: "4px 10px", fontSize: 12, color: "var(--text-muted)", cursor: "pointer", marginRight: 6 }}
              >편집</button>
              <button
                onClick={() => deleteMinWage(row.year)}
                style={{ background: "none", border: "none", color: "#ef4444", fontSize: 18, cursor: "pointer", padding: 0 }}
              >✕</button>
            </div>
          ))}
        </div>
      )}

      <p style={{ fontSize: 11, color: "var(--text-muted)", textAlign: "center", marginTop: 8 }}>
        hellopazab@gmail.com 전용 관리 페이지
      </p>
    </main>
  );
}
