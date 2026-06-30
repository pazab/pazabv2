"use client";

import { useRef, useEffect, useCallback, useState } from "react";

const ITEM_H = 40;

function Wheel({
  items,
  index,
  onChange,
  width = 60,
  repeat = 5,
}: {
  items: string[];
  index: number;
  onChange: (i: number) => void;
  width?: number;
  repeat?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const len = items.length;
  const mid = Math.floor(repeat / 2) * len;
  const initialized = useRef(false);
  const raf = useRef<number | null>(null);
  const touchY = useRef(0);
  const touchTime = useRef(0);
  const velocity = useRef(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.scrollTop = (mid + index) * ITEM_H;
    initialized.current = true;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!initialized.current) return;
    const el = ref.current;
    if (!el) return;
    const cur = ((Math.round(el.scrollTop / ITEM_H)) % len + len) % len;
    if (cur !== index) el.scrollTop = (mid + index) * ITEM_H;
  }, [index, len, mid]);

  const snapTo = useCallback((scrollTop: number) => {
    const el = ref.current;
    if (!el) return;
    let raw = Math.round(scrollTop / ITEM_H);
    if (repeat === 1) raw = Math.max(0, Math.min(len - 1, raw));
    el.scrollTop = raw * ITEM_H;
    const i = ((raw % len) + len) % len;
    if (repeat > 1 && (raw < len || raw > len * (repeat - 1))) {
      el.scrollTop = (mid + i) * ITEM_H;
    }
    onChange(i);
  }, [len, mid, repeat, onChange]);

  return (
    <div style={{ position: "relative", width, height: ITEM_H * 3, overflow: "hidden", flexShrink: 0 }}>
      {/* 선택 하이라이트 */}
      <div style={{
        position: "absolute", top: ITEM_H, left: 4, right: 4, height: ITEM_H,
        background: "rgba(124,58,237,0.08)", borderRadius: 10,
        border: "1px solid rgba(124,58,237,0.18)",
        pointerEvents: "none", zIndex: 2,
      }} />
      {/* 위 페이드 */}
      <div style={{
        position: "absolute", top: 0, left: 0, right: 0, height: ITEM_H,
        background: "linear-gradient(to bottom,var(--surface) 10%,transparent)",
        pointerEvents: "none", zIndex: 3,
      }} />
      {/* 아래 페이드 */}
      <div style={{
        position: "absolute", bottom: 0, left: 0, right: 0, height: ITEM_H,
        background: "linear-gradient(to top,var(--surface) 10%,transparent)",
        pointerEvents: "none", zIndex: 3,
      }} />
      <div
        ref={ref}
        onPointerDown={e => {
          if (raf.current) cancelAnimationFrame(raf.current);
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
          touchY.current = e.clientY;
          touchTime.current = Date.now();
          velocity.current = 0;
        }}
        onPointerMove={e => {
          if (!(e.currentTarget as HTMLElement).hasPointerCapture(e.pointerId)) return;
          const el = ref.current;
          if (!el) return;
          const now = Date.now();
          const dy = touchY.current - e.clientY;
          const dt = now - touchTime.current || 1;
          velocity.current = dy / dt;
          el.scrollTop += dy;
          touchY.current = e.clientY;
          touchTime.current = now;
        }}
        onPointerUp={e => {
          if (!(e.currentTarget as HTMLElement).hasPointerCapture(e.pointerId)) return;
          (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
          const el = ref.current;
          if (!el) return;
          let v = velocity.current * 16;
          const decel = 0.88;
          const animate = () => {
            if (!el) return;
            if (Math.abs(v) < 0.5) { snapTo(el.scrollTop); return; }
            el.scrollTop += v;
            v *= decel;
            raf.current = requestAnimationFrame(animate);
          };
          raf.current = requestAnimationFrame(animate);
        }}
        style={{
          height: ITEM_H * 3,
          overflowY: "hidden",
          scrollbarWidth: "none",
          cursor: "grab",
          touchAction: "none",
        }}
      >
        <div style={{ height: ITEM_H }} />
        {Array.from({ length: len * repeat }, (_, i) => {
          const idx = i % len;
          const sel = idx === index && Math.floor(i / len) === Math.floor(mid / len);
          return (
            <div key={i} style={{
              height: ITEM_H,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: sel ? 17 : 14,
              fontWeight: sel ? 700 : 400,
              color: sel ? "var(--text)" : "rgba(130,130,150,0.45)",
              userSelect: "none",
              transition: "font-size 0.1s, color 0.1s",
            }}>
              {items[idx]}
            </div>
          );
        })}
        <div style={{ height: ITEM_H }} />
      </div>
    </div>
  );
}

