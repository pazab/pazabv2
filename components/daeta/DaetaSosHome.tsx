"use client";

/**
 * DaetaSosHome — 사장님 대타 SOS 홈 (DESIGN_PLAN.md P1)
 * 원버튼 요청 → 진행 중 요청 카드(에스컬레이션 단계 표시) → 실시간 인력 목록(Tier1 우선정렬, 8명+더보기)
 * "직접 고르기"(카드덱, onOpenDeck)는 인력 목록과 같은 후보를 중복 노출해 2026-08-06 진입 버튼 제거 —
 * 코드/prop은 유지(강등), 필요해지면 목록 옆에 다시 노출
 */
import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/lib/useToast";
import AppHeader from "@/components/AppHeader";
import DaetaRegisterModal from "@/components/daeta/DaetaRegisterModal";
import DaetaRoleTabBar from "@/components/daeta/DaetaRoleTabBar";
import SetNeighborhoodSheet from "@/components/daeta/SetNeighborhoodSheet";
import { getWorkerTiers, TIER_LABEL, DaetaTier } from "@/lib/daetaTier";
import { ensureUserRow } from "@/lib/onboarding";
import { getGrade, getBadgesByRole } from "@/lib/trustScore";
import TierBadge from "@/components/TierBadge";
import { formatDaetaDateRange } from "@/lib/utils";


interface SosPosting {
  id: string;
  user_id: string;
  business_name: string;
  region: string;
  work_date: string;
  work_date_end?: string | null;
  work_hours: string;
  wage: number;
  duty: string;
  escalation_stage: number;
  allow_new: boolean;
  status: string;
  created_at: string;
  stage_updated_at: string | null;
  lat?: number | null;
  lng?: number | null;
  base_wage?: number | null;
  max_urgent_pct?: number | null;
  employer_profile_id?: string | null;
  image_urls?: string[] | null;
  required_credentials?: string | null;
}

// 서버 기본 대기시간(lib/daetaEscalation.ts DEFAULT_CONFIG)과 동일 — 관리자 설정 변경 시 다소 어긋날 수 있는 근사치
const STAGE_WAIT_MIN: Record<number, number> = { 1: 10, 2: 30, 3: 30 };

interface PostingMatchMeta {
  total: number;
  notified: number;
  acceptedMatchId: string | null;
  acceptedWorkerName: string | null;
  checkedInAt: string | null;
  checkedOutAt: string | null;
}

const STAGE_STEPS = [
  { n: 1, label: "우리 팀", icon: "ti-users" },
  { n: 2, label: "동네 검증", icon: "ti-circle-check" },
  { n: 3, label: "신규 포함", icon: "ti-circle-plus" },
  { n: 4, label: "공개 SOS", icon: "ti-speakerphone" },
];

function toRad(d: number) { return (d * Math.PI) / 180; }

// 앱 내 카드덱 모드(app/daeta/page.tsx)와 동일하게 실시간 GPS를 1순위로 시도 — 저장된 매장/알바 프로필 위치는 GPS 거부·미지원 시의 대체값일 뿐
function getGpsBase(): Promise<{ lat: number; lng: number } | null> {
  if (typeof navigator === "undefined" || !navigator.geolocation) return Promise.resolve(null);
  return new Promise(resolve => {
    navigator.geolocation.getCurrentPosition(
      pos => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => resolve(null),
      { timeout: 6000 }
    );
  });
}

function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

// 근무 시작까지 남은 시간(시간 단위) — work_hours가 "HH:MM ~ HH:MM" 형식이 아니면 정렬에서 밀리지 않도록 Infinity 처리
function hoursUntilShiftStart(p: SosPosting, now: number): number {
  const startPart = p.work_hours?.split("~")[0]?.trim();
  if (!startPart) return Infinity;
  const start = new Date(`${p.work_date}T${startPart}:00`).getTime();
  if (Number.isNaN(start)) return Infinity;
  return (start - now) / 3600000;
}

function isTodayDate(dateStr: string, now: number): boolean {
  const d = new Date(now);
  const todayStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return dateStr === todayStr;
}

// 긴급 판정 — 시작 3시간 이내 or 당일 시작 or 확대공지 단계(3+, 동네 검증인력까지 풀었는데도 안 잡힘)
function isUrgentPosting(p: SosPosting, now: number): boolean {
  if ((p.escalation_stage || 1) >= 3) return true;
  if (isTodayDate(p.work_date, now)) return true;
  return hoursUntilShiftStart(p, now) <= 3;
}

// 공고의 실제 근무 시작~종료 시각 범위(ms) — 시간 겹침 판정용. 야간 근무(종료<시작)와 기간 공고
// (work_date_end)도 처리. 파싱 실패 시 null(겹침 판정에서 조용히 제외).
function getShiftRange(p: SosPosting): { start: number; end: number } | null {
  const startPart = p.work_hours?.split("~")[0]?.trim();
  const endPart = p.work_hours?.split("~")[1]?.trim();
  if (!p.work_date || !startPart || !endPart) return null;
  const start = new Date(`${p.work_date}T${startPart}:00+09:00`).getTime();
  let end = new Date(`${p.work_date_end || p.work_date}T${endPart}:00+09:00`).getTime();
  if (endPart <= startPart) end += 86400000; // 익일까지 이어지는 야간 근무
  if (Number.isNaN(start) || Number.isNaN(end)) return null;
  return { start, end };
}

function shiftsOverlap(a: SosPosting, b: SosPosting): boolean {
  const ra = getShiftRange(a);
  const rb = getShiftRange(b);
  if (!ra || !rb) return false;
  return ra.start < rb.end && rb.start < ra.end;
}

interface PostingCardProps {
  p: SosPosting;
  isMine: boolean;
  urgent: boolean;
  meta: PostingMatchMeta;
  isApplied: boolean;
  isReceivedRequest?: boolean;
  isLoading: boolean;
  width?: number | string;
  myBase?: { lat: number; lng: number } | null;
  onEdit?: () => void;
  onCancel?: () => void;
  onApply?: () => void;
  onCancelApply?: () => void;
  onAcceptRequest?: () => void;
  onRejectRequest?: () => void;
  onGoToChat: (matchId: string) => void;
  onGoToSettle: (matchId: string) => void;
  onViewStore?: (employerProfileId: string) => void;
  onShowDetail?: (p: SosPosting) => void;
  onShowApplicants?: (p: SosPosting) => void;
  expansionInfo?: { label: string; minutesLeft: number } | null;
}

