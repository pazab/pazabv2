"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import AppHeader from "@/components/AppHeader";
import { BADGE_DEFS, getGrade, getBadgesByRole } from "@/lib/trustScore";

export default function ProfilePage() {
  const router = useRouter();
  const params = useParams();
  const profileId = params.userId as string;

  const [user, setUser] = useState<any>(null);
  const [stores, setStores] = useState<any[]>([]);
  const [workerProfile, setWorkerProfile] = useState<any>(null);
  const [badges, setBadges] = useState<any[]>([]);
  const [personalPosts, setPersonalPosts] = useState<any[]>([]);
  const [selectedBadge, setSelectedBadge] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { init(); }, [profileId]);

  const init = async () => {
    const { data: userData } = await supabase
      .from("users")
      .select("id, nickname, avatar_url, trust_score, user_type, created_at")
      .eq("id", profileId)
      .single();
    if (!userData) { setLoading(false); return; }
    setUser(userData);

    const isEmployer = userData.user_type === "employer" || userData.user_type === "both";
    const isWorker = userData.user_type === "worker" || userData.user_type === "both";

    const [storesRes, workerRes, badgesRes, postsRes] = await Promise.all([
      isEmployer
        ? supabase.from("employer_profiles").select("id, business_name, business_type, region, image_url").eq("user_id", profileId).eq("is_deleted", false)
        : Promise.resolve({ data: [] }),
      isWorker
        ? supabase.from("worker_profiles").select("worker_type, desired_region, desired_wage, work_days, bio").eq("user_id", profileId).maybeSingle()
        : Promise.resolve({ data: null }),
      supabase.from("user_badges").select("badge_key, earned_at").eq("user_id", profileId),
      supabase.from("feed_posts").select("id, content, media_urls, created_at").eq("user_id", profileId).is("employer_profile_id", null).order("created_at", { ascending: false }).limit(6),
    ]);

    setStores((storesRes as any).data || []);
    setWorkerProfile((workerRes as any).data || null);
    setBadges(getBadgesByRole((badgesRes.data || []), userData.user_type === "employer" ? "employer" : "worker"));
    setPersonalPosts((postsRes as any).data || []);
    setLoading(false);
  };

  if (loading) return (
    <main style={{ minHeight: "100vh", background: "var(--bg)", color: "var(--text)", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <p style={{ color: "var(--text-muted)" }}>불러오는 중...</p>
    </main>
  );

  if (!user) return (
    <main style={{ minHeight: "100vh", background: "var(--bg)", color: "var(--text)", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <p style={{ color: "var(--text-muted)" }}>프로필을 찾을 수 없어요</p>
    </main>
  );

  const grade = getGrade(user.trust_score || 0);
  const isEmployer = user.user_type === "employer" || user.user_type === "both";
  const isWorker = user.user_type === "worker" || user.user_type === "both";

  return (
    <main style={{ minHeight: "100vh", background: "var(--bg)", color: "var(--text)", paddingBottom: 100, width: "100%", maxWidth: 480, margin: "0 auto" }}>
      <AppHeader title="프로필" showBack />

      <div style={{ padding: "16px" }}>

        {/* 프로필 헤더 */}
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 24, padding: 20, marginBottom: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 16 }}>
            <div style={{ width: 60, height: 60, borderRadius: "50%", overflow: "hidden", flexShrink: 0, background: "linear-gradient(135deg,#7c3aed,#ec4899)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26, border: "2px solid rgba(255,255,255,0.1)" }}>
              {user.avatar_url
                ? <img src={user.avatar_url} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                : (isEmployer ? "🏪" : "👤")}
            </div>
            <div style={{ flex: 1 }}>
              <p style={{ fontSize: 20, fontWeight: 900, margin: "0 0 4px", letterSpacing: "-0.3px" }}>{user.nickname || "닉네임 없음"}</p>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: 14 }}>{grade.emoji}</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: "#c4b5fd" }}>{grade.name}</span>
                {isEmployer && isWorker && (
                  <span style={{ fontSize: 10, background: "rgba(139,92,246,0.15)", color: "#c4b5fd", border: "1px solid rgba(139,92,246,0.3)", borderRadius: 20, padding: "2px 8px", fontWeight: 700 }}>사장+알바</span>
                )}
                {isEmployer && !isWorker && (
                  <span style={{ fontSize: 10, background: "rgba(236,72,153,0.12)", color: "#f9a8d4", border: "1px solid rgba(236,72,153,0.25)", borderRadius: 20, padding: "2px 8px", fontWeight: 700 }}>사장님</span>
                )}
                {!isEmployer && isWorker && (
                  <span style={{ fontSize: 10, background: "rgba(34,197,94,0.1)", color: "#86efac", border: "1px solid rgba(34,197,94,0.2)", borderRadius: 20, padding: "2px 8px", fontWeight: 700 }}>알바생</span>
                )}
              </div>
            </div>
          </div>

          {/* 신뢰도 바 */}
          <div style={{ background: "var(--surface2,var(--surface))", borderRadius: 12, padding: "10px 14px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
              <span style={{ fontSize: 11, color: "var(--text-muted)" }}>종합 신뢰도</span>
              <span style={{ fontSize: 13, fontWeight: 800, color: "#c4b5fd" }}>{user.trust_score || 0}점</span>
            </div>
            <div style={{ height: 6, background: "rgba(255,255,255,0.08)", borderRadius: 4 }}>
              <div style={{ height: "100%", borderRadius: 4, background: "linear-gradient(90deg,#7c3aed,#ec4899)", width: `${Math.min(100, user.trust_score || 0)}%`, transition: "width 0.6s" }} />
            </div>
          </div>
        </div>

        {/* 뱃지 */}
        {badges.length > 0 && (
          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 20, padding: 16, marginBottom: 14 }}>
            <h3 style={{ fontSize: 13, fontWeight: 700, margin: "0 0 10px", color: "var(--text)" }}>🏅 뱃지</h3>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {badges.map(b => (
                <button key={b.key}
                  onClick={() => setSelectedBadge(selectedBadge === b.key ? null : b.key)}
                  style={{ background: selectedBadge === b.key ? "rgba(139,92,246,0.2)" : "rgba(139,92,246,0.08)", border: `1px solid ${selectedBadge === b.key ? "rgba(139,92,246,0.5)" : "rgba(139,92,246,0.2)"}`, borderRadius: 20, padding: "4px 10px", fontSize: 11, color: "#c4b5fd", cursor: "pointer", fontWeight: 600 }}>
                  {b.emoji} {b.name}
                </button>
              ))}
            </div>
            {selectedBadge && BADGE_DEFS[selectedBadge] && (
              <div style={{ background: "rgba(139,92,246,0.08)", border: "1px solid rgba(139,92,246,0.2)", borderRadius: 10, padding: "8px 12px", marginTop: 10 }}>
                <p style={{ fontSize: 12, fontWeight: 700, color: "#c4b5fd", margin: "0 0 2px" }}>{BADGE_DEFS[selectedBadge].emoji} {BADGE_DEFS[selectedBadge].name}</p>
                <p style={{ fontSize: 11, color: "var(--text-muted)", margin: 0 }}>{BADGE_DEFS[selectedBadge].desc}</p>
              </div>
            )}
          </div>
        )}

        {/* 운영 중인 매장 (사장님) */}
        {isEmployer && stores.length > 0 && (
          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 20, padding: 16, marginBottom: 14 }}>
            <h3 style={{ fontSize: 13, fontWeight: 700, margin: "0 0 10px" }}>🏪 운영 중인 매장</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {stores.map(s => (
                <button key={s.id} onClick={() => router.push(`/store/${s.id}`)}
                  style={{ display: "flex", alignItems: "center", gap: 10, background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 12, padding: "10px 12px", cursor: "pointer", width: "100%", textAlign: "left" }}>
                  <div style={{ width: 36, height: 36, borderRadius: 8, overflow: "hidden", flexShrink: 0, background: "linear-gradient(135deg,#ec4899,#be185d)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>
                    {s.image_url ? <img src={s.image_url} style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : "🏪"}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 13, fontWeight: 700, margin: 0, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.business_name}</p>
                    <p style={{ fontSize: 11, color: "var(--text-muted)", margin: 0 }}>{s.business_type || ""} {s.region ? `· ${s.region.split(" ").slice(0, 2).join(" ")}` : ""}</p>
                  </div>
                  <span style={{ fontSize: 12, color: "var(--text-muted)" }}>→</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* 구직 정보 (알바생) */}
        {isWorker && workerProfile && (
          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 20, padding: 16, marginBottom: 14 }}>
            <h3 style={{ fontSize: 13, fontWeight: 700, margin: "0 0 10px" }}>💼 구직 정보</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {workerProfile.worker_type && <div style={{ display: "flex", gap: 8, fontSize: 12 }}><span style={{ color: "var(--text-muted)", minWidth: 60 }}>직종</span><span style={{ color: "var(--text)", fontWeight: 600 }}>{workerProfile.worker_type}</span></div>}
              {workerProfile.desired_region && <div style={{ display: "flex", gap: 8, fontSize: 12 }}><span style={{ color: "var(--text-muted)", minWidth: 60 }}>희망 지역</span><span style={{ color: "var(--text)", fontWeight: 600 }}>{workerProfile.desired_region}</span></div>}
              {workerProfile.desired_wage && <div style={{ display: "flex", gap: 8, fontSize: 12 }}><span style={{ color: "var(--text-muted)", minWidth: 60 }}>희망 시급</span><span style={{ color: "var(--text)", fontWeight: 600 }}>{Number(workerProfile.desired_wage).toLocaleString()}원↑</span></div>}
              {workerProfile.work_days && <div style={{ display: "flex", gap: 8, fontSize: 12 }}><span style={{ color: "var(--text-muted)", minWidth: 60 }}>가능 요일</span><span style={{ color: "var(--text)", fontWeight: 600 }}>{workerProfile.work_days}</span></div>}
              {workerProfile.bio && <p style={{ fontSize: 12, color: "var(--text-sub)", margin: "6px 0 0", lineHeight: 1.6, borderTop: "1px solid var(--border)", paddingTop: 8 }}>{workerProfile.bio}</p>}
            </div>
          </div>
        )}

        {/* 개인 피드 글 */}
        {personalPosts.length > 0 && (
          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 20, padding: 16 }}>
            <h3 style={{ fontSize: 13, fontWeight: 700, margin: "0 0 10px" }}>📝 최근 소식</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {personalPosts.map(post => (
                <div key={post.id} style={{ borderBottom: "1px solid var(--border)", paddingBottom: 10 }}>
                  {post.media_urls?.[0] && (
                    <img src={post.media_urls[0]} style={{ width: "100%", borderRadius: 10, objectFit: "cover", maxHeight: 200, marginBottom: 6 }} />
                  )}
                  {post.content && <p style={{ fontSize: 12, color: "var(--text)", margin: 0, lineHeight: 1.6 }}>{post.content}</p>}
                  <p style={{ fontSize: 10, color: "var(--text-muted)", margin: "4px 0 0" }}>
                    {new Date(post.created_at).toLocaleDateString("ko-KR", { month: "numeric", day: "numeric" })}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

      </div>
    </main>
  );
}
