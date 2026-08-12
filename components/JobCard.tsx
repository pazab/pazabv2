"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { getFitChips } from "@/lib/utils";
import { getGrade } from "@/lib/trustScore";

const GRADE_EMOJI: Record<string, string> = {
  bronze: "🥉", silver: "🥈", gold: "🥇", platinum: "💎",
};

const WORKER_TYPE_EMOJI: Record<string, string> = {
  "폭풍처리형": "⚡", "꼼꼼탐정형": "🔍", "공감마스터형": "💕",
  "돌격대장형": "🚀", "묵묵수행형": "🎯", "분위기메이커형": "🌟",
  "철벽약속형": "🤝", "에너자이저형": "💪", "스펀지흡수형": "🧠",
  "든든한실전형": "🛡️", "아이디어뱅크형": "💡", "만능재주꾼형": "🎨",
};

export interface CardProps {
  item: Record<string, any>;
  mode: "worker" | "employer";
  isLoggedIn: boolean;
  myRegion: string;
  isOwner?: boolean;
  onLike?: (id: string, liked: boolean) => void;
  onLovecall?: (id: string) => void;
  onClick?: () => void;
  likedIds?: Set<string>;
  onHide?: (id: string) => void;
  onReport?: (id: string) => void;
  onDislike?: (id: string) => void;
  onEdit?: (id: string) => void;
  onDelete?: (id: string) => void;
  matchStatus?: string;
  matchIsSent?: boolean;
  matchId?: string;
}

export function getRegionMatchLevel(myRegion: string, targetRegion: string): "same-dong" | "same-gu" | "same-sido" | "other" {
  if (!myRegion || !targetRegion) return "other";
  const a = myRegion.split(/\s+/);
  const b = targetRegion.split(/\s+/);
  if (a[0] === b[0]) {
    if (a[1] && b[1] && a[1] === b[1]) {
      if (a[2] && b[2] && a[2] === b[2]) return "same-dong";
      return "same-gu";
    }
    return "same-sido";
  }
  return "other";
}

export function formatDateBadge(startDate: string, endDate?: string): string {
  if (!startDate) return "";
  const start = new Date(startDate);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffDays = Math.ceil((start.getTime() - today.getTime()) / 86400000);
  if (diffDays === 0) return "오늘";
  if (diffDays === 1) return "내일";
  const startStr = `${start.getMonth() + 1}/${start.getDate()}`;
  if (!endDate) return startStr;
  const end = new Date(endDate);
  if (startDate === endDate) return startStr;
  return `${startStr}~${end.getDate()}`;
}

export function DeadlineBadge({ expiresAt }: { expiresAt: string }) {
  const days = Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 86400000);
  if (days > 3 || days < 0) return null;
  return (
    <span style={{ fontSize: 9, fontWeight: 800, background: "rgba(251,146,60,0.85)", color: "#fff", padding: "3px 7px", borderRadius: 8, backdropFilter: "blur(4px)" }}>
      🔥 마감 {days}일
    </span>
  );
}

