"use client";
import React, { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/lib/useToast";
import {
  modalOverlay,
  modalSheet,
  btnPrimary,
  btnSecondary,
  inputStyle,
} from "@/lib/styles";

interface InviteBottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  defaultStoreId?: string;
}

function generateCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return "PAZ-" + Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

export default function InviteBottomSheet({ isOpen, onClose, onSuccess, defaultStoreId }: InviteBottomSheetProps) {
  const router = useRouter();
  const { showToast, ToastUI } = useToast();

  const [user, setUser] = useState<any>(null);
  const [profiles, setProfiles] = useState<any[]>([]);
  const [selProfile, setSelProfile] = useState<any>(null);

  // 직원 검색 관련 상태
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const [selected, setSelected] = useState<any>(null);
  const [searching, setSearching] = useState(false);
  const [searchDone, setSearchDone] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [sending, setSending] = useState(false);

  // 초기 로그인 유저 및 매장 정보 로드
  useEffect(() => {
    if (!isOpen) return;

    // 모달이 열릴 때 상태 초기화
    setQuery("");
    setResults([]);
    setSelected(null);
    setSearchDone(false);
    setSending(false);

    supabase.auth.getUser().then(async (res: any) => {
      const u = res.data?.user;
      if (!u) {
        onClose();
        router.push("/login");
        return;
      }
      setUser(u);

      // 매장 목록 로드
      const { data: ps } = await supabase
        .from("employer_profiles")
        .select("id, business_name, address, sigungu, eupmyeondong")
        .eq("user_id", u.id)
        .eq("is_deleted", false)
        .order("created_at", { ascending: false });

      if (ps && ps.length > 0) {
        setProfiles(ps);
        const matched = defaultStoreId ? ps.find(p => p.id === defaultStoreId) : null;
        setSelProfile(matched || ps[0]); // 매칭되는게 있으면 그것으로, 없으면 첫번째 매장
      }
    });
  }, [isOpen, defaultStoreId]);

  // 직원 실시간 검색 핸들러
  const onQueryChange = (v: string) => {
    setQuery(v);
    setSelected(null);
    setSearchDone(false);

    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (!v.trim()) {
      setResults([]);
      setSearching(false);
      return;
    }

    setSearching(true);
    searchTimer.current = setTimeout(async () => {
      const { data } = await supabase
        .from("users")
        .select("id, nickname, avatar_url, user_type")
        .ilike("nickname", `%${v}%`)
        .neq("id", user?.id)
        .limit(8);

      setResults(data || []);
      setSearching(false);
      setSearchDone(true);
    }, 400);
  };

  const selectUser = (u: any) => {
    setSelected(u);
    setQuery(u.nickname || "");
    setResults([]);
  };

  // 초대장 발송 처리
  async function handleSend() {
    if (!user) return;
    if (!selProfile) {
      showToast("매장을 선택해주세요.", "error");
      return;
    }
    if (!selected) {
      showToast("초대할 직원을 먼저 선택해주세요.", "error");
      return;
    }

    setSending(true);

    try {
      // 1. 이미 팀원인지 체크
      const { data: existing } = await supabase
        .from("team_members")
        .select("id, status")
        .eq("employer_id", user.id)
        .eq("worker_id", selected.id)
        .limit(1);

      if (existing && existing.length > 0) {
        showToast(`@${selected.nickname}님은 이미 우리 팀의 팀원입니다.`, "error");
        setSending(false);
        return;
      }

      const code = generateCode();
      
      // 2. 초대 코드 DB 저장
      const { error: inviteErr } = await supabase.from("invite_codes").insert({
        code,
        employer_id: user.id,
        employer_profile_id: selProfile.id,
        biz_name: selProfile.business_name,
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7일 유효
      });

      if (inviteErr) throw inviteErr;

      // 3. 인앱 푸시 및 실시간 알림 발송
      try {
        await fetch("/api/notifications", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userId: selected.id,
            type: "invite",
            title: `🏪 ${selProfile.business_name}에서 팀원 초대장이 왔어요!`,
            body: `초대코드를 수락하고 우리 팀에 합류해 보세요.`,
            data: { url: `/i/${code}` },
          }),
        });
      } catch (err) {
        console.warn("Push notification api trigger failed, fallback silent.", err);
      }

      showToast("📨 초대장을 성공적으로 전송했습니다!", "success");
      onSuccess?.();
      setTimeout(onClose, 800);
    } catch (e: any) {
      showToast("초대 전송 실패: " + e.message, "error");
    } finally {
      setSending(false);
    }
  }

  const profileLocation = (p: any) =>
    [p.eupmyeondong || p.sigungu, p.address].filter(Boolean).join(" · ") || "";

  if (!isOpen) return null;

  return (
    <div style={modalOverlay} onClick={onClose}>
      {ToastUI}
      <div
        style={{
          ...modalSheet,
          maxHeight: "85vh",
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
          gap: 18,
          boxShadow: "0 -8px 30px rgba(0,0,0,0.5)",
          borderTop: "1px solid var(--border)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 드래그 핸들 바 */}
        <div
          style={{
            width: 40,
            height: 4,
            background: "var(--border)",
            borderRadius: 2,
            alignSelf: "center",
            marginBottom: -4,
          }}
        />

        {/* 타이틀 */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <h3 style={{ fontSize: 17, fontWeight: 900, color: "var(--text)", margin: 0 }}>
              📨 새로운 팀원 초대하기
            </h3>
            <p style={{ fontSize: 11, color: "var(--text-muted)", margin: "4px 0 0" }}>
              이미 합의가 끝난 알바생을 우리 매장 팀원으로 등록해 보세요.
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              fontSize: 18,
              color: "var(--text-muted)",
              cursor: "pointer",
              padding: 4,
            }}
          >
            ✕
          </button>
        </div>

        {/* 1. 매장 선택 */}
        <div>
          <p style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", margin: "0 0 8px" }}>
            초대할 매장 선택 <span style={{ color: "#ef4444" }}>*</span>
          </p>
          {profiles.length === 0 ? (
            <div
              style={{
                background: "var(--surface2)",
                borderRadius: 12,
                padding: "14px 16px",
                border: "1px solid var(--border)",
              }}
            >
              <p style={{ fontSize: 13, color: "var(--text-muted)", margin: 0 }}>
                등록된 매장이 없습니다. 매장을 먼저 생성해주세요.
              </p>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {profiles.map((p) => {
                const isSel = selProfile?.id === p.id;
                return (
                  <button
                    key={p.id}
                    onClick={() => setSelProfile(p)}
                    style={{
                      background: isSel ? "rgba(139,92,246,0.06)" : "var(--surface2)",
                      border: `1.5px solid ${isSel ? "#8b5cf6" : "var(--border)"}`,
                      borderRadius: 12,
                      padding: "10px 12px",
                      cursor: "pointer",
                      textAlign: "left",
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      transition: "all 0.2s",
                    }}
                  >
                    <div
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: 8,
                        background: isSel ? "rgba(139,92,246,0.15)" : "var(--surface)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                      }}
                    >
                      <i
                        className="ti ti-building-store"
                        style={{
                          fontSize: 16,
                          color: isSel ? "#8b5cf6" : "var(--text-muted)",
                        }}
                      />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p
                        style={{
                          margin: 0,
                          fontSize: 13,
                          fontWeight: 700,
                          color: isSel ? "#8b5cf6" : "var(--text)",
                        }}
                      >
                        {p.business_name || "매장명 없음"}
                      </p>
                      {profileLocation(p) && (
                        <p
                          style={{
                            margin: "1px 0 0",
                            fontSize: 10,
                            color: "var(--text-muted)",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          📍 {profileLocation(p)}
                        </p>
                      )}
                    </div>
                    {isSel && (
                      <i
                        className="ti ti-circle-check-filled"
                        style={{ fontSize: 16, color: "#8b5cf6", flexShrink: 0 }}
                      />
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* 2. 직원 검색 */}
        <div style={{ position: "relative" }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", margin: "0 0 8px" }}>
            초대할 알바생 검색 <span style={{ color: "#ef4444" }}>*</span>
          </p>
          {/* 안내 배너 */}
          <div style={{ background: "var(--primary-light)", border: "1px solid var(--primary-border)", borderRadius: 10, padding: "9px 12px", marginBottom: 10, display: "flex", gap: 8, alignItems: "flex-start" }}>
            <span style={{ fontSize: 15, flexShrink: 0 }}>💡</span>
            <p style={{ fontSize: 11, color: "var(--text-sub)", margin: 0, lineHeight: 1.6 }}>
              초대하려는 직원이 <strong style={{ color: "var(--purple-text)", fontWeight: 700 }}>파잡에 먼저 가입</strong>되어 있어야 해요.<br />
              가입 시 설정한 <strong style={{ color: "var(--purple-text)", fontWeight: 700 }}>닉네임</strong>으로 검색할 수 있어요.
            </p>
          </div>
          <div style={{ position: "relative" }}>
            <input
              value={query}
              onChange={(e) => onQueryChange(e.target.value)}
              placeholder="직원의 닉네임을 입력해 주세요..."
              style={{
                ...inputStyle,
                paddingLeft: 36,
                paddingRight: selected ? 36 : 12,
                border: selected ? "1.5px solid #8b5cf6" : "1px solid var(--border)",
              }}
            />
            <i
              className="ti ti-search"
              style={{
                position: "absolute",
                left: 11,
                top: "50%",
                transform: "translateY(-50%)",
                fontSize: 15,
                color: "var(--text-muted)",
                pointerEvents: "none",
              }}
            />
            {selected && (
              <button
                onClick={() => {
                  setSelected(null);
                  setQuery("");
                }}
                style={{
                  position: "absolute",
                  right: 10,
                  top: "50%",
                  transform: "translateY(-50%)",
                  background: "none",
                  border: "none",
                  color: "var(--text-muted)",
                  cursor: "pointer",
                  fontSize: 14,
                }}
              >
                ✕
              </button>
            )}
          </div>

          {/* 검색 상태 피드백 */}
          {searching && (
            <p style={{ fontSize: 11, color: "var(--text-muted)", margin: "6px 0 0", paddingLeft: 4 }}>
              🔍 검색 중...
            </p>
          )}
          {!searching && searchDone && !selected && query.trim() && results.length === 0 && (
            <div style={{ marginTop: 8, background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 10, padding: "9px 12px" }}>
              <p style={{ fontSize: 11, color: "#ef4444", margin: 0, lineHeight: 1.6 }}>
                <strong>'{query}'</strong> 닉네임을 가진 유저를 찾을 수 없어요.<br />
                <span style={{ color: "var(--text-muted)" }}>직원이 아직 파잡에 가입하지 않았을 수 있어요. 가입 후 다시 검색해주세요.</span>
              </p>
            </div>
          )}

          {/* 검색 결과 드롭다운 */}
          {results.length > 0 && (
            <div
              style={{
                position: "absolute",
                left: 0,
                right: 0,
                top: "calc(100% + 4px)",
                background: "var(--surface)",
                border: "1px solid var(--border)",
                borderRadius: 12,
                zIndex: 250,
                maxHeight: 180,
                overflowY: "auto",
                boxShadow: "0 10px 25px rgba(0,0,0,0.4)",
              }}
            >
              {results.map((u: any) => (
                <button
                  key={u.id}
                  onClick={() => selectUser(u)}
                  style={{
                    width: "100%",
                    background: "none",
                    border: "none",
                    padding: "10px 14px",
                    cursor: "pointer",
                    textAlign: "left",
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    borderBottom: "1px solid var(--border)",
                  }}
                >
                  <div
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: "50%",
                      background: "var(--surface2)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                      overflow: "hidden",
                    }}
                  >
                    {u.avatar_url ? (
                      <img src={u.avatar_url} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    ) : (
                      <i className="ti ti-user" style={{ fontSize: 14, color: "var(--text-muted)" }} />
                    )}
                  </div>
                  <div style={{ flex: 1 }}>
                    <span style={{ fontSize: 13, color: "var(--text)", fontWeight: 500 }}>
                      @{u.nickname}
                    </span>
                  </div>
                  <span style={{ fontSize: 10, color: "var(--text-muted)" }}>
                    {u.user_type === "worker" ? "알바생" : u.user_type === "employer" ? "사장님" : "공통"}
                  </span>
                </button>
              ))}
            </div>
          )}

          {/* 선택 완료된 직원 뱃지 */}
          {selected && (
            <div
              style={{
                marginTop: 8,
                display: "flex",
                alignItems: "center",
                gap: 8,
                background: "rgba(139,92,246,0.06)",
                border: "1px solid rgba(139,92,246,0.25)",
                borderRadius: 10,
                padding: "8px 12px",
              }}
            >
              <div
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: "50%",
                  background: "var(--surface2)",
                  overflow: "hidden",
                  flexShrink: 0,
                }}
              >
                {selected.avatar_url ? (
                  <img
                    src={selected.avatar_url}
                    style={{ width: "100%", height: "100%", objectFit: "cover" }}
                  />
                ) : (
                  <div
                    style={{
                      width: "100%",
                      height: "100%",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <i className="ti ti-user" style={{ fontSize: 12, color: "#8b5cf6" }} />
                  </div>
                )}
              </div>
              <span style={{ fontSize: 12, fontWeight: 700, color: "#8b5cf6" }}>
                ✓ 초대 대상자 지정: @{selected.nickname}
              </span>
            </div>
          )}
        </div>

        {/* 3. 발송 액션 버튼 */}
        <div style={{ display: "flex", gap: 10, marginTop: 6 }}>
          <button onClick={onClose} style={{ ...btnSecondary, flex: 1, padding: "12px 16px" }}>
            취소
          </button>
          <button
            onClick={handleSend}
            disabled={sending || !selected || !selProfile}
            style={{
              ...btnPrimary,
              flex: 2,
              padding: "12px 16px",
              opacity: !selected || !selProfile ? 0.5 : 1,
            }}
          >
            {sending ? "📨 초대장 전송 중..." : "📨 초대장 전송"}
          </button>
        </div>
      </div>
    </div>
  );
}
