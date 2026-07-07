"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import AppHeader from "@/components/AppHeader";
import { BADGE_DEFS, GRADE_DEFS, getGrade, getBadgesByRole } from "@/lib/trustScore";

export default function EmployerProfilePage() {
  const router = useRouter();
  const params = useParams();
  const employerId = params.id as string;

  const [employer, setEmployer] = useState<any>(null);
  const [profiles, setProfiles] = useState<any[]>([]);
  const [badges, setBadges] = useState<any[]>([]);
  const [reviews, setReviews] = useState<any[]>([]);
  const [selectedBadge, setSelectedBadge] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [hireCount, setHireCount] = useState(0);

  useEffect(() => { init(); }, [employerId]);

  const init = async () => {
    // 사장님 기본 정보
    const { data: userData } = await supabase.from("users")
      .select("id, nickname, name, avatar_url, trust_score, user_type, created_at")
      .eq("id", employerId).single();
    if (!userData) { setLoading(false); return; }
    setEmployer(userData);

    // 매장 공고 목록
    const { data: profileData } = await supabase.from("employer_profiles")
      .select("id, business_name, business_type, region, wage, work_days, is_active, job_status, rating, review_count")
      .eq("user_id", employerId)
      .eq("is_deleted", false)
      .order("is_active", { ascending: false })  // 활성 매장 먼저
      .order("created_at", { ascending: false }); // 최신순

    // 같은 이름 중복 제거 (활성 우선)
    const seen = new Set<string>();
    const uniqueProfiles = (profileData || []).filter((p: { business_name: string | null }) => {
      const key = p.business_name ?? "";
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    setProfiles(uniqueProfiles);

    // 뱃지
    const { data: badgeData } = await supabase.from("user_badges")
      .select("badge_key, earned_at").eq("user_id", employerId);
    setBadges(getBadgesByRole(badgeData || [], "employer"));

    // 채용 횟수
    const { count } = await supabase.from("matches")
      .select("*", { count: "exact", head: true })
      .eq("employer_id", employerId)
      .eq("progress_status", "hired");
    setHireCount(count || 0);

    // 리뷰
    const { data: reviewData } = await supabase.from("reviews")
      .select("*")
      .eq("reviewee_id", employerId)
      .eq("reviewer_type", "worker")
      .order("created_at", { ascending: false })
      .limit(20);
    setReviews(reviewData || []);

    setLoading(false);
  };

  if (loading) return (
    <main style={{ minHeight: "100vh", background: "var(--bg)", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <p style={{ color: "var(--text-muted)" }}>불러오는 중...</p>
    </main>
  );

  if (!employer) return (
    <main style={{ minHeight: "100vh", background: "var(--bg)", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <p style={{ color: "var(--text-muted)" }}>사장님을 찾을 수 없어요</p>
    </main>
  );

  const grade = getGrade(employer.trust_score || 0);
  const avgRating = profiles.length > 0
    ? (profiles.reduce((s, p) => s + (p.rating || 0), 0) / profiles.filter(p => p.rating > 0).length || 0)
    : 0;
  const totalReviews = profiles.reduce((s, p) => s + (p.review_count || 0), 0);

  return (
    <main style={{ minHeight: "100vh", background: "linear-gradient(to bottom, #1d0f30 0%, #09090b 60%)", color: "var(--text)", paddingBottom: 80, maxWidth: 480, margin: "0 auto" }}>
      <AppHeader title="사장님 프로필" showBack />

      <div style={{ padding: "16px 16px" }}>

        {/* 프로필 카드 */}
        <div style={{ background: "linear-gradient(135deg, rgba(236,72,153,0.12), rgba(139,92,246,0.05))", backdropFilter: "blur(12px)", border: "1px solid rgba(236,72,153,0.2)", borderRadius: 24, padding: 20, marginBottom: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 16 }}>
            <div style={{ width: 56, height: 56, borderRadius: "50%", background: "linear-gradient(135deg, #ec4899, #be185d)", overflow: "hidden", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, border: "2px solid rgba(255,255,255,0.1)" }}>
              {employer.avatar_url
                ? <img src={employer.avatar_url} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                : "🏪"}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                <span style={{ fontSize: 18, fontWeight: 900 }}>{employer.nickname || employer.name || "사장님"}</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: 14 }}>{grade.emoji}</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: "#f9a8d4" }}>{grade.name}</span>
                <span style={{ fontSize: 11, color: "var(--text-muted)", background: "rgba(236,72,153,0.1)", padding: "2px 8px", borderRadius: 20, border: "1px solid rgba(236,72,153,0.2)" }}>
                  파잡 등급
                </span>
              </div>
            </div>
          </div>

          {/* 요약 통계 */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
            {[
              { label: "채용 완료", value: `${hireCount}회`, color: "#86efac" },
              { label: "평균 평점", value: avgRating > 0 ? `${avgRating.toFixed(1)}점` : "-", color: "#fbbf24" },
              { label: "리뷰", value: `${totalReviews}개`, color: "#c4b5fd" },
            ].map(s => (
              <div key={s.label} style={{ background: "rgba(0,0,0,0.35)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: 12, padding: "10px 8px", textAlign: "center" }}>
                <p style={{ fontSize: 16, fontWeight: 700, color: s.color, margin: "0 0 2px" }}>{s.value}</p>
                <p style={{ fontSize: 10, color: "var(--text-muted)", margin: 0 }}>{s.label}</p>
              </div>
            ))}
          </div>
        </div>

        {/* 뱃지 */}
        {badges.length > 0 && (
          <div style={{ background: "rgba(255,255,255,0.03)", backdropFilter: "blur(12px)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 20, padding: 16, marginBottom: 14 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, margin: "0 0 12px" }}>🏅 획득 뱃지</h3>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: selectedBadge ? 12 : 0 }}>
              {badges.map(b => (
                <button key={b.key}
                  onClick={() => setSelectedBadge(selectedBadge === b.key ? null : b.key)}
                  style={{ background: selectedBadge === b.key ? "rgba(236,72,153,0.15)" : "rgba(139,92,246,0.1)", border: `1px solid ${selectedBadge === b.key ? "rgba(236,72,153,0.4)" : "rgba(139,92,246,0.25)"}`, borderRadius: 20, padding: "5px 12px", fontSize: 12, color: "#c4b5fd", cursor: "pointer", fontWeight: 600 }}>
                  {b.emoji} {b.name}
                </button>
              ))}
            </div>
            {selectedBadge && BADGE_DEFS[selectedBadge] && (
              <div style={{ background: "rgba(236,72,153,0.08)", border: "1px solid rgba(236,72,153,0.2)", borderRadius: 12, padding: "10px 12px" }}>
                <p style={{ fontSize: 13, fontWeight: 700, color: "#f9a8d4", margin: "0 0 4px" }}>
                  {BADGE_DEFS[selectedBadge].emoji} {BADGE_DEFS[selectedBadge].name}
                </p>
                <p style={{ fontSize: 12, color: "var(--text-muted)", margin: 0 }}>{BADGE_DEFS[selectedBadge].desc}</p>
              </div>
            )}
          </div>
        )}

        {/* 운영 중인 매장 */}
        {profiles.length > 0 && (
          <div style={{ background: "rgba(255,255,255,0.03)", backdropFilter: "blur(12px)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 20, padding: 16, marginBottom: 14 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, margin: "0 0 12px" }}>🏪 운영 중인 매장</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {profiles.map(p => (
                <div key={p.id}
                  onClick={() => router.push(`/job/${p.id}`)}
                  style={{ background: "rgba(0,0,0,0.2)", borderRadius: 14, padding: "12px 14px", cursor: "pointer", border: "1px solid rgba(255,255,255,0.05)", transition: "all 0.2s" }}
                  onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.06)"}
                  onMouseLeave={e => e.currentTarget.style.background = "rgba(0,0,0,0.2)"}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 14, fontWeight: 700 }}>{p.business_name}</span>
                      <span style={{ fontSize: 10, background: p.is_active ? "rgba(34,197,94,0.15)" : "rgba(107,114,128,0.15)", color: p.is_active ? "#86efac" : "#6b7280", padding: "1px 6px", borderRadius: 10 }}>
                        {p.is_active ? "모집중" : "비공개"}
                      </span>
                    </div>
                    {p.rating > 0 && (
                      <span style={{ fontSize: 12, color: "#fbbf24", fontWeight: 700 }}>⭐ {p.rating}</span>
                    )}
                  </div>
                  <p style={{ fontSize: 12, color: "var(--text-muted)", margin: 0 }}>
                    {p.business_type} · {(p.region || "").split(" ").slice(0, 2).join(" ")} · {(p.wage || 0).toLocaleString()}원
                  </p>
                  {p.review_count > 0 && (
                    <p style={{ fontSize: 11, color: "var(--text-muted)", margin: "4px 0 0" }}>리뷰 {p.review_count}개</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 리뷰 */}
        <div style={{ background: "rgba(255,255,255,0.03)", backdropFilter: "blur(12px)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 20, padding: 16, marginBottom: 14 }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, margin: "0 0 12px" }}>
            💬 알바생 리뷰 {reviews.length > 0 && <span style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 400 }}>({reviews.length}개)</span>}
          </h3>
          {reviews.length === 0 ? (
            <p style={{ fontSize: 13, color: "var(--text-muted)", textAlign: "center", padding: "16px 0" }}>아직 리뷰가 없어요</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {reviews.map((r, i) => (
                <div key={r.id || i} style={{ background: "rgba(0,0,0,0.2)", borderRadius: 14, padding: "12px 14px", border: "1px solid rgba(255,255,255,0.04)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                    <div style={{ display: "flex", gap: 4 }}>
                      {Array.from({ length: 5 }).map((_, si) => (
                        <span key={si} style={{ fontSize: 13, color: si < (r.total_score || r.work_score || 0) ? "#fbbf24" : "rgba(255,255,255,0.15)" }}>★</span>
                      ))}
                    </div>
                    <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
                      {new Date(r.created_at).toLocaleDateString("ko-KR")}
                    </span>
                  </div>
                  {r.comment && (
                    <p style={{ fontSize: 13, color: "var(--text)", margin: "0 0 6px", lineHeight: 1.6 }}>{r.comment}</p>
                  )}
                  <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                    {r.rehire_want && (
                      <span style={{ fontSize: 10, background: "rgba(34,197,94,0.1)", color: "#86efac", padding: "2px 7px", borderRadius: 10 }}>재지원 의향 있음</span>
                    )}
                    {(r.work_score >= 4) && (
                      <span style={{ fontSize: 10, background: "rgba(139,92,246,0.1)", color: "#c4b5fd", padding: "2px 7px", borderRadius: 10 }}>업무 {r.work_score}점</span>
                    )}
                    {(r.attitude_score >= 4) && (
                      <span style={{ fontSize: 10, background: "rgba(236,72,153,0.1)", color: "#f9a8d4", padding: "2px 7px", borderRadius: 10 }}>태도 {r.attitude_score}점</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>
    </main>
  );
}