export type DayKey = "월" | "화" | "수" | "목" | "금" | "토" | "일";

export const DAY_KEYS: DayKey[] = ["월", "화", "수", "목", "금", "토", "일"];

export interface TimeRange {
  open: string;
  close: string;
}

export interface DayHours {
  closed: boolean;
  ranges: TimeRange[]; // 2개 이상이면 브레이크타임 있는 것 (예: 10:00-15:00, 17:00-22:00)
}

export type BusinessHours = Record<DayKey, DayHours>;

// 요일별 정기 스케줄과 별개인 특정 날짜 휴무 (명절 연휴, 임시 휴무 등)
export interface ClosedDate {
  date: string; // "YYYY-MM-DD"
  reason: string;
}

export function defaultDayHours(): DayHours {
  return { closed: false, ranges: [{ open: "10:00", close: "22:00" }] };
}

export function defaultBusinessHours(): BusinessHours {
  return DAY_KEYS.reduce((acc, d) => {
    acc[d] = defaultDayHours();
    return acc;
  }, {} as BusinessHours);
}

function dayHoursKey(h: DayHours): string {
  return JSON.stringify({ closed: h.closed, ranges: h.ranges });
}

// 기존 저장값(구버전 단일 open/close 형태 포함)을 항상 7일 × ranges[] 형태로 정규화
export function mergeBusinessHours(existing: unknown): BusinessHours {
  const base = defaultBusinessHours();
  if (existing && typeof existing === "object") {
    const src = existing as Record<string, any>;
    DAY_KEYS.forEach(d => {
      const day = src[d];
      if (!day) return;
      if (Array.isArray(day.ranges) && day.ranges.length > 0) {
        base[d] = {
          closed: !!day.closed,
          ranges: day.ranges.map((r: any) => ({ open: r.open || "10:00", close: r.close || "22:00" })),
        };
      } else if (day.open && day.close) {
        // 구버전(요일당 단일 open/close) 호환
        base[d] = { closed: !!day.closed, ranges: [{ open: day.open, close: day.close }] };
      } else if (day.closed) {
        base[d] = { closed: true, ranges: [] };
      }
    });
  }
  return base;
}

// 저장된 7일 데이터를 "기본 영업시간 + 예외 요일"로 분해 — 입력 UI 초기값(매일동일 vs 요일별) 판단용
export function splitBusinessHours(hours: BusinessHours): {
  base: DayHours;
  exceptionDays: DayKey[];
} {
  const groupCount = new Map<string, { hours: DayHours; count: number }>();
  DAY_KEYS.forEach(d => {
    const h = hours[d];
    const key = dayHoursKey(h);
    const g = groupCount.get(key);
    if (g) g.count++;
    else groupCount.set(key, { hours: h, count: 1 });
  });

  let base = hours["월"];
  let maxCount = 0;
  groupCount.forEach(g => {
    if (g.count > maxCount) { maxCount = g.count; base = g.hours; }
  });
  const baseKey = dayHoursKey(base);

  const exceptionDays: DayKey[] = [];
  DAY_KEYS.forEach(d => {
    if (dayHoursKey(hours[d]) !== baseKey) exceptionDays.push(d);
  });

  return { base, exceptionDays };
}

// 모든 요일에 같은 시간을 적용해 7일치 데이터 조립 (저장용, "매일동일" 모드)
export function buildUniformBusinessHours(hours: DayHours): BusinessHours {
  const result = {} as BusinessHours;
  DAY_KEYS.forEach(d => { result[d] = { closed: hours.closed, ranges: hours.ranges.map(r => ({ ...r })) }; });
  return result;
}

// 연속된 요일 중 영업시간이 같은 구간을 묶어서 "월-금 10:00-15:00, 17:00-22:00 · 토-일 11:00-21:00" 형태로 표시
export function formatBusinessHours(hours: BusinessHours | null | undefined): string {
  if (!hours) return "";
  const groups: { days: DayKey[]; hours: DayHours }[] = [];
  for (const day of DAY_KEYS) {
    const h = hours[day];
    if (!h) continue;
    const last = groups[groups.length - 1];
    if (last && dayHoursKey(last.hours) === dayHoursKey(h)) {
      last.days.push(day);
    } else {
      groups.push({ days: [day], hours: h });
    }
  }
  return groups
    .map(g => {
      const dayLabel = g.days.length === 1 ? g.days[0] : `${g.days[0]}-${g.days[g.days.length - 1]}`;
      if (g.hours.closed || g.hours.ranges.length === 0) return `${dayLabel} 휴무`;
      const rangeLabel = g.hours.ranges.map(r => `${r.open}-${r.close}`).join(", ");
      return `${dayLabel} ${rangeLabel}`;
    })
    .join(" · ");
}

// 오늘 이후로 가장 가까운 특정일 휴무를 찾음 (기간 제한 없음) — 매장 홈에 "9/16(수) 추석연휴로 쉽니다" 같은 안내용
export function getUpcomingClosedDate(closedDates: ClosedDate[] | null | undefined): ClosedDate | null {
  if (!closedDates || closedDates.length === 0) return null;
  const todayStr = new Date().toISOString().slice(0, 10);

  const upcoming = closedDates
    .filter(c => c.date >= todayStr)
    .sort((a, b) => a.date.localeCompare(b.date));

  return upcoming[0] || null;
}

// 오늘부터 며칠 남았는지 — 임박한 휴무만 강조 표시하기 위한 용도
export function daysUntil(dateStr: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr + "T00:00:00");
  return Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

export function formatClosedDate(closedDate: ClosedDate): string {
  const d = new Date(closedDate.date + "T00:00:00");
  const dayLabel = DAY_KEYS[(d.getDay() + 6) % 7]; // getDay: 0=일 → 월요일 시작 DAY_KEYS 인덱스로 변환
  const label = `${d.getMonth() + 1}/${d.getDate()}(${dayLabel})`;
  return closedDate.reason ? `${label} ${closedDate.reason}로 쉽니다` : `${label} 휴무`;
}
