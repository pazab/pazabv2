"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import DONG_DATA from "@/lib/dongData";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { Suspense } from "react";
import { cardStyle, btnPrimary, btnSecondary, toggleTrack, toggleThumb } from "@/lib/styles";
import ImageCropperModal from "@/components/ImageCropperModal";
import { REGIONS } from "@/lib/regions";

const MIN_WAGE = 10030;
const WORK_DAYS = ["평일", "주말", "평일+주말", "협의 가능"];
const WORK_TIMES = ["오전 (06~12시)", "오후 (12~18시)", "저녁 (18~22시)", "야간 (22~06시)", "시간 협의"];

interface Category {
  id: string;
  parent_id: string | null;
  name: string;
  emoji: string;
  sort_order: number;
}

function WorkerProfileContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isEdit = searchParams.get("edit") === "true";
  const isNew = searchParams.get("new") === "true";
  const profileId = searchParams.get("profileId") || ""; // 수정할 공고 id
  const returnTo = searchParams.get("return") || "explore";
  const sectionParam = searchParams.get("section") || "";

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [step, setStep] = useState(1);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [isPublic, setIsPublic] = useState(true);

  // 카테고리
  const [parentCategories, setParentCategories] = useState<Category[]>([]);
  const [childCategories, setChildCategories] = useState<Category[]>([]);
  const [selectedParents, setSelectedParents] = useState<string[]>([]); // 선택된 대분류 ids
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<string[]>([]); // 선택된 소분류 ids
  const [customCategories, setCustomCategories] = useState<string[]>([]); // 직접입력
  const [customInput, setCustomInput] = useState("");

  // 지역
  const [sido, setSido] = useState("");
  const [gugun, setGugun] = useState("");
  const [dong, setDong] = useState("");
  const [regionSearch, setRegionSearch] = useState("");
  const [regionSuggestions, setRegionSuggestions] = useState<string[]>([]);

  // 동 목록 (시/도+구/군 기준 로컬 필터)
  const dongList = useMemo(() => {
    if (!sido || !gugun) return [];
    return DONG_DATA[`${sido} ${gugun}`] || [];
  }, [sido, gugun]);

  // 근무 조건
  const [minWage, setMinWage] = useState(String(MIN_WAGE));
  const [selectedDays, setSelectedDays] = useState<string[]>([]);
  const [hasExperience, setHasExperience] = useState<boolean | null>(null);
  const [experienceMonths, setExperienceMonths] = useState("0");
  const [availableNow, setAvailableNow] = useState<boolean | null>(null);
  const [workType, setWorkType] = useState<"단기" | "장기" | "무관">("무관");
  const [bio, setBio] = useState("");
  const [wageNegotiable, setWageNegotiable] = useState(false);
  const [workHours, setWorkHours] = useState("협의 가능");
  const [workStartHour, setWorkStartHour] = useState<number | null>(null);
  const [workEndHour, setWorkEndHour] = useState<number | null>(null);
  const [workStartMin, setWorkStartMin] = useState<number>(0);
  const [workEndMin, setWorkEndMin] = useState<number>(0);
  const [timeMode, setTimeMode] = useState<"preset" | "custom" | "negotiable">("negotiable");
  const [userId, setUserId] = useState<string | null>(null);
  const [imageUrls, setImageUrls] = useState<string[]>([]);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoUploading, setVideoUploading] = useState(false);
  const [imageUploading, setImageUploading] = useState(false);
  const [cropperOpen, setCropperOpen] = useState(false);

  // 자격 요건 마스터 및 보유 리스트 상태
  const [credentialsMaster, setCredentialsMaster] = useState<any[]>([]);
  const [selectedCreds, setSelectedCreds] = useState<any[]>([]);
  const [customCredInput, setCustomCredInput] = useState("");
  const [showCustomInput, setShowCustomInput] = useState(false);
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [tempImageSrc, setTempImageSrc] = useState<string | null>(null);
  const [originalFileName, setOriginalFileName] = useState("");
  const [originalUserId, setOriginalUserId] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<string | null>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.type.startsWith("video/")) {
      if (videoUrl) {
        setError("동영상은 최대 1개만 업로드할 수 있어요. 기존 동영상을 삭제한 후 다시 시도해주세요.");
        e.target.value = "";
        return;
      }
      if (file.size > 100 * 1024 * 1024) {
        setError("동영상 크기는 최대 100MB까지 가능해요.");
        e.target.value = "";
        return;
      }
      const ext = file.name.split(".").pop()?.toLowerCase();
      if (ext !== "mp4" && ext !== "mov") {
        setError("mp4 또는 mov 형식의 동영상만 업로드할 수 있어요.");
        e.target.value = "";
        return;
      }

      setVideoUploading(true);
      setError("");
      try {
        const path = `worker/videos/${userId}_${Date.now()}.${ext}`;
        const { error: uploadError } = await supabase.storage.from("media").upload(path, file, { upsert: true });
        if (uploadError) {
          setError("동영상 업로드 실패: " + uploadError.message);
        } else {
          const { data } = supabase.storage.from("media").getPublicUrl(path);
          setVideoUrl(data.publicUrl);
        }
      } catch (err) {
        setError("동영상 업로드 중 오류가 발생했습니다.");
      } finally {
        setVideoUploading(false);
      }
    } else if (file.type.startsWith("image/")) {
      if (imageUrls.length >= 10) {
        setError("사진은 최대 10장까지 업로드할 수 있어요.");
        e.target.value = "";
        return;
      }
      setOriginalFileName(file.name);
      const reader = new FileReader();
      reader.onload = () => { setTempImageSrc(reader.result as string); setCropperOpen(true); };
      reader.readAsDataURL(file);
    } else {
      setError("이미지 또는 동영상 파일만 업로드할 수 있어요.");
    }
    e.target.value = "";
  };

  const handleCropComplete = async (croppedBlob: Blob) => {
    if (!userId) return;
    setCropperOpen(false);
    setImageUploading(true);

    const ext = originalFileName.split(".").pop() || "jpg";
    const path = `worker/${userId}_${Date.now()}.${ext}`;
    const file = new File([croppedBlob], `profile.${ext}`, { type: "image/jpeg" });

    const { error } = await supabase.storage.from("media").upload(path, file, { upsert: true });
    if (!error) {
      const { data } = supabase.storage.from("media").getPublicUrl(path);
      const newUrl = `${data.publicUrl}?t=${Date.now()}`;
      setImageUrls(prev => [...prev.slice(0, 9), newUrl]);
    }
    setImageUploading(false);
    setTempImageSrc(null);
  };

  useEffect(() => {
    loadCategories();
    checkAuth();
  }, []);

  const loadCategories = async () => {
    const { data } = await supabase.from("job_categories").select("*").order("sort_order");
    if (data) {
      setParentCategories(data.filter(c => !c.parent_id));
      setChildCategories(data.filter(c => c.parent_id));
    }
  };

  const checkAuth = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { router.push("/login"); return; }
    setUserId(session.user.id);

    // 하이드레이션 딜레이 및 클로저 갇힘 방지를 위해 window.location에서 직접 최신 파라미터 조회
    const currentParams = new URLSearchParams(window.location.search);
    const currIsEdit = currentParams.get("edit") === "true";
    const currIsNew = currentParams.get("new") === "true";
    const currProfileId = currentParams.get("profileId") || "";
    const currReturnTo = currentParams.get("return") || "explore";
    const currSectionParam = currentParams.get("section") || "";

    const decodedReturn = currReturnTo ? decodeURIComponent(currReturnTo) : "";
    if (currIsNew || (decodedReturn.startsWith("/") && !decodedReturn.includes("mypage"))) {
      // 신규 등록 시 users.region으로 희망지역 자동채움
      const { data: userData } = await supabase.from("users")
        .select("region").eq("id", session.user.id).maybeSingle();
      if (userData?.region) {
        const parts = userData.region.split(" ");
        setSido(parts[0] || "");
        setGugun(parts[1] || "");
        setRegionSearch(userData.region);
      }
      setLoading(false);
      return;
    }

    // profileId 있으면 해당 공고 로드, 없으면 첫 번째
    const query = supabase.from("worker_profiles").select("*").eq("user_id", session.user.id);
    const { data } = currProfileId
      ? await query.eq("id", currProfileId).maybeSingle()
      : await query.order("created_at", { ascending: false }).limit(1).maybeSingle();

    if (data) {
      const parts = (data.desired_region || "").split(" ");
      setSido(parts[0] || "");
      setGugun(parts[1] || "");
      setDong(parts.slice(2).join(" ") || "");
      if (data.desired_region) setRegionSearch(data.desired_region);
      setMinWage(String(data.desired_wage || MIN_WAGE));
      setSelectedDays(data.work_days ? data.work_days.split(",") : []);

      setHasExperience(data.experience === "있음");
      setExperienceMonths(String(data.experience_months || 0));
      setAvailableNow(data.available_now ?? null);
      setWorkType(data.work_type || "무관");
      setBio(data.bio || "");
      setWageNegotiable(data.wage_negotiable || false);
      setIsPublic(data.is_public !== false);
      setImageUrls(data.image_urls || (data.image_url ? [data.image_url] : []));
      setVideoUrl(data.video_url || null);
      setSelectedCreds(data.credentials || []);
      
      const wh = data.work_hours || "협의 가능";
      setWorkHours(wh);
      setWorkStartHour(data.work_start_hour ?? null);
      setWorkEndHour(data.work_end_hour ?? null);
      setWorkStartMin(data.work_start_min ?? 0);
      setWorkEndMin(data.work_end_min ?? 0);
      if (data.work_start_hour != null && data.work_end_hour != null) {
        const isPreset = ["오전 (06~12시)", "오후 (12~18시)", "저녁 (18~22시)", "야간 (22~06시)"].includes(wh);
        setTimeMode(isPreset ? "preset" : "custom");
      } else {
        setTimeMode("negotiable");
      }

      // 카테고리 복원
      if (data.category_ids?.length) {
        setSelectedCategoryIds(data.category_ids);
        // 소분류 → 대분류 역추적해서 selectedParents도 복원
        const { data: cats } = await supabase.from("job_categories").select("*");
        if (cats) {
          const children = cats.filter((c: any) => c.parent_id);
          const parentIds = [...new Set(
            data.category_ids.map((id: string) => {
              const child = children.find((c: any) => c.id === id);
              return child?.parent_id;
            }).filter(Boolean)
          )];
          setSelectedParents(parentIds as string[]);
        }
      }
      if (data.custom_categories?.length) setCustomCategories(data.custom_categories);

      // 기존 desired_type 호환 (카테고리 없으면 텍스트로 표시)
      if (!data.category_ids?.length && data.desired_type) {
        setCustomCategories(data.desired_type.split(","));
      }

      if (!currIsEdit && !currReturnTo.startsWith("%2F") && !currReturnTo.startsWith("/")) {
        router.replace(
          currReturnTo === "mypage" ? `/mypage${currSectionParam ? `?section=${currSectionParam}` : ""}` :
          currReturnTo === "interview" ? "/interview" :
          "/explore?type=worker"
        );
        return;
      }
    }

    // 자격요건 마스터 데이터 로드
    const { data: creds } = await supabase.from("job_credentials").select("*").order("is_mandatory_by_law", { ascending: false });
    if (creds) setCredentialsMaster(creds);

    setLoading(false);
  };

  const getChildCats = (parentId: string) => childCategories.filter(c => c.parent_id === parentId);

  const toggleParent = (parentId: string) => {
    setSelectedParents(prev =>
      prev.includes(parentId) ? prev.filter(id => id !== parentId) : [...prev, parentId]
    );
  };

  const toggleCategory = (catId: string) => {
    setSelectedCategoryIds(prev =>
      prev.includes(catId) ? prev.filter(id => id !== catId) : [...prev, catId]
    );
  };

  const addCustom = () => {
    if (!customInput.trim()) return;
    setCustomCategories(prev => [...prev, customInput.trim()]);
    setCustomInput("");
  };

  const handleSave = async () => {
    if (!sido || !gugun) { setError("시/도와 구/군을 선택해주세요"); return; }
    if (selectedCategoryIds.length === 0 && customCategories.length === 0) { setError("희망 직종을 선택해주세요"); return; }
    if (selectedCategoryIds.length === 0 && customCategories.length === 0) {
      setError("희망 직종을 선택해주세요"); return;
    }

    setSaving(true); setError("");

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    const wageNum = Math.max(parseInt(minWage) || MIN_WAGE, MIN_WAGE);
    const region = [sido, gugun, dong.trim()].filter(Boolean).join(" ");

    // 주소 → 좌표 변환 (카카오 API)
    let resolvedLat: number | null = null;
    let resolvedLng: number | null = null;
    if (region) {
      try {
        const kakaoKey = process.env.NEXT_PUBLIC_KAKAO_REST_API_KEY;
        if (kakaoKey) {
          const res = await fetch(
            `https://dapi.kakao.com/v2/local/search/address.json?query=${encodeURIComponent(region)}`,
            { headers: { Authorization: `KakaoAK ${kakaoKey}` } }
          );
          const json = await res.json();
          const doc = json.documents?.[0];
          if (doc) {
            resolvedLat = parseFloat(doc.y);
            resolvedLng = parseFloat(doc.x);
          }
        }
      } catch {
        // 좌표 실패해도 저장은 계속 진행
      }
    }

    const getInterviewResult = () => {
      const r = localStorage.getItem("interview_result_advanced_worker") || localStorage.getItem("interview_result_basic_worker");
      return r ? JSON.parse(r) : null;
    };
    const interviewResult = getInterviewResult();

    // desired_type 호환용 텍스트 생성 - 대분류 이름으로 저장
    const selectedParentNames = [...new Set(
      selectedCategoryIds.map(id => {
        const child = childCategories.find(c => c.id === id);
        if (!child) return "";
        const parent = parentCategories.find(p => p.id === child.parent_id);
        return parent ? parent.name : child.name;
      }).filter(Boolean)
    )];
    const desiredType = [...selectedParentNames, ...customCategories].join(",");

    const formattedWorkHours = workStartHour != null && workEndHour != null
      ? `${String(workStartHour).padStart(2,"0")}:${String(workStartMin).padStart(2,"0")}~${String(workEndHour).padStart(2,"0")}:${String(workEndMin).padStart(2,"0")}`
      : workHours || "협의 가능";

    // profileId 기준으로 조회 (user_id 필터 없음 — admin이 남의 공고 수정해도 소유권 유지)
    const { data: existing } = profileId
      ? await supabase.from("worker_profiles").select("id, user_id").eq("id", profileId).maybeSingle()
      : await supabase.from("worker_profiles").select("id, user_id").eq("user_id", session.user.id).order("created_at", { ascending: false }).limit(1).maybeSingle();

    const profileData: any = {
      desired_region: region,
      lat: resolvedLat,
      lng: resolvedLng,
      desired_wage: wageNum,
      wage_negotiable: wageNegotiable,
      work_days: selectedDays.length > 0 ? selectedDays.join(",") : "협의 가능",
      work_hours: formattedWorkHours,
      work_start_hour: workStartHour,
      work_end_hour: workEndHour,
      work_start_min: workStartMin,
      work_end_min: workEndMin,
      desired_type: desiredType,
      category_ids: selectedCategoryIds,
      custom_categories: customCategories,
      experience: hasExperience ? "있음" : "없음",
      experience_months: parseInt(experienceMonths) || 0,
      available_now: availableNow || false,
      is_long_term: workType === "장기",
      work_type: workType,
      bio: bio.trim(),
      worker_type: interviewResult?.personalityType || null,
      big5_data: interviewResult?.big5 || null,
      is_public: isPublic,
      image_url: imageUrls[0] || null,
      image_urls: imageUrls,
      video_url: videoUrl || null,
      credentials: selectedCreds,
    };

    if (!existing || isNew) {
      // 새 공고: 항상 현재 세션 유저 소유
      profileData.user_id = session.user.id;
    }
    // 기존 공고 수정: user_id는 건드리지 않음 (소유권 유지)

    let saveError;
    if (existing && !isNew) {
      // 기존 공고 수정 - id로
      const { error } = await supabase.from("worker_profiles").update(profileData).eq("id", existing.id);
      saveError = error;
    } else {
      // 새 공고 추가
      const { error } = await supabase.from("worker_profiles").insert({ ...profileData, job_status: "active" });
      saveError = error;
    }

    if (saveError) { setError("저장 중 오류: " + saveError.message); setSaving(false); return; }

    await supabase.from("users").update({ profile_completed: true }).eq("id", session.user.id);
    setSuccess(true);
    const mypageUrl = `/mypage${sectionParam ? `?section=${sectionParam}` : ""}`;
    const decodedReturn = returnTo ? decodeURIComponent(returnTo) : "";
    setTimeout(() => router.push(
      returnTo === "mypage" ? mypageUrl :
      returnTo === "interview" ? "/interview" :
      returnTo === "result" ? "/result?type=worker&level=1" :
      decodedReturn.startsWith("/") ? decodedReturn :
      "/explore?type=worker"
    ), 1500);
  };

  if (loading) return (
    <main style={{ minHeight: "100vh", background: "var(--bg)", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <p style={{ color: "var(--text-muted)" }}>불러오는 중...</p>
    </main>
  );

  return (
    <main style={{ minHeight: "100vh", background: "var(--bg)", color: "var(--text)", paddingBottom: 100 }}>
      {/* 헤더 */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 16px", borderBottom: "1px solid var(--border)", position: "sticky", top: 0, background: "rgba(24,24,27,0.97)", backdropFilter: "blur(12px)", zIndex: 10 }}>
        <button onClick={() => router.back()} style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", padding: 4 }}>
          <i className="ti ti-arrow-left" style={{ fontSize: 20, display: "block" }} aria-hidden="true" />
        </button>
        <span style={{ fontSize: 16, fontWeight: 700 }}>{isEdit ? "알바 조건 수정" : "알바 조건 입력"}</span>
      </div>

      <div style={{ maxWidth: 480, margin: "0 auto", padding: "24px 16px" }}>
        {success ? (
          <div style={{ textAlign: "center", padding: "60px 0" }}>
            <div style={{ fontSize: 56, marginBottom: 16 }}>✅</div>
            <h2 style={{ fontSize: 22, fontWeight: 900, margin: "0 0 8px" }}>저장됐어요!</h2>
            <p style={{ color: "var(--text-muted)", fontSize: 14 }}>잠시 후 이동합니다</p>
          </div>
        ) : (
          <>
            {/* 진행 바 */}
            <div style={{ marginBottom: 24 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                <span style={{ fontSize: 12, color: "var(--text-muted)" }}>Step {step}/2</span>
                <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{step === 1 ? "희망 직종 & 지역" : "근무 조건"}</span>
              </div>
              <div style={{ background: "var(--surface2)", borderRadius: 4, height: 4 }}>
                <div style={{ background: "linear-gradient(90deg, #8b5cf6, #ec4899)", height: 4, borderRadius: 4, width: `${(step / 2) * 100}%`, transition: "width 0.3s" }} />
              </div>
            </div>

            {step === 1 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                {/* 희망 직종 */}
                <div>
                  <label style={{ fontSize: 14, fontWeight: 700, display: "block", marginBottom: 10 }}>
                    💼 희망 직종 <span style={{ color: "#c4b5fd" }}>*</span>
                    <span style={{ fontSize: 11, color: "var(--text-muted)", marginLeft: 8 }}>여러 개 선택 가능</span>
                  </label>

                  {/* 대분류 */}
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
                    {parentCategories.map(cat => (
                      <button key={cat.id} onClick={() => toggleParent(cat.id)}
                        style={{ padding: "8px 14px", borderRadius: 20, fontSize: 13, cursor: "pointer", border: "none", background: selectedParents.includes(cat.id) ? "linear-gradient(135deg, #8b5cf6, #7c3aed)" : "var(--surface2)", color: selectedParents.includes(cat.id) ? "#fff" : "var(--text-muted)", fontWeight: selectedParents.includes(cat.id) ? 700 : 400 }}>
                        {cat.emoji} {cat.name}
                      </button>
                    ))}
                  </div>

                  {/* 선택된 대분류의 소분류 */}
                  {selectedParents.map(parentId => {
                    const parent = parentCategories.find(c => c.id === parentId);
                    const children = getChildCats(parentId);
                    if (!parent) return null;
                    return (
                      <div key={parentId} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14, padding: 14, marginBottom: 8 }}>
                        <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "0 0 10px", fontWeight: 600 }}>
                          {parent.emoji} {parent.name} › 직무
                        </p>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                          {children.map(child => (
                            child.name === "직접입력" ? (
                              <div key={child.id} style={{ width: "100%" }}>
                                <div style={{ display: "flex", gap: 8 }}>
                                  <input type="text" value={customInput}
                                    onChange={e => setCustomInput(e.target.value)}
                                    onKeyDown={e => e.key === "Enter" && addCustom()}
                                    placeholder="직종명 입력 후 Enter"
                                    style={{ flex: 1, background: "var(--surface2)", border: "1px solid var(--primary-border)", borderRadius: 10, padding: "8px 12px", color: "var(--text)", fontSize: 12, outline: "none" }} />
                                  <button onClick={addCustom}
                                    style={{ background: "var(--primary-light)", border: "1px solid var(--primary-border)", color: "#c4b5fd", fontSize: 12, padding: "8px 12px", borderRadius: 10, cursor: "pointer" }}>
                                    추가
                                  </button>
                                </div>
                                {customCategories.length > 0 && (
                                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
                                    {customCategories.map(c => (
                                      <span key={c} style={{ background: "var(--primary-light)", border: "1px solid var(--primary-border)", color: "#c4b5fd", fontSize: 11, padding: "4px 10px", borderRadius: 20, display: "flex", alignItems: "center", gap: 4 }}>
                                        {c}
                                        <button onClick={() => setCustomCategories(prev => prev.filter(x => x !== c))}
                                          style={{ background: "none", border: "none", color: "#c4b5fd", cursor: "pointer", fontSize: 12, padding: 0 }}>×</button>
                                      </span>
                                    ))}
                                  </div>
                                )}
                              </div>
                            ) : (
                              <button key={child.id} onClick={() => toggleCategory(child.id)}
                                style={{ padding: "6px 12px", borderRadius: 20, fontSize: 12, cursor: "pointer", border: "none", background: selectedCategoryIds.includes(child.id) ? "linear-gradient(135deg, #8b5cf6, #7c3aed)" : "var(--surface2)", color: selectedCategoryIds.includes(child.id) ? "#fff" : "var(--text-muted)" }}>
                                {child.emoji} {child.name}
                              </button>
                            )
                          ))}
                        </div>
                      </div>
                    );
                  })}

                  {/* 선택 요약 */}
                  {(selectedCategoryIds.length > 0 || customCategories.length > 0) && (
                    <div style={{ background: "rgba(139,92,246,0.1)", border: "1px solid var(--primary-border)", borderRadius: 12, padding: "10px 14px", marginTop: 8 }}>
                      <p style={{ fontSize: 11, color: "var(--text-muted)", margin: "0 0 6px" }}>선택된 직종</p>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                        {selectedCategoryIds.map(id => {
                          const cat = childCategories.find(c => c.id === id);
                          return cat ? (
                            <span key={id} style={{ fontSize: 11, background: "var(--primary-light)", color: "#c4b5fd", padding: "3px 8px", borderRadius: 20 }}>
                              {cat.emoji} {cat.name}
                            </span>
                          ) : null;
                        })}
                        {customCategories.map(c => (
                          <span key={c} style={{ fontSize: 11, background: "var(--primary-light)", color: "#c4b5fd", padding: "3px 8px", borderRadius: 20 }}>✏️ {c}</span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* 희망 지역 */}
                <div>
                  <label style={{ fontSize: 14, fontWeight: 700, display: "block", marginBottom: 8 }}>📍 희망 지역 <span style={{ color: "#c4b5fd" }}>*</span></label>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {/* 시/도 */}
                    <select value={sido} onChange={e => { setSido(e.target.value); setGugun(""); setDong(""); setRegionSearch(""); setRegionSuggestions([]); }}
                      style={{ width: "100%", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "12px 16px", color: sido ? "var(--text)" : "var(--text-muted)", fontSize: 14, outline: "none" }}>
                      <option value="">시/도 선택 *</option>
                      {Object.keys(REGIONS).map(s => <option key={s} value={s}>{s}</option>)}
                    </select>

                    {/* 구/군 */}
                    {sido && (
                      <select value={gugun} onChange={e => { setGugun(e.target.value); setDong(""); setRegionSearch(""); setRegionSuggestions([]); }}
                        style={{ width: "100%", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "12px 16px", color: gugun ? "var(--text)" : "var(--text-muted)", fontSize: 14, outline: "none" }}>
                        <option value="">구/군 선택 *</option>
                        {REGIONS[sido]?.map(g => <option key={g} value={g}>{g}</option>)}
                      </select>
                    )}

                    {/* 동/읍/면 자동완성 */}
                    {gugun && (
                      <div style={{ position: "relative" }}>
                        <div style={{ display: "flex", alignItems: "center", background: "var(--surface)", border: `1px solid ${dong ? "var(--primary)" : "var(--border)"}`, borderRadius: 12, padding: "12px 16px", gap: 8 }}>
                          <input
                            value={regionSearch}
                            onChange={e => {
                              const v = e.target.value;
                              setRegionSearch(v);
                              setDong("");
                              if (!v.trim()) { setRegionSuggestions([]); return; }
                              const filtered = dongList.filter(d => d.includes(v));
                              setRegionSuggestions(filtered.slice(0, 8));
                            }}
                            placeholder={dongList.length > 0 ? `동/읍/면 검색 — 선택사항 (${dongList.length}개)` : "동/읍/면 입력"}
                            style={{ flex: 1, background: "none", border: "none", outline: "none", color: "var(--text)", fontSize: 14 }}
                          />
                          {regionSearch && (
                            <button onClick={() => { setRegionSearch(""); setDong(""); setRegionSuggestions([]); }}
                              style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: 13, padding: 0, flexShrink: 0 }}>✕</button>
                          )}
                        </div>

                        {/* 자동완성 드롭다운 */}
                        {regionSuggestions.length > 0 && (
                          <div style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, zIndex: 50, overflow: "hidden", boxShadow: "0 8px 24px rgba(0,0,0,0.4)" }}>
                            {regionSuggestions.map((d, i) => (
                              <button key={d} onClick={() => { setDong(d); setRegionSearch(d); setRegionSuggestions([]); }}
                                style={{ width: "100%", padding: "11px 16px", background: "none", border: "none", borderBottom: i < regionSuggestions.length - 1 ? "1px solid var(--border)" : "none", textAlign: "left", cursor: "pointer", color: "var(--text)", fontSize: 14 }}>
                                {d}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                <button onClick={() => {
                  if (!sido || !gugun) { setError("시/도와 구/군을 선택해주세요"); return; }
                  if (selectedCategoryIds.length === 0 && customCategories.length === 0) { setError("희망 직종을 선택해주세요"); return; }
                  setError(""); setStep(2);
                }}
                  style={{ ...btnPrimary, fontSize: 16 }}>
                  다음 →
                </button>
                {error && <p style={{ color: "#f87171", fontSize: 13, textAlign: "center" }}>{error}</p>}
              </div>
            )}

            {step === 2 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

                {/* 프로필 미디어 등록 (통합) */}
                <div>
                  <label style={{ fontSize: 14, fontWeight: 700, display: "block", marginBottom: 8 }}>
                    📸 프로필 미디어 <span style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 400 }}>(사진 최대 10장, 영상 1개, 권장 3:2 비율)</span>
                  </label>
                  
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 12 }}>
                    {/* 동영상 썸네일 */}
                    {videoUrl && (
                      <div style={{ position: "relative", width: 90, height: 90, borderRadius: 12, overflow: "hidden", border: "1px solid var(--border)", background: "#000" }}>
                        <video src={videoUrl} muted style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                        <span style={{ position: "absolute", bottom: 4, left: 4, background: "rgba(139,92,246,0.9)", color: "#fff", fontSize: 9, padding: "2px 5px", borderRadius: 4, fontWeight: 700 }}>🎥 영상</span>
                        <button onClick={(e) => { e.preventDefault(); setVideoUrl(null); }}
                          style={{ position: "absolute", top: 4, right: 4, background: "rgba(0,0,0,0.6)", border: "none", color: "#f87171", width: 20, height: 20, borderRadius: "50%", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, padding: 0 }}>
                          ✕
                        </button>
                      </div>
                    )}

                    {/* 이미지 썸네일들 */}
                    {imageUrls.map((url, index) => (
                      <div key={url} style={{ position: "relative", width: 90, height: 90, borderRadius: 12, overflow: "hidden", border: "1px solid var(--border)", background: "var(--surface2)" }}>
                        <img src={url} alt={`프로필사진 ${index + 1}`} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                        <button onClick={(e) => { e.preventDefault(); setImageUrls(prev => prev.filter((_, i) => i !== index)); }}
                          style={{ position: "absolute", top: 4, right: 4, background: "rgba(0,0,0,0.6)", border: "none", color: "#f87171", width: 20, height: 20, borderRadius: "50%", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, padding: 0 }}>
                          ✕
                        </button>
                      </div>
                    ))}

                    {/* 추가 버튼 */}
                    {(imageUrls.length < 10 || !videoUrl) && (
                      <label style={{ cursor: "pointer" }}>
                        <input type="file" accept="image/*,video/mp4,video/quicktime" style={{ display: "none" }} onChange={handleFileChange} />
                        <div style={{ width: 90, height: 90, borderRadius: 12, border: "2px dashed var(--border)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "var(--surface2)", gap: 4 }}>
                          {imageUploading || videoUploading ? (
                            <span style={{ fontSize: 10, color: "var(--text-muted)", textAlign: "center" }}>업로드 중...</span>
                          ) : (
                            <>
                              <span style={{ fontSize: 20 }}>+</span>
                              <span style={{ fontSize: 10, color: "var(--text-muted)" }}>미디어 추가</span>
                            </>
                          )}
                        </div>
                      </label>
                    )}
                  </div>
                </div>

                {/* 한줄 자기소개 */}
                <div>
                  <label style={{ fontSize: 14, fontWeight: 700, display: "block", marginBottom: 8 }}>✏️ 한줄 자기소개 <span style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 400 }}>선택</span></label>
                  <input type="text" value={bio} onChange={e => setBio(e.target.value.slice(0, 50))}
                    placeholder="예: 성실하고 빠르게 배워요! 장기 근무 원해요 😊"
                    style={{ width: "100%", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "12px 16px", color: "var(--text)", fontSize: 14, outline: "none", boxSizing: "border-box" }} />
                  <p style={{ fontSize: 11, color: "var(--text-muted)", margin: "4px 0 0", textAlign: "right" }}>{bio.length}/50</p>
                </div>

                {/* 근무 가능 요일 */}
                <div>
                  <label style={{ fontSize: 14, fontWeight: 700, display: "block", marginBottom: 10 }}>📅 근무 가능 요일 <span style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 400 }}>선택</span></label>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                    {["월","화","수","목","금","토","일"].map(d => (
                      <button key={d} onClick={() => {
                        const next = selectedDays.includes(d)
                          ? selectedDays.filter(x => x !== d)
                          : [...selectedDays.filter(x => x !== "협의"), d];
                        setSelectedDays(["월","화","수","목","금","토","일"].filter(x => next.includes(x)));
                      }}
                        style={{ width: 40, height: 40, borderRadius: 12, fontSize: 13, cursor: "pointer", border: "none", fontWeight: 700, background: selectedDays.includes(d) ? "linear-gradient(135deg, #8b5cf6, #7c3aed)" : "var(--surface2)", color: selectedDays.includes(d) ? "#fff" : "var(--text-muted)" }}>
                        {d}
                      </button>
                    ))}
                  </div>
                  {/* 협의가능 토글 - 요일과 함께 선택 가능 */}
                  <button onClick={() => {
                    if (selectedDays.includes("협의")) {
                      setSelectedDays(selectedDays.filter(x => x !== "협의"));
                    } else {
                      setSelectedDays([...selectedDays, "협의"]);
                    }
                  }}
                    style={{ marginTop: 8, padding: "6px 14px", borderRadius: 20, fontSize: 12, cursor: "pointer", background: selectedDays.includes("협의") ? "var(--primary-light)" : "var(--surface2)", color: selectedDays.includes("협의") ? "#c4b5fd" : "var(--text-muted)", border: selectedDays.includes("협의") ? "1px solid var(--primary-border)" : "1px solid transparent" }}>
                    💬 협의 가능 {selectedDays.includes("협의") ? "✓" : ""}
                  </button>
                  {selectedDays.length > 0 && (
                    <p style={{ fontSize: 11, color: "var(--text-muted)", margin: "6px 0 0" }}>
                      선택: {selectedDays.join(", ")}
                    </p>
                  )}
                </div>

                {/* 선호 근무시간 */}
                <div>
                  <label style={{ fontSize: 14, fontWeight: 700, display: "block", marginBottom: 10 }}>⏰ 선호 근무시간</label>
                  <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap" }}>
                    {[
                      { label: "시간 협의", mode: "negotiable", hStart: null, hEnd: null },
                      { label: "오전 (6~12시)", mode: "preset", hStart: 6, hEnd: 12 },
                      { label: "오후 (12~18시)", mode: "preset", hStart: 12, hEnd: 18 },
                      { label: "저녁 (18~22시)", mode: "preset", hStart: 18, hEnd: 22 },
                      { label: "야간 (22~06시)", mode: "preset", hStart: 22, hEnd: 6 },
                      { label: "직접 입력", mode: "custom", hStart: 9, hEnd: 18 },
                    ].map(opt => {
                      const isSelected = opt.mode === "negotiable" ? timeMode === "negotiable" :
                                         opt.mode === "custom" ? timeMode === "custom" :
                                         timeMode === "preset" && workHours.startsWith(opt.label.split(" ")[0]);
                      return (
                        <button key={opt.label} type="button" onClick={() => {
                          setTimeMode(opt.mode as any);
                          if (opt.mode === "negotiable") {
                            setWorkHours("협의 가능");
                            setWorkStartHour(null);
                            setWorkEndHour(null);
                          } else if (opt.mode === "preset") {
                            setWorkHours(opt.label);
                            setWorkStartHour(opt.hStart);
                            setWorkEndHour(opt.hEnd);
                            setWorkStartMin(0);
                            setWorkEndMin(0);
                          } else {
                            setWorkHours("");
                            setWorkStartHour(9);
                            setWorkEndHour(18);
                            setWorkStartMin(0);
                            setWorkEndMin(0);
                          }
                        }}
                          style={{ padding: "6px 12px", borderRadius: 20, fontSize: 12, cursor: "pointer", border: "none", fontWeight: isSelected ? 700 : 400,
                            background: isSelected ? "linear-gradient(135deg, #8b5cf6, #7c3aed)" : "var(--surface2)",
                            color: isSelected ? "#fff" : "var(--text-muted)" }}>
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>

                  {timeMode === "custom" && (
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10 }}>
                      <div style={{ flex: 1 }}>
                        <p style={{ fontSize: 11, color: "var(--text-muted)", margin: "0 0 4px" }}>시작</p>
                        <div style={{ display: "flex", gap: 4 }}>
                          <select value={workStartHour ?? 9} onChange={e => setWorkStartHour(Number(e.target.value))}
                            style={{ flex: 1, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "10px 8px", color: "var(--text)", fontSize: 13, outline: "none" }}>
                            {Array.from({ length: 24 }, (_, i) => (
                              <option key={i} value={i}>{String(i).padStart(2,"0")}시</option>
                            ))}
                          </select>
                          <select value={workStartMin} onChange={e => setWorkStartMin(Number(e.target.value))}
                            style={{ width: 64, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "10px 8px", color: "var(--text)", fontSize: 13, outline: "none" }}>
                            <option value={0}>00분</option>
                            <option value={30}>30분</option>
                          </select>
                        </div>
                      </div>
                      <span style={{ color: "var(--text-muted)", fontSize: 18, paddingTop: 18 }}>~</span>
                      <div style={{ flex: 1 }}>
                        <p style={{ fontSize: 11, color: "var(--text-muted)", margin: "0 0 4px" }}>종료</p>
                        <div style={{ display: "flex", gap: 4 }}>
                          <select value={workEndHour ?? 18} onChange={e => setWorkEndHour(Number(e.target.value))}
                            style={{ flex: 1, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "10px 8px", color: "var(--text)", fontSize: 13, outline: "none" }}>
                            {Array.from({ length: 24 }, (_, i) => (
                              <option key={i} value={i}>{String(i).padStart(2,"0")}시</option>
                            ))}
                          </select>
                          <select value={workEndMin} onChange={e => setWorkEndMin(Number(e.target.value))}
                            style={{ width: 64, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "10px 8px", color: "var(--text)", fontSize: 13, outline: "none" }}>
                            <option value={0}>00분</option>
                            <option value={30}>30분</option>
                          </select>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* 희망 시급 */}
                <div>
                  <label style={{ fontSize: 14, fontWeight: 700, display: "block", marginBottom: 8 }}>
                    💰 희망 시급
                    <span style={{ fontSize: 11, color: "var(--text-muted)", marginLeft: 8, fontWeight: 400 }}>최저 {MIN_WAGE.toLocaleString()}원 이상</span>
                  </label>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                    <input type="number" value={minWage} onChange={e => setMinWage(e.target.value)}
                      style={{ flex: 1, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "12px 16px", color: "var(--text)", fontSize: 14, outline: "none" }} />
                    <span style={{ color: "var(--text-muted)", fontSize: 14, flexShrink: 0 }}>원 이상</span>
                  </div>
                  <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                    {[MIN_WAGE, 11000, 12000, 13000].map(w => (
                      <button key={w} onClick={() => setMinWage(String(w))}
                        style={{ flex: 1, padding: "7px", borderRadius: 10, fontSize: 11, cursor: "pointer", border: "none", background: parseInt(minWage) === w ? "linear-gradient(135deg, #8b5cf6, #7c3aed)" : "var(--surface2)", color: parseInt(minWage) === w ? "#fff" : "var(--text-muted)" }}>
                        {w.toLocaleString()}
                      </button>
                    ))}
                  </div>
                  <button onClick={() => setWageNegotiable(!wageNegotiable)}
                    style={{ padding: "6px 14px", borderRadius: 20, fontSize: 12, cursor: "pointer", background: wageNegotiable ? "var(--primary-light)" : "var(--surface2)", color: wageNegotiable ? "#c4b5fd" : "var(--text-muted)", border: wageNegotiable ? "1px solid var(--primary-border)" : "1px solid transparent" }}>
                    💬 협의 가능 {wageNegotiable ? "✓" : ""}
                  </button>
                </div>

                {/* 근무 기간 */}
                <div>
                  <label style={{ fontSize: 14, fontWeight: 700, display: "block", marginBottom: 10 }}>📆 근무 기간</label>
                  <div style={{ display: "flex", gap: 8 }}>
                    {(["단기", "장기", "무관"] as const).map(t => (
                      <button key={t} onClick={() => setWorkType(t)}
                        style={{ flex: 1, padding: "10px", borderRadius: 12, fontSize: 13, cursor: "pointer", border: "none", fontWeight: 600, background: workType === t ? "linear-gradient(135deg, #8b5cf6, #7c3aed)" : "var(--surface2)", color: workType === t ? "#fff" : "var(--text-muted)" }}>
                        {t === "단기" ? "⚡ 단기" : t === "장기" ? "🌿 장기" : "🤝 무관"}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 즉시 가능 */}
                <div>
                  <label style={{ fontSize: 14, fontWeight: 700, display: "block", marginBottom: 10 }}>⚡ 즉시 근무 가능</label>
                  <div style={{ display: "flex", gap: 8 }}>
                    {[{ label: "네, 바로 가능해요", value: true }, { label: "협의 필요해요", value: false }].map(o => (
                      <button key={String(o.value)} onClick={() => setAvailableNow(o.value)}
                        style={{ flex: 1, padding: "10px", borderRadius: 12, fontSize: 13, cursor: "pointer", border: "none", fontWeight: 600, background: availableNow === o.value ? "linear-gradient(135deg, #8b5cf6, #7c3aed)" : "var(--surface2)", color: availableNow === o.value ? "#fff" : "var(--text-muted)" }}>
                        {o.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 경력 */}
                <div>
                  <label style={{ fontSize: 14, fontWeight: 700, display: "block", marginBottom: 10 }}>💼 알바 경력</label>
                  <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                    <button onClick={() => setHasExperience(false)}
                      style={{ flex: 1, padding: "10px", borderRadius: 12, fontSize: 13, cursor: "pointer", border: "none", fontWeight: 600, background: hasExperience === false ? "linear-gradient(135deg, #8b5cf6, #7c3aed)" : "var(--surface2)", color: hasExperience === false ? "#fff" : "var(--text-muted)" }}>
                      없음 (처음이에요)
                    </button>
                    <button onClick={() => setHasExperience(true)}
                      style={{ flex: 1, padding: "10px", borderRadius: 12, fontSize: 13, cursor: "pointer", border: "none", fontWeight: 600, background: hasExperience === true ? "linear-gradient(135deg, #8b5cf6, #7c3aed)" : "var(--surface2)", color: hasExperience === true ? "#fff" : "var(--text-muted)" }}>
                      있음
                    </button>
                  </div>
                  {hasExperience && (
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <input type="number" value={experienceMonths} onChange={e => setExperienceMonths(e.target.value)}
                        placeholder="몇 개월"
                        style={{ flex: 1, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "12px 16px", color: "var(--text)", fontSize: 14, outline: "none" }} />
                      <span style={{ color: "var(--text-muted)", fontSize: 14 }}>개월</span>
                    </div>
                  )}
                </div>

                {/* 자격 요건 / 보유 기술 등록 */}
                {selectedCategoryIds.length > 0 && (
                  <div>
                    <label style={{ fontSize: 14, fontWeight: 700, display: "block", marginBottom: 8 }}>🏅 보유 자격증 및 실무기술</label>
                    <p style={{ fontSize: 11, color: "var(--text-muted)", margin: "0 0 12px" }}>선택하신 직무와 매핑되는 보유 자격 요건들을 체크해 주세요!</p>
 
                    {/* 선택된 각 소분류 직무별 루프 */}
                    {selectedCategoryIds.map(catId => {
                      const child = childCategories.find(c => c.id === catId);
                      if (!child) return null;

                      const parent = parentCategories.find(p => p.id === child.parent_id);
                      const parentName = parent?.name || "";

                      // 이 직무(소분류)에 매핑되는 자격 요건들
                      const childCreds = [
                        ...credentialsMaster.filter(c => c.category_name === parentName && c.duty_name === child.name && c.is_mandatory_by_law),
                        ...credentialsMaster.filter(c => c.category_name === parentName && c.duty_name === child.name && !c.is_mandatory_by_law),
                      ];

                      return (
                        <div key={catId} style={{ marginBottom: 14 }}>
                          <p style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.85)", margin: "0 0 6px" }}>
                            {child.emoji} {child.name} 보유 기술/자격
                          </p>
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
                            {childCreds.map(c => {
                              const isSelected = selectedCreds.some(sc => sc.name === c.name);
                              const isMandatory = c.is_mandatory_by_law;
                              return (
                                <button
                                  key={c.id}
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
                                    border: "none",
                                    fontSize: 11,
                                    cursor: "pointer",
                                    fontWeight: isSelected ? 700 : 400,
                                    background: isSelected
                                      ? (isMandatory ? "linear-gradient(135deg, #db2777, #ec4899)" : "linear-gradient(135deg, #8b5cf6, #7c3aed)")
                                      : (isMandatory ? "rgba(236,72,153,0.15)" : "var(--surface2)"),
                                    color: isSelected ? "#fff" : (isMandatory ? "#fbcfe8" : "var(--text-muted)"),
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
                                      c.category_name === parentName &&
                                      c.duty_name === child.name &&
                                      c.name.toLowerCase().includes(val.toLowerCase()) &&
                                      !selectedCreds.some(sc => sc.name === c.name)
                                    );
                                    setSuggestions(matched.slice(0, 5));
                                  }}
                                  onBlur={() => {
                                    setTimeout(() => {
                                      if (customCredInput.trim() && !selectedCreds.some(sc => sc.name === customCredInput.trim())) {
                                        const presetMatch = credentialsMaster.find(c => c.category_name === parentName && c.duty_name === child.name && c.name === customCredInput.trim());
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
                                        const presetMatch = credentialsMaster.find(c => c.category_name === parentName && c.duty_name === child.name && c.name === customCredInput.trim());
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
                                    border: "1px solid #c4b5fd",
                                    background: "var(--surface)",
                                    color: "#fff",
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
                                    background: "#1e1e24",
                                    border: "1px solid var(--border)",
                                    borderRadius: 10,
                                    zIndex: 100,
                                    overflow: "hidden",
                                    boxShadow: "0 8px 24px rgba(0,0,0,0.5)"
                                  }}>
                                    {suggestions.map((c, i) => (
                                      <button
                                        key={c.id}
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
                                          borderBottom: i < suggestions.length - 1 ? "1px solid rgba(255,255,255,0.05)" : "none",
                                          textAlign: "left",
                                          cursor: "pointer",
                                          color: "#fff",
                                          fontSize: 11,
                                          display: "block"
                                        }}
                                        onMouseEnter={e => e.currentTarget.style.background = "rgba(139,92,246,0.1)"}
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
                        </div>
                      );
                    })}

                    {/* 직접 입력한 칩 토글/삭제 */}
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
                                background: "rgba(236,72,153,0.1)",
                                border: "1px solid rgba(236,72,153,0.3)",
                                color: "#fbcfe8",
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

                {/* 공개 여부 */}
                <div style={{ ...cardStyle }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <p style={{ fontSize: 14, fontWeight: 700, margin: "0 0 2px" }}>구직 공개</p>
                      <p style={{ fontSize: 12, color: "var(--text-muted)", margin: 0 }}>
                        {isPublic ? "사장님들이 내 프로필을 볼 수 있어요" : "내 프로필이 숨겨져 있어요"}
                      </p>
                    </div>
                    <div onClick={() => setIsPublic(!isPublic)} style={toggleTrack(isPublic)}>
                      <div style={toggleThumb(isPublic)} />
                    </div>
                  </div>
                </div>

                {error && <p style={{ color: "#f87171", fontSize: 13, textAlign: "center" }}>{error}</p>}

                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={() => setStep(1)}
                    style={{ ...btnSecondary, flex: 1 }}>
                    ← 이전
                  </button>
                  <button onClick={handleSave} disabled={saving}
                    style={{ ...btnPrimary, flex: 2, opacity: saving ? 0.7 : 1 }}>
                    {saving ? "저장 중..." : "저장하기 ✓"}
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
      {cropperOpen && tempImageSrc && (
        <ImageCropperModal
          imageSrc={tempImageSrc}
          onCrop={handleCropComplete}
          onClose={() => {
            setCropperOpen(false);
            setTempImageSrc(null);
          }}
        />
      )}
    </main>
  );
}

export default function WorkerProfile() {
  return (
    <Suspense fallback={
      <div style={{ minHeight: "100vh", background: "var(--bg)", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <p style={{ color: "var(--text-muted)" }}>불러오는 중...</p>
      </div>
    }>
      <WorkerProfileContent />
    </Suspense>
  );
}
