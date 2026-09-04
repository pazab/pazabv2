"use client";

/**
 * DateSheetPicker — 좁은 범위(min~max) 안에서 날짜(하루 또는 기간)를 고르는 바텀시트.
 * 대타 SOS처럼 선택 가능 범위가 며칠 안쪽으로 좁을 때, 달력 그리드+월 이동 대신 범위 안 날짜를
 * 칩으로 전부 펼쳐서 한 화면에서 바로 고르게 함(오늘/내일은 이름으로, 나머지는 M/D(요일)로 표시).
 * 브라우저 기본 input[type=date]가 iOS 휠피커/안드로이드 다이얼로그 등 기기마다 다르게 뜨면서
 * 이 앱의 다크테마·커스텀 바텀시트 톤과 어긋난다는 피드백으로 도입(2026-09-05).
 * 범위가 넓어지면(예: 몇 달) 이 칩 방식은 안 맞으니 그때 다시 설계할 것.
 *
 * "하루만 진행" 토글을 시트 안에 내장 — 예전엔 폼에 체크박스가 따로 있고 그 값에 따라 다른
 * 시트(단일/범위)를 열었는데, 진입점이 두 개로 갈라지는 게 부자연스럽다는 피드백으로 하나의
 * 시트 안에서 모드를 바로 전환하게 합쳐짐(2026-09-05). 체크 해제하면 여행앱 숙박일 고르듯
 * "시작일 탭 → 종료일 탭"으로 기간을 고름(첫 탭이 시작일보다 이르면 새 시작점으로 리셋).
 */
import { useMemo, useState } from "react";

interface Props {
  title?: string;
  value: string; // yyyy-mm-dd, 아직 선택 안 했으면 "" — 단일 모드에선 그 날짜, 범위 모드에선 시작일
  rangeEnd?: string; // 범위 모드일 때 현재 종료일
  min: string; // yyyy-mm-dd
  max: string; // yyyy-mm-dd
  todayStr: string; // 호출부와 "오늘" 기준을 일치시키기 위해 직접 전달받음(자체 계산 안 함)
  isSingleDay: boolean;
  onToggleSingleDay: (v: boolean) => void;
  onConfirmSingle: (date: string) => void;
  onConfirmRange: (start: string, end: string) => void;
  onClose: () => void;
  showModeToggle?: boolean; // false면 "하루만 진행" 토글 자체를 숨기고 항상 단일 모드로 고정(수정 모드 등)
}

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

function toDateStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function DateSheetPicker({ title = "날짜 선택", value, rangeEnd, min, max, todayStr, isSingleDay, onToggleSingleDay, onConfirmSingle, onConfirmRange, onClose, showModeToggle = true }: Props) {
  const [picked, setPicked] = useState<string | null>(value || null);
  const [pickedEnd, setPickedEnd] = useState<string | null>(rangeEnd || null);

  const options = useMemo(() => {
    const list: { date: string; label: string; weekday: string }[] = [];
    const start = new Date(`${min}T00:00:00`);
    const end = new Date(`${max}T00:00:00`);
    if (isNaN(start.getTime()) || isNaN(end.getTime()) || start > end) return list;
    const tomorrowStr = toDateStr(new Date(new Date(`${todayStr}T00:00:00`).getTime() + 86400000));
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const dateStr = toDateStr(d);
      const label = dateStr === todayStr ? "오늘" : dateStr === tomorrowStr ? "내일" : `${d.getMonth() + 1}/${d.getDate()}`;
      list.push({ date: dateStr, label, weekday: WEEKDAYS[d.getDay()] });
    }
    return list;
  }, [min, max, todayStr]);

  const handleDayClick = (date: string) => {
    if (isSingleDay) {
      setPicked(date);
      return;
    }
    // 시작점이 없거나(첫 진입) 이미 시작~끝이 다 정해진 상태에서 또 누르면 새로 고르기 시작
    if (!picked || (picked && pickedEnd)) {
      setPicked(date);
      setPickedEnd(null);
    } else if (date < picked) {
      // 시작일보다 이른 날을 누르면 그 날을 새 시작점으로(여행앱과 동일한 관행)
      setPicked(date);
      setPickedEnd(null);
    } else {
      setPickedEnd(date);
    }
  };

  const handleToggle = (checked: boolean) => {
    // 범위→단일로 바꿀 땐 지금까지 고른 시작일을 그대로 단일 날짜로 이어받고, 단일→범위로 바꿀 땐
    // 지금 고른 날짜를 시작일로 이어받되 종료일은 새로 고르게 비움
    if (!checked) setPickedEnd(null);
    onToggleSingleDay(checked);
  };

  const canConfirm = isSingleDay ? !!picked : !!picked && !!pickedEnd;
  const confirm = () => {
    if (!picked) return;
    if (isSingleDay) onConfirmSingle(picked);
    else { if (!pickedEnd) return; onConfirmRange(picked, pickedEnd); }
    onClose();
  };

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 1200, background: "rgba(0,0,0,0.65)", display: "flex", alignItems: "flex-end" }}>
      <div onClick={e => e.stopPropagation()} style={{ width: "100%", maxWidth: 480, margin: "0 auto", background: "var(--surface, #18181b)", borderRadius: "24px 24px 0 0", padding: 20, borderTop: "1px solid var(--border, rgba(255,255,255,0.1))", maxHeight: "85dvh", overflowY: "auto", boxSizing: "border-box" }}>
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 10 }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: "var(--border)" }} />
        </div>
        <h3 style={{ fontSize: 16, fontWeight: 900, color: "var(--text, #fff)", margin: "0 0 12px", textAlign: "center" }}>{title}</h3>

        {showModeToggle && (
          <>
            <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", marginBottom: 4 }}>
              <input type="checkbox" checked={isSingleDay} onChange={e => handleToggle(e.target.checked)}
                style={{ width: 16, height: 16, cursor: "pointer" }} />
              <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>하루만 진행</span>
            </label>
            <p style={{ fontSize: 11, color: "var(--text-muted)", margin: "0 0 14px", lineHeight: 1.5 }}>
              {isSingleDay ? "여러 날 등록하려면 체크를 해제해 주세요 — 시작일과 종료일을 눌러 기간으로 등록할 수 있어요." : "시작일을 먼저 누르고 종료일을 눌러주세요. 한 분이 수락하면 기간 전체를 맡게 돼요."}
            </p>
          </>
        )}

        {!isSingleDay && (
          <p style={{ fontSize: 12, color: "var(--text-muted)", textAlign: "center", margin: "0 0 10px" }}>
            {!picked ? "시작일을 눌러주세요" : !pickedEnd ? "종료일을 눌러주세요" : `${picked} ~ ${pickedEnd}`}
          </p>
        )}

        {options.length === 0 ? (
          <p style={{ fontSize: 13, color: "var(--text-muted)", textAlign: "center", padding: "20px 0" }}>선택 가능한 날짜가 없어요.</p>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
            {options.map(opt => {
              const isStart = opt.date === picked;
              const isEnd = !isSingleDay && opt.date === pickedEnd;
              const inRange = !isSingleDay && !!picked && !!pickedEnd && opt.date > picked && opt.date < pickedEnd;
              const selected = isStart || isEnd;
              return (
                <button key={opt.date} type="button" onClick={() => handleDayClick(opt.date)}
                  style={{
                    display: "flex", flexDirection: "column", alignItems: "center", gap: 2,
                    padding: "10px 4px", borderRadius: 14, cursor: "pointer",
                    background: selected ? "var(--primary, #8b5cf6)" : inRange ? "rgba(139,92,246,0.16)" : "var(--surface2, rgba(255,255,255,0.06))",
                    border: selected ? "1.5px solid var(--primary, #8b5cf6)" : inRange ? "1px solid rgba(139,92,246,0.35)" : "1px solid var(--border, rgba(255,255,255,0.12))",
                  }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: selected ? "#fff" : "var(--text-muted)" }}>{opt.weekday}</span>
                  <span style={{ fontSize: 14, fontWeight: 800, color: selected ? "#fff" : "var(--text)" }}>{opt.label}</span>
                </button>
              );
            })}
          </div>
        )}

        <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
          <button type="button" onClick={onClose} style={{ flex: 1, padding: 12, background: "none", border: "1px solid var(--border)", borderRadius: 12, color: "var(--text-muted)", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>취소</button>
          <button type="button" onClick={confirm} disabled={!canConfirm}
            style={{ flex: 2, padding: 12, background: !canConfirm ? "var(--surface2, rgba(255,255,255,0.1))" : "var(--primary, #8b5cf6)", border: "none", borderRadius: 12, color: !canConfirm ? "var(--text-muted)" : "#fff", fontSize: 13, fontWeight: 800, cursor: !canConfirm ? "default" : "pointer" }}>
            확인
          </button>
        </div>
      </div>
    </div>
  );
}