function PostingCard({ p, isMine, urgent, meta, isApplied, isReceivedRequest, isLoading, width, myBase, onEdit, onCancel, onApply, onCancelApply, onAcceptRequest, onRejectRequest, onGoToChat, onGoToSettle, onViewStore, onShowDetail, onShowApplicants, expansionInfo }: PostingCardProps) {
  const stage = p.escalation_stage || 1;
  const visibleSteps = STAGE_STEPS.filter(s => s.n !== 3 || p.allow_new);
  const dist = !isMine && myBase && p.lat != null && p.lng != null ? distanceKm(myBase, { lat: p.lat, lng: p.lng }) : null;
  const [mediaIndex, setMediaIndex] = useState(0);
  const images = p.image_urls || [];
  return (
    <div onClick={() => onShowDetail?.(p)} style={{
      width: width ?? "100%",
      flexShrink: 0,
      cursor: onShowDetail ? "pointer" : "default",
      background: isMine
        ? "linear-gradient(135deg, rgba(249,115,22,0.12) 0%, rgba(239,68,68,0.06) 100%)"
        : "var(--surface, rgba(255,255,255,0.04))",
      border: isMine
        ? "1.5px solid rgba(249,115,22,0.6)"
        : urgent
          ? "1.5px solid rgba(239,68,68,0.45)"
          : "1px solid var(--border, rgba(255,255,255,0.12))",
      borderRadius: 18,
      overflow: "hidden",
      boxShadow: isMine ? "0 4px 16px rgba(249,115,22,0.15)" : "none",
      display: "flex",
      flexDirection: "column",
      justifyContent: "space-between",
    }}>
      {/* 업무 현장 사진 — 예전엔 48x48 아이콘 크기 썸네일로만 붙어있어서 사장님이 애써 올린 업무
          사진이 거의 안 보였음. 카드 절반 가까이 차지하는 배너로 키우고, 여러 장이면 상세 팝업처럼
          여기서도 ‹ › 로 바로 넘겨볼 수 있게 함(상세까지 안 들어가도 됨). */}
      {images.length > 0 && (
        <div style={{ position: "relative" }}>
          <img src={images[Math.min(mediaIndex, images.length - 1)]} alt="" style={{ width: "100%", aspectRatio: "16/11", objectFit: "cover", display: "block" }} />
          {images.length > 1 && (
            <>
              <button onClick={(e) => { e.stopPropagation(); setMediaIndex(prev => (prev - 1 + images.length) % images.length); }}
                style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)", background: "rgba(0,0,0,0.5)", border: "none", borderRadius: "50%", width: 26, height: 26, color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, zIndex: 2 }}>
                ‹
              </button>
              <button onClick={(e) => { e.stopPropagation(); setMediaIndex(prev => (prev + 1) % images.length); }}
                style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", background: "rgba(0,0,0,0.5)", border: "none", borderRadius: "50%", width: 26, height: 26, color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, zIndex: 2 }}>
                ›
              </button>
              <div style={{ position: "absolute", bottom: 8, left: "50%", transform: "translateX(-50%)", display: "flex", gap: 4, zIndex: 2 }}>
                {images.map((_, i) => (
                  <div key={i} style={{ width: 5, height: 5, borderRadius: "50%", background: i === mediaIndex ? "#fff" : "rgba(255,255,255,0.4)" }} />
                ))}
              </div>
            </>
          )}
        </div>
      )}
      <div style={{ padding: 16, display: "flex", flexDirection: "column", flex: 1 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
        <div style={{ display: "flex", gap: 10, alignItems: "flex-start", minWidth: 0 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4, flexWrap: "wrap" }}>
            {!isMine && p.employer_profile_id ? (
              <span
                onClick={(e) => { e.stopPropagation(); onViewStore?.(p.employer_profile_id!); }}
                style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 15, fontWeight: 900, color: "var(--text, #fff)", textDecoration: "underline", textDecorationColor: "rgba(255,255,255,0.3)", textUnderlineOffset: 3, cursor: "pointer" }}>
                <i className="ti ti-home" style={{ fontSize: 13, color: "var(--text-muted, rgba(255,255,255,0.5))" }} aria-hidden="true" />
                {p.business_name}
              </span>
            ) : (
              <span style={{ fontSize: 15, fontWeight: 900, color: "var(--text, #fff)" }}>{p.business_name}</span>
            )}
            {isMine ? (
              <span style={{ fontSize: 10, background: "rgba(249,115,22,0.25)", color: "#fb923c", padding: "2px 7px", borderRadius: 10, fontWeight: 900 }}>🔥 내가 올린 SOS</span>
            ) : urgent ? (
              <span style={{ fontSize: 10, background: "rgba(239,68,68,0.22)", color: "#f87171", padding: "2px 7px", borderRadius: 10, fontWeight: 900 }}>🔥 긴급</span>
            ) : (
              <span style={{ fontSize: 10, background: "rgba(139,92,246,0.18)", color: "#a78bfa", padding: "2px 7px", borderRadius: 10, fontWeight: 800 }}>📢 동네 매장 SOS</span>
            )}
            {isReceivedRequest && (
              <span style={{ fontSize: 10, background: "rgba(139,92,246,0.22)", color: "#c4b5fd", padding: "2px 7px", borderRadius: 10, fontWeight: 900 }}>📥 나에게 직접 요청함</span>
            )}
          </div>
          <div style={{ fontSize: 12, color: "var(--text-muted, rgba(255,255,255,0.55))", marginTop: 3, wordBreak: "keep-all", overflowWrap: "break-word" }}>
            {formatDaetaDateRange(p.work_date, p.work_date_end)} · {p.work_hours}
            {dist != null && ` · 🚶 ${dist < 10 ? dist.toFixed(1) : Math.round(dist)}km`}
          </div>
          <div style={{ fontSize: 11, color: "var(--text-muted, rgba(255,255,255,0.5))", marginTop: 2, wordBreak: "keep-all", overflowWrap: "break-word" }}>
            {p.duty}
          </div>
          {p.region && (
            <div style={{ fontSize: 11, color: "var(--text-muted, rgba(255,255,255,0.45))", marginTop: 3, display: "flex", alignItems: "flex-start", gap: 3, wordBreak: "keep-all", overflowWrap: "break-word" }}>
              <i className="ti ti-map-pin" style={{ fontSize: 11, marginTop: 1, flexShrink: 0 }} aria-hidden="true" /> {p.region}
            </div>
          )}
          <div style={{ fontSize: 13, fontWeight: 800, color: "#fb923c", marginTop: 3 }}>
            시급 {p.wage.toLocaleString()}원
            {isMine && p.base_wage != null && p.wage > p.base_wage && (
              <span style={{ fontSize: 10, color: "var(--text-muted, rgba(255,255,255,0.5))", fontWeight: 600, marginLeft: 4 }}>
                (기본 {p.base_wage.toLocaleString()}원 → 자동 할증)
              </span>
            )}
          </div>
          {isMine && (p.max_urgent_pct || 0) > 0 && (
            <div style={{ fontSize: 10, color: "var(--text-muted, rgba(255,255,255,0.45))", marginTop: 2 }}>
              ⚡ 안 잡히면 최대 +{p.max_urgent_pct}%까지 자동 할증돼요
            </div>
          )}
        </div>
        </div>
        <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
          {isMine ? (
            !meta.acceptedMatchId && (
              <>
                <button
                  onClick={(e) => { e.stopPropagation(); onEdit?.(); }}
                  style={{ background: "var(--surface2, rgba(255,255,255,0.08))", border: "1px solid var(--border, rgba(255,255,255,0.1))", borderRadius: 10, padding: "6px 10px", color: "var(--text, #fff)", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                  수정
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); onCancel?.(); }}
                  style={{ background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.35)", borderRadius: 10, padding: "6px 10px", color: "#f87171", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                  취소
                </button>
              </>
            )
          ) : isReceivedRequest ? (
            // 사장님이 나를 콕 찍어 보낸 1:1 SOS 요청 — 내가 지원한 게 아니라 저쪽이 나한테 제안한 거라
            // "지원 완료/취소"가 아니라 수락/거절이 맞음. 예전엔 이것도 isApplied로 뭉뚱그려서
            // "지원 완료"로만 보이고 취소 버튼만 있어서, 진짜 요청인 줄 모르고 거절하기 쉬웠음.
            // "나에게 직접 요청함" 표시는 상단 뱃지 줄로 옮김(여기 두면 거절/수락 버튼보다 넓어져서 삐져나왔음).
            <div style={{ display: "flex", gap: 6 }}>
              <button
                onClick={(e) => { e.stopPropagation(); onRejectRequest?.(); }}
                disabled={isLoading}
                style={{ background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.35)", borderRadius: 10, padding: "6px 10px", color: "#f87171", fontSize: 11, fontWeight: 700, cursor: isLoading ? "default" : "pointer", opacity: isLoading ? 0.6 : 1 }}
              >
                거절
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); onAcceptRequest?.(); }}
                disabled={isLoading}
                style={{ background: "linear-gradient(135deg, #f97316, #ef4444)", border: "none", borderRadius: 10, padding: "6px 12px", color: "#fff", fontSize: 11, fontWeight: 800, cursor: isLoading ? "default" : "pointer", opacity: isLoading ? 0.6 : 1 }}
              >
                {isLoading ? "..." : "수락"}
              </button>
            </div>
          ) : isApplied ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-end" }}>
              <span style={{ background: "var(--surface2, rgba(255,255,255,0.1))", border: "1px solid var(--border)", borderRadius: 10, padding: "6px 12px", color: "var(--text-muted)", fontSize: 11, fontWeight: 800 }}>
                ✅ 지원 완료
              </span>
              <button
                onClick={(e) => { e.stopPropagation(); onCancelApply?.(); }}
                disabled={isLoading}
                style={{ background: "none", border: "none", color: "#f87171", fontSize: 11, fontWeight: 700, cursor: isLoading ? "default" : "pointer", opacity: isLoading ? 0.6 : 1, padding: "2px 4px" }}
              >
                {isLoading ? "..." : "지원 취소"}
              </button>
            </div>
          ) : (
            <button
              onClick={(e) => { e.stopPropagation(); onApply?.(); }}
              disabled={isLoading}
              style={{
                background: "linear-gradient(135deg, #f97316, #ef4444)",
                border: "none",
                borderRadius: 10,
                padding: "8px 14px",
                color: "#fff",
                fontSize: 12,
                fontWeight: 800,
                cursor: "pointer",
                opacity: isLoading ? 0.6 : 1,
                boxShadow: "0 2px 8px rgba(249,115,22,0.3)",
              }}
            >
              {isLoading ? "..." : "🚀 지원하기"}
            </button>
          )}
        </div>
      </div>

      {/* 진행상황(스테퍼·응답건수)은 사장님 본인에게만 의미있는 내부 정보라 내 공고에만 노출 — 남의 공고엔 매장 홈 링크로 대체 */}
      {isMine ? (
        meta.acceptedMatchId ? (
          // 매칭 확정 이후에도 정산 전까지는 이 카드가 홈에 계속 남아있음(위 load()에서 status='matched'도
          // 계속 조회) — 출근/퇴근/정산까지 이 화면 안에서 다음 액션을 바로 알 수 있게.
          <div style={{ marginTop: 8 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 12px", background: "rgba(34,197,94,0.12)", border: "1px solid rgba(34,197,94,0.35)", borderRadius: 14, marginBottom: 6, gap: 8 }}>
              <span style={{ fontSize: 12, fontWeight: 800, color: "#4ade80" }}>🎉 {meta.acceptedWorkerName}님 매칭 완료</span>
              <span style={{ fontSize: 11, fontWeight: 700, color: meta.checkedOutAt ? "#4ade80" : meta.checkedInAt ? "#fbbf24" : "var(--text-muted, rgba(255,255,255,0.5))", whiteSpace: "nowrap" }}>
                {meta.checkedOutAt ? "🏁 퇴근함" : meta.checkedInAt ? "🔥 근무중" : "⏳ 출근 전"}
              </span>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={(e) => { e.stopPropagation(); onGoToChat(meta.acceptedMatchId!); }}
                style={{ flex: 1, padding: "10px", background: "var(--surface2, rgba(255,255,255,0.08))", border: "1px solid var(--border, rgba(255,255,255,0.15))", borderRadius: 14, color: "var(--text, #fff)", fontSize: 12, fontWeight: 800, cursor: "pointer" }}>
                💬 채팅
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); onGoToSettle(meta.acceptedMatchId!); }}
                style={{ flex: 1, padding: "10px", background: "linear-gradient(135deg, #f97316, #ef4444)", border: "none", borderRadius: 14, color: "#fff", fontSize: 12, fontWeight: 800, cursor: "pointer" }}>
                💸 정산하러 가기
              </button>
            </div>
          </div>
        ) : (
          <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--border, rgba(255,255,255,0.08))" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 8 }}>
              {visibleSteps.map((s, i) => {
                const active = stage >= s.n;
                const current = stage === s.n;
                return (
                  <div key={s.n} style={{ display: "flex", alignItems: "center", gap: 4, flex: 1 }}>
                    <div style={{
                      flex: 1,
                      textAlign: "center",
                      padding: "5px 2px",
                      borderRadius: 8,
                      background: current ? "rgba(251,146,60,0.15)" : active ? "rgba(255,255,255,0.06)" : "transparent",
                      border: current ? "1px solid rgba(251,146,60,0.45)" : "1px solid transparent",
                    }}>
                      <i className={`ti ${s.icon}`} style={{ fontSize: 11 }} aria-hidden="true" />
                      <div style={{ fontSize: 9, fontWeight: current ? 800 : 500, color: current ? "#fb923c" : active ? "var(--text, #fff)" : "var(--text-muted, rgba(255,255,255,0.3))", marginTop: 1 }}>
                        {s.label}
                      </div>
                    </div>
                    {i < visibleSteps.length - 1 && (
                      <div style={{ width: 6, height: 1.5, background: active ? "rgba(251,146,60,0.5)" : "rgba(255,255,255,0.12)", flexShrink: 0 }} />
                    )}
                  </div>
                );
              })}
            </div>

            {meta.total > 0 ? (
              // 지원자가 실제로 있으면 "확인해야 할 일"이므로 스테퍼 하단의 작은 텍스트가 아니라
              // 카드 안에서 가장 눈에 띄는 액션 버튼으로 — 처음 쓰는 사장님도 여기서 지원자를 볼 수
              // 있다는 걸 바로 알아챌 수 있게.
              <button onClick={(e) => { e.stopPropagation(); onShowApplicants?.(p); }}
                style={{
                  width: "100%",
                  display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8,
                  background: "linear-gradient(135deg, rgba(34,197,94,0.22), rgba(22,163,74,0.14))",
                  border: "1.5px solid rgba(34,197,94,0.55)",
                  borderRadius: 14,
                  padding: "11px 14px",
                  cursor: "pointer",
                }}>
                <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{
                    width: 26, height: 26, borderRadius: "50%", flexShrink: 0,
                    background: "#22c55e", color: "#fff", fontSize: 12, fontWeight: 900,
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    {meta.total}
                  </span>
                  <span style={{ fontSize: 13, fontWeight: 900, color: "#4ade80" }}>지원자 확인하기</span>
                </span>
                <span style={{ fontSize: 12, fontWeight: 800, color: "#4ade80", display: "flex", alignItems: "center", gap: 2 }}>
                  보러가기 <i className="ti ti-chevron-right" style={{ fontSize: 13 }} aria-hidden="true" />
                </span>
              </button>
            ) : (
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 10, color: "var(--text-muted, rgba(255,255,255,0.45))" }}>
                  {stage === 1 && "팀 알림 중"}
                  {stage === 2 && "동네 검증 공개"}
                  {stage === 3 && "신규 포함 공개"}
                  {stage === 4 && "전체 공개 중"}
                </span>
                <span style={{ fontSize: 10, fontWeight: 800, color: "var(--text-muted, rgba(255,255,255,0.45))" }}>
                  {meta.notified > 0 ? `${meta.notified}명에게 알림 · ` : ""}응답 0건
                </span>
              </div>
            )}

            {expansionInfo && (
              <div style={{ fontSize: 10, color: "var(--text-muted, rgba(255,255,255,0.4))", marginTop: 6, textAlign: "right" }}>
                ⏳ {expansionInfo.minutesLeft > 0 ? `${expansionInfo.label}까지 ${expansionInfo.minutesLeft}분` : `곧 ${expansionInfo.label}`}
              </div>
            )}
          </div>
        )
      ) : null}
      </div>
    </div>
  );
}

interface DaetaSosHomeProps {
  userId: string;
  userType: string;
  onOpenDeck: () => void;
  roleView?: "employer" | "worker";
  onRoleChange?: (r: "employer" | "worker") => void;
  /** "새 지원서 도착" 알림에서 온 경우 — 해당 공고의 지원자 시트를 진입하자마자 자동으로 염 */
  autoOpenApplicantsPostingId?: string | null;
  onAutoOpenApplicantsConsumed?: () => void;
}