export function JobCard({ item, mode, isLoggedIn, myRegion, isOwner, onLike, onLovecall, onClick, likedIds, onHide, onReport, onDislike, onEdit, onDelete, matchStatus, matchIsSent, matchId }: CardProps) {
  const router = useRouter();
  const id = String(item.id || item.user_id || "");
  const isLiked = likedIds ? likedIds.has(id) : false;
  const fitChips = getFitChips(item);
  const grade = getGrade(Number(item.trust_score ?? 50));
  const [isHovered, setIsHovered] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const bgGradient = mode === "worker"
    ? "linear-gradient(160deg, #1a1035 0%, #2d1b6e 50%, #1e1040 100%)"
    : "linear-gradient(160deg, #0a2020 0%, #0f4a3a 50%, #0a2820 100%)";

  const regionLevel = myRegion
    ? getRegionMatchLevel(myRegion, String(item.region || item.desired_region || ""))
    : null;

  const imageUrl = (item.image_url || (Array.isArray(item.image_urls) && item.image_urls[0])) as string | null;
  const hasVideo = !!item.video_url;
  const imageCount = Array.isArray(item.image_urls) ? item.image_urls.length : 0;

  const displayName = mode === "worker"
    ? String(item.business_name || "")
    : String(item.worker_type || item.worker_name || "알바생");

  const jobType = String(item.job_type || "regular");
  const workStartDate = String(item.work_start_date || "");
  const workEndDate = String(item.work_end_date || "");

  const FitBadges = () => fitChips.length > 0 ? (
    <div style={{ display: "flex", flexDirection: "column", gap: 3, alignItems: "flex-end" }}>
      {fitChips.map(c => (
        <div key={c.text} style={{ background: "rgba(0,0,0,0.45)", backdropFilter: "blur(12px)", border: "1px solid rgba(74,222,128,0.35)", borderRadius: 10, padding: "3px 8px", fontSize: 9, fontWeight: 700, color: "#86efac", whiteSpace: "nowrap" }}>
          {c.icon} {c.text}
        </div>
      ))}
    </div>
  ) : null;

  const RegionBadge = () => regionLevel && regionLevel !== "other" ? (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 4, background: "rgba(0,0,0,0.4)", backdropFilter: "blur(8px)", border: `1px solid ${regionLevel === "same-dong" ? "rgba(74,222,128,0.4)" : "rgba(134,239,172,0.3)"}`, borderRadius: 20, padding: "4px 10px" }}>
      <span style={{ fontSize: 10, fontWeight: 700, color: regionLevel === "same-dong" ? "#4ade80" : "#86efac" }}>
        {regionLevel === "same-dong" ? "◎ 바로 동네" : regionLevel === "same-gu" ? "◎ 같은 동네" : "◎ 같은 지역"}
      </span>
    </div>
  ) : null;

  return (
    <div onClick={onClick} 
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{ position: "relative", borderRadius: 20, overflow: "hidden", height: 300, cursor: "pointer", flexShrink: 0, width: "100%", boxShadow: "0 2px 20px rgba(0,0,0,0.35)" }}>
      {hasVideo && item.video_url && isHovered ? (
        <video src={String(item.video_url)} muted autoPlay loop playsInline style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
      ) : imageUrl ? (
        <div style={{ position: "absolute", inset: 0, background: `url(${imageUrl}) center/cover no-repeat` }} />
      ) : (
        <div style={{ position: "absolute", inset: 0, background: bgGradient }} />
      )}
      {(imageUrl || hasVideo) && <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to bottom, rgba(0,0,0,0.15) 0%, rgba(0,0,0,0.05) 40%, rgba(0,0,0,0.75) 100%)", pointerEvents: "none" }} />}
      {!imageUrl && !hasVideo && <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse at 30% 20%, rgba(255,255,255,0.04) 0%, transparent 60%)", pointerEvents: "none" }} />}

      {/* ⋮ 메뉴 버튼 (공통 상단 우측) */}
      <div onClick={e => e.stopPropagation()} style={{ position: "absolute", top: 10, right: 10, zIndex: 20 }}>
        <button onClick={() => setMenuOpen(v => !v)}
          style={{ width: 30, height: 30, borderRadius: "50%", background: "rgba(0,0,0,0.45)", backdropFilter: "blur(8px)", border: "1px solid rgba(255,255,255,0.15)", color: "#fff", fontSize: 16, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", lineHeight: 1 }}>
          ⋮
        </button>
        {menuOpen && (
          <div style={{ position: "absolute", top: 36, right: 0, background: "#1c1c1e", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 14, minWidth: 160, overflow: "hidden", boxShadow: "0 8px 32px rgba(0,0,0,0.6)", zIndex: 30 }}>
            {isOwner ? (
              <>
                <button onClick={() => { onEdit?.(id); setMenuOpen(false); }}
                  style={{ width: "100%", padding: "13px 16px", background: "none", border: "none", borderBottom: "1px solid rgba(255,255,255,0.07)", color: "#fff", fontSize: 13, textAlign: "left", cursor: "pointer", display: "flex", alignItems: "center", gap: 10 }}>
                  <span>✏️</span> 수정하기
                </button>
                <button onClick={() => { onDelete?.(id); setMenuOpen(false); }}
                  style={{ width: "100%", padding: "13px 16px", background: "none", border: "none", color: "#f87171", fontSize: 13, textAlign: "left", cursor: "pointer", display: "flex", alignItems: "center", gap: 10 }}>
                  <span>🗑️</span> 삭제하기
                </button>
              </>
            ) : (
              <>
                <button onClick={() => { onHide?.(id); setMenuOpen(false); }}
                  style={{ width: "100%", padding: "13px 16px", background: "none", border: "none", borderBottom: "1px solid rgba(255,255,255,0.07)", color: "#fff", fontSize: 13, textAlign: "left", cursor: "pointer", display: "flex", alignItems: "center", gap: 10 }}>
                  <span>🙈</span> 이 글 숨기기
                </button>
                <button onClick={() => { onDislike?.(id); setMenuOpen(false); }}
                  style={{ width: "100%", padding: "13px 16px", background: "none", border: "none", borderBottom: "1px solid rgba(255,255,255,0.07)", color: "#fff", fontSize: 13, textAlign: "left", cursor: "pointer", display: "flex", alignItems: "center", gap: 10 }}>
                  <span>👎</span> 관심 없음
                </button>
                <button onClick={() => { onReport?.(id); setMenuOpen(false); }}
                  style={{ width: "100%", padding: "13px 16px", background: "none", border: "none", color: "#f87171", fontSize: 13, textAlign: "left", cursor: "pointer", display: "flex", alignItems: "center", gap: 10 }}>
                  <span>🚨</span> 신고하기
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {mode === "worker" && (
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, padding: "14px 14px 0", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <RegionBadge />
            <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
              {matchStatus === "pending" && (
                <span style={{ fontSize: 9, fontWeight: 800, background: "rgba(139,92,246,0.9)", color: "#fff", padding: "3px 7px", borderRadius: 8, backdropFilter: "blur(4px)", border: "1px solid rgba(139,92,246,0.3)" }}>
                  {matchIsSent ? "📤 수락 대기" : "📥 지원 받음"}
                </span>
              )}
              {(matchStatus === "accepted" || matchStatus === "interviewing") && (
                <span style={{ fontSize: 9, fontWeight: 800, background: "rgba(34,197,94,0.9)", color: "#fff", padding: "3px 7px", borderRadius: 8, backdropFilter: "blur(4px)", border: "1px solid rgba(34,197,94,0.3)" }}>
                  💬 대화 중
                </span>
              )}
              {matchStatus === "hired" && (
                <span style={{ fontSize: 9, fontWeight: 800, background: "rgba(251,191,36,0.9)", color: "#000", padding: "3px 7px", borderRadius: 8, backdropFilter: "blur(4px)" }}>
                  ✅ 채용 완료
                </span>
              )}
              {jobType === "urgent" && (
                <span style={{ fontSize: 9, fontWeight: 800, background: "rgba(239,68,68,0.9)", color: "#fff", padding: "3px 7px", borderRadius: 8, backdropFilter: "blur(4px)" }}>
                  🚨 {workStartDate ? formatDateBadge(workStartDate) : "긴급"}
                </span>
              )}
              {jobType === "short" && workStartDate && (
                <span style={{ fontSize: 9, fontWeight: 800, background: "rgba(251,146,60,0.9)", color: "#fff", padding: "3px 7px", borderRadius: 8, backdropFilter: "blur(4px)" }}>
                  📅 {formatDateBadge(workStartDate, workEndDate)}
                </span>
              )}
              {jobType === "short" && !!item.is_urgent && (
                <span style={{ fontSize: 9, fontWeight: 800, background: "rgba(239,68,68,0.85)", color: "#fff", padding: "3px 7px", borderRadius: 8, backdropFilter: "blur(4px)" }}>⚡ 긴급</span>
              )}
              {jobType === "regular" && !!item.expires_at && (
                <DeadlineBadge expiresAt={String(item.expires_at)} />
              )}
              {hasVideo && (
                <span style={{ fontSize: 9, fontWeight: 800, background: "rgba(139,92,246,0.9)", color: "#fff", padding: "3px 7px", borderRadius: 8, backdropFilter: "blur(4px)" }}>
                  🎥 영상
                </span>
              )}
              {imageCount > 1 && (
                <span style={{ fontSize: 9, fontWeight: 800, background: "rgba(0,0,0,0.55)", color: "#fff", padding: "3px 7px", borderRadius: 8, backdropFilter: "blur(4px)" }}>
                  📸 +{imageCount}
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {mode === "employer" && (
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, padding: "14px 14px 0", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <RegionBadge />
            <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
              {matchStatus === "pending" && (
                <span style={{ fontSize: 9, fontWeight: 800, background: "rgba(236,72,153,0.9)", color: "#fff", padding: "3px 7px", borderRadius: 8, backdropFilter: "blur(4px)", border: "1px solid rgba(236,72,153,0.3)" }}>
                  {matchIsSent ? "📤 제안 완료" : "📥 제안 받음"}
                </span>
              )}
              {(matchStatus === "accepted" || matchStatus === "interviewing") && (
                <span style={{ fontSize: 9, fontWeight: 800, background: "rgba(34,197,94,0.9)", color: "#fff", padding: "3px 7px", borderRadius: 8, backdropFilter: "blur(4px)", border: "1px solid rgba(34,197,94,0.3)" }}>
                  💬 대화 중
                </span>
              )}
              {matchStatus === "hired" && (
                <span style={{ fontSize: 9, fontWeight: 800, background: "rgba(251,191,36,0.9)", color: "#000", padding: "3px 7px", borderRadius: 8, backdropFilter: "blur(4px)" }}>
                  ✅ 채용 완료
                </span>
              )}
              {!!item.available_now && (
                <span style={{ fontSize: 9, fontWeight: 800, background: "rgba(34,197,94,0.85)", color: "#fff", padding: "3px 7px", borderRadius: 8, backdropFilter: "blur(4px)" }}>⚡ 즉시출근</span>
              )}
              {item.experience === "있음" && (
                <span style={{ fontSize: 9, fontWeight: 700, background: "rgba(251,191,36,0.85)", color: "#000", padding: "3px 7px", borderRadius: 8 }}>경력 {Number(item.experience_months)}개월</span>
              )}
              {hasVideo && (
                <span style={{ fontSize: 9, fontWeight: 800, background: "rgba(139,92,246,0.9)", color: "#fff", padding: "3px 7px", borderRadius: 8, backdropFilter: "blur(4px)" }}>
                  🎥 영상
                </span>
              )}
              {imageCount > 1 && (
                <span style={{ fontSize: 9, fontWeight: 800, background: "rgba(0,0,0,0.55)", color: "#fff", padding: "3px 7px", borderRadius: 8, backdropFilter: "blur(4px)" }}>
                  📸 +{imageCount}
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: "28px 14px 14px", background: imageUrl ? "linear-gradient(to top, rgba(0,0,0,0.88) 0%, rgba(0,0,0,0.5) 60%, transparent 100%)" : "linear-gradient(to top, rgba(0,0,0,0.7) 0%, transparent 100%)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 10 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
              <span style={{ fontSize: 12 }}>
                {mode === "worker" ? GRADE_EMOJI[String(item.grade || "bronze")] : (WORKER_TYPE_EMOJI[String(item.worker_type || "")] || "⚡")}
              </span>
              <span style={{ fontSize: 9, color: "rgba(255,255,255,0.6)", background: "rgba(255,255,255,0.08)", padding: "2px 7px", borderRadius: 6, fontWeight: 600 }}>
                {mode === "worker" ? String(item.business_type || "") : grade.name}
              </span>
              {mode === "worker" && !!item.tagline && (
                <span style={{ fontSize: 9, color: "rgba(255,255,255,0.5)", fontStyle: "italic" }}>{String(item.tagline).slice(0, 18)}</span>
              )}
            </div>
            <h3 style={{ fontSize: 18, fontWeight: 900, margin: "0 0 7px", color: "#fff", letterSpacing: "-0.3px", lineHeight: 1.2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {displayName.length > 20 ? displayName.slice(0, 20) + "…" : displayName}
            </h3>
            <div style={{ display: "flex", gap: 6, fontSize: 11, color: "rgba(255,255,255,0.8)", margin: 0, flexWrap: "wrap", alignItems: "center" }}>
              {mode === "worker" ? (
                <>
                  <span style={{ color: "#fca5a5", fontWeight: 700 }}>₩ {Number(item.wage || 0).toLocaleString()}</span>
                  <span style={{ opacity: 0.7 }}>·</span>
                  <span>{jobType === "short" || jobType === "urgent"
                    ? (workStartDate ? formatDateBadge(workStartDate, workEndDate) : String(item.work_days || ""))
                    : String(item.work_days || "")}</span>
                  {item.work_hours && <><span style={{ opacity: 0.7 }}>·</span><span>{String(item.work_hours || "").split(" ")[0]}</span></>}
                  <span style={{ opacity: 0.7 }}>·</span>
                  <span>{String(item.region || "")}</span>
                </>
              ) : (
                <>
                  <span>{String(item.desired_region || item.region || "지역 협의")}</span>
                  {Number(item.desired_wage) > 0 && <><span style={{ opacity: 0.7 }}>·</span><span style={{ color: "#f9a8d4", fontWeight: 700 }}>₩ {Number(item.desired_wage).toLocaleString()}↑</span></>}
                  {item.work_days && <><span style={{ opacity: 0.7 }}>·</span><span>{String(item.work_days || "")}</span></>}
                </>
              )}
            </div>
          </div>
          <div onClick={e => e.stopPropagation()} style={{ flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, color: "rgba(255,255,255,0.35)", fontWeight: 600 }}>
              <span>👁</span>
              <span>{Number(item.view_count || 0)}</span>
            </div>
            <FitBadges />
            {onLike && (
              <button onClick={() => onLike(id, isLiked)} style={{ display: "flex", alignItems: "center", gap: 6, background: isLiked ? "rgba(239,68,68,0.3)" : "rgba(0,0,0,0.4)", backdropFilter: "blur(12px)", border: `1px solid ${isLiked ? "rgba(239,68,68,0.6)" : "rgba(255,255,255,0.2)"}`, borderRadius: 14, padding: "8px 12px", color: isLiked ? "#fca5a5" : "rgba(255,255,255,0.8)", fontSize: 14, fontWeight: 700, cursor: "pointer", transition: "all 0.15s" }}>
                {isLiked ? "❤" : "♡"}
                <span style={{ fontSize: 11 }}>{Number(item.like_count || 0)}</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