function parseDateStr(val: string) {
  const [y, m, d] = (val || "").split("-").map(Number);
  const now = new Date();
  return {
    year: isNaN(y) ? now.getFullYear() : y,
    month: isNaN(m) ? now.getMonth() + 1 : m,
    day: isNaN(d) ? now.getDate() : d,
  };
}

const now = new Date();
const CUR_YEAR = now.getFullYear();
// 2015 ~ 올해까지
const YEARS = Array.from({ length: CUR_YEAR - 2014 }, (_, i) => String(2015 + i));
const MONTHS = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, "0"));

function daysInMonth(y: number, m: number) {
  return new Date(y, m, 0).getDate();
}

export default function DateWheelPicker({
  value,
  onChange,
  onClose,
  onConfirm,
}: {
  value: string;
  onChange: (v: string) => void;
  onClose: () => void;
  onConfirm: (v: string) => void;
}) {
  const init = parseDateStr(value);
  const [year, setYear] = useState(init.year);
  const [month, setMonth] = useState(init.month);
  const [day, setDay] = useState(init.day);

  const maxDay = daysInMonth(year, month);
  const safeDay = Math.min(day, maxDay);
  const DAYS = Array.from({ length: maxDay }, (_, i) => String(i + 1).padStart(2, "0"));

  const yearIdx = YEARS.indexOf(String(year));
  const monthIdx = month - 1;
  const dayIdx = safeDay - 1;

  const emit = (y: number, m: number, d: number) => {
    const safe = Math.min(d, daysInMonth(y, m));
    onChange(`${y}-${String(m).padStart(2,"0")}-${String(safe).padStart(2,"0")}`);
  };

  const handleConfirm = () => {
    const safe = Math.min(day, daysInMonth(year, month));
    onConfirm(`${year}-${String(month).padStart(2,"0")}-${String(safe).padStart(2,"0")}`);
  };

  return (
    <>
      {/* 딤 배경 */}
      <div
        onClick={onClose}
        style={{
          position: "fixed", inset: 0,
          background: "rgba(0,0,0,0.45)",
          zIndex: 1000,
          backdropFilter: "blur(2px)",
        }}
      />
      {/* 바텀 시트 */}
      <div style={{
        position: "fixed", bottom: 0, left: 0, right: 0,
        background: "var(--surface)",
        borderRadius: "20px 20px 0 0",
        zIndex: 1001,
        paddingBottom: "env(safe-area-inset-bottom, 16px)",
        boxShadow: "0 -4px 32px rgba(0,0,0,0.18)",
      }}>
        {/* 핸들 */}
        <div style={{ display: "flex", justifyContent: "center", paddingTop: 12, paddingBottom: 4 }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: "var(--border)" }} />
        </div>

        {/* 헤더 */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 20px 4px" }}>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 15, color: "var(--text-muted)", cursor: "pointer", padding: "4px 0" }}>취소</button>
          <span style={{ fontSize: 15, fontWeight: 700, color: "var(--text)" }}>입사일 선택</span>
          <button onClick={handleConfirm} style={{ background: "none", border: "none", fontSize: 15, fontWeight: 700, color: "#7c3aed", cursor: "pointer", padding: "4px 0" }}>확인</button>
        </div>

        {/* 휠 */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "center",
          gap: 0, padding: "8px 24px 20px",
          background: "var(--surface)",
        }}>
          <Wheel
            items={YEARS}
            index={Math.max(0, yearIdx)}
            onChange={i => { const y = parseInt(YEARS[i]); setYear(y); emit(y, month, day); }}
            width={80}
            repeat={3}
          />
          <span style={{ fontSize: 13, color: "var(--text-muted)", padding: "0 2px", marginTop: 2 }}>년</span>

          <Wheel
            items={MONTHS}
            index={monthIdx}
            onChange={i => { const m = i + 1; setMonth(m); emit(year, m, day); }}
            width={54}
            repeat={5}
          />
          <span style={{ fontSize: 13, color: "var(--text-muted)", padding: "0 2px", marginTop: 2 }}>월</span>

          <Wheel
            items={DAYS}
            index={Math.min(dayIdx, DAYS.length - 1)}
            onChange={i => { const d = i + 1; setDay(d); emit(year, month, d); }}
            width={54}
            repeat={5}
          />
          <span style={{ fontSize: 13, color: "var(--text-muted)", padding: "0 2px", marginTop: 2 }}>일</span>
        </div>
      </div>
    </>
  );
}