export default function DaetaSosHome({ userId, userType, onOpenDeck, roleView, onRoleChange, autoOpenApplicantsPostingId, onAutoOpenApplicantsConsumed }: DaetaSosHomeProps) {
  const router = useRouter();
  const { showToast, ToastUI } = useToast();

  const [loading, setLoading] = useState(true);
  const [postings, setPostings] = useState<SosPosting[]>([]);
  const [matchMeta, setMatchMeta] = useState<Record<string, PostingMatchMeta>>({});
  const [availableWorkers, setAvailableWorkers] = useState<any[]>([]);
  const [workerProfile, setWorkerProfile] = useState<{ id: string; available_now: boolean } | null>(null);
  // 내 이력에 등록된 자격증/보건증 목록(worker_profiles.credentials) — 지원 전 필수 자격 확인용
  const [myCredentials, setMyCredentials] = useState<{ name: string; is_mandatory_by_law?: boolean }[]>([]);
  const [showRegisterModal, setShowRegisterModal] = useState(false);
  const [editingPostingId, setEditingPostingId] = useState<string | null>(null);
  const [historyCount, setHistoryCount] = useState(0);
  const [showAllWorkers, setShowAllWorkers] = useState(false);
  const [pendingConfirm, setPendingConfirm] = useState<{ title: string; message: string; onConfirm: () => void } | null>(null);
  const [activeTab, setActiveTab] = useState<"post" | "people">("post");
  const [myBase, setMyBase] = useState<{ lat: number; lng: number } | null>(null);
  const [neighborhoodLabel, setNeighborhoodLabel] = useState<string | null>(null);
  const [showNeighborhoodSheet, setShowNeighborhoodSheet] = useState(false);



  const [actionLoading, setActionLoading] = useState<string | null>(null);
  // postingId → matchId (취소 시 어떤 match를 취소할지 알아야 해서 postingId만 있던 Set에서 확장)
  const [appliedMatchIds, setAppliedMatchIds] = useState<Record<string, string>>({});
  // postingId → matchId — 사장님이 나를 콕 찍어 보낸 1:1 SOS 요청(내가 지원한 게 아니라 받은 것). appliedMatchIds와
  // 같은 원본 조회에서 initiated_by로 갈라 나온다.
  const [receivedRequestMatchIds, setReceivedRequestMatchIds] = useState<Record<string, string>>({});
  // 확정된 근무와 시간이 겹치는 다른 대기중 지원/요청 발견 시 취소를 정중히 유도하는 팝업
  const [conflictWarning, setConflictWarning] = useState<{ matchId: string; confirmedPosting: SosPosting; conflictPosting: SosPosting } | null>(null);
  const [cancelingConflict, setCancelingConflict] = useState(false);
  // 같은 matchId로 반복 팝업하지 않게(취소든 나중에든 한 번 보면 이번 세션에선 다시 안 뜸) — 리렌더로 리셋되면 안 되므로 ref
  const promptedConflictRef = useRef<Set<string>>(new Set());
  const [hasEmployerProfile, setHasEmployerProfile] = useState(false);

  const [targetWorkerForSos, setTargetWorkerForSos] = useState<any | null>(null);
  const [selectedPostingId, setSelectedPostingId] = useState<string>("");
  const [sendingSos, setSendingSos] = useState(false);
  const [detailPosting, setDetailPosting] = useState<SosPosting | null>(null);
  const [detailMediaIndex, setDetailMediaIndex] = useState(0);
  const openDetail = (p: SosPosting) => { setDetailMediaIndex(0); setDetailPosting(p); };
  const [applicantsSheet, setApplicantsSheet] = useState<{
    postingId: string; businessName: string;
    applicants: { matchId: string; workerId: string; nickname: string; trustScore: number; avatarUrl?: string; tier: DaetaTier; badges: { key: string; emoji: string; name: string }[] }[];
    // 거절한 지원자 — 예전엔 거절하는 순간 사장님 화면에서 완전히 사라져서(재조회해도 pending만
    // 가져옴) "이 사람 전에 거절했었나?" 확인할 방법이 아예 없었음. 재지원 자체는 막지 않으므로
    // (다른 상황이면 다시 고려할 수도 있어서) 참고용으로만 접어서 보여준다.
    rejected: { matchId: string; workerId: string; nickname: string; avatarUrl?: string }[];
  } | null>(null);
  const [showRejectedApplicants, setShowRejectedApplicants] = useState(false);
  const [loadingApplicants, setLoadingApplicants] = useState(false);
  const [acceptingMatchId, setAcceptingMatchId] = useState<string | null>(null);
  const [rejectingMatchId, setRejectingMatchId] = useState<string | null>(null);
  // 대타 참여 정지 상태 — 예전엔 지원/등록을 "시도해서 실패"해야만 토스트로 알 수 있었음.
  // 상시로 눈에 띄게 보여줘서 왜 못 하는지 매번 다시 알아내지 않게 함.
  const [suspendedUntil, setSuspendedUntil] = useState<string | null>(null);
  useEffect(() => {
    supabase.from("users").select("daeta_cancel_suspended_until").eq("id", userId).maybeSingle()
      .then(({ data }) => {
        const until = data?.daeta_cancel_suspended_until;
        setSuspendedUntil(until && new Date(until) > new Date() ? until : null);
      });
  }, [userId]);

  // 내 지원 자격(Tier1/Tier2) — 아직 신규(Tier2)에게 안 열린 공고(stage<3)는 목록에서부터 숨겨서
  // "지원했는데 거절당함" 경험을 안 만든다. 실제 차단은 app/api/lovecall route가 서버에서 함, 이건 그 결과를 미리 보여주는 것뿐.
  const [myTier, setMyTier] = useState<DaetaTier | null>(null);
  useEffect(() => {
    if (!userId) return;
    getWorkerTiers(supabase, [userId]).then(tiers => setMyTier(tiers[userId] || "tier2"));
  }, [userId]);

  // 첫 진입 가이드 — 1회성, 닫으면 다시 안 뜸
  const [guideDismissed, setGuideDismissed] = useState(true);
  useEffect(() => {
    setGuideDismissed(localStorage.getItem("pazab_daeta_guide_dismissed") === "1");
  }, []);
  const dismissGuide = () => {
    localStorage.setItem("pazab_daeta_guide_dismissed", "1");
    setGuideDismissed(true);
  };

  const handleSosClick = (w: any) => {
    if (w.isMe) {
      router.push("/mypage");
      return;
    }
    if (!hasEmployerProfile) {
      setPendingConfirm({
        title: "사장님 프로필 등록 필요",
        message: "대타 SOS 요청은 매장을 등록하신 사장님만 보낼 수 있습니다. 사장님 프로필(매장)을 등록하시겠습니까?",
        onConfirm: () => {
          setPendingConfirm(null);
          router.push("/employer/register?return=daeta");
        }
      });
      return;
    }
    // 1:1 지정 요청은 아직 구인 중인(pending) 공고에만 붙일 수 있음 — 이미 매칭된(matched) 공고는 대상에서 제외
    const myPostings = postings.filter(p => p.user_id === userId && p.status === "pending");
    if (myPostings.length > 0) {
      setSelectedPostingId(myPostings[0].id); // 이미 등록된 진행 중 대타 공고를 스마트 기본값으로 자동 세팅!
    } else {
      setSelectedPostingId("");
    }
    setTargetWorkerForSos(w);
  };

  const sendDirectSosRequest = async () => {
    if (!targetWorkerForSos) return;
    if (!selectedPostingId) {
      showToast("요청할 긴급 대타 공고를 먼저 선택해 주세요.", "error");
      return;
    }
    setSendingSos(true);
    try {
      const res = await fetch("/api/lovecall", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employerId: userId,
          workerId: targetWorkerForSos.userId,
          senderType: "employer",
          daetaPostingId: selectedPostingId,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "지정 대타 요청 발송 실패");
      showToast(`🎉 ${targetWorkerForSos.nickname}님에게 1:1 지정 대타 요청을 보냈습니다!`);
      setTargetWorkerForSos(null);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "요청 실패";
      showToast(msg, "error");
    } finally {
      setSendingSos(false);
    }
  };

  const load = useCallback(async () => {
    const gpsBasePromise = getGpsBase(); // 다른 조회와 병렬로 미리 시작 — 뒤에서 값 필요할 때 await만
    // 매칭 확정(status='matched')된 공고도 정산 전까지는 계속 홈에 노출 — 예전엔 수락 즉시 status가
    // 'matched'로 바뀌면서 이 목록에서 통째로 사라져, 출근/퇴근/정산을 하려면 이름이 전혀 다른
    // "대타 이력" 화면으로 옮겨가야 했음(사장님이 다음 액션을 놓치기 쉬운 구조). status가
    // 'completed'/'cancelled'/'expired'로 바뀌는(=정산되거나 종료되는) 순간에만 진짜로 빠진다.
    const { data: rowsRaw } = await supabase
      .from("daeta_postings")
      .select("id, user_id, business_name, region, work_date, work_date_end, work_hours, wage, duty, escalation_stage, allow_new, status, created_at, stage_updated_at, expires_at, lat, lng, base_wage, max_urgent_pct, employer_profile_id, image_urls, required_credentials")
      .in("status", ["pending", "matched"])
      .order("created_at", { ascending: false });

    // 근무 시작 시각(expires_at)이 지났는데 응답자 없이 방치된 공고는 크론 없이 조회 시점에 만료 처리 —
    // daeta_postings 상태 변경뿐 아니라 거기 딸린 pending 지원자 정리 + 알림까지 필요해서
    // (서비스롤 권한 필요) 클라이언트에서 직접 update하지 않고 서버 라우트를 호출한다.
    // matched(이미 확정)된 공고는 expires_at이 지나 있어도 만료 대상이 아니므로 이 판정에서 제외.
    const nowIso = new Date().toISOString();
    const pendingRows = (rowsRaw || []).filter(r => (r as any).status === "pending");
    const expiredIds = pendingRows.filter(r => (r as any).expires_at && (r as any).expires_at < nowIso).map(r => r.id);
    if (expiredIds.length > 0) {
      fetch("/api/daeta/expire-check", { method: "POST" }).catch(() => {});
    }
    const expiredIdSet = new Set(expiredIds);
    const rows = (rowsRaw || []).filter(r => !expiredIdSet.has(r.id));

    const postingList = (rows || []) as SosPosting[];
    // 내 공고가 먼저 오도록 정렬
    postingList.sort((a, b) => (b.user_id === userId ? 1 : 0) - (a.user_id === userId ? 1 : 0));
    setPostings(postingList);


    if (postingList.length > 0) {
      const ids = postingList.map(p => p.id);
      const { data: matches } = await supabase
        .from("matches")
        .select("id, daeta_posting_id, worker_id, progress_status, checked_in_at, checked_out_at, initiated_by")
        .in("daeta_posting_id", ids)
        .in("progress_status", ["pending", "accepted", "hired"]);

      const meta: Record<string, PostingMatchMeta> = {};
      ids.forEach(id => { meta[id] = { total: 0, notified: 0, acceptedMatchId: null, acceptedWorkerName: null, checkedInAt: null, checkedOutAt: null }; });

      const acceptedWorkerIds: string[] = [];
      (matches || []).forEach((m: { id: string; daeta_posting_id: string; worker_id: string; progress_status: string; checked_in_at: string | null; checked_out_at: string | null }) => {
        const entry = meta[m.daeta_posting_id];
        if (!entry) return;
        entry.total += 1;
        if (m.progress_status === "accepted" || m.progress_status === "hired") {
          entry.acceptedMatchId = m.id;
          entry.checkedInAt = m.checked_in_at;
          entry.checkedOutAt = m.checked_out_at;
          acceptedWorkerIds.push(m.worker_id);
          (entry as PostingMatchMeta & { _workerId?: string })._workerId = m.worker_id;
        }
      });

      if (acceptedWorkerIds.length > 0) {
        const { data: users } = await supabase
          .from("users").select("id, nickname").in("id", acceptedWorkerIds);
        const nameMap: Record<string, string> = {};
        (users || []).forEach((u: { id: string; nickname: string }) => { nameMap[u.id] = u.nickname; });
        Object.values(meta).forEach(entry => {
          const wid = (entry as PostingMatchMeta & { _workerId?: string })._workerId;
          if (wid) entry.acceptedWorkerName = nameMap[wid] || "알바생";
        });
      }

      setMatchMeta(meta);

      // 내가 지원한 공고 — 세션 안에서 방금 지원한 것만이 아니라 이전에 지원해둔 것도
      // 새로고침/재진입 시 그대로 "지원 완료"로 보여야 함 (예전엔 로컬 state만 믿어서 리셋됨)
      const appliedMap: Record<string, string> = {};
      const receivedMap: Record<string, string> = {};
      (matches || []).forEach(m => {
        if (m.worker_id !== userId) return;
        // initiated_by === 나 → 내가 지원한 것. 그 외(사장님이 initiated) → 사장님이 나한테 직접 보낸 요청.
        if (m.initiated_by === userId) appliedMap[m.daeta_posting_id] = m.id;
        else receivedMap[m.daeta_posting_id] = m.id;
      });
      setAppliedMatchIds(appliedMap);
      setReceivedRequestMatchIds(receivedMap);

      // 확정된(accepted) 내 근무와 시간이 겹치는 다른 대기중 지원/요청 감지 — 강제 취소는 안 하고
      // 정중하게 취소를 유도하는 팝업만 한 번 띄움(무시해도 그만, 본인 자유). matchId 하나당
      // 세션 내 한 번만 뜨도록 promptedConflictRef로 관리(무시했든 취소했든 다시 안 물어봄).
      const confirmedMine = (matches || []).filter(m => m.worker_id === userId && m.progress_status === "accepted");
      const pendingMine = (matches || []).filter(m => m.worker_id === userId && m.progress_status === "pending");
      outer: for (const cm of confirmedMine) {
        const confirmedPosting = postingList.find(p => p.id === cm.daeta_posting_id);
        if (!confirmedPosting) continue;
        for (const pm of pendingMine) {
          if (pm.daeta_posting_id === cm.daeta_posting_id) continue;
          if (promptedConflictRef.current.has(pm.id)) continue;
          const conflictPosting = postingList.find(p => p.id === pm.daeta_posting_id);
          if (!conflictPosting) continue;
          if (shiftsOverlap(confirmedPosting, conflictPosting)) {
            promptedConflictRef.current.add(pm.id);
            setConflictWarning({ matchId: pm.id, confirmedPosting, conflictPosting });
            break outer;
          }
        }
      }

      // 내 공고에만 필요한 "알림 간 인원" — 응답건수(meta.total)의 분모. notifications RLS(본인만 SELECT)상
      // 사장님이 직접 못 읽으므로 서버 라우트(서비스롤+소유권검증) 경유해서 근사치를 채운다(비동기, 실패해도 무시)
      const myIds = ids.filter(id => postingList.find(p => p.id === id)?.user_id === userId);
      if (myIds.length > 0) {
        fetch("/api/daeta/notified-count", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ postingIds: myIds }),
        })
          .then(res => res.json())
          .then((data: { counts?: Record<string, number> }) => {
            if (!data.counts) return;
            setMatchMeta(prev => {
              const next = { ...prev };
              Object.entries(data.counts!).forEach(([pid, count]) => {
                if (next[pid]) next[pid] = { ...next[pid], notified: count };
              });
              return next;
            });
          })
          .catch(() => {});
      }
    } else {
      setMatchMeta({});
      setAppliedMatchIds({});
      setReceivedRequestMatchIds({});
    }

    // ⚡ 사장님 프로필(매장) 존재 여부 조회
    const { data: empData } = await supabase
      .from("employer_profiles")
      .select("id")
      .eq("user_id", userId)
      .limit(1);
    setHasEmployerProfile(!!(empData && empData.length > 0));

    // ⚡ 내 알바 프로필 상태 조회
    const { data: wpRows } = await supabase
      .from("worker_profiles")
      .select("id, available_now, lat, lng, eupmyeondong, sigungu, credentials")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1);
    if (wpRows && wpRows.length > 0) {
      setWorkerProfile(wpRows[0]);
    } else {
      setWorkerProfile(null);
    }
    setMyCredentials(Array.isArray(wpRows?.[0]?.credentials) ? wpRows[0].credentials : []);

    // ⚡ 내 위치 기준점 — 실시간 GPS 1순위, 거부·미지원 시엔 "내 동네"(worker_profiles, 수동 설정)로 대체.
    // 매장 주소는 기준으로 안 씀 — 이 거리는 "대타 뛰러 갈 통근 거리"라 본인 가게 위치와는 무관함.
    const wpLoc = wpRows?.[0] as { lat: number | null; lng: number | null; eupmyeondong?: string | null; sigungu?: string | null } | undefined;
    setNeighborhoodLabel(wpLoc?.eupmyeondong || wpLoc?.sigungu || null);
    const gpsBase = await gpsBasePromise;
    if (gpsBase) {
      setMyBase(gpsBase);
    } else if (wpLoc?.lat != null && wpLoc?.lng != null) {
      setMyBase({ lat: wpLoc.lat, lng: wpLoc.lng });
    } else {
      setMyBase(null);
    }

    // ⚡ 실시간 대타 가능 알바생 목록 조회 (available_now가 true인 대기 중 유저만)
    const { data: workers } = await supabase
      .from("worker_profiles")
      .select(`
        id, user_id, desired_type, experience_months, available_now, desired_region,
        users!worker_profiles_user_id_fkey (id, nickname, avatar_url, trust_score)
      `)
      .eq("available_now", true)
      .order("created_at", { ascending: false })
      .limit(30);

    interface WorkerCardItem {
      id: string;
      userId: string;
      nickname: string;
      avatarUrl?: string;
      trustScore: number;
      availableNow: boolean;
      category: string;
      region: string;
      experienceMonths: number;
      isMe: boolean;
      tier?: "tier1" | "tier2";
    }

    let workerCardList: WorkerCardItem[] = (workers || []).map((w: any) => ({
      id: w.id,
      userId: w.user_id,
      nickname: w.users?.nickname || "익명 알바생",
      avatarUrl: w.users?.avatar_url || undefined,
      trustScore: w.users?.trust_score || 50,
      availableNow: true,
      category: w.desired_type || "알바",
      region: w.desired_region || "",
      experienceMonths: w.experience_months || 0,
      isMe: w.user_id === userId,
    }));

    // 만약 현재 로그인 유저가 대타 가능(available_now = true) 상태이면 목록 맨 앞에 나를 확실히 정렬
    if (wpRows && wpRows.length > 0 && wpRows[0].available_now) {
      const existsInList = workerCardList.some(w => w.userId === userId);
      if (!existsInList) {
        const { data: meUser } = await supabase.from("users").select("nickname, avatar_url, trust_score").eq("id", userId).maybeSingle();
        workerCardList.unshift({
          id: wpRows[0].id,
          userId: userId,
          nickname: meUser?.nickname || "나",
          avatarUrl: meUser?.avatar_url || undefined,
          trustScore: meUser?.trust_score || 50,
          availableNow: true,
          category: "알바",
          region: "",
          experienceMonths: 0,
          isMe: true,
        });
      } else {
        workerCardList = workerCardList.map(w => w.userId === userId ? { ...w, isMe: true } : w);
        workerCardList.sort((a, b) => (b.isMe ? 1 : 0) - (a.isMe ? 1 : 0));
      }
    } else {
      // 꺼진 상태(available_now = false)이면 내 카드를 목록에서 완전히 제외
      workerCardList = workerCardList.filter(w => w.userId !== userId);
    }

    // STRATEGY.md 2-Tier 원칙 — 알바생 쪽 공고 피드에만 적용돼 있던 Tier1(✅검증) 우선노출을
    // 사장님이 인력을 직접 보는 이 목록에도 동일하게 적용 (기존엔 가입 최신순으로만 나열됐음)
    const tiers = await getWorkerTiers(supabase, workerCardList.map(w => w.userId));
    workerCardList = workerCardList.map(w => ({ ...w, tier: tiers[w.userId] || "tier2" }));
    workerCardList.sort((a, b) => (b.isMe ? 1 : 0) - (a.isMe ? 1 : 0) || (a.tier === "tier1" ? 0 : 1) - (b.tier === "tier1" ? 0 : 1));

    setAvailableWorkers(workerCardList);

    // 대타 내역 버튼에 건수 표시 — 눌러보기 전엔 뭐가 들어있는지 알 수 없던 문제
    const { count } = await supabase
      .from("matches")
      .select("id", { count: "exact", head: true })
      .eq("employer_id", userId)
      .not("daeta_posting_id", "is", null);
    setHistoryCount(count || 0);

    setLoading(false);
  }, [userId]);


  const toggleAvailable = async () => {
    let currentProfile = workerProfile;

    if (!currentProfile) {
      const { data: existing } = await supabase
        .from("worker_profiles")
        .select("id, available_now")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (existing) {
        currentProfile = existing;
      }
    }

    if (!currentProfile) {
      // users(id) FK 자가치유 — 레거시 계정 등으로 public.users 행이 없으면 아래 upsert가
      // "violates foreign key constraint"로 항상 실패했음
      await ensureUserRow(supabase, userId);
      const { data: newP, error: upsertErr } = await supabase
        .from("worker_profiles")
        .upsert({
          user_id: userId,
          available_now: true,
          is_active: true,
          is_public: true,
        }, { onConflict: "user_id" })
        .select("id, available_now")
        .single();

      if (upsertErr || !newP) {
        showToast("알바 프로필 생성 실패: " + (upsertErr?.message || ""), "error");
        return;
      }
      setWorkerProfile(newP);
      showToast("🟢 대타 가능! 동네 SOS 알림을 받아요", "success");
      await load();
      return;
    }

    const next = !currentProfile.available_now;
    const { error } = await supabase
      .from("worker_profiles")
      .update({ available_now: next, is_active: true, is_public: true })
      .eq("id", currentProfile.id);

    if (error) {
      showToast("변경 실패: " + error.message, "error");
      return;
    }
    setWorkerProfile({ ...currentProfile, available_now: next });
    showToast(next ? "🟢 대타 가능! 동네 SOS 알림을 받아요" : "⚪ 대타 알림을 껐어요", next ? "success" : "info");
    await load();
  };



  useEffect(() => { load(); }, [load]);

  // 확산 카운트다운 표시용 — 1분마다 재계산
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(t);
  }, []);

  function nextExpansionInfo(p: SosPosting): { label: string; minutesLeft: number } | null {
    const stage = p.escalation_stage || 1;
    if (stage >= 4) return null;
    if (stage === 2 && !p.allow_new) return null; // opt-in 안 하면 2→4 직행(대기 안내 스킵)
    const waitMin = STAGE_WAIT_MIN[stage];
    if (!waitMin) return null;
    const stageStart = new Date(p.stage_updated_at || p.created_at).getTime();
    const elapsedMin = (now - stageStart) / 60000;
    const minutesLeft = Math.max(0, Math.ceil(waitMin - elapsedMin));
    const label = stage === 1 ? "동네 ✅검증 인력 공개" : stage === 2 ? "🔵신규 알바생 공개" : "전체 공개 SOS";
    return { label, minutesLeft };
  }

  const fireSos = async (postingId: string) => {
    try {
      const res = await fetch("/api/daeta/sos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ postingId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "SOS 발동 실패");
      if (data.teamNotified > 0) {
        showToast(`⚡ 우리 팀 ${data.teamNotified}명에게 가장 먼저 알렸어요!`);
      } else {
        showToast(`⚡ 팀원이 없어 동네 ✅검증 인력 ${data.nearbyNotified}명에게 바로 공개했어요!`);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "SOS 발동 중 오류";
      showToast(message, "error");
    }
    await load();
  };

  // 내 공고에 지원한 사람들 목록 — 예전엔 이 화면 어디에도 지원자 리스트/수락 버튼이 없어서
  // (응답 N건 이라는 숫자만 표시) MY페이지 지원현황까지 따로 찾아가야만 수락할 수 있었음
  const openApplicants = async (p: SosPosting) => {
    setLoadingApplicants(true);
    setShowRejectedApplicants(false);
    setApplicantsSheet({ postingId: p.id, businessName: p.business_name, applicants: [], rejected: [] });
    try {
      const { data: allMatches } = await supabase
        .from("matches")
        .select("id, worker_id, progress_status")
        .eq("daeta_posting_id", p.id)
        .in("progress_status", ["pending", "rejected"]);

      const pendingMatches = (allMatches || []).filter(m => m.progress_status === "pending");
      const rejectedMatches = (allMatches || []).filter(m => m.progress_status === "rejected");

      if (pendingMatches.length === 0 && rejectedMatches.length === 0) {
        setApplicantsSheet({ postingId: p.id, businessName: p.business_name, applicants: [], rejected: [] });
        return;
      }

      const workerIds = [...new Set([...pendingMatches, ...rejectedMatches].map(m => m.worker_id))];
      const [{ data: users }, tiers, { data: badgeRows }] = await Promise.all([
        supabase.from("users").select("id, nickname, trust_score, avatar_url").in("id", workerIds),
        getWorkerTiers(supabase, workerIds),
        supabase.from("user_badges").select("user_id, badge_key").in("user_id", workerIds),
      ]);
      const userMap = new Map((users || []).map(u => [u.id, u]));
      const badgesByWorker = new Map<string, { badge_key: string }[]>();
      (badgeRows || []).forEach((b: { user_id: string; badge_key: string }) => {
        const list = badgesByWorker.get(b.user_id) || [];
        list.push({ badge_key: b.badge_key });
        badgesByWorker.set(b.user_id, list);
      });

      // 사장님이 여러 지원자 중 한 명을 고르는 가장 중요한 순간인데 예전엔 닉네임·신뢰점수만
      // 보이고 ✅검증/🔵신규 Tier 배지가 전혀 안 떠서, 정작 이 정보가 가장 필요한 화면에 없었음
      const applicants = pendingMatches.map(m => ({
        matchId: m.id,
        workerId: m.worker_id,
        nickname: userMap.get(m.worker_id)?.nickname || "알바생",
        trustScore: userMap.get(m.worker_id)?.trust_score ?? 50,
        avatarUrl: userMap.get(m.worker_id)?.avatar_url || undefined,
        tier: tiers[m.worker_id] || "tier2",
        badges: getBadgesByRole(badgesByWorker.get(m.worker_id) || [], "worker"),
      }));
      const rejected = rejectedMatches.map(m => ({
        matchId: m.id,
        workerId: m.worker_id,
        nickname: userMap.get(m.worker_id)?.nickname || "알바생",
        avatarUrl: userMap.get(m.worker_id)?.avatar_url || undefined,
      }));
      setApplicantsSheet({ postingId: p.id, businessName: p.business_name, applicants, rejected });
    } catch {
      showToast("지원자 목록을 불러오지 못했어요.", "error");
    } finally {
      setLoadingApplicants(false);
    }
  };

  // "새 지원서 도착" 알림 → 예전엔 지원자 프로필 페이지로 보내서 정작 수락할 방법이 없는
  // 막다른 길이었음. 이젠 이 공고의 지원자 시트로 바로 딥링크해서 알림 한 번으로 수락까지 끝나게 함.
  // postings는 폴링마다 새 배열로 갱신되므로, ref로 "이미 처리한 postingId"를 기억해서 매번 재실행되지 않게 함.
  const autoOpenedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!autoOpenApplicantsPostingId || loading) return;
    if (autoOpenedRef.current === autoOpenApplicantsPostingId) return;
    autoOpenedRef.current = autoOpenApplicantsPostingId;
    const posting = postings.find(p => p.id === autoOpenApplicantsPostingId);
    if (posting) {
      openApplicants(posting);
    } else {
      showToast("이미 마감됐거나 존재하지 않는 공고예요.", "error");
    }
    onAutoOpenApplicantsConsumed?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoOpenApplicantsPostingId, loading, postings]);

  const acceptApplicant = async (matchId: string) => {
    setAcceptingMatchId(matchId);
    try {
      const res = await fetch("/api/lovecall", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ matchId, action: "accept" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "수락 실패");
      showToast("✅ 수락 완료! 채팅방이 열렸어요");
      setApplicantsSheet(null);
      await load();
    } catch (err) {
      const message = err instanceof Error ? err.message : "수락 중 오류";
      showToast(message, "error");
    } finally {
      setAcceptingMatchId(null);
    }
  };

  const rejectApplicant = async (matchId: string) => {
    setRejectingMatchId(matchId);
    try {
      const res = await fetch("/api/lovecall", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ matchId, action: "reject" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "거절 실패");
      showToast("지원을 거절했어요", "info");
      // 목록에서 지우지 않고 "지난 지원자"로 옮겨서, 나중에 다시 들어와도 누굴 거절했었는지 남아있게 함
      setApplicantsSheet(prev => {
        if (!prev) return prev;
        const moved = prev.applicants.find(a => a.matchId === matchId);
        return {
          ...prev,
          applicants: prev.applicants.filter(a => a.matchId !== matchId),
          rejected: moved ? [...prev.rejected, { matchId: moved.matchId, workerId: moved.workerId, nickname: moved.nickname, avatarUrl: moved.avatarUrl }] : prev.rejected,
        };
      });
      await load();
    } catch (err) {
      const message = err instanceof Error ? err.message : "거절 중 오류";
      showToast(message, "error");
    } finally {
      setRejectingMatchId(null);
    }
  };

  // posting.required_credentials(JSON 문자열)를 파싱 — 등록 폼에서 저장한 배열, 각 항목 is_mandatory_by_law로
  // 법적 필수(보건증 등)와 우대를 구분
  const parseRequiredCreds = (posting: SosPosting): { name: string; is_mandatory_by_law?: boolean }[] => {
    if (!posting.required_credentials) return [];
    try {
      const parsed = typeof posting.required_credentials === "string" ? JSON.parse(posting.required_credentials) : posting.required_credentials;
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  };

  const doApplyPosting = async (posting: SosPosting) => {
    setActionLoading(posting.id);
    try {
      // 무단 노쇼 이력이 있으면 정지 기간 동안 지원 제한 (사전 취소는 신뢰점수만 깎일 뿐 정지는 안 걸림)
      const { data: userRow } = await supabase.from("users").select("daeta_cancel_suspended_until").eq("id", userId).maybeSingle();
      if (userRow?.daeta_cancel_suspended_until && new Date(userRow.daeta_cancel_suspended_until) > new Date()) {
        showToast(`무단 노쇼 이력으로 ${new Date(userRow.daeta_cancel_suspended_until).toLocaleString("ko-KR")}까지 지원이 제한돼요.`, "error");
        setActionLoading(null);
        return;
      }
      const res = await fetch("/api/lovecall", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employerId: posting.user_id,
          workerId: userId,
          senderType: "worker",
          daetaPostingId: posting.id,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "지원 실패");
      showToast("🚀 지원 완료! 사장님의 수락을 기다려요");
      setAppliedMatchIds(prev => ({ ...prev, [posting.id]: data.data.id }));
    } catch (err) {
      const message = err instanceof Error ? err.message : "지원 중 오류";
      showToast(message, "error");
    } finally {
      setActionLoading(null);
    }
  };

  // 지원 전 필수 자격 확인 — 보건증처럼 법적 필수 자격이 내 이력(worker_profiles.credentials)에
  // 없으면 사장님이 나중에 거절할 가능성이 높으니 미리 알려주고 그래도 지원할지 물어봄(강제 차단은 아님)
  const applyPosting = (posting: SosPosting) => {
    const mandatoryMissing = parseRequiredCreds(posting)
      .filter(c => c.is_mandatory_by_law && !myCredentials.some(mc => mc.name === c.name));
    if (mandatoryMissing.length > 0) {
      setPendingConfirm({
        title: "필수 자격 확인 필요",
        message: `이 공고는 [${mandatoryMissing.map(c => c.name).join(", ")}]이(가) 필수예요. 내 이력에는 등록돼 있지 않아서 사장님이 나중에 거절할 수 있어요. 그래도 지원하시겠어요?`,
        onConfirm: () => {
          setPendingConfirm(null);
          doApplyPosting(posting);
        },
      });
      return;
    }
    doApplyPosting(posting);
  };

  // 남의 공고에 낸 내 지원을 취소 — 응답 대기 중에 마음이 바뀌었거나 다른 곳에 확정됐을 때
  const cancelApplication = (posting: SosPosting) => {
    const matchId = appliedMatchIds[posting.id];
    if (!matchId) return;
    setPendingConfirm({
      title: "지원 취소",
      message: "이 공고에 낸 지원을 취소할까요?",
      onConfirm: async () => {
        setPendingConfirm(null);
        setActionLoading(posting.id);
        try {
          const res = await fetch("/api/lovecall", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ matchId, action: "cancel" }),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || "취소 실패");
          showToast("지원을 취소했어요", "info");
          setAppliedMatchIds(prev => {
            const next = { ...prev };
            delete next[posting.id];
            return next;
          });
          await load();
        } catch (err) {
          const message = err instanceof Error ? err.message : "취소 중 오류";
          showToast(message, "error");
        } finally {
          setActionLoading(null);
        }
      },
    });
  };

  // 시간 겹침 경고 팝업에서 "취소하고 안내 보내기" — 정중한 사유를 자동으로 붙여서 취소
  const cancelConflictingApplication = async () => {
    if (!conflictWarning) return;
    const { matchId, confirmedPosting } = conflictWarning;
    setCancelingConflict(true);
    try {
      const dateLabel = formatDaetaDateRange(confirmedPosting.work_date, confirmedPosting.work_date_end);
      const reason = `다른 대타 근무(${confirmedPosting.business_name}, ${dateLabel} · ${confirmedPosting.work_hours})가 먼저 확정되어 부득이하게 취소하게 됐어요. 좋은 분 빨리 구하시길 바랄게요. 죄송합니다.`;
      const res = await fetch("/api/lovecall", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ matchId, action: "cancel", reason }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "취소 실패");
      showToast("정중하게 취소 안내를 보냈어요", "info");
      setConflictWarning(null);
      await load();
    } catch (err) {
      const message = err instanceof Error ? err.message : "취소 중 오류";
      showToast(message, "error");
    } finally {
      setCancelingConflict(false);
    }
  };

  // 사장님이 나한테 직접 보낸 1:1 SOS 요청에 응답 — 수락하면 채팅방이 열리고, 거절하면 그냥 종료됨
  const respondToSosRequest = async (posting: SosPosting, action: "accept" | "reject") => {
    const matchId = receivedRequestMatchIds[posting.id];
    if (!matchId) return;
    setActionLoading(posting.id);
    try {
      const res = await fetch("/api/lovecall", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ matchId, action }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || (action === "accept" ? "수락 실패" : "거절 실패"));
      showToast(action === "accept" ? "🎉 수락 완료! 채팅방이 열렸어요" : "요청을 거절했어요", action === "accept" ? "success" : "info");
      setReceivedRequestMatchIds(prev => {
        const next = { ...prev };
        delete next[posting.id];
        return next;
      });
      await load();
    } catch (err) {
      const message = err instanceof Error ? err.message : "처리 중 오류";
      showToast(message, "error");
    } finally {
      setActionLoading(null);
    }
  };

  const cancelPosting = (posting: SosPosting) => {
    setPendingConfirm({
      title: "대타 요청 취소",
      message: "이 대타 요청을 취소할까요? 지원자들에게도 취소 알림이 가요.",
      onConfirm: async () => {
        setPendingConfirm(null);
        try {
          const res = await fetch("/api/daeta/cancel-posting", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ postingId: posting.id, userId }),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || "취소 실패");
          showToast(
            data.notified > 0 ? `대타 요청이 취소됐어요 (지원자 ${data.notified}명에게 알림)` : "대타 요청이 취소됐어요",
            "info"
          );
          await load();
        } catch (err) {
          const message = err instanceof Error ? err.message : "취소 실패";
          showToast(message, "error");
        }
      },
    });
  };

  // 공고 정렬: 내 공고(고정) → 긴급(시작임박·확대공지, 임박한 순) → 다른 공고(거리순→최신순)
  // 남의 공고는 아직 구인 중인(pending) 것만 지원 대상으로 노출 — 이미 matched된 건 다른 사람이 이미
  // 잡은 자리라 지원하기를 눌러도 의미가 없음(내 공고는 진행상황 확인을 위해 matched도 계속 보여줘야 함)
  const myPostings = postings.filter(p => p.user_id === userId);
  // 신규(Tier2)에게 아직 안 열린 공고(stage<3)는 숨김 — 사장님이 나를 콕 찍어 보낸 1:1 요청은
  // 그 사람이 직접 고른 거라 Tier와 무관하게 항상 보여야 함(app/api/lovecall도 동일 예외)
  const othersPostings = postings.filter(p =>
    p.user_id !== userId && p.status === "pending" &&
    (myTier !== "tier2" || (p.escalation_stage || 1) >= 3 || !!receivedRequestMatchIds[p.id])
  );
  // Tier2 게이트 때문에 postings.length(전체)와 실제 이 사람한테 보이는 개수가 달라질 수 있어서
  // (다른 공고가 있어도 전부 신규에게 안 열렸으면 0개) 탭 배지·빈 상태 판정은 이 값을 써야 한다 —
  // postings.length를 그대로 쓰면 "공고(1)"이라고 뱃지엔 뜨는데 목록은 텅 비어 보이는 모순이 생김.
  const visiblePostingsCount = myPostings.length + othersPostings.length;
  // 내가 이미 지원했거나 사장님에게 직접 요청받은 공고는 각 섹션(긴급/다른 공고) 안에서 맨 앞으로 —
  // 특히 받은 요청은 내가 액션(수락/거절)해야 하는 쪽이라 지원한 것보다도 더 우선. 섹션 자체(긴급 vs
  // 일반)는 그대로 유지해서 "긴급 옆"에 붙는 느낌을 살림.
  const appliedFirst = (p: SosPosting) => (receivedRequestMatchIds[p.id] ? 0 : appliedMatchIds[p.id] ? 1 : 2);
  const urgentOthers = othersPostings
    .filter(p => isUrgentPosting(p, now))
    .sort((a, b) => appliedFirst(a) - appliedFirst(b) || hoursUntilShiftStart(a, now) - hoursUntilShiftStart(b, now));
  const generalOthers = othersPostings
    .filter(p => !isUrgentPosting(p, now))
    .sort((a, b) => {
      const af = appliedFirst(a) - appliedFirst(b);
      if (af !== 0) return af;
      const da = myBase && a.lat != null && a.lng != null ? distanceKm(myBase, { lat: a.lat, lng: a.lng }) : Infinity;
      const db = myBase && b.lat != null && b.lng != null ? distanceKm(myBase, { lat: b.lat, lng: b.lng }) : Infinity;
      if (da !== db) return da - db;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg, #0a0a0f)", paddingBottom: 100 }}>
      <AppHeader
        title="대타"
        showBellAndMenu
        rightActions={
          <button
            onClick={() => setShowNeighborhoodSheet(true)}
            style={{
              display: "flex", alignItems: "center", gap: 4, flexShrink: 0,
              background: "linear-gradient(135deg, #0ea5e9, #38bdf8)",
              border: "none", borderRadius: 20, padding: "6px 12px",
              color: "#fff", fontSize: 12, fontWeight: 800, cursor: "pointer",
              boxShadow: "0 2px 8px rgba(14,165,233,0.35)",
            }}>
            <i className="ti ti-map-pin" style={{ fontSize: 13 }} aria-hidden="true" />
            {neighborhoodLabel || "동네 설정"}
          </button>
        }
      />

      <div style={{ maxWidth: 480, margin: "0 auto", padding: "16px 16px 0" }}>

        {/* 대타 참여 정지 배너 — 지원/등록을 시도해서 막혀야만 알던 것을 상시 노출로 바꿈 */}
        {suspendedUntil && (
          <div style={{
            background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)",
            borderRadius: 14, padding: "12px 14px", marginBottom: 14,
            display: "flex", alignItems: "center", gap: 10,
          }}>
            <span style={{ fontSize: 20 }}>🚫</span>
            <div style={{ fontSize: 12, color: "#f87171", lineHeight: 1.5 }}>
              <strong>무단 노쇼 이력으로 대타 참여가 제한 중이에요.</strong><br />
              {new Date(suspendedUntil).toLocaleString("ko-KR", { month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" })}까지 새 대타 지원·등록이 안 돼요.
            </div>
          </div>
        )}

        {/* 시작 전 설정 안내 — 동네 미설정/알림 꺼짐 상태에서만 노출, 설정하면 자동으로 사라짐(닫기 버튼 없음) */}
        {!loading && (!neighborhoodLabel || !workerProfile?.available_now) && (
          <div style={{
            background: "linear-gradient(135deg, rgba(14,165,233,0.12), rgba(139,92,246,0.06))",
            border: "1px solid rgba(14,165,233,0.35)",
            borderRadius: 16,
            padding: "14px 16px",
            marginBottom: 16,
          }}>
            <p style={{ fontSize: 13, fontWeight: 800, color: "var(--text, #fff)", margin: "0 0 10px", display: "flex", alignItems: "center", gap: 6 }}>
              👋 대타 SOS, 시작 전에 이것부터 해보세요
            </p>
            <div style={{ display: "flex", gap: 8 }}>
              {!neighborhoodLabel && (
                <button onClick={() => setShowNeighborhoodSheet(true)}
                  style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "10px 8px", background: "rgba(14,165,233,0.18)", border: "1px solid rgba(14,165,233,0.45)", borderRadius: 12, color: "#38bdf8", fontSize: 12, fontWeight: 800, cursor: "pointer" }}>
                  <i className="ti ti-map-pin" style={{ fontSize: 13 }} aria-hidden="true" /> 동네 설정하기
                </button>
              )}
              {!workerProfile?.available_now && (
                <button onClick={toggleAvailable}
                  style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "10px 8px", background: "rgba(34,197,94,0.14)", border: "1px solid rgba(34,197,94,0.4)", borderRadius: 12, color: "#4ade80", fontSize: 12, fontWeight: 800, cursor: "pointer" }}>
                  <i className="ti ti-bell" style={{ fontSize: 13 }} aria-hidden="true" /> 대타 알림 켜기
                </button>
              )}
            </div>
          </div>
        )}

        {/* 첫 진입 가이드 — 1회성, 닫으면 다시 안 뜸 */}
        {!guideDismissed && (
          <div style={{
            background: "linear-gradient(135deg, rgba(249,115,22,0.1), rgba(139,92,246,0.06))",
            border: "1px solid rgba(249,115,22,0.3)",
            borderRadius: 16,
            padding: "14px 16px",
            marginBottom: 16,
            position: "relative",
          }}>
            <button onClick={dismissGuide} aria-label="닫기"
              style={{ position: "absolute", top: 8, right: 8, background: "none", border: "none", color: "var(--text-muted, rgba(255,255,255,0.6))", fontSize: 14, cursor: "pointer", padding: 6, lineHeight: 1 }}>✕</button>
            <p style={{ fontSize: 13, fontWeight: 800, color: "var(--text, #fff)", margin: "0 0 8px", paddingRight: 20 }}>👋 대타 SOS, 이렇게 써요</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <p style={{ fontSize: 12, color: "var(--text-muted, rgba(255,255,255,0.75))", margin: 0, lineHeight: 1.5 }}>🚨 갑자기 사람이 빠지면? 우측 하단 <b>+ 버튼</b>으로 SOS 등록 — 우리 팀 → 동네 검증 인력 순으로 자동 확산돼요</p>
              <p style={{ fontSize: 12, color: "var(--text-muted, rgba(255,255,255,0.75))", margin: 0, lineHeight: 1.5 }}>🟢 나도 대타 뛸 수 있으면 아래 스위치를 켜두세요 — 근처 사장님 요청에 내 카드가 노출돼요</p>
              <p style={{ fontSize: 12, color: "var(--text-muted, rgba(255,255,255,0.75))", margin: 0, lineHeight: 1.5 }}>👥 급하면 <b>인력</b> 탭에서 검증된 사람에게 바로 콕 찍어 요청할 수도 있어요</p>
            </div>
          </div>
        )}

        {/* 🟢 내 대타 가능 ON/OFF 스위치 바 */}
        <button
          onClick={toggleAvailable}
          style={{
            width: "100%",
            padding: "16px 18px",
            background: workerProfile?.available_now
              ? "var(--success-bg, rgba(34,197,94,0.12))"
              : "var(--surface, rgba(255,255,255,0.05))",
            border: workerProfile?.available_now
              ? "1.5px solid rgba(34,197,94,0.5)"
              : "1.5px solid var(--border, rgba(255,255,255,0.15))",
            borderRadius: 20,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 20,
            transition: "all 0.25s ease",
            boxShadow: workerProfile?.available_now
              ? "0 4px 20px rgba(34, 197, 94, 0.2)"
              : "0 2px 10px rgba(0, 0, 0, 0.1)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{
              width: 38,
              height: 38,
              borderRadius: "50%",
              background: workerProfile?.available_now
                ? "linear-gradient(135deg, #22c55e, #16a34a)"
                : "var(--primary-light, rgba(139,92,246,0.15))",
              border: workerProfile?.available_now ? "none" : "1px solid var(--primary-border, rgba(139,92,246,0.3))",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: workerProfile?.available_now ? "#fff" : "var(--primary, #8b5cf6)",
              fontSize: 18,
              boxShadow: workerProfile?.available_now ? "0 2px 8px rgba(34,197,94,0.4)" : "none",
              flexShrink: 0
            }}>
              <i className={`ti ${workerProfile?.available_now ? "ti-bolt" : "ti-power"}`} aria-hidden="true" />
            </div>
            <div style={{ textAlign: "left" }}>
              <div style={{ fontSize: 15, fontWeight: 900, color: workerProfile?.available_now ? "var(--success-text, #4ade80)" : "var(--text, #fff)" }}>
                {workerProfile?.available_now ? "🟢 대타 가능 대기 중" : "⚪ 대타 알림 꺼짐 (터치하여 켜기)"}
              </div>
              <div style={{ fontSize: 11, color: workerProfile?.available_now ? "var(--success-text, rgba(134,239,172,0.85))" : "var(--text-muted, rgba(255,255,255,0.6))", marginTop: 2 }}>
                {workerProfile?.available_now ? "동네 사장님들에게 내 대타 카드가 노출 중이에요" : "스위치를 켜면 동네 대타 요청 알림을 받아요"}
              </div>
            </div>
          </div>
          <div style={{
            width: 50, height: 28, borderRadius: 14, position: "relative", flexShrink: 0,
            background: workerProfile?.available_now
              ? "linear-gradient(135deg, #22c55e, #16a34a)"
              : "var(--surface2, rgba(255,255,255,0.12))",
            border: workerProfile?.available_now ? "none" : "1px solid var(--border, rgba(255,255,255,0.2))",
            transition: "all 0.25s ease",
            boxShadow: workerProfile?.available_now ? "0 2px 8px rgba(34,197,94,0.4)" : "inset 0 1px 3px rgba(0,0,0,0.2)",
          }}>
            <div style={{
              position: "absolute", top: 3, left: workerProfile?.available_now ? 25 : 3,
              width: 20, height: 20, borderRadius: "50%",
              background: "#ffffff",
              transition: "left 0.25s ease",
              boxShadow: "0 2px 5px rgba(0,0,0,0.3)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 10,
              color: workerProfile?.available_now ? "#16a34a" : "var(--text-muted, #71717a)"
            }}>
              <i className={`ti ${workerProfile?.available_now ? "ti-check" : "ti-x"}`} aria-hidden="true" />
            </div>
          </div>
        </button>


        {/* 공고 ⇄ 인력 탭 전환 — 지원(pull)할 공고와 직접 지목(push)할 인력은 액션이 달라 한 화면에 섞지 않음 */}
        <div style={{ display: "flex", gap: 6, marginBottom: 16, background: "var(--surface, rgba(255,255,255,0.04))", borderRadius: 16, padding: 4 }}>
          <button
            onClick={() => setActiveTab("post")}
            style={{
              flex: 1, padding: "10px 0", borderRadius: 12, border: "none", cursor: "pointer",
              background: activeTab === "post" ? "linear-gradient(135deg, #f97316, #ef4444)" : "transparent",
              color: activeTab === "post" ? "#fff" : "var(--text-muted, rgba(255,255,255,0.6))",
              fontSize: 13, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
            }}
          >
            <i className="ti ti-clipboard-list" aria-hidden="true" /> 공고{visiblePostingsCount > 0 ? ` (${visiblePostingsCount})` : ""}
          </button>
          <button
            onClick={() => setActiveTab("people")}
            style={{
              flex: 1, padding: "10px 0", borderRadius: 12, border: "none", cursor: "pointer",
              background: activeTab === "people" ? "linear-gradient(135deg, #8b5cf6, #7c3aed)" : "transparent",
              color: activeTab === "people" ? "#fff" : "var(--text-muted, rgba(255,255,255,0.6))",
              fontSize: 13, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
            }}
          >
            <i className="ti ti-users" aria-hidden="true" /> 인력{availableWorkers.filter(w => w.availableNow).length > 0 ? ` (${availableWorkers.filter(w => w.availableNow).length})` : ""}
          </button>
        </div>

        {loading ? (
          <div style={{ textAlign: "center", padding: "30px 0", color: "var(--text-muted, rgba(255,255,255,0.4))", fontSize: 13 }}>불러오는 중...</div>
        ) : activeTab === "post" ? (
          visiblePostingsCount === 0 ? (
            <div style={{ background: "var(--surface, rgba(255,255,255,0.04))", border: "1px solid var(--border, rgba(255,255,255,0.08))", borderRadius: 16, padding: "24px 16px", textAlign: "center", color: "var(--text-muted, rgba(255,255,255,0.4))", fontSize: 13, marginBottom: 24 }}>
              진행 중인 대타 공고가 없어요. 아래 버튼으로 등록해보세요.
            </div>
          ) : (
            <div style={{ maxHeight: "70vh", overflowY: "auto", borderRadius: 18, border: "1px solid var(--border, rgba(255,255,255,0.1))", marginBottom: 24 }}>
              {myPostings.length > 0 && (
                <div style={{ position: "sticky", top: 0, zIndex: 2, background: "var(--bg, #0a0a0f)", padding: "14px 14px 10px", borderBottom: "1px solid var(--border, rgba(255,255,255,0.1))" }}>
                  <h3 style={{ fontSize: 12, fontWeight: 800, color: "var(--text-muted, rgba(255,255,255,0.5))", margin: "0 0 8px", textTransform: "uppercase", letterSpacing: 0.3 }}>내 공고</h3>
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {myPostings.map(p => (
                      <PostingCard
                        key={p.id}
                        p={p}
                        isMine
                        urgent={false}
                        meta={matchMeta[p.id] || { total: 0, notified: 0, acceptedMatchId: null, acceptedWorkerName: null, checkedInAt: null, checkedOutAt: null }}
                        isApplied={false}
                        isLoading={false}
                        onEdit={() => { setEditingPostingId(p.id); setShowRegisterModal(true); }}
                        onCancel={() => cancelPosting(p)}
                        onGoToChat={(matchId) => router.push(`/chat/${matchId}`)}
                        onGoToSettle={(matchId) => router.push(`/mypage/daeta-history?tab=employer&matchId=${matchId}`)}
                        onShowDetail={openDetail}
                        onShowApplicants={openApplicants}
                        expansionInfo={nextExpansionInfo(p)}
                      />
                    ))}
                  </div>
                </div>
              )}

              <div style={{ padding: 14 }}>
                {urgentOthers.length > 0 && (
                  <div style={{ marginBottom: 16 }}>
                    <h3 style={{ fontSize: 12, fontWeight: 800, color: "#f87171", margin: "0 0 8px", display: "flex", alignItems: "center", gap: 5 }}>
                      <i className="ti ti-flame" aria-hidden="true" /> 긴급
                    </h3>
                    <div style={{ display: "flex", gap: 10, overflowX: "auto", paddingBottom: 8, scrollSnapType: "x mandatory", WebkitOverflowScrolling: "touch" }}>
                      {urgentOthers.map(p => (
                        <div key={p.id} style={{ scrollSnapAlign: "start", flexShrink: 0 }}>
                          <PostingCard
                            p={p}
                            isMine={false}
                            urgent
                            width={280}
                            meta={matchMeta[p.id] || { total: 0, notified: 0, acceptedMatchId: null, acceptedWorkerName: null, checkedInAt: null, checkedOutAt: null }}
                            isApplied={Boolean(appliedMatchIds[p.id])}
                            isReceivedRequest={Boolean(receivedRequestMatchIds[p.id])}
                            isLoading={actionLoading === p.id}
                            myBase={myBase}
                            onApply={() => applyPosting(p)}
                            onCancelApply={() => cancelApplication(p)}
                            onAcceptRequest={() => respondToSosRequest(p, "accept")}
                            onRejectRequest={() => respondToSosRequest(p, "reject")}
                            onGoToChat={(matchId) => router.push(`/chat/${matchId}`)}
                        onGoToSettle={(matchId) => router.push(`/mypage/daeta-history?tab=employer&matchId=${matchId}`)}
                            onViewStore={(id) => router.push(`/store/${id}`)}
                            onShowDetail={openDetail}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {generalOthers.length > 0 && (
                  <div>
                    <h3 style={{ fontSize: 12, fontWeight: 800, color: "var(--text-muted, rgba(255,255,255,0.5))", margin: "0 0 8px" }}>다른 공고</h3>
                    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                      {generalOthers.map(p => (
                        <PostingCard
                          key={p.id}
                          p={p}
                          isMine={false}
                          urgent={false}
                          meta={matchMeta[p.id] || { total: 0, notified: 0, acceptedMatchId: null, acceptedWorkerName: null, checkedInAt: null, checkedOutAt: null }}
                          isApplied={Boolean(appliedMatchIds[p.id])}
                          isReceivedRequest={Boolean(receivedRequestMatchIds[p.id])}
                          isLoading={actionLoading === p.id}
                          myBase={myBase}
                          onApply={() => applyPosting(p)}
                          onCancelApply={() => cancelApplication(p)}
                          onAcceptRequest={() => respondToSosRequest(p, "accept")}
                          onRejectRequest={() => respondToSosRequest(p, "reject")}
                          onGoToChat={(matchId) => router.push(`/chat/${matchId}`)}
                        onGoToSettle={(matchId) => router.push(`/mypage/daeta-history?tab=employer&matchId=${matchId}`)}
                          onViewStore={(id) => router.push(`/store/${id}`)}
                          onShowDetail={openDetail}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {urgentOthers.length === 0 && generalOthers.length === 0 && myPostings.length > 0 && (
                  <div style={{ textAlign: "center", padding: "16px 0", color: "var(--text-muted, rgba(255,255,255,0.4))", fontSize: 12 }}>
                    주변에 다른 대타 공고가 없어요.
                  </div>
                )}
              </div>
            </div>
          )
        ) : (
          <div style={{ marginBottom: 24 }}>
            {availableWorkers.length === 0 ? (
              <div style={{ background: "var(--surface, rgba(255,255,255,0.04))", border: "1px solid var(--border, rgba(255,255,255,0.08))", borderRadius: 16, padding: "20px 16px", textAlign: "center", color: "var(--text-muted, rgba(255,255,255,0.4))", fontSize: 13 }}>
                현재 등록된 대타 알바생이 없습니다.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {(showAllWorkers ? availableWorkers : availableWorkers.slice(0, 8)).map(w => (
                  <div
                    key={w.id}
                    onClick={() => router.push(`/worker/${w.userId}`)}
                    style={{
                      background: w.isMe && w.availableNow
                        ? "rgba(34,197,94,0.12)"
                        : "var(--surface, rgba(255,255,255,0.04))",
                      border: w.isMe && w.availableNow
                        ? "2px solid #22c55e"
                        : `1px solid ${w.availableNow ? "rgba(34,197,94,0.4)" : "var(--border, rgba(255,255,255,0.08))"}`,
                      borderRadius: 16,
                      padding: 12,
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      cursor: "pointer",
                      transition: "transform 0.15s ease",
                    }}
                  >
                    <div style={{ width: 44, height: 44, borderRadius: "50%", background: "var(--primary, #7c3aed)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 18, overflow: "hidden", flexShrink: 0, border: w.availableNow ? "2px solid #22c55e" : "1px solid var(--border)" }}>
                      {w.avatarUrl ? <img src={w.avatarUrl} style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <span>{w.nickname[0]?.toUpperCase()}</span>}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                        <span style={{ fontSize: 14, fontWeight: 800, color: "var(--text, #fff)" }}>
                          {w.nickname} {w.isMe && "(나)"}
                        </span>
                        {!w.isMe && w.tier && (
                          <span style={{ fontSize: 9, background: `${TIER_LABEL[w.tier as "tier1" | "tier2"].color}22`, color: TIER_LABEL[w.tier as "tier1" | "tier2"].color, padding: "2px 6px", borderRadius: 8, fontWeight: 800, flexShrink: 0 }}>
                            {TIER_LABEL[w.tier as "tier1" | "tier2"].emoji}{TIER_LABEL[w.tier as "tier1" | "tier2"].name}
                          </span>
                        )}
                        {w.isMe && w.availableNow ? (
                          <span style={{ fontSize: 10, background: "#22c55e", color: "#fff", padding: "2px 7px", borderRadius: 10, fontWeight: 900 }}>🟢 나 (대타 대기 중)</span>
                        ) : w.availableNow ? (
                          <span style={{ fontSize: 10, background: "rgba(34,197,94,0.2)", color: "#86efac", padding: "2px 6px", borderRadius: 10, fontWeight: 800 }}>🟢 대타 가능</span>
                        ) : (
                          <span style={{ fontSize: 10, background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.4)", padding: "2px 6px", borderRadius: 10, fontWeight: 500 }}>오프라인</span>
                        )}
                      </div>
                      <p style={{ fontSize: 11, color: "var(--text-muted, rgba(255,255,255,0.6))", margin: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {w.category} · 경력 {w.experienceMonths > 0 ? `${w.experienceMonths}개월` : "신입"} · {w.region || "지역미설정"}
                      </p>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleSosClick(w);
                      }}
                      style={{
                        background: w.isMe
                          ? "var(--surface2, #27272a)"
                          : w.availableNow
                            ? "linear-gradient(135deg, #f97316, #ef4444)"
                            : "var(--surface2, #27272a)",
                        border: w.isMe
                          ? "1px solid var(--border, rgba(255,255,255,0.25))"
                          : w.availableNow
                            ? "none"
                            : "1px solid var(--border, rgba(255,255,255,0.25))",
                        borderRadius: 10,
                        padding: "8px 14px",
                        color: w.availableNow && !w.isMe ? "#ffffff" : "var(--text, #ffffff)",
                        fontSize: 12,
                        fontWeight: 800,
                        cursor: "pointer",
                        flexShrink: 0,
                        boxShadow: !w.isMe && w.availableNow ? "0 2px 10px rgba(249,115,22,0.4)" : "none",
                      }}
                    >
                      {w.isMe ? "내 프로필" : w.availableNow ? "⚡ SOS 요청" : "프로필"}
                    </button>
                  </div>
                ))}

                {!showAllWorkers && availableWorkers.length > 8 && (
                  <button
                    onClick={() => setShowAllWorkers(true)}
                    style={{ padding: "10px", background: "none", border: "1px dashed var(--border, rgba(255,255,255,0.2))", borderRadius: 14, color: "var(--text-muted, rgba(255,255,255,0.6))", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                    더보기 ({availableWorkers.length - 8}명 더)
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* 보조 경로 — "직접 고르기"(카드덱)는 위 목록과 같은 후보를 다시 스와이프로 보여줘 중복이라 강등(코드는 유지, 진입 버튼만 제거) */}
        <div style={{ display: "flex", gap: 10 }}>
          <button
            onClick={() => router.push(`/mypage/daeta-history?tab=${roleView || (userType === "employer" ? "employer" : "worker")}`)}
            style={{ flex: 1, padding: "14px", background: "var(--surface, rgba(255,255,255,0.04))", border: "1px solid var(--border, rgba(255,255,255,0.1))", borderRadius: 16, color: "var(--text, #fff)", fontSize: 13, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
            <i className="ti ti-list" aria-hidden="true" /> 대타 이력 {historyCount > 0 ? `(${historyCount}건)` : ""}
          </button>
        </div>
      </div>

      {showRegisterModal && (
        <DaetaRegisterModal
          userId={userId}
          postingId={editingPostingId}
          onClose={() => { setShowRegisterModal(false); setEditingPostingId(null); }}
          onSuccess={async (postingId) => {
            const wasEditing = !!editingPostingId;
            setShowRegisterModal(false);
            setEditingPostingId(null);
            if (!wasEditing && postingId) {
              await fireSos(postingId);
            } else {
              await load();
            }
          }}
        />
      )}

      {applicantsSheet && (
        <div onClick={() => setApplicantsSheet(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 10000, display: "flex", alignItems: "flex-end" }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: "var(--surface)", borderRadius: "24px 24px 0 0", padding: "10px 20px 20px", width: "100%", maxWidth: 480, margin: "0 auto", borderTop: "1px solid var(--border)", color: "var(--text)", maxHeight: "80vh", overflowY: "auto" }}>
            <div style={{ width: 36, height: 4, borderRadius: 4, background: "var(--border)", margin: "0 auto 14px" }} />
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
              <div>
                <h3 style={{ fontSize: 17, fontWeight: 900, margin: 0 }}>지원자</h3>
                <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "3px 0 0" }}>
                  {applicantsSheet.businessName} · {applicantsSheet.applicants.length}명 대기중
                </p>
              </div>
              <button onClick={() => setApplicantsSheet(null)} style={{ background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: "50%", width: 28, height: 28, color: "var(--text-muted)", fontSize: 16, cursor: "pointer", lineHeight: 1, flexShrink: 0 }}>✕</button>
            </div>

            {loadingApplicants ? (
              <div style={{ textAlign: "center", padding: "30px 0", color: "var(--text-muted)", fontSize: 13 }}>불러오는 중...</div>
            ) : applicantsSheet.applicants.length === 0 ? (
              <div style={{ textAlign: "center", padding: "30px 0", color: "var(--text-muted)", fontSize: 13 }}>아직 지원자가 없어요.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {applicantsSheet.applicants.map(a => {
                  const grade = getGrade(a.trustScore);
                  const isBusy = acceptingMatchId === a.matchId || rejectingMatchId === a.matchId;
                  return (
                    <div key={a.matchId} style={{ background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 16, padding: "14px", boxShadow: "var(--shadow-elevate, none)" }}>
                      <div onClick={() => router.push(`/worker/${a.workerId}`)} style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", marginBottom: 12 }}>
                        <div style={{
                          width: 44, height: 44, borderRadius: "50%", flexShrink: 0, overflow: "hidden",
                          background: "linear-gradient(135deg, #f97316, #8b5cf6)",
                          display: "flex", alignItems: "center", justifyContent: "center",
                          fontSize: 17, fontWeight: 900, color: "#fff",
                        }}>
                          {a.avatarUrl ? (
                            <img src={a.avatarUrl} alt={a.nickname} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                          ) : (
                            a.nickname.charAt(0)
                          )}
                        </div>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: 14, fontWeight: 800, color: "var(--text)", display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                            <i className="ti ti-home" style={{ fontSize: 12, color: "var(--text-muted)" }} aria-hidden="true" />
                            {a.nickname}
                            <TierBadge tier={a.tier} size="sm" />
                          </div>
                          <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 1 }}>{grade.emoji} {grade.name} · 신뢰도 {a.trustScore}점</div>
                          {a.badges.length > 0 && (
                            <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 4 }}>
                              {a.badges.map(b => (
                                <span key={b.key} title={b.name} style={{ fontSize: 10, background: "rgba(139,92,246,0.14)", color: "#a78bfa", padding: "2px 7px", borderRadius: 10, fontWeight: 700 }}>
                                  {b.emoji} {b.name}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: 8 }}>
                        <button
                          onClick={() => rejectApplicant(a.matchId)}
                          disabled={isBusy}
                          style={{ flex: 1, background: "var(--danger-bg)", border: "1px solid var(--danger-border)", borderRadius: 12, padding: "10px", color: "var(--danger)", fontSize: 13, fontWeight: 800, cursor: "pointer", opacity: isBusy ? 0.5 : 1 }}>
                          {rejectingMatchId === a.matchId ? "..." : "거절"}
                        </button>
                        <button
                          onClick={() => acceptApplicant(a.matchId)}
                          disabled={isBusy}
                          style={{ flex: 2, background: "linear-gradient(135deg, #22c55e, #16a34a)", border: "none", borderRadius: 12, padding: "10px", color: "#fff", fontSize: 13, fontWeight: 800, cursor: "pointer", opacity: isBusy ? 0.6 : 1 }}>
                          {acceptingMatchId === a.matchId ? "..." : "✅ 수락"}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {!loadingApplicants && applicantsSheet.rejected.length > 0 && (
              <div style={{ marginTop: 16, paddingTop: 14, borderTop: "1px solid var(--border)" }}>
                <button onClick={() => setShowRejectedApplicants(v => !v)}
                  style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", background: "none", border: "none", padding: 0, cursor: "pointer", color: "var(--text-muted)", fontSize: 12, fontWeight: 700 }}>
                  <span>지난 지원자(거절함) {applicantsSheet.rejected.length}명</span>
                  <i className={`ti ${showRejectedApplicants ? "ti-chevron-up" : "ti-chevron-down"}`} aria-hidden="true" />
                </button>
                {showRejectedApplicants && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 10 }}>
                    {applicantsSheet.rejected.map(r => (
                      <div key={r.matchId} onClick={() => router.push(`/worker/${r.workerId}`)}
                        style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", opacity: 0.7 }}>
                        <div style={{
                          width: 32, height: 32, borderRadius: "50%", flexShrink: 0, overflow: "hidden",
                          background: "var(--surface2)", border: "1px solid var(--border)",
                          display: "flex", alignItems: "center", justifyContent: "center",
                          fontSize: 13, fontWeight: 800, color: "var(--text-muted)",
                        }}>
                          {r.avatarUrl ? (
                            <img src={r.avatarUrl} alt={r.nickname} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                          ) : (
                            r.nickname.charAt(0)
                          )}
                        </div>
                        <span style={{ fontSize: 13, color: "var(--text-muted)" }}>{r.nickname}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {detailPosting && (
        <div onClick={() => setDetailPosting(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 10000, display: "flex", alignItems: "flex-end" }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: "var(--surface, #18181b)", borderRadius: "24px 24px 0 0", width: "100%", maxWidth: 480, margin: "0 auto", borderTop: "1px solid rgba(255,255,255,0.08)", color: "var(--text, #fff)", maxHeight: "85vh", overflowY: "auto" }}>
            {/* 업무 사진 — 예전엔 140x140 썸네일을 옆으로 나열만 했는데, 한 장씩 크게 넘겨보는 형태로
                바꿈(components/daeta/DaetaSosHome.tsx PostingCard 배너 사진과 같은 톤으로 통일) */}
            {detailPosting.image_urls && detailPosting.image_urls.length > 0 ? (
              <div style={{ position: "relative", height: 260, background: "#000", overflow: "hidden", borderRadius: "24px 24px 0 0" }}>
                <img src={detailPosting.image_urls[Math.min(detailMediaIndex, detailPosting.image_urls.length - 1)]} alt="업무 사진"
                  style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to bottom, rgba(0,0,0,0.35) 0%, transparent 30%)", pointerEvents: "none" }} />
                <h3 style={{ position: "absolute", left: 16, bottom: 12, margin: 0, fontSize: 17, fontWeight: 900, color: "#fff", textShadow: "0 1px 4px rgba(0,0,0,0.5)" }}>{detailPosting.business_name}</h3>
                <button onClick={() => setDetailPosting(null)} style={{ position: "absolute", top: 12, right: 12, background: "rgba(0,0,0,0.4)", backdropFilter: "blur(8px)", border: "none", borderRadius: "50%", width: 32, height: 32, color: "#fff", fontSize: 16, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 20 }}>✕</button>
                {detailPosting.image_urls.length > 1 && (
                  <>
                    <button onClick={(e) => { e.stopPropagation(); setDetailMediaIndex(prev => (prev - 1 + detailPosting.image_urls!.length) % detailPosting.image_urls!.length); }}
                      style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", background: "rgba(0,0,0,0.5)", border: "none", borderRadius: "50%", width: 32, height: 32, color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, zIndex: 20 }}>
                      ‹
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); setDetailMediaIndex(prev => (prev + 1) % detailPosting.image_urls!.length); }}
                      style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", background: "rgba(0,0,0,0.5)", border: "none", borderRadius: "50%", width: 32, height: 32, color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, zIndex: 20 }}>
                      ›
                    </button>
                    <div style={{ position: "absolute", bottom: 12, right: 12, background: "rgba(0,0,0,0.6)", borderRadius: 10, padding: "3px 6px", fontSize: 10, color: "#fff", fontWeight: 600, zIndex: 20 }}>
                      {detailMediaIndex + 1} / {detailPosting.image_urls.length}
                    </div>
                  </>
                )}
              </div>
            ) : (
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", padding: "20px 20px 0" }}>
                <h3 style={{ fontSize: 17, fontWeight: 900, margin: 0 }}>{detailPosting.business_name}</h3>
                <button onClick={() => setDetailPosting(null)} style={{ background: "none", border: "none", color: "var(--text-muted, rgba(255,255,255,0.5))", fontSize: 20, cursor: "pointer", padding: 4, lineHeight: 1 }}>✕</button>
              </div>
            )}

            <div style={{ padding: 20 }}>

            {detailPosting.lat != null && detailPosting.lng != null && (
              <iframe
                src={`/map.html?lat=${detailPosting.lat}&lng=${detailPosting.lng}&addr=${encodeURIComponent(detailPosting.region || detailPosting.business_name)}`}
                style={{ width: "100%", height: 180, borderRadius: 14, border: "none", marginBottom: 12 }} />
            )}

            {detailPosting.region && (
              <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "var(--text-muted, rgba(255,255,255,0.7))", marginBottom: 10 }}>
                <i className="ti ti-map-pin" style={{ fontSize: 14 }} aria-hidden="true" /> {detailPosting.region}
              </div>
            )}

            <div style={{ display: "flex", flexDirection: "column", gap: 6, background: "rgba(255,255,255,0.04)", borderRadius: 14, padding: "12px 14px" }}>
              <div style={{ fontSize: 13 }}>📅 {formatDaetaDateRange(detailPosting.work_date, detailPosting.work_date_end)}</div>
              <div style={{ fontSize: 13 }}>⏰ {detailPosting.work_hours}</div>
              <div style={{ fontSize: 13 }}>💼 {detailPosting.duty}</div>
              <div style={{ fontSize: 13, fontWeight: 800, color: "#fb923c" }}>💰 시급 {detailPosting.wage.toLocaleString()}원</div>
            </div>

            {detailPosting.employer_profile_id && (
              <button
                onClick={() => { const id = detailPosting.employer_profile_id!; setDetailPosting(null); router.push(`/store/${id}`); }}
                style={{ width: "100%", marginTop: 12, padding: "12px", background: "var(--surface2, rgba(255,255,255,0.08))", border: "1px solid var(--border, rgba(255,255,255,0.15))", borderRadius: 14, color: "var(--text, #fff)", fontSize: 13, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                <i className="ti ti-home" aria-hidden="true" /> 매장 홈 가기
              </button>
            )}
            </div>
          </div>
        </div>
      )}

      {pendingConfirm && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 10000, display: "flex", alignItems: "flex-end" }}>
          <div style={{ background: "var(--surface)", borderRadius: "24px 24px 0 0", padding: 24, width: "100%", maxWidth: 480, margin: "0 auto", borderTop: "1px solid rgba(255,255,255,0.08)", color: "var(--text, #fff)" }}>
            <h3 style={{ fontSize: 16, fontWeight: 800, margin: "0 0 8px" }}>{pendingConfirm.title}</h3>
            <p style={{ fontSize: 13, color: "var(--text-muted)", margin: "0 0 20px", lineHeight: 1.6 }}>{pendingConfirm.message}</p>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={pendingConfirm.onConfirm}
                style={{ flex: 2, padding: "14px", background: "var(--danger)", border: "none", borderRadius: 14, color: "#fff", fontWeight: 700, cursor: "pointer" }}>
                확인
              </button>
              <button onClick={() => setPendingConfirm(null)}
                style={{ flex: 1, padding: "14px", background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 14, color: "var(--text-muted)", fontWeight: 700, cursor: "pointer" }}>
                취소
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 확정된 근무와 시간 겹치는 다른 지원/요청 발견 시 취소 유도 팝업 — 강제 아님, 무시 가능 */}
      {conflictWarning && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 10000, display: "flex", alignItems: "flex-end" }}>
          <div style={{ background: "var(--surface)", borderRadius: "24px 24px 0 0", padding: 24, width: "100%", maxWidth: 480, margin: "0 auto", borderTop: "1px solid rgba(239,68,68,0.3)", color: "var(--text, #fff)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
              <span style={{ fontSize: 24 }}>⚠️</span>
              <h3 style={{ fontSize: 16, fontWeight: 900, margin: 0, color: "#f87171" }}>근무 시간이 겹쳐요</h3>
            </div>
            <p style={{ fontSize: 13, color: "var(--text, rgba(255,255,255,0.9))", margin: "0 0 10px", lineHeight: 1.7, background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.3)", borderRadius: 12, padding: "10px 14px" }}>
              ✅ <strong>{conflictWarning.confirmedPosting.business_name}</strong> 근무가 확정됐어요<br />
              <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{formatDaetaDateRange(conflictWarning.confirmedPosting.work_date, conflictWarning.confirmedPosting.work_date_end)} · {conflictWarning.confirmedPosting.work_hours}</span>
            </p>
            <p style={{ fontSize: 13, color: "var(--text-muted)", margin: "0 0 20px", lineHeight: 1.7 }}>
              그런데 <strong style={{ color: "var(--text)" }}>{conflictWarning.conflictPosting.business_name}</strong>에 낸 지원/요청(<span style={{ color: "var(--text-muted)" }}>{formatDaetaDateRange(conflictWarning.conflictPosting.work_date, conflictWarning.conflictPosting.work_date_end)} · {conflictWarning.conflictPosting.work_hours}</span>)이 시간이 겹쳐서 두 곳 다 갈 수 없어요. 이건 취소 안 하셔도 되고, 원하시면 정중한 사유와 함께 대신 취소해드릴게요.
            </p>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setConflictWarning(null)} disabled={cancelingConflict}
                style={{ flex: 1, padding: "14px", background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 14, color: "var(--text-muted)", fontWeight: 700, cursor: "pointer" }}>
                나중에 할게요
              </button>
              <button onClick={cancelConflictingApplication} disabled={cancelingConflict}
                style={{ flex: 2, padding: "14px", background: "var(--danger)", border: "none", borderRadius: 14, color: "#fff", fontWeight: 800, cursor: cancelingConflict ? "default" : "pointer", opacity: cancelingConflict ? 0.7 : 1 }}>
                {cancelingConflict ? "취소하는 중..." : "취소하고 안내 보내기"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ⚡ Karrot-style Floating Action Button (FAB) */}
      <button
        onClick={() => {
          if (!hasEmployerProfile) {
            setPendingConfirm({
              title: "사장님 프로필 등록 필요",
              message: "긴급 대타 SOS 공고를 등록하려면 먼저 사장님 프로필(매장) 등록이 필요합니다. 이동하시겠습니까?",
              onConfirm: () => {
                setPendingConfirm(null);
                router.push("/employer/register?return=daeta");
              }
            });
            return;
          }
          setShowRegisterModal(true);
        }}
        style={{
          position: "fixed",
          bottom: 84,
          right: 16,
          zIndex: 90,
          background: "linear-gradient(135deg, #f97316 0%, #ef4444 100%)",
          border: "none",
          borderRadius: 30,
          padding: "12px 20px 12px 16px",
          color: "#fff",
          fontSize: 14,
          fontWeight: 900,
          cursor: "pointer",
          boxShadow: "0 8px 28px rgba(249, 115, 22, 0.45), 0 2px 10px rgba(0, 0, 0, 0.3)",
          display: "flex",
          alignItems: "center",
          gap: 6,
          backdropFilter: "blur(8px)",
          transition: "all 0.2s ease",
        }}
      >
        <i className="ti ti-plus" style={{ fontSize: 18, fontWeight: 900 }} aria-hidden="true" />
        <span>대타 SOS 등록</span>
      </button>

      {/* ⚡ 1:1 지정 대타 요청 스마트 모달 */}
      {targetWorkerForSos && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 1000,
          background: "rgba(0,0,0,0.65)", backdropFilter: "blur(6px)",
          display: "flex", alignItems: "center", justifyContent: "center", padding: 16
        }}>
          <div style={{
            width: "100%", maxWidth: 400, background: "var(--surface, #18181b)",
            border: "1.5px solid var(--primary-border, rgba(139,92,246,0.4))",
            borderRadius: 24, padding: 24, boxShadow: "0 10px 30px rgba(0,0,0,0.5)"
          }}>
            <div style={{ textAlign: "center", marginBottom: 16 }}>
              <div style={{ fontSize: 32, marginBottom: 6 }}>⚡</div>
              <h3 style={{ fontSize: 17, fontWeight: 900, color: "var(--text, #fff)", margin: 0 }}>
                {targetWorkerForSos.nickname}님에게 1:1 지정 대타 요청
              </h3>
              <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>
                선택하신 대타 공고로 초대 러브콜을 발송합니다.
              </p>
            </div>

            {(() => {
              const myPostings = postings.filter(p => p.user_id === userId && p.status === "pending");
              return myPostings.length > 0 ? (
                <div style={{ marginBottom: 20 }}>
                  <label style={{ fontSize: 13, fontWeight: 900, color: "var(--text, #fff)", display: "block", marginBottom: 8 }}>
                    어느 대타 공고로 요청할까요? (터치하여 선택)
                  </label>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 220, overflowY: "auto" }}>
                    {myPostings.map(p => {
                      const isSelected = selectedPostingId === p.id;
                      return (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => setSelectedPostingId(p.id)}
                          style={{
                            width: "100%",
                            padding: "12px 14px",
                            borderRadius: 14,
                            textAlign: "left",
                            background: isSelected
                              ? "linear-gradient(135deg, rgba(249,115,22,0.18) 0%, rgba(239,68,68,0.12) 100%)"
                              : "var(--surface2, rgba(255,255,255,0.06))",
                            border: isSelected
                              ? "2px solid #f97316"
                              : "1px solid var(--border, rgba(255,255,255,0.15))",
                            color: "var(--text, #fff)",
                            cursor: "pointer",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            transition: "all 0.2s ease",
                            boxShadow: isSelected ? "0 4px 14px rgba(249,115,22,0.25)" : "none"
                          }}
                        >
                          <div>
                            <div style={{ fontSize: 14, fontWeight: 900, color: isSelected ? "#fb923c" : "var(--text, #fff)" }}>
                              🔥 {p.business_name} {isSelected && "(선택됨)"}
                            </div>
                            <div style={{ fontSize: 11, color: "var(--text-muted, rgba(255,255,255,0.6))", marginTop: 2 }}>
                              {formatDaetaDateRange(p.work_date, p.work_date_end)} · {p.work_hours} · 시급 {p.wage.toLocaleString()}원
                            </div>
                          </div>
                          <div style={{
                            width: 22, height: 22, borderRadius: "50%",
                            background: isSelected ? "#f97316" : "transparent",
                            border: isSelected ? "none" : "2px solid var(--border, rgba(255,255,255,0.3))",
                            display: "flex", alignItems: "center", justifyContent: "center",
                            color: "#fff", fontSize: 12, fontWeight: 900
                          }}>
                            {isSelected && "✓"}
                          </div>
                        </button>
                      );
                    })}

                    <button
                      type="button"
                      onClick={() => {
                        setTargetWorkerForSos(null);
                        setShowRegisterModal(true);
                      }}
                      style={{
                        width: "100%",
                        padding: "10px 14px",
                        borderRadius: 14,
                        background: "var(--primary-light, rgba(139,92,246,0.12))",
                        border: "1.5px dashed var(--primary-border, rgba(139,92,246,0.4))",
                        color: "var(--primary, #8b5cf6)",
                        fontSize: 12,
                        fontWeight: 800,
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 6
                      }}
                    >
                      <i className="ti ti-plus" aria-hidden="true" /> 다른 매장 / 새 긴급 대타 공고 등록하기
                    </button>
                  </div>
                </div>
              ) : (
                <div style={{ background: "rgba(251,146,60,0.1)", border: "1px solid rgba(251,146,60,0.3)", borderRadius: 14, padding: 16, marginBottom: 20, textAlign: "center" }}>
                  <div style={{ fontSize: 13, color: "#fb923c", fontWeight: 800, marginBottom: 8 }}>
                    등록된 진행 중 대타 공고가 없습니다.
                  </div>
                  <button
                    onClick={() => { setTargetWorkerForSos(null); setShowRegisterModal(true); }}
                    style={{ background: "linear-gradient(135deg, #f97316, #ef4444)", border: "none", borderRadius: 12, padding: "10px 16px", color: "#fff", fontSize: 13, fontWeight: 800, cursor: "pointer", boxShadow: "0 3px 10px rgba(249,115,22,0.3)" }}
                  >
                    + 새 대타 SOS 공고 등록하기
                  </button>
                </div>
              );
            })()}

            <div style={{ display: "flex", gap: 10 }}>
              <button
                onClick={() => setTargetWorkerForSos(null)}
                style={{ flex: 1, padding: 12, borderRadius: 12, background: "var(--surface2)", border: "1px solid var(--border)", color: "var(--text-muted)", fontSize: 13, fontWeight: 700, cursor: "pointer" }}
              >
                취소
              </button>
              {postings.some(p => p.user_id === userId) && (
                <button
                  onClick={sendDirectSosRequest}
                  disabled={sendingSos}
                  style={{ flex: 2, padding: 12, borderRadius: 12, background: "linear-gradient(135deg, #f97316, #ef4444)", border: "none", color: "#fff", fontSize: 13, fontWeight: 900, cursor: "pointer", boxShadow: "0 3px 12px rgba(249,115,22,0.4)" }}
                >
                  {sendingSos ? "발송 중..." : `⚡ ${targetWorkerForSos.nickname}님에게 즉시 발송`}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {showNeighborhoodSheet && (
        <SetNeighborhoodSheet
          userId={userId}
          onClose={() => setShowNeighborhoodSheet(false)}
          onSaved={(loc) => { setMyBase(loc); setNeighborhoodLabel(loc.label); }}
        />
      )}

      {ToastUI}
    </div>
  );
}
