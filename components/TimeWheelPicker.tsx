"use client";

import { useRef, useEffect, useCallback } from "react";

const ITEM_H = 36;
const REPEAT = 7;

function Wheel({ items, index, onChange, width = 44, repeat = REPEAT }: {
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

  // 터치 관성용
  const touchY = useRef(0);
  const touchTime = useRef(0);
  const velocity = useRef(0); // px/ms

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
    <div style={{ position:"relative", width, height: ITEM_H * 3, overflow:"hidden", flexShrink:0 }}>
      <div style={{ position:"absolute", top: ITEM_H, left:3, right:3, height: ITEM_H, borderTop:"1px solid rgba(139,92,246,0.4)", borderBottom:"1px solid rgba(139,92,246,0.4)", pointerEvents:"none", zIndex:2 }} />
      <div style={{ position:"absolute", top:0, left:0, right:0, height: ITEM_H, background:"linear-gradient(to bottom,var(--surface2) 30%,transparent)", pointerEvents:"none", zIndex:3 }} />
      <div style={{ position:"absolute", bottom:0, left:0, right:0, height: ITEM_H, background:"linear-gradient(to top,var(--surface2) 30%,transparent)", pointerEvents:"none", zIndex:3 }} />
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
        style={{ height: ITEM_H * 3, overflowY:"hidden", scrollbarWidth:"none", cursor:"grab", touchAction:"none" }}
      >
        <div style={{ height: ITEM_H }} />
        {Array.from({ length: len * repeat }, (_, i) => {
          const idx = i % len;
          const sel = idx === index && Math.floor(i / len) === Math.floor(mid / len);
          return (
            <div key={i} style={{ height: ITEM_H, display:"flex", alignItems:"center", justifyContent:"center", fontSize: sel ? 15 : 13, fontWeight: sel ? 700 : 400, color: sel ? "var(--text)" : "rgba(130,130,150,0.55)", userSelect:"none" }}>
              {items[idx]}
            </div>
          );
        })}
        <div style={{ height: ITEM_H }} />
      </div>
    </div>
  );
}

function to12h(h24: number) {
  return { ampm: h24 < 12 ? 0 : 1, h: h24 % 12 === 0 ? 12 : h24 % 12 };
}
function to24h(ampm: number, h12: number) {
  if (ampm === 0) return h12 === 12 ? 0 : h12;
  return h12 === 12 ? 12 : h12 + 12;
}

const AMPM  = ["오전", "오후"];
const HOURS = Array.from({ length: 12 }, (_, i) => String(i + 1));
const MINS  = Array.from({ length: 60 }, (_, i) => i.toString().padStart(2, "0"));

export default function TimeWheelPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [hh, mm] = value.split(":").map(Number);
  const { ampm, h } = to12h(isNaN(hh) ? 9 : hh);
  const hourIdx = h - 1;
  const minIdx  = isNaN(mm) ? 0 : Math.min(mm, 59);

  const emit = (a: number, hi: number, mi: number) => {
    const h24 = to24h(a, hi + 1);
    onChange(`${h24.toString().padStart(2,"0")}:${mi.toString().padStart(2,"0")}`);
  };

  return (
    <div style={{ display:"flex", alignItems:"center", justifyContent:"center", background:"var(--surface2)", border:"1px solid var(--border)", borderRadius:12, overflow:"hidden", padding:"0 6px" }}>
      <Wheel items={AMPM}  index={ampm}    onChange={i => emit(i, hourIdx, minIdx)} width={46} repeat={1} />
      <div style={{ width:1, height:32, background:"var(--border)", flexShrink:0, margin:"0 2px" }} />
      <Wheel items={HOURS} index={hourIdx} onChange={i => emit(ampm, i, minIdx)}    width={38} />
      <span style={{ fontSize:14, fontWeight:700, color:"var(--text-muted)", padding:"0 2px" }}>:</span>
      <Wheel items={MINS}  index={minIdx}  onChange={i => emit(ampm, hourIdx, i)}   width={42} />
    </div>
  );
}
