"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/lib/useToast";
import { fetchCredentialsWithFallback } from "@/lib/credentials";
import { fetchMinWage } from "@/lib/minWage";

interface DaetaRegisterModalProps {
  userId: string;
  onClose: () => void;
  onSuccess: (postingId?: string) => void;
  postingId?: string | null;
}

const BANK_OPTIONS = ["신한은행", "국민은행", "우리은행", "하나은행", "농협은행", "카카오뱅크", "토스뱅크"];

const mapKakaoCategory = (kakaoCategory: string): string => {
  if (!kakaoCategory) return "기타";
  if (kakaoCategory.includes("카페") || kakaoCategory.includes("커피") || kakaoCategory.includes("제과") || kakaoCategory.includes("베이커리") || kakaoCategory.includes("디저트")) {
    return "카페/음료";
  }
  if (kakaoCategory.includes("음식점") || kakaoCategory.includes("한식") || kakaoCategory.includes("일식") || kakaoCategory.includes("중식") || kakaoCategory.includes("양식") || kakaoCategory.includes("패스트푸드") || kakaoCategory.includes("분식") || kakaoCategory.includes("술집") || kakaoCategory.includes("호프") || kakaoCategory.includes("포장마차") || kakaoCategory.includes("식당")) {
    return "식당/음식점";
  }
  if (kakaoCategory.includes("편의점") || kakaoCategory.includes("마트") || kakaoCategory.includes("슈퍼")) {
    return "편의점/마트";
  }
  if (kakaoCategory.includes("미용") || kakaoCategory.includes("뷰티") || kakaoCategory.includes("헤어") || kakaoCategory.includes("네일") || kakaoCategory.includes("피부")) {
    return "뷰티/미용";
  }
  if (kakaoCategory.includes("판매") || kakaoCategory.includes("리테일") || kakaoCategory.includes("매장") || kakaoCategory.includes("백화점") || kakaoCategory.includes("쇼핑") || kakaoCategory.includes("아웃렛")) {
    return "판매/매장";
  }
  if (kakaoCategory.includes("물류") || kakaoCategory.includes("배송") || kakaoCategory.includes("택배")) {
    return "물류/배송";
  }
  return "기타";
};

