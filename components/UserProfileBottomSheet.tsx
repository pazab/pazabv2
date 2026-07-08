"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { getTrustGrade } from "@/lib/utils";
import { useToast } from "@/lib/useToast";

interface UserProfileBottomSheetProps {
  userId: string;
  onClose: () => void;
}

export default function UserProfileBottomSheet({
  userId,
  onClose,
}: UserProfileBottomSheetProps) {
  const router = useRouter();
  const { showToast, ToastUI } = useToast();
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [teamMember, setTeamMember] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [isBlocked, setIsBlocked] = useState(false);
  const [blocking, setBlocking] = useState(false);

  useEffect(() => {
    if (userId) {
      loadProfileData();
    }
  }, [userId]);

  async function loadProfileData() {
    setLoading(true);
    const { data: { user: authUser } } = await supabase.auth.getUser();
    setCurrentUser(authUser);

    // 1. 유저 기본 정보 조회
    const { data: userData } = await supabase
      .from("users")
      .select("id, nickname, avatar_url, trust_score, bank_verified")
      .eq("id", userId)
      .single();

    // 2. 구직자 상세 프로필 조회
    const { data: workerData } = await supabase
      .from("worker_profiles")
      .select("bio, job_categories, region, desired_wage, is_verified")
      .eq("user_id", userId)
      .maybeSingle();

    // 3. 현재 사장님과의 소속 멤버 관계 조회
    let tmData = null;
    if (authUser && authUser.id !== userId) {
      const { data } = await supabase
        .from("team_members")
        .select("id, docs_submitted")
        .eq("employer_id", authUser.id)
        .eq("worker_id", userId)
        .eq("status", "active")
        .maybeSingle();
      tmData = data;
    }

    // 4. 차단 여부 조회 (user_blocks 테이블 존재 시 조회, 실패시 false 처리)
    if (authUser) {
      const { data: blockData } = await supabase
        .from("user_blocks")
        .select("id")
        .eq("blocker_id", authUser.id)
        .eq("blocked_id", userId)
        .maybeSingle();
      setIsBlocked(!!blockData);
    }

    setProfile({
      user: userData,
      worker: workerData,
    });
    setTeamMember(tmData);
    setLoading(false);
  }

  const handleChat = async () => {
    if (!currentUser) { router.push("/login"); return; }

    const res = await fetch(`/api/dm?targetId=${userId}`);
    const data = await res.json();

    if (!res.ok || !data.matchId) {
      showToast(data.error || "채팅방을 열 수 없어요.", "error");
      return;
    }

    onClose();
    router.push(`/chat/${data.matchId}`);
  };

  const [showBlockConfirm, setShowBlockConfirm] = useState(false);

  const handleBlock = async () => {
    if (!currentUser) return;
    if (!isBlocked) {
      setShowBlockConfirm(true);
      return;
    }
    // 차단 해제 (confirm 불필요)
    setBlocking(true);
    const { error } = await supabase
      .from("user_blocks")
      .delete()
      .eq("blocker_id", currentUser.id)
      .eq("blocked_id", userId);
    if (!error) {
      setIsBlocked(false);
      showToast("차단이 해제되었습니다.");
    } else {
      showToast("차단 해제 실패: " + error.message, "error");
    }
    setBlocking(false);
  };

  const confirmBlock = async () => {
    if (!currentUser) return;
    setShowBlockConfirm(false);
    setBlocking(true);
    const { error } = await supabase
      .from("user_blocks")
      .insert({ blocker_id: currentUser.id, blocked_id: userId });
    if (!error) {
      setIsBlocked(true);
      showToast("사용자가 차단되었습니다.");
    } else {
      showToast("차단 처리 실패: " + error.message, "error");
    }
    setBlocking(false);
  };

  if (!userId) return null;

  const nick = profile?.user?.nickname || "사용자";
  const avatar = profile?.user?.avatar_url;
  const trustScore = profile?.user?.trust_score ?? 70;
  const trust = getTrustGrade(trustScore);

  const hasHealthCert = !!teamMember?.docs_submitted?.healthCert;
  const hasIdCard = !!profile?.worker?.is_verified;
  const hasBankbook = !!profile?.user?.bank_verified;

  return (
    <>
    {ToastUI}
    {showBlockConfirm && (
      <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.75)", zIndex:1100, display:"flex", alignItems:"center", justifyContent:"center", padding:24 }}>
        <div style={{ background:"var(--surface)", borderRadius:20, padding:24, width:"100%", maxWidth:340 }}>
          <p style={{ fontSize:16, fontWeight:800, color:"var(--text)", margin:"0 0 8px" }}>🚫 차단하기</p>
          <p style={{ fontSize:13, color:"var(--text-muted)", margin:"0 0 20px", lineHeight:1.6 }}>
            차단 시 이 사용자의 대타 공고 지원이 제한되며 메시지 수신이 차단됩니다.
          </p>
          <div style={{ display:"flex", gap:8 }}>
            <button onClick={() => setShowBlockConfirm(false)}
              style={{ flex:1, background:"var(--surface2)", border:"1px solid var(--border)", borderRadius:12, padding:12, fontSize:13, fontWeight:700, color:"var(--text)", cursor:"pointer" }}>
              취소
            </button>
            <button onClick={confirmBlock}
              style={{ flex:1, background:"#ef4444", border:"none", borderRadius:12, padding:12, fontSize:13, fontWeight:700, color:"#fff", cursor:"pointer" }}>
              차단하기
            </button>
          </div>
        </div>
      </div>
    )}
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", zIndex: 1000,
      display: "flex", alignItems: "flex-end", justifyContent: "center"
    }} onClick={onClose}>
      <div style={{
        background: "var(--surface)", borderTop: "1px solid var(--border)",
        borderRadius: "24px 24px 0 0", width: "100%", maxWidth: 480,
        padding: "24px 20px 36px", boxShadow: "0 -8px 32px rgba(0,0,0,0.5)",
        display: "flex", flexDirection: "column", gap: 20,
        transform: "translateY(0)", transition: "transform 0.3s ease-out"
      }} onClick={e => e.stopPropagation()}>
        {/* 바텀시트 핸들 */}
        <div style={{ width: 40, height: 4, background: "var(--border)", borderRadius: 2, margin: "-12px auto 8px" }} />

        {loading ? (
          <div style={{ textAlign: "center", padding: "40px 0", color: "var(--text-muted)", fontSize: 14 }}>
            프로필 불러오는 중...
          </div>
        ) : (
          <>
            {/* 상단 프로필 헤더 */}
            <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
              <div style={{
                width: 68, height: 68, borderRadius: "50%",
                background: "linear-gradient(135deg, #f59e0b, #ef4444)",
                overflow: "hidden", display: "flex", alignItems: "center",
                justifyContent: "center", fontSize: 28, flexShrink: 0
              }}>
                {avatar ? <img src={avatar} style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : "👤"}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                  <span style={{ fontSize: 18, fontWeight: 800, color: "var(--text)" }}>{nick}</span>
                  <span style={{
                    fontSize: 11, background: `${trust.color}20`, color: trust.color,
                    borderRadius: 6, padding: "2px 8px", fontWeight: 700, display: "flex", alignItems: "center", gap: 2
                  }}>
                    {trust.emoji} {trust.label}등급
                  </span>
                </div>
                <p style={{ fontSize: 12, color: "var(--text-muted)", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {profile?.worker?.bio || "등록된 소개글이 없습니다."}
                </p>
              </div>
            </div>

            {/* 신뢰 정보 게이지 */}
            <div style={{ background: "var(--surface2)", borderRadius: 16, padding: 14, border: "1px solid var(--border)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                <span style={{ fontSize: 12, color: "var(--text-muted)" }}>신뢰도 점수</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: trust.color }}>{trustScore}점</span>
              </div>
              <div style={{ width: "100%", height: 6, background: "var(--border)", borderRadius: 3, overflow: "hidden" }}>
                <div style={{ width: `${trustScore}%`, height: "100%", background: trust.color, borderRadius: 3 }} />
              </div>
            </div>

            {/* 스펙 검증 배지 구역 */}
            <div>
              <p style={{ fontSize: 12, fontWeight: 700, color: "var(--text-muted)", margin: "0 0 10px" }}>🛡️ 안심 근무 스펙 검증</p>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                {[
                  { label: "신원 인증", on: hasIdCard, emoji: "🛡️" },
                  { label: "보건증 제출", on: hasHealthCert, emoji: "🩺" },
                  { label: "계좌 검증", on: hasBankbook, emoji: "🏦" },
                ].map(badge => (
                  <div key={badge.label} style={{
                    background: badge.on ? "rgba(16,185,129,0.06)" : "var(--surface2)",
                    border: `1px solid ${badge.on ? "rgba(16,185,129,0.3)" : "var(--border)"}`,
                    borderRadius: 12, padding: "10px 4px", textAlign: "center", display: "flex", flexDirection: "column", gap: 4, alignItems: "center"
                  }}>
                    <span style={{ fontSize: 20, opacity: badge.on ? 1 : 0.35 }}>{badge.emoji}</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: badge.on ? "#10b981" : "var(--text-muted)" }}>
                      {badge.label}
                    </span>
                    <span style={{ fontSize: 9, color: badge.on ? "#10b981" : "var(--text-muted)", opacity: 0.8 }}>
                      {badge.on ? "검증 완료" : "미인증"}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* 성향 분석 요약 */}
            {profile?.worker?.job_categories && profile.worker.job_categories.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text-muted)" }}>💼 선호 업종</span>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {profile.worker.job_categories.map((c: string) => (
                    <span key={c} style={{ fontSize: 11, background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 8, padding: "4px 8px", color: "var(--text)" }}>
                      {c}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* 작업 버튼들 */}
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 6 }}>
              <div style={{ display: "flex", gap: 8 }}>
                {/* 차단 버튼 */}
                <button onClick={handleBlock} disabled={blocking}
                  style={{
                    flex: 1, background: isBlocked ? "rgba(239,68,68,0.15)" : "var(--surface2)",
                    border: `1px solid ${isBlocked ? "#ef4444" : "var(--border)"}`,
                    borderRadius: 12, padding: 13, color: isBlocked ? "#ef4444" : "var(--text)",
                    fontSize: 13, fontWeight: 700, cursor: "pointer"
                  }}>
                  {isBlocked ? "🚫 차단 해제" : "🚫 차단하기"}
                </button>

                {/* 1:1 메시지 버튼 */}
                {currentUser?.id !== userId && (
                  <button onClick={handleChat}
                    style={{
                      flex: 2, background: "linear-gradient(135deg,#7c3aed,#ec4899)",
                      border: "none", borderRadius: 12, padding: 13, color: "#fff",
                      fontSize: 13, fontWeight: 700, cursor: "pointer"
                    }}>
                    💬 1:1 메시지 보내기
                  </button>
                )}
              </div>



              {/* 닫기 */}
              <button onClick={onClose}
                style={{
                  width: "100%", background: "none", border: "none",
                  padding: 10, color: "var(--text-muted)", fontSize: 13, cursor: "pointer"
                }}>
                취소
              </button>
            </div>
          </>
        )}
      </div>
    </div>
    </>
  );
}