export default function DaetaRegisterModal({ userId, onClose, onSuccess, postingId }: DaetaRegisterModalProps) {
  const { showToast, ToastUI } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hasProfile, setHasProfile] = useState(false);
  const [errMsg, setErrMsg] = useState("");

  // 기본 매장 정보 (기존 프로필이 있을 때)
  const [shopInfo, setShopInfo] = useState<{
    id?: string;
    businessName: string;
    businessType: string;
    region: string;
    lat: number;
    lng: number;
  } | null>(null);

  const [myShops, setMyShops] = useState<any[]>([]);

  // 1. 신규 사장님 간편 가입/인증 폼 상태
  const [step, setStep] = useState<"cert" | "form">("cert"); // cert: 신원인증/매장등록, form: 대타근무조건
  const [newBusinessName, setNewBusinessName] = useState("");
  const [newBusinessType, setNewBusinessType] = useState("식당/음식점");
  const [addressQuery, setAddressQuery] = useState("");
  const [addressResults, setAddressResults] = useState<any[]>([]);
  const [selectedAddress, setSelectedAddress] = useState<any>(null);
  
  // 신원/계좌인증 상태
  const [phoneVerified, setPhoneVerified] = useState(false);
  const [bankName, setBankName] = useState("신한은행");
  const [accountNum, setAccountNum] = useState("");
  const [accountVerified, setAccountVerified] = useState(false);
  const [verifiedName, setVerifiedName] = useState("");

  // 2. 대타 구인 정보 입력 상태
  const [workDate, setWorkDate] = useState("");
  const [startHour, setStartHour] = useState("12");
  const [startMin, setStartMin] = useState("00");
  const [endHour, setEndHour] = useState("18");
  const [endMin, setEndMin] = useState("00");
  const [wage, setWage] = useState("11000"); // 기본 추천 우대 시급
  const [wageTouched, setWageTouched] = useState(false); // 사장님이 직접 수정하면 자동 할증 제안 중단
  const [urgentPct, setUrgentPct] = useState({ sameDay: 20, h3: 30 }); // DB daeta_sos_config에서 로드
  const [minWage, setMinWage] = useState(10030);
  const [wageHint, setWageHint] = useState("");
  const [duty, setDuty] = useState("");
  const [secureOption, setSecureOption] = useState(false); // 사장님 안심 옵션 수수료 동의
  const [allowNew, setAllowNew] = useState(false); // 🔵 신규(Tier2) 알바생에게도 노출 opt-in

  // 자격 요건 마스터 및 선택 상태
  const [credentialsMaster, setCredentialsMaster] = useState<any[]>([]);
  const [selectedCreds, setSelectedCreds] = useState<any[]>([]);
  const [customCredInput, setCustomCredInput] = useState("");
  const [showCustomInput, setShowCustomInput] = useState(false);
  const [suggestions, setSuggestions] = useState<any[]>([]);

  // 업종 및 직무 카테고리 상태
  const [parentCategories, setParentCategories] = useState<any[]>([]);
  const [childCategories, setChildCategories] = useState<any[]>([]);
  const [selectedParent, setSelectedParent] = useState<any | null>(null);
  const [customDuty, setCustomDuty] = useState("");
  const [profileCategoryId, setProfileCategoryId] = useState<string | null>(null);

  // 오늘 날짜 계산 (min 설정용)
  const todayStr = new Date().toISOString().split("T")[0];
  const maxDateStr = new Date(Date.now() + 3 * 86400000).toISOString().split("T")[0]; // 최대 3일 뒤

  useEffect(() => {
    loadCredentials();
    loadWageConfig();
    if (postingId) {
      loadPostingDetails(postingId);
    } else {
      checkEmployerProfile();
    }
  }, [postingId, userId]);

  const loadWageConfig = async () => {
    const mw = await fetchMinWage();
    setMinWage(mw);
    const { data } = await supabase
      .from("daeta_sos_config")
      .select("key, value")
      .in("key", ["urgent_pct_same_day", "urgent_pct_3h"]);
    if (data) {
      const map: Record<string, number> = {};
      data.forEach((r: { key: string; value: number }) => { map[r.key] = r.value; });
      setUrgentPct({ sameDay: map.urgent_pct_same_day ?? 20, h3: map.urgent_pct_3h ?? 30 });
    }
  };

  // 긴급 할증 시급 기본값 제안 (당일 +20%, 3시간 내 +30%) — 사장님이 직접 수정하면 중단
  useEffect(() => {
    if (!workDate) { setWageHint(""); return; }
    const start = new Date(`${workDate}T${startHour}:${startMin}:00`);
    const hoursUntil = (start.getTime() - Date.now()) / 3600000;
    const isSameDay = workDate === new Date().toISOString().split("T")[0];

    let pct = 0;
    let label = "";
    if (hoursUntil <= 3 && hoursUntil > -1) {
      pct = urgentPct.h3;
      label = `⚡ 3시간 내 초긴급 — 할증 +${pct}% 추천 시급 적용`;
    } else if (isSameDay) {
      pct = urgentPct.sameDay;
      label = `🔥 당일 긴급 — 할증 +${pct}% 추천 시급 적용`;
    }

    if (pct > 0) {
      setWageHint(label);
      if (!wageTouched) {
        const suggested = Math.ceil((minWage * (1 + pct / 100)) / 10) * 10;
        setWage(String(suggested));
      }
    } else {
      setWageHint("");
    }
  }, [workDate, startHour, startMin, urgentPct, minWage, wageTouched]);

  const loadPostingDetails = async (id: string) => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("daeta_postings")
        .select("*")
        .eq("id", id)
        .single();
      
      if (error) throw error;
      
      if (data) {
        setWorkDate(data.work_date || "");
        if (data.work_hours) {
          const parts = data.work_hours.split("~");
          const startParts = (parts[0] || "12:00").trim().split(":");
          const endParts = (parts[1] || "18:00").trim().split(":");
          setStartHour(startParts[0] || "12");
          setStartMin(startParts[1] || "00");
          setEndHour(endParts[0] || "18");
          setEndMin(endParts[1] || "00");
        }
        setWage(String(data.wage || 10030));
        setWageTouched(true); // 수정 모드에서는 저장된 시급 유지
        setDuty(data.duty || "");
        setSecureOption(data.secure_option || false);
        setAllowNew(!!data.allow_new);
        if (data.required_credentials) {
          const parsed = typeof data.required_credentials === "string"
            ? JSON.parse(data.required_credentials)
            : data.required_credentials;
          setSelectedCreds(parsed || []);
        }
        
        setShopInfo({
          id: data.employer_profile_id || undefined,
          businessName: data.business_name || "",
          businessType: data.business_type || "기타",
          region: data.region || "",
          lat: data.lat || 37.5665,
          lng: data.lng || 126.9780,
        });
        setHasProfile(true);
        setStep("form");
      }
    } catch (err: any) {
      console.error(err);
      setErrMsg("공고 정보를 불러오는 데 실패했습니다: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const loadCredentials = async () => {
    const { data: cats } = await supabase.from("job_categories").select("*").order("sort_order");
    if (cats) {
      setParentCategories(cats.filter((c: { parent_id: string | null }) => !c.parent_id));
      setChildCategories(cats.filter((c: { parent_id: string | null }) => c.parent_id));
    }
    const data = await fetchCredentialsWithFallback();
    setCredentialsMaster(data);
  };

  useEffect(() => {
    if (profileCategoryId && childCategories.length > 0 && parentCategories.length > 0) {
      const child = childCategories.find(c => c.id === profileCategoryId);
      if (child) {
        setDuty(child.name);
        const parent = parentCategories.find(p => p.id === child.parent_id);
        if (parent) setSelectedParent(parent);
      }
    }
  }, [profileCategoryId, childCategories, parentCategories]);

  const checkEmployerProfile = async () => {
    try {
      const { data, error } = await supabase
        .from("employer_profiles")
        .select("id, business_name, business_type, region, lat, lng, category_id, category_ids")
        .eq("user_id", userId)
        .or("is_deleted.is.null,is_deleted.eq.false")
        .not("business_name", "is", null)
        .order("created_at", { ascending: false });

      if (error) throw error;

      if (data && data.length > 0) {
        setMyShops(data);
        const profile = data[0];
        setShopInfo({
          id: profile.id,
          businessName: profile.business_name || "",
          businessType: profile.business_type || "기타",
          region: profile.region || "",
          lat: profile.lat || 37.5665,
          lng: profile.lng || 126.9780,
        });
        setHasProfile(true);
        setStep("form"); // 매장 프로필이 있으면 바로 대타 정보 입력 폼으로
        if (profile.category_id) {
          setProfileCategoryId(profile.category_id);
        }
      } else {
        setHasProfile(false);
        setStep("cert"); // 없으면 1분 간편 가입/인증 단계로
      }
    } catch (err: any) {
      console.error(err);
      setErrMsg("매장 정보를 조회하는 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  // 카카오 API 주소 키워드 검색
  const searchAddress = async (query: string) => {
    setAddressQuery(query);
    if (query.trim().length < 2) {
      setAddressResults([]);
      return;
    }
    try {
      const res = await fetch(
        `https://dapi.kakao.com/v2/local/search/keyword.json?query=${encodeURIComponent(query)}&size=5`,
        {
          headers: {
            Authorization: "KakaoAK 02e1711115a492598ea97b18764fc597",
          },
        }
      );
      const data = await res.json();
      setAddressResults(data.documents || []);
    } catch (err) {
      console.error("주소 검색 오류:", err);
    }
  };

  // 목업 1원 송금 계좌 실명인증
  const verifyAccount = () => {
    if (!accountNum.trim()) {
      showToast("계좌번호를 입력해 주세요.", "error");
      return;
    }
    // 1초 목업 로딩 후 인증완료 처리
    setAccountVerified(true);
    // 가입자 이름 또는 임의의 이름 매칭
    setVerifiedName("안심사장");
    showToast("🏦 계좌 실명 인증 완료! (예금주: 안심사장)");
  };

  // 대타 공고 저장 처리
  const handleRegister = async () => {
    if (step === "cert") {
      // 1단계 유효성 검증
      if (!newBusinessName.trim()) {
        setErrMsg("매장 상호명을 입력해 주세요.");
        return;
      }
      if (!selectedAddress) {
        setErrMsg("매장 주소를 검색하여 선택해 주세요.");
        return;
      }
      if (!phoneVerified) {
        setErrMsg("휴대폰 간편인증 동의가 필요합니다.");
        return;
      }
      if (!accountVerified) {
        setErrMsg("정산용 은행 계좌 실명 인증을 완료해 주세요.");
        return;
      }
      
      setSaving(true);
      setErrMsg("");
      try {
        const newProfile = {
          user_id: userId,
          business_name: newBusinessName.trim(),
          business_type: newBusinessType,
          region: selectedAddress.address_name,
          lat: parseFloat(selectedAddress.y),
          lng: parseFloat(selectedAddress.x),
          is_active: true,
          is_deleted: false,
        };

        const { data: insertedData, error: insErr } = await supabase
          .from("employer_profiles")
          .insert(newProfile)
          .select()
          .single();

        if (insErr) throw insErr;

        if (insertedData) {
          setMyShops(prev => [insertedData, ...prev]);
          setShopInfo({
            id: insertedData.id,
            businessName: insertedData.business_name || "",
            businessType: insertedData.business_type || "기타",
            region: insertedData.region || "",
            lat: insertedData.lat || 37.5665,
            lng: insertedData.lng || 126.9780,
          });
          setHasProfile(true);
          if (insertedData.category_id) {
            setProfileCategoryId(insertedData.category_id);
          } else {
            setProfileCategoryId(null);
          }
        }
        setStep("form");
      } catch (err: any) {
        console.error(err);
        setErrMsg("매장 등록에 실패했습니다: " + err.message);
      } finally {
        setSaving(false);
      }
      return;
    }

    // 2단계 구인 정보 유효성 검증
    if (!workDate) {
      setErrMsg("대타가 필요한 날짜를 선택해 주세요.");
      return;
    }
    const finalWage = parseInt(wage);
    if (isNaN(finalWage) || finalWage < 10030) {
      setErrMsg("시급은 2026년 최저시급(10,030원) 이상이어야 합니다.");
      return;
    }
    const finalDuty = duty === "직접입력" ? customDuty.trim() : duty;
    if (!finalDuty) {
      setErrMsg("대타 담당 업무를 선택하거나 입력해 주세요.");
      return;
    }

    // 확정된 대타를 취소한 이력이 있으면 정지 기간 동안 신규 SOS 등록 제한
    if (!postingId) {
      const { data: userRow } = await supabase.from("users").select("daeta_cancel_suspended_until").eq("id", userId).maybeSingle();
      if (userRow?.daeta_cancel_suspended_until && new Date(userRow.daeta_cancel_suspended_until) > new Date()) {
        setErrMsg(`확정된 대타를 취소한 이력으로 ${new Date(userRow.daeta_cancel_suspended_until).toLocaleString("ko-KR")}까지 새 대타 등록이 제한돼요.`);
        return;
      }
    }

    setSaving(true);
    setErrMsg("");

    try {
      const finalShop = shopInfo!;
      
      // 요일 계산
      const days = ["일", "월", "화", "수", "목", "금", "토"];
      const dayName = days[new Date(workDate).getDay()];

      // 만료시간 계산 (근무 시작 날짜/시간)
      const expiresAt = `${workDate}T${startHour}:${startMin}:00Z`;

      const tags = [finalDuty, "대타"];
      if (secureOption) {
        tags.push("안심페이");
      }

      const insertData = {
        user_id: userId,
        business_name: finalShop.businessName,
        business_type: finalShop.businessType,
        region: finalShop.region,
        lat: finalShop.lat,
        lng: finalShop.lng,
        work_date: workDate,
        work_hours: `${startHour}:${startMin} ~ ${endHour}:${endMin}`,
        wage: finalWage,
        duty: finalDuty,
        secure_option: secureOption,
        allow_new: allowNew,
        status: "pending",
        expires_at: expiresAt,
        required_credentials: JSON.stringify(selectedCreds),
      };

      if (postingId) {
        const { error } = await supabase
          .from("daeta_postings")
          .update({
            work_date: workDate,
            work_hours: `${startHour}:${startMin} ~ ${endHour}:${endMin}`,
            wage: finalWage,
            duty: finalDuty,
            secure_option: secureOption,
            allow_new: allowNew,
            required_credentials: JSON.stringify(selectedCreds),
          })
          .eq("id", postingId);
        if (error) throw error;
        showToast("⚡ 대타 공고가 성공적으로 수정되었습니다!");
        setTimeout(() => onSuccess(postingId), 1500);
      } else {
        const { data: inserted, error } = await supabase
          .from("daeta_postings")
          .insert(insertData)
          .select("id")
          .single();
        if (error) throw error;
        showToast("⚡ SOS 발동! 우리 팀에게 가장 먼저 알릴게요");
        setTimeout(() => onSuccess(inserted?.id), 1500);
      }
    } catch (err: any) {
      console.error(err);
      setErrMsg("대타 공고 등록에 실패했습니다: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", zIndex: 1000, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
      <div style={{ width: "100%", maxWidth: 480, background: "var(--surface)", borderRadius: "24px 24px 0 0", padding: "20px", maxHeight: "90vh", overflowY: "auto", paddingBottom: "calc(24px + env(safe-area-inset-bottom))", borderTop: "1px solid var(--border)", color: "var(--text)" }}>

        {/* 모달 헤더 */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <h3 style={{ fontSize: 18, fontWeight: 900, margin: 0, color: "var(--text)" }}>
            {step === "cert" ? "⚡ 대타 간편 등록 & 본인 인증" : "⚡ 대타 근무조건 입력"}
          </h3>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "var(--text-muted)", fontSize: 20, cursor: "pointer" }}>✕</button>
        </div>

        {loading ? (
          <p style={{ textAlign: "center", padding: "40px 0", color: "var(--text-muted)" }}>정보를 불러오는 중...</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            
            {/* 1단계: 신원/계좌인증 및 간편 등록 (프로필이 없는 사장님 대상) */}
            {step === "cert" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                
                <div style={{ background: "var(--primary-light)", border: "1px solid var(--primary-border)", borderRadius: 12, padding: "12px", fontSize: 12, lineHeight: 1.5, color: "var(--purple-text)" }}>
                  💡 <strong>처음 오셨군요!</strong><br />
                  바쁘신 사장님을 위해 1회성 간편 정보 등록 및 본인 확인을 거친 후 바로 대타를 구하실 수 있습니다. (성향분석 생략)
                </div>

                {/* 매장 상호명 검색 */}
                <div style={{ position: "relative" }}>
                  <label style={{ fontSize: 13, fontWeight: 700, display: "block", marginBottom: 6 }}>🏪 매장 상호명 검색 *</label>
                  <input type="text" value={newBusinessName}
                    onChange={e => {
                      setNewBusinessName(e.target.value);
                      searchAddress(e.target.value);
                    }}
                    placeholder="예: 파스쿠찌 아산신정호점 (검색어 입력)"
                    style={{ width: "100%", background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 12, padding: "12px", color: "var(--text)", fontSize: 14, outline: "none", boxSizing: "border-box" }} />

                  {/* 주소 및 상호명 검색 결과 드롭다운 */}
                  {addressResults.length > 0 && (
                    <div style={{ position: "absolute", top: "100%", left: 0, right: 0, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, zIndex: 100, overflow: "hidden", marginTop: 4, boxShadow: "0 8px 24px rgba(0,0,0,0.5)" }}>
                      {addressResults.map((item, i) => (
                        <div key={i} onClick={() => {
                          setNewBusinessName(item.place_name);
                          setSelectedAddress(item);
                          if (item.category_name) {
                            setNewBusinessType(mapKakaoCategory(item.category_name));
                          }
                          setAddressResults([]);
                        }}
                          style={{ padding: "10px 12px", cursor: "pointer", borderBottom: i < addressResults.length - 1 ? "1px solid var(--border)" : "none", fontSize: 12, transition: "background 0.2s" }}
                          onMouseEnter={e => e.currentTarget.style.background = "var(--surface2)"}
                          onMouseLeave={e => e.currentTarget.style.background = "none"}>
                          <div style={{ fontWeight: 700, color: "var(--text)" }}>{item.place_name || item.address_name}</div>
                          <div style={{ color: "var(--text-muted)", fontSize: 11, marginTop: 2 }}>{item.road_address_name || item.address_name}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* 확인된 주소 및 업종 표시 */}
                {selectedAddress && (
                  <div style={{ background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 12, padding: "12px 14px", display: "flex", flexDirection: "column", gap: 10 }}>
                    <div>
                      <span style={{ fontSize: 10, color: "var(--success)", fontWeight: 700, letterSpacing: 0.5, display: "block", marginBottom: 2 }}>📍 확인된 매장 위치</span>
                      <div style={{ fontSize: 13, fontWeight: 700 }}>{selectedAddress.road_address_name || selectedAddress.address_name}</div>
                    </div>
                    <div>
                      <span style={{ fontSize: 10, color: "var(--purple-text)", fontWeight: 700, letterSpacing: 0.5, display: "block", marginBottom: 2 }}>📂 자동 감지된 업종</span>
                      <div style={{ fontSize: 13, fontWeight: 700 }}>
                        {newBusinessType === "카페/음료" ? "☕ 카페 / 음료" :
                         newBusinessType === "식당/음식점" ? "🍳 식당 / 음식점" :
                         newBusinessType === "편의점/마트" ? "🏪 편의점 / 마트" :
                         newBusinessType === "뷰티/미용" ? "💄 뷰티 / 미용" :
                         newBusinessType === "판매/매장" ? "🛍️ 판매 / 매장" :
                         newBusinessType === "물류/배송" ? "🚚 물류 / 배송" :
                         newBusinessType !== "기타" ? `📂 ${newBusinessType}` :
                         "❓ 기타 업종"}
                      </div>
                    </div>
                  </div>
                )}

                {/* 휴대폰 인증 동의 */}
                <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0" }}>
                  <input type="checkbox" id="phoneCheck" checked={phoneVerified} onChange={e => setPhoneVerified(e.target.checked)}
                    style={{ width: 18, height: 18, cursor: "pointer" }} />
                  <label htmlFor="phoneCheck" style={{ fontSize: 13, cursor: "pointer", color: "var(--text-sub)" }}>
                    📱 휴대폰 본인 신원 인증 동의 (10초 인증)
                  </label>
                </div>

                {/* 계좌 인증 */}
                <div>
                  <label style={{ fontSize: 13, fontWeight: 700, display: "block", marginBottom: 6 }}>💰 급여 지급 정산 계좌 연동 *</label>
                  <div style={{ display: "flex", gap: 8, marginBottom: 6 }}>
                    <select value={bankName} onChange={e => setBankName(e.target.value)}
                      style={{ width: 110, background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 12, padding: "12px 6px", color: "var(--text)", fontSize: 13, outline: "none" }}>
                      {BANK_OPTIONS.map(b => <option key={b} value={b}>{b}</option>)}
                    </select>
                    <input type="text" value={accountNum} onChange={e => setAccountNum(e.target.value)} placeholder="계좌번호 입력 (숫자만)"
                      style={{ flex: 1, background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 12, padding: "12px", color: "var(--text)", fontSize: 13, outline: "none", boxSizing: "border-box" }} />
                    <button type="button" onClick={verifyAccount}
                      style={{ background: accountVerified ? "var(--success)" : "var(--surface2)", border: "none", color: accountVerified ? "#fff" : "var(--text)", borderRadius: 12, padding: "0 12px", fontSize: 12, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}>
                      {accountVerified ? "인증완료" : "1원 인증"}
                    </button>
                  </div>
                  {accountVerified && (
                    <span style={{ fontSize: 11, color: "var(--success)" }}>예금주: {verifiedName} (신원 대조 완료)</span>
                  )}
                </div>

              </div>
            )}

            {/* 2단계: 대타 구인 상세 조건 입력 */}
            {step === "form" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                
                {/* 상점 정보 확인 */}
                <div style={{ background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 12, padding: "12px 14px" }}>
                  <span style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 700, letterSpacing: 1, display: "block", marginBottom: 6 }}>SELECTED SHOP</span>
                  {myShops.length > 0 ? (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                      {myShops.map(s => {
                        const isSelected = shopInfo?.id === s.id;
                        return (
                          <button key={s.id} type="button" onClick={() => {
                            setShopInfo({
                              id: s.id,
                              businessName: s.business_name || "",
                              businessType: s.business_type || "기타",
                              region: s.region || "",
                              lat: s.lat || 37.5665,
                              lng: s.lng || 126.9780,
                            });
                            if (s.category_id) {
                              setProfileCategoryId(s.category_id);
                            } else {
                              setProfileCategoryId(null);
                            }
                          }}
                            style={{ padding: "8px 14px", borderRadius: 20, border: "none", fontSize: 13, cursor: "pointer", fontWeight: isSelected ? 700 : 400, background: isSelected ? "var(--primary)" : "var(--surface)", color: isSelected ? "#fff" : "var(--text)" }}>
                            {s.business_name} <span style={{ opacity: 0.7, fontSize: 11 }}>({s.region})</span>
                          </button>
                        );
                      })}
                      <button type="button" onClick={() => {
                        setNewBusinessName("");
                        setNewBusinessType("식당/음식점");
                        setAddressQuery("");
                        setAddressResults([]);
                        setSelectedAddress(null);
                        setPhoneVerified(false);
                        setAccountVerified(false);
                        setStep("cert");
                      }}
                        style={{ padding: "8px 14px", borderRadius: 20, border: "1px dashed var(--border)", fontSize: 13, cursor: "pointer", background: "none", color: "var(--text-muted)" }}>
                        ➕ 새 매장 추가
                      </button>
                    </div>
                  ) : (
                    <>
                      <div style={{ fontSize: 15, fontWeight: 900 }}>{shopInfo?.businessName}</div>
                      <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>{shopInfo?.region}</div>
                    </>
                  )}
                </div>

                {/* 대타 일자 */}
                <div>
                  <label style={{ fontSize: 13, fontWeight: 700, display: "block", marginBottom: 6 }}>📅 대타 필요한 날짜 *</label>
                  <input type="date" value={workDate} onChange={e => setWorkDate(e.target.value)} min={todayStr} max={maxDateStr}
                    style={{ width: "100%", boxSizing: "border-box", background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 12, padding: "12px", color: "var(--text)", fontSize: 14, outline: "none" }} />
                  <span style={{ fontSize: 10, color: "var(--text-muted)", display: "block", marginTop: 4 }}>* 대타 구인은 오늘 기준 3일 이내 긴급 일정만 가능합니다.</span>
                </div>

                {/* 근무시간 */}
                <div>
                  <label style={{ fontSize: 13, fontWeight: 700, display: "block", marginBottom: 6 }}>⏰ 근무시간 *</label>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <select value={startHour} onChange={e => setStartHour(e.target.value)}
                      style={{ flex: 1, background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 12, padding: "12px", color: "var(--text)", fontSize: 14, outline: "none" }}>
                      {Array.from({ length: 24 }, (_, i) => <option key={i} value={String(i).padStart(2, "0")}>{String(i).padStart(2, "0")}시</option>)}
                    </select>
                    <select value={startMin} onChange={e => setStartMin(e.target.value)}
                      style={{ width: 64, background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 12, padding: "12px 6px", color: "var(--text)", fontSize: 14, outline: "none" }}>
                      <option value="00">00분</option><option value="30">30분</option>
                    </select>
                    <span style={{ color: "var(--text-muted)" }}>~</span>
                    <select value={endHour} onChange={e => setEndHour(e.target.value)}
                      style={{ flex: 1, background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 12, padding: "12px", color: "var(--text)", fontSize: 14, outline: "none" }}>
                      {Array.from({ length: 24 }, (_, i) => <option key={i} value={String(i).padStart(2, "0")}>{String(i).padStart(2, "0")}시</option>)}
                    </select>
                    <select value={endMin} onChange={e => setEndMin(e.target.value)}
                      style={{ width: 64, background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 12, padding: "12px 6px", color: "var(--text)", fontSize: 14, outline: "none" }}>
                      <option value="00">00분</option><option value="30">30분</option>
                    </select>
                  </div>
                </div>

                {/* 제시 시급 */}
                <div>
                  <label style={{ fontSize: 13, fontWeight: 700, display: "block", marginBottom: 6 }}>💰 제시 시급 *</label>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <input type="number" value={wage} onChange={e => { setWage(e.target.value); setWageTouched(true); }}
                      style={{ flex: 1, background: "var(--surface2)", border: wageHint ? "1px solid var(--warning-border)" : "1px solid var(--border)", borderRadius: 12, padding: "12px 16px", color: "var(--text)", fontSize: 14, outline: "none", boxSizing: "border-box" }} />
                    <span style={{ color: "var(--text-muted)", fontSize: 14 }}>원/시간</span>
                  </div>
                  {wageHint && (
                    <span style={{ fontSize: 11, color: "var(--warning)", fontWeight: 700, display: "block", marginTop: 4 }}>{wageHint}</span>
                  )}
                  <span style={{ fontSize: 10, color: "var(--text-muted)", display: "block", marginTop: 4 }}>* 최저시급({minWage.toLocaleString()}원) 이상. 급한 대타일수록 할증 시급이 매칭율을 크게 높여요.</span>
                </div>

                {/* 업종 및 담당 업무 선택 */}
                <div>
                  <label style={{ fontSize: 13, fontWeight: 700, display: "block", marginBottom: 8 }}>📂 업종 선택 *</label>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: selectedParent ? 10 : 0 }}>
                    {parentCategories.map(cat => (
                      <button key={cat.id} type="button" onClick={() => { setSelectedParent(cat); setDuty(""); setCustomDuty(""); }}
                        style={{ padding: "6px 12px", borderRadius: 14, border: "none", fontSize: 12, cursor: "pointer", fontWeight: selectedParent?.id === cat.id ? 700 : 400, background: selectedParent?.id === cat.id ? "var(--primary)" : "var(--surface2)", color: selectedParent?.id === cat.id ? "#fff" : "var(--text-muted)", transition: "all 0.15s" }}>
                        {cat.emoji} {cat.name}
                      </button>
                    ))}
                  </div>
                  {selectedParent && (
                    <div style={{ background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 12, padding: 12, marginTop: 10 }}>
                      <p style={{ fontSize: 11, color: "var(--text-muted)", margin: "0 0 8px", fontWeight: 600 }}>{selectedParent.emoji} {selectedParent.name} › 직무 선택</p>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                        {childCategories.filter(c => c.parent_id === selectedParent.id).map(child => (
                          child.name === "직접입력" ? (
                            <div key={child.id} style={{ width: "100%", marginTop: 4 }}>
                              <button type="button" onClick={() => { setDuty("직접입력"); }}
                                style={{ padding: "6px 12px", borderRadius: 14, border: "none", fontSize: 12, cursor: "pointer", fontWeight: duty === "직접입력" ? 700 : 400, background: duty === "직접입력" ? "var(--primary)" : "var(--surface2)", color: duty === "직접입력" ? "#fff" : "var(--text-muted)", marginBottom: duty === "직접입력" ? 8 : 0 }}>
                                ✏️ 직접입력
                              </button>
                              {duty === "직접입력" && (
                                <input type="text" value={customDuty} onChange={e => setCustomDuty(e.target.value)} placeholder="직무명을 입력해 주세요"
                                  style={{ width: "100%", background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 10, padding: "10px 12px", color: "var(--text)", fontSize: 13, outline: "none", boxSizing: "border-box", marginTop: 4 }} />
                              )}
                            </div>
                          ) : (
                            <button key={child.id} type="button" onClick={() => { setDuty(child.name); setCustomDuty(""); }}
                              style={{ padding: "6px 12px", borderRadius: 14, border: "none", fontSize: 12, cursor: "pointer", fontWeight: duty === child.name ? 700 : 400, background: duty === child.name ? "var(--primary)" : "var(--surface2)", color: duty === child.name ? "#fff" : "var(--text-muted)", transition: "all 0.15s" }}>
                              {child.emoji} {child.name}
                            </button>
                          )
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* 필수/우대 자격 요건 선택 */}
                {duty && (
                  <div>
                    <label style={{ fontSize: 13, fontWeight: 700, display: "block", marginBottom: 8 }}>🏅 필수/우대 자격 요건</label>
                    
                    {/* 동적 프리셋 칩 목록 */}
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
                      {[
                        ...credentialsMaster.filter(c => c.category_name === selectedParent?.name && c.duty_name === duty && c.is_mandatory_by_law),
                        ...credentialsMaster.filter(c => c.category_name === selectedParent?.name && c.duty_name === duty && !c.is_mandatory_by_law),
                      ].map(c => {
                          const isSelected = selectedCreds.some(sc => sc.name === c.name);
                          const isMandatory = c.is_mandatory_by_law;
                          return (
                            <button
                              key={c.id || `${c.category_name}_${c.duty_name}_${c.name}`}
                              type="button"
                              onClick={() => {
                                if (isSelected) {
                                  setSelectedCreds(prev => prev.filter(sc => sc.name !== c.name));
                                } else {
                                  setSelectedCreds(prev => [...prev, { id: c.id, name: c.name, is_preset: true }]);
                                }
                              }}
                              style={{
                                padding: "6px 12px",
                                borderRadius: 20,
                                border: isMandatory && !isSelected ? "1px solid var(--danger-border)" : "none",
                                fontSize: 11,
                                cursor: "pointer",
                                fontWeight: isSelected ? 700 : 400,
                                background: isSelected
                                  ? (isMandatory ? "var(--danger)" : "var(--primary)")
                                  : (isMandatory ? "var(--danger-bg)" : "var(--surface2)"),
                                color: isSelected ? "#fff" : (isMandatory ? "var(--danger)" : "var(--text-muted)"),
                                boxShadow: "none",
                                outline: "none",
                                transition: "all 0.15s"
                              }}
                            >
                              {isMandatory && "⚠️ "}{c.name}
                            </button>
                          );
                        })}

                      {/* 인라인 직접입력 칩 */}
                      {showCustomInput ? (
                        <div style={{ position: "relative", display: "inline-block" }}>
                          <input
                            type="text"
                            autoFocus
                            value={customCredInput}
                            onChange={e => {
                              const val = e.target.value;
                              setCustomCredInput(val);
                              if (!val.trim()) {
                                setSuggestions([]);
                                return;
                              }
                              const matched = credentialsMaster.filter(c =>
                                c.category_name === selectedParent?.name &&
                                c.duty_name === duty &&
                                c.name.toLowerCase().includes(val.toLowerCase()) &&
                                !selectedCreds.some(sc => sc.name === c.name)
                              );
                              setSuggestions(matched.slice(0, 5));
                            }}
                            onBlur={() => {
                              setTimeout(() => {
                                if (customCredInput.trim() && !selectedCreds.some(sc => sc.name === customCredInput.trim())) {
                                  const presetMatch = credentialsMaster.find(c => c.category_name === selectedParent?.name && c.duty_name === duty && c.name === customCredInput.trim());
                                  setSelectedCreds(prev => [...prev, { id: presetMatch ? presetMatch.id : null, name: customCredInput.trim(), is_preset: !!presetMatch }]);
                                }
                                setCustomCredInput("");
                                setSuggestions([]);
                                setShowCustomInput(false);
                              }, 200);
                            }}
                            onKeyDown={e => {
                              if (e.key === "Enter") {
                                if (customCredInput.trim() && !selectedCreds.some(sc => sc.name === customCredInput.trim())) {
                                  const presetMatch = credentialsMaster.find(c => c.category_name === selectedParent?.name && c.duty_name === duty && c.name === customCredInput.trim());
                                  setSelectedCreds(prev => [...prev, { id: presetMatch ? presetMatch.id : null, name: customCredInput.trim(), is_preset: !!presetMatch }]);
                                }
                                setCustomCredInput("");
                                setSuggestions([]);
                                setShowCustomInput(false);
                              }
                            }}
                            placeholder="직접 입력..."
                            style={{
                              padding: "6px 12px",
                              borderRadius: 20,
                              border: "1px solid var(--primary-border)",
                              background: "var(--surface)",
                              color: "var(--text)",
                              fontSize: 11,
                              width: 100,
                              outline: "none"
                            }}
                          />
                          {suggestions.length > 0 && (
                            <div style={{
                              position: "absolute",
                              top: "calc(100% + 4px)",
                              left: 0,
                              width: 180,
                              background: "var(--surface)",
                              border: "1px solid var(--border)",
                              borderRadius: 10,
                              zIndex: 100,
                              overflow: "hidden",
                              boxShadow: "0 8px 24px rgba(0,0,0,0.5)"
                            }}>
                              {suggestions.map((c, i) => (
                                <button
                                  key={c.id || `${c.category_name}_${c.duty_name}_${c.name}`}
                                  type="button"
                                  onMouseDown={() => {
                                    setSelectedCreds(prev => [...prev, { id: c.id, name: c.name, is_preset: true }]);
                                    setCustomCredInput("");
                                    setSuggestions([]);
                                    setShowCustomInput(false);
                                  }}
                                  style={{
                                    width: "100%",
                                    padding: "8px 12px",
                                    background: "none",
                                    border: "none",
                                    borderBottom: i < suggestions.length - 1 ? "1px solid var(--border)" : "none",
                                    textAlign: "left",
                                    cursor: "pointer",
                                    color: "var(--text)",
                                    fontSize: 11,
                                    display: "block"
                                  }}
                                  onMouseEnter={e => e.currentTarget.style.background = "var(--primary-light)"}
                                  onMouseLeave={e => e.currentTarget.style.background = "none"}
                                >
                                  {c.name}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            setShowCustomInput(true);
                            setCustomCredInput("");
                            setSuggestions([]);
                          }}
                          style={{
                            padding: "6px 12px",
                            borderRadius: 20,
                            border: "none",
                            fontSize: 11,
                            cursor: "pointer",
                            fontWeight: 400,
                            background: "var(--surface2)",
                            color: "var(--text-muted)",
                            boxShadow: "none",
                            outline: "none",
                            transition: "all 0.15s"
                          }}
                        >
                          ✏️ 직접입력
                        </button>
                      )}
                    </div>

                    {/* 추가된 직접 입력 칩들 */}
                    {selectedCreds.filter(sc => !sc.is_preset).length > 0 && (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
                        {selectedCreds
                          .filter(sc => !sc.is_preset)
                          .map(sc => (
                            <span
                              key={sc.name}
                              onClick={() => setSelectedCreds(prev => prev.filter(p => p.name !== sc.name))}
                              style={{
                                fontSize: 11,
                                background: "var(--chip-pink-bg)",
                                border: "1px solid var(--chip-pink-border)",
                                color: "var(--pink-text)",
                                padding: "4px 10px",
                                borderRadius: 10,
                                cursor: "pointer"
                              }}
                            >
                              {sc.name} ✕
                            </span>
                          ))}
                      </div>
                    )}
                  </div>
                )}

                {/* 신규(Tier2) 알바생 노출 opt-in — STRATEGY.md §4 */}
                <div style={{ background: "rgba(59,130,246,0.06)", border: "1px solid rgba(59,130,246,0.18)", borderRadius: 14, padding: "12px 14px" }}>
                  <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                    <input type="checkbox" id="allowNewCheck" checked={allowNew} onChange={e => setAllowNew(e.target.checked)}
                      style={{ width: 20, height: 20, cursor: "pointer", marginTop: 2, flexShrink: 0 }} />
                    <div>
                      <label htmlFor="allowNewCheck" style={{ fontSize: 13, fontWeight: 800, color: "#93c5fd", cursor: "pointer", display: "block", marginBottom: 4 }}>
                        🔵 신규 알바생에게도 열기
                      </label>
                      <span style={{ fontSize: 11, color: "var(--text-muted)", lineHeight: 1.5, display: "block" }}>
                        기본은 ✅검증된 인력(팀 이력·대타 이력 보유)에게 먼저 공개돼요. 체크하면 검증 인력이 응답하지 않을 때 신규 알바생에게도 순차 공개됩니다.
                      </span>
                    </div>
                  </div>
                </div>

                {/* 안심 보장 수수료 옵션 */}
                <div style={{ background: "rgba(236,72,153,0.06)", border: "1px solid rgba(236,72,153,0.15)", borderRadius: 14, padding: "12px 14px", marginTop: 4 }}>
                  <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                    <input type="checkbox" id="secureCheck" checked={secureOption} onChange={e => setSecureOption(e.target.checked)}
                      style={{ width: 20, height: 20, cursor: "pointer", marginTop: 2, flexShrink: 0 }} />
                    <div>
                      <label htmlFor="secureCheck" style={{ fontSize: 13, fontWeight: 800, color: "var(--pink-text)", cursor: "pointer", display: "block", marginBottom: 4 }}>
                        🛡️ 노쇼 안심 보장 수수료 가입 (건당 3,000원)
                      </label>
                      <span style={{ fontSize: 11, color: "var(--text-muted)", lineHeight: 1.5, display: "block" }}>
                        체크 시 공고에 [안심보장 🛡️] 마크가 표시되어 매칭률이 3배 급상승합니다. 알바생이 노쇼할 경우 플랫폼이 위로금(일당 전액 환불 및 쿠폰)을 보장합니다.
                      </span>
                    </div>
                  </div>
                </div>

                {/* 패널티 규정 동의 고지 */}
                <p style={{ fontSize: 10, color: "var(--text-muted)", lineHeight: 1.4, margin: "4px 0 0" }}>
                  ※ 파잡 대타 매칭은 민법상 적법한 근로계약 성립의 청약 행위입니다. 매칭 성사 후 사장님의 사유로 일방 취소(해고 등) 시 위약금이 부과되거나 서비스 영구 정지 처리가 될 수 있습니다.
                </p>

              </div>
            )}

            {errMsg && (
              <p style={{ color: "var(--danger)", fontSize: 13, fontWeight: 700, textAlign: "center", margin: 0 }}>🚨 {errMsg}</p>
            )}

            {/* 하단 버튼 */}
            <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
              {step === "form" && !hasProfile && (
                <button type="button" onClick={() => setStep("cert")} style={{ flex: 1, padding: "14px", background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 16, color: "var(--text)", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
                  이전
                </button>
              )}
              {step === "cert" && myShops.length > 0 && (
                <button type="button" onClick={() => {
                  setStep("form");
                  // Restore to the first active shop
                  const firstShop = myShops[0];
                  if (firstShop) {
                    setShopInfo({
                      id: firstShop.id,
                      businessName: firstShop.business_name || "",
                      businessType: firstShop.business_type || "기타",
                      region: firstShop.region || "",
                      lat: firstShop.lat || 37.5665,
                      lng: firstShop.lng || 126.9780,
                    });
                    if (firstShop.category_id) {
                      setProfileCategoryId(firstShop.category_id);
                    } else {
                      setProfileCategoryId(null);
                    }
                  }
                }} style={{ flex: 1, padding: "14px", background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 16, color: "var(--text)", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
                  취소
                </button>
              )}
              <button type="button" onClick={handleRegister} disabled={saving}
                style={{ flex: 2, padding: "14px", background: "var(--primary)", border: "none", borderRadius: 16, color: "#fff", fontSize: 14, fontWeight: 800, cursor: "pointer", boxShadow: "var(--shadow-elevate)" }}>
                {saving ? "등록 중..." : step === "cert" ? "매장 등록 및 다음으로 →" : "대타 긴급 등록하기 🚀"}
              </button>
            </div>
            
            {ToastUI}
          </div>
        )}

      </div>
    </div>
  );
}
