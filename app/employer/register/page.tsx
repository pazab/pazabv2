"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { Suspense } from "react";
import dynamic from "next/dynamic";
import ImageCropperModal from "@/components/ImageCropperModal";

const MapComponent = dynamic(() => import("@/components/MapComponent"), { ssr: false });

import { calcWorkPay } from "@/lib/utils";
import { cardStyle, cardGradientStyle, btnPrimary, btnSecondary } from "@/lib/styles";

const MIN_WAGE = 10030;
const WORK_DAYS_OPTIONS = ["평일", "주말", "평일+주말", "협의"];
const PRESET_TAGS = ["즉시채용", "장기우대", "교육제공", "식사제공", "야간알바", "주말알바", "단기알바", "혼자근무", "팀근무", "주차가능"];
const REGIONS: Record<string, string[]> = {
  "서울": ["강남구","강동구","강북구","강서구","관악구","광진구","구로구","금천구","노원구","도봉구","동대문구","동작구","마포구","서대문구","서초구","성동구","성북구","송파구","양천구","영등포구","용산구","은평구","종로구","중구","중랑구"],
  "경기": ["고양시","과천시","광명시","광주시","구리시","군포시","김포시","남양주시","동두천시","부천시","성남시","수원시","시흥시","안산시","안성시","안양시","양주시","여주시","오산시","용인시","의왕시","의정부시","이천시","파주시","평택시","포천시","하남시","화성시"],
  "인천": ["계양구","남동구","동구","미추홀구","부평구","서구","연수구","중구","강화군","옹진군"],
  "부산": ["강서구","금정구","기장군","남구","동구","동래구","부산진구","북구","사상구","사하구","서구","수영구","연제구","영도구","중구","해운대구"],
  "대구": ["군위군","남구","달서구","달성군","동구","북구","서구","수성구","중구"],
  "대전": ["대덕구","동구","서구","유성구","중구"],
  "광주": ["광산구","남구","동구","북구","서구"],
  "울산": ["남구","동구","북구","울주군","중구"],
  "세종": ["세종시"],
  "강원": ["강릉시","고성군","동해시","삼척시","속초시","양구군","양양군","영월군","원주시","인제군","정선군","철원군","춘천시","태백시","평창군","홍천군","화천군","횡성군"],
  "충북": ["괴산군","단양군","보은군","영동군","옥천군","음성군","제천시","증평군","진천군","청주시","충주시"],
  "충남": ["계룡시","공주시","금산군","논산시","당진시","보령시","부여군","서산시","서천군","아산시","예산군","천안시","청양군","태안군","홍성군"],
  "전북": ["고창군","군산시","김제시","남원시","무주군","부안군","순창군","완주군","익산시","임실군","장수군","전주시","정읍시","진안군"],
  "전남": ["강진군","고흥군","곡성군","광양시","구례군","나주시","담양군","목포시","무안군","보성군","순천시","신안군","여수시","영광군","영암군","완도군","장성군","장흥군","진도군","함평군","해남군","화순군"],
  "경북": ["경산시","경주시","고령군","구미시","김천시","문경시","봉화군","상주시","성주군","안동시","영덕군","영양군","영주시","영천시","예천군","울릉군","울진군","의성군","청도군","청송군","칠곡군","포항시"],
  "경남": ["거제시","거창군","고성군","김해시","남해군","밀양시","사천시","산청군","양산시","의령군","진주시","창녕군","창원시","통영시","하동군","함안군","함양군","합천군"],
  "제주": ["서귀포시","제주시"],
};

interface Category {
  id: string;
  parent_id: string | null;
  name: string;
  emoji: string;
  sort_order: number;
}

type JobType = "regular" | "short" | "urgent";

interface JobForm {
  id?: string;
  businessName: string;
  categoryId: string;
  categoryIds: string[];
  customCategory: string;
  businessType: string;
  sido: string;
  gugun: string;
  addressDetail: string;
  lat: number | null;
  lng: number | null;
  wage: string;
  wageNegotiable: boolean;
  workDays: string;
  daysNegotiable: boolean;
  workHours: string;
  workStartHour: number | null;
  workEndHour: number | null;
  selectedTags: string[];
  staffCount: string;
  mealProvided: boolean;
  parking: boolean;
  breakHours: number;
  weeklyHoliday: string;
  isUrgent: boolean;
  expiresAt: string;
  jobType: JobType;
  workStartDate: string;
  workEndDate: string;
}

const emptyForm = (): JobForm => ({
  businessName: "", categoryId: "", categoryIds: [], customCategory: "", businessType: "",
  sido: "", gugun: "", addressDetail: "", lat: null, lng: null,
  wage: String(MIN_WAGE), wageNegotiable: false, workDays: "", daysNegotiable: false, workHours: "", workStartHour: null, workEndHour: null,
  selectedTags: [], staffCount: "1", mealProvided: false, parking: false,
  breakHours: 0.5, weeklyHoliday: "일",
  isUrgent: false, expiresAt: "",
  jobType: "regular", workStartDate: "", workEndDate: "",
});

const parseWorkHours = (workHoursStr: string) => {
  const clean = (workHoursStr || "").split("(")[0].trim();
  const breakMatch = (workHoursStr || "").match(/휴게\s*(\d+(\.\d+)?|반)시간|휴게\s*(\d+)분/);
  let breakHours = 0.5;
  if (breakMatch) {
    if (breakMatch[3]) breakHours = parseInt(breakMatch[3]) / 60;
    else if (breakMatch[1]) breakHours = breakMatch[1] === "반" ? 0.5 : parseFloat(breakMatch[1]);
  }
  const holidayMatch = (workHoursStr || "").match(/주휴일\s*:\s*([가-힣a-zA-Z]+)/);
  const weeklyHoliday = holidayMatch ? holidayMatch[1] : "일";
  return { clean, breakHours, weeklyHoliday };
};

const JOB_TYPE_OPTIONS: { key: JobType; label: string; emoji: string; desc: string }[] = [
  { key: "regular", label: "정기채용", emoji: "📋", desc: "장기/반복 근무자 모집 (14일 공고)" },
  { key: "short",   label: "단기급구", emoji: "📅", desc: "특정 날짜 N일 근무 (공고 자동 만료)" },
  { key: "urgent",  label: "긴급대타", emoji: "🚨", desc: "당일~3일 이내 즉시 필요 (7일 공고)" },
];

function EmployerRegisterContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isEdit = searchParams.get("edit") === "true";
  const editId = searchParams.get("jobId");
  const returnTo = searchParams.get("return") || "explore";

  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [newProfileId, setNewProfileId] = useState("");
  const [step, setStep] = useState(1);
  const [imageUrls, setImageUrls] = useState<string[]>([]);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoUploading, setVideoUploading] = useState(false);
  const [imageUploading, setImageUploading] = useState(false);
  const [cropperOpen, setCropperOpen] = useState(false);
  const [tempImageSrc, setTempImageSrc] = useState<string | null>(null);
  const [originalFileName, setOriginalFileName] = useState("");

  // 자격 요건 마스터 및 보유 리스트 상태
  const [credentialsMaster, setCredentialsMaster] = useState<any[]>([]);
  const [selectedCreds, setSelectedCreds] = useState<any[]>([]);
  const [customCredInput, setCustomCredInput] = useState("");
  const [showCustomInput, setShowCustomInput] = useState(false);
  const [suggestions, setSuggestions] = useState<any[]>([]);

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
        const path = `employer/videos/${userId}_${Date.now()}.${ext}`;
        const { error: uploadError } = await supabase.storage.from("avatars").upload(path, file, { upsert: true });
        if (uploadError) {
          setError("동영상 업로드 실패: " + uploadError.message);
        } else {
          const { data } = supabase.storage.from("avatars").getPublicUrl(path);
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
    const path = `employer/${userId}_${Date.now()}.${ext}`;
    const file = new File([croppedBlob], `shop.${ext}`, { type: "image/jpeg" });
    const { error } = await supabase.storage.from("avatars").upload(path, file, { upsert: true });
    if (!error) {
      const { data } = supabase.storage.from("avatars").getPublicUrl(path);
      const newUrl = `${data.publicUrl}?t=${Date.now()}`;
      setImageUrls(prev => [...prev.slice(0, 9), newUrl]);
    }
    setImageUploading(false);
    setTempImageSrc(null);
  };

  const [parentCategories, setParentCategories] = useState<Category[]>([]);
  const [childCategories, setChildCategories] = useState<Category[]>([]);
  const [selectedParent, setSelectedParent] = useState<Category | null>(null);
  const [form, setForm] = useState<JobForm>(emptyForm());
  const [addressToast, setAddressToast] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);

  useEffect(() => { loadCategories(); checkAuth(); }, []);

  const loadCategories = async () => {
    const { data } = await supabase.from("job_categories").select("*").order("sort_order");
    if (data) {
      setParentCategories(data.filter(c => !c.parent_id));
      setChildCategories(data.filter(c => c.parent_id));
    }
    const { data: creds } = await supabase.from("job_credentials").select("*").order("is_mandatory_by_law", { ascending: false });
    if (creds) setCredentialsMaster(creds);
  };

  const checkAuth = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { router.push("/login"); return; }
    setUserId(session.user.id);
    if (isEdit && editId) {
      const { data } = await supabase.from("employer_profiles").select("*").eq("id", editId).single();
      if (data) loadFormFromProfile(data);
    } else if (isEdit && !editId) {
      const { data } = await supabase.from("employer_profiles").select("*").eq("user_id", session.user.id)
        .order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (data) loadFormFromProfile(data);
    }
    setLoading(false);
  };

  const loadFormFromProfile = (profile: any) => {
    const parts = (profile.region || "").split(" ");
    setImageUrls(profile.image_urls || (profile.image_url ? [profile.image_url] : []));
    setVideoUrl(profile.video_url || null);
    const parsed = parseWorkHours(profile.work_hours || "");
    setForm({
      id: profile.id,
      businessName: profile.business_name || "",
      categoryId: profile.category_id || "",
      categoryIds: profile.category_ids || (profile.category_id ? [profile.category_id] : []),
      customCategory: profile.custom_category || "",
      businessType: profile.business_type || "",
      sido: parts[0] || "",
      gugun: parts[1] || "",
      addressDetail: parts.slice(2).join(" "),
      lat: profile.lat || null,
      lng: profile.lng || null,
      wage: String(profile.wage || MIN_WAGE),
      wageNegotiable: profile.wage_negotiable || false,
      workDays: profile.work_days || "",
      daysNegotiable: profile.days_negotiable || false,
      workHours: parsed.clean || "",
      workStartHour: profile.work_start_hour ?? null,
      workEndHour: profile.work_end_hour ?? null,
      selectedTags: Array.isArray(profile.tags) ? profile.tags : [],
      staffCount: String(profile.staff_count || 1),
      mealProvided: profile.meal_provided || false,
      parking: profile.parking || false,
      breakHours: parsed.breakHours,
      weeklyHoliday: parsed.weeklyHoliday,
      isUrgent: profile.is_urgent || false,
      expiresAt: profile.expires_at ? profile.expires_at.split("T")[0] : "",
      jobType: profile.job_type || "regular",
      workStartDate: profile.work_start_date || "",
      workEndDate: profile.work_end_date || "",
    });
    setSelectedCreds(profile.required_credentials || []);
    if (profile.category_id) {
      supabase.from("job_categories").select("*").eq("id", profile.category_id).single()
        .then(({ data: cat }) => {
          if (cat?.parent_id) {
            supabase.from("job_categories").select("*").eq("id", cat.parent_id).single()
              .then(({ data: parent }) => { if (parent) setSelectedParent(parent); });
          } else if (cat) setSelectedParent(cat);
        });
    }
  };

  const updateForm = (key: keyof JobForm, value: any) => {
    setForm(prev => ({ ...prev, [key]: value }));
  };

  const getInterviewResult = () => {
    try {
      const advanced = localStorage.getItem("interview_result_advanced_employer");
      const basic = localStorage.getItem("interview_result_basic_employer");
      return advanced ? JSON.parse(advanced) : basic ? JSON.parse(basic) : null;
    } catch { return null; }
  };

  const geocodeAddress = async (fullAddress: string) => {
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(fullAddress)}&format=json&limit=1`,
        { headers: { "Accept-Language": "ko" } }
      );
      const data = await res.json();
      if (data.length > 0) {
        updateForm("lat", parseFloat(data[0].lat));
        updateForm("lng", parseFloat(data[0].lon));
        setAddressToast("✓ 주소가 저장됐어요!");
        setTimeout(() => setAddressToast(""), 2500);
      }
    } catch {}
  };

  const openAddressSearch = () => {
    const loadPostcode = () => {
      new (window as any).daum.Postcode({
        oncomplete: (data: any) => {
          const fullAddress = data.roadAddress || data.jibunAddress;
          const parts = fullAddress.split(" ");
          if (parts[0]) updateForm("sido", parts[0]);
          if (parts[1]) updateForm("gugun", parts[1]);
          updateForm("addressDetail", parts.slice(2).join(" "));
          geocodeAddress(fullAddress);
        }
      }).open();
    };
    if ((window as any).daum?.Postcode) { loadPostcode(); return; }
    const s = document.createElement("script");
    s.src = "//t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js";
    s.onload = loadPostcode;
    document.head.appendChild(s);
  };

  // 공고 유형별 expires_at 자동 계산
  const calcExpiresAt = (): string => {
    if (form.expiresAt) return new Date(form.expiresAt).toISOString();
    if (form.jobType === "short" && form.workEndDate) {
      // 단기: 근무 종료일 다음날 만료
      const d = new Date(form.workEndDate);
      d.setDate(d.getDate() + 1);
      return d.toISOString();
    }
    if (form.jobType === "urgent") return new Date(Date.now() + 7 * 86400000).toISOString();
    return new Date(Date.now() + 14 * 86400000).toISOString();
  };

  const handleSave = async () => {
    if (!form.businessName.trim()) { setError("매장명을 입력해주세요"); return; }
    if (!form.categoryIds.length && !form.categoryId) { setError("업종을 선택해주세요"); return; }
    if (!form.sido) { setError("지역을 선택해주세요"); return; }
    if (parseInt(form.wage) < MIN_WAGE) { setError(`시급은 최저시급 ${MIN_WAGE.toLocaleString()}원 이상이어야 해요`); return; }
    if (!form.workDays && form.jobType === "regular") { setError("근무요일을 선택해주세요"); return; }
    if (form.jobType === "short" && !form.workStartDate) { setError("근무 시작일을 선택해주세요"); return; }
    if (form.jobType === "urgent" && !form.workStartDate) { setError("필요한 날짜를 선택해주세요"); return; }

    setSaving(true); setError("");

    const fullRegion = [form.sido, form.gugun, form.addressDetail].filter(Boolean).join(" ");
    const interviewResult = getInterviewResult();
    const parentCat = selectedParent;
    const businessType = form.customCategory || parentCat?.name || "";

    const { data: userData } = await supabase.from("users").select("employer_bot_knowledge").eq("id", userId).single();
    const existingBotKnowledge = userData?.employer_bot_knowledge || null;

    const hoursPart = form.workStartHour != null && form.workEndHour != null
      ? `${String(form.workStartHour).padStart(2,"0")}:${String((form as any).workStartMin || 0).padStart(2,"0")}~${String(form.workEndHour).padStart(2,"0")}:${String((form as any).workEndMin || 0).padStart(2,"0")}`
      : form.workHours || "협의";
    const breakLabel = form.breakHours === 0 ? "없음" : form.breakHours === 0.5 ? "30분" : `${form.breakHours}시간`;
    const workHoursFormatted = `${hoursPart} (휴게 ${breakLabel}, 주휴일:${form.weeklyHoliday}요일)`;

    // 긴급대타는 is_urgent 자동 true
    const isUrgent = form.isUrgent || form.jobType === "urgent";

    const profileData: any = {
      business_name: form.businessName.trim(),
      business_type: businessType,
      category_id: form.categoryIds[0] || form.categoryId || null,
      category_ids: form.categoryIds.length ? form.categoryIds : (form.categoryId ? [form.categoryId] : []),
      custom_category: form.customCategory || null,
      region: fullRegion,
      wage: parseInt(form.wage),
      wage_negotiable: form.wageNegotiable,
      work_days: form.workDays || "협의",
      days_negotiable: form.daysNegotiable,
      work_hours: workHoursFormatted,
      work_start_hour: form.workStartHour,
      work_end_hour: form.workEndHour,
      tags: form.selectedTags,
      staff_count: parseInt(form.staffCount) || 1,
      meal_provided: form.mealProvided,
      parking: form.parking,
      is_active: true,
      employer_type: interviewResult?.personalityType || null,
      bio5_data: interviewResult?.big5 || null,
      hexaco_data: interviewResult?.hexaco || null,
      tagline: interviewResult?.tagline || null,
      best_matches: interviewResult?.bestMatches || null,
      worst_matches: interviewResult?.worstMatches || null,
      caution: interviewResult?.caution || null,
      analyzed_mbti: interviewResult?.analyzedMbti || null,
      address_detail: form.addressDetail,
      lat: form.lat,
      lng: form.lng,
      bot_knowledge: existingBotKnowledge,
      bot_interview_done: !!existingBotKnowledge,
      image_url: imageUrls[0] || null,
      image_urls: imageUrls,
      video_url: videoUrl || null,
      is_urgent: isUrgent,
      expires_at: calcExpiresAt(),
      job_type: form.jobType,
      work_start_date: form.workStartDate || null,
      work_end_date: form.workEndDate || null,
      required_credentials: selectedCreds,
    };

    if (!form.id) {
      profileData.user_id = userId;
    }

    let saveError;
    let newProfId = "";
    if (form.id) {
      const { error } = await supabase.from("employer_profiles").update(profileData).eq("id", form.id);
      saveError = error;
    } else {
      const { data: inserted, error } = await supabase.from("employer_profiles").insert(profileData).select("id").single();
      saveError = error;
      if (inserted) newProfId = inserted.id;
    }

    if (saveError) { setError("저장 중 오류: " + saveError.message); setSaving(false); return; }
    if (newProfId) setNewProfileId(newProfId);
    setSuccess(true);

    if (isEdit) {
      const tabParam = searchParams.get("tab") || "";
      const sectionParam = searchParams.get("section") || "";
      const mypageUrl = `/mypage${tabParam || sectionParam ? `?${tabParam ? `tab=${tabParam}` : ""}${tabParam && sectionParam ? "&" : ""}${sectionParam ? `section=${sectionParam}` : ""}` : ""}`;
      const decodedReturn = returnTo ? decodeURIComponent(returnTo) : "";
      setTimeout(() => router.push(
        returnTo === "mypage" ? mypageUrl :
        returnTo === "interview" ? "/interview" :
        returnTo === "result" ? "/result?type=employer&level=1" :
        decodedReturn.startsWith("/") ? decodedReturn :
        "/mypage?section=jobs"
      ), 2000);
    }
  };

  const getChildCats = (parentId: string) => childCategories.filter(c => c.parent_id === parentId);

  // 오늘 날짜 (date input min)
  const today = new Date().toISOString().split("T")[0];
  // 3일 후 (긴급대타 최대)
  const in3days = new Date(Date.now() + 3 * 86400000).toISOString().split("T")[0];

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
        <span style={{ fontSize: 16, fontWeight: 700 }}>{isEdit ? "공고 수정" : "공고 등록"}</span>
      </div>

      <div style={{ maxWidth: 480, margin: "0 auto", padding: "24px 16px" }}>
        {success ? (
          <div style={{ textAlign: "center", padding: "40px 0" }}>
            <div style={{ fontSize: 56, marginBottom: 16 }}>🎉</div>
            <h2 style={{ fontSize: 22, fontWeight: 900, margin: "0 0 8px" }}>
              {isEdit ? "공고가 수정됐어요!" : "공고가 등록됐어요!"}
            </h2>
            <p style={{ color: "var(--text-muted)", fontSize: 14, marginBottom: 28, lineHeight: 1.6 }}>
              {!isEdit && "매장봇을 설정하면 알바생들의\n궁금증을 24시간 자동으로 답해드려요!"}
            </p>
            {!isEdit && newProfileId && (
              <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: "0 16px" }}>
                <button onClick={() => router.push(`/employer/interview?profileId=${newProfileId}`)} style={{ ...btnPrimary, fontSize: 15 }}>
                  🤖 매장봇 설정하기 (추천)
                </button>
                <button onClick={() => router.push("/mypage?section=jobs")} style={{ ...btnSecondary, fontSize: 14 }}>
                  나중에 하기 → 내 공고로
                </button>
              </div>
            )}
          </div>
        ) : (
          <>
            {/* 진행 바 */}
            <div style={{ marginBottom: 24 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                <span style={{ fontSize: 12, color: "var(--text-muted)" }}>Step {step}/2</span>
                <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{step === 1 ? "기본 정보" : "근무 조건"}</span>
              </div>
              <div style={{ background: "var(--surface2)", borderRadius: 4, height: 4 }}>
                <div style={{ background: "linear-gradient(90deg, #8b5cf6, #ec4899)", height: 4, borderRadius: 4, width: `${(step / 2) * 100}%`, transition: "width 0.3s" }} />
              </div>
            </div>

            {step === 1 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

                {/* 공고 유형 선택 - 맨 위 */}
                <div>
                  <label style={{ fontSize: 14, fontWeight: 700, display: "block", marginBottom: 10 }}>📌 공고 유형 <span style={{ color: "#c4b5fd" }}>*</span></label>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {JOB_TYPE_OPTIONS.map(opt => (
                      <button
                        key={opt.key}
                        onClick={() => {
                          updateForm("jobType", opt.key);
                          // 긴급대타는 isUrgent 자동 on
                          if (opt.key === "urgent") updateForm("isUrgent", true);
                          else if (opt.key === "regular") updateForm("isUrgent", false);
                        }}
                        style={{
                          padding: "12px 14px", borderRadius: 12, border: "none", cursor: "pointer", textAlign: "left",
                          background: form.jobType === opt.key
                            ? opt.key === "urgent" ? "rgba(239,68,68,0.15)" : opt.key === "short" ? "rgba(251,146,60,0.15)" : "rgba(139,92,246,0.15)"
                            : "var(--surface2)",
                          borderLeft: form.jobType === opt.key
                            ? `3px solid ${opt.key === "urgent" ? "#ef4444" : opt.key === "short" ? "#f97316" : "#8b5cf6"}`
                            : "3px solid transparent",
                          transition: "all 0.15s",
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ fontSize: 18 }}>{opt.emoji}</span>
                          <div>
                            <p style={{
                              fontSize: 13, fontWeight: 700, margin: "0 0 2px",
                              color: form.jobType === opt.key
                                ? opt.key === "urgent" ? "#fca5a5" : opt.key === "short" ? "#fdba74" : "#c4b5fd"
                                : "var(--text)",
                            }}>{opt.label}</p>
                            <p style={{ fontSize: 11, color: "var(--text-muted)", margin: 0 }}>{opt.desc}</p>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* 단기/긴급: 날짜 선택 */}
                {(form.jobType === "short" || form.jobType === "urgent") && (
                  <div style={{ ...cardStyle, borderColor: form.jobType === "urgent" ? "rgba(239,68,68,0.3)" : "rgba(251,146,60,0.3)" }}>
                    <p style={{ fontSize: 12, fontWeight: 700, color: form.jobType === "urgent" ? "#fca5a5" : "#fdba74", margin: "0 0 12px" }}>
                      {form.jobType === "urgent" ? "🚨 필요한 날짜" : "📅 근무 기간"}
                    </p>
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <div style={{ flex: 1 }}>
                        <p style={{ fontSize: 11, color: "var(--text-muted)", margin: "0 0 4px" }}>
                          {form.jobType === "urgent" ? "필요일" : "시작일"}
                        </p>
                        <input
                          type="date"
                          value={form.workStartDate}
                          onChange={e => updateForm("workStartDate", e.target.value)}
                          min={today}
                          max={form.jobType === "urgent" ? in3days : undefined}
                          style={{ width: "100%", boxSizing: "border-box", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "10px 12px", color: "var(--text)", fontSize: 13, outline: "none" }}
                        />
                      </div>
                      {form.jobType === "short" && (
                        <>
                          <span style={{ color: "var(--text-muted)", paddingTop: 18 }}>~</span>
                          <div style={{ flex: 1 }}>
                            <p style={{ fontSize: 11, color: "var(--text-muted)", margin: "0 0 4px" }}>종료일</p>
                            <input
                              type="date"
                              value={form.workEndDate}
                              onChange={e => updateForm("workEndDate", e.target.value)}
                              min={form.workStartDate || today}
                              style={{ width: "100%", boxSizing: "border-box", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "10px 12px", color: "var(--text)", fontSize: 13, outline: "none" }}
                            />
                          </div>
                        </>
                      )}
                    </div>
                    {form.jobType === "urgent" && (
                      <p style={{ fontSize: 11, color: "rgba(239,68,68,0.7)", margin: "8px 0 0" }}>* 긴급대타는 오늘부터 3일 이내만 선택 가능해요</p>
                    )}
                    {/* 추가 긴급 토글 (단기+긴급 조합용) */}
                    {form.jobType === "short" && (
                      <button
                        onClick={() => updateForm("isUrgent", !form.isUrgent)}
                        style={{
                          marginTop: 10, padding: "8px 14px", borderRadius: 20, border: "none", cursor: "pointer", fontSize: 12,
                          background: form.isUrgent ? "rgba(239,68,68,0.15)" : "var(--surface2)",
                          color: form.isUrgent ? "#fca5a5" : "var(--text-muted)",
                          fontWeight: form.isUrgent ? 700 : 400,
                        }}
                      >
                        ⚡ 긴급 표시 추가 {form.isUrgent ? "✓" : ""}
                      </button>
                    )}
                  </div>
                )}

                {/* 매장명 */}
                <div style={{ position: "relative" }}>
                  <label style={{ fontSize: 14, fontWeight: 700, display: "block", marginBottom: 8 }}>🏪 매장명 <span style={{ color: "#c4b5fd" }}>*</span></label>
                  <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
                    <button onClick={() => { updateForm("directInput" as any, false); }}
                      style={{ flex: 1, padding: "7px", borderRadius: 10, fontSize: 12, cursor: "pointer", border: "none", background: !(form as any).directInput ? "linear-gradient(135deg, #8b5cf6, #7c3aed)" : "var(--surface2)", color: !(form as any).directInput ? "#fff" : "var(--text-muted)" }}>
                      🔍 검색으로 찾기
                    </button>
                    <button onClick={() => { updateForm("directInput" as any, true); setSearchResults([]); }}
                      style={{ flex: 1, padding: "7px", borderRadius: 10, fontSize: 12, cursor: "pointer", border: "none", background: (form as any).directInput ? "linear-gradient(135deg, #8b5cf6, #7c3aed)" : "var(--surface2)", color: (form as any).directInput ? "#fff" : "var(--text-muted)" }}>
                      ✏️ 직접 입력
                    </button>
                  </div>
                  <input type="text" value={form.businessName}
                    onChange={async e => {
                      updateForm("businessName", e.target.value);
                      if ((form as any).directInput) return;
                      if (e.target.value.length < 2) { setSearchResults([]); return; }
                      try {
                        const res = await fetch(
                          `https://dapi.kakao.com/v2/local/search/keyword.json?query=${encodeURIComponent(e.target.value)}&size=5`,
                          { headers: { Authorization: `KakaoAK 02e1711115a492598ea97b18764fc597` } }
                        );
                        const data = await res.json();
                        setSearchResults(data.documents || []);
                      } catch {}
                    }}
                    placeholder={(form as any).directInput ? "신규 매장명을 직접 입력하세요" : "매장명으로 검색하세요"}
                    style={{ width: "100%", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "12px 16px", color: "var(--text)", fontSize: 14, outline: "none", boxSizing: "border-box" }} />
                  {(form as any).directInput && (
                    <p style={{ fontSize: 11, color: "var(--text-muted)", margin: "6px 0 0" }}>📍 직접입력 시 아래에서 주소를 검색해주세요</p>
                  )}
                  {searchResults.length > 0 && !(form as any).directInput && (
                    <div style={{ position: "absolute", top: "100%", left: 0, right: 0, background: "var(--surface)", border: "1px solid var(--primary-border)", borderRadius: 12, zIndex: 50, overflow: "hidden", boxShadow: "0 8px 24px rgba(0,0,0,0.3)" }}>
                      {searchResults.map((place: any, i: number) => (
                        <button key={i} onClick={() => {
                          updateForm("businessName", place.place_name);
                          setSearchResults([]);
                          const addr = place.road_address_name || place.address_name || "";
                          const parts = addr.split(" ");
                          if (parts[0]) updateForm("sido", parts[0]);
                          if (parts[1]) updateForm("gugun", parts[1]);
                          updateForm("addressDetail", parts.slice(2).join(" "));
                          if (place.x && place.y) {
                            updateForm("lng", parseFloat(place.x));
                            updateForm("lat", parseFloat(place.y));
                            setAddressToast("✓ 주소가 자동으로 입력됐어요!");
                            setTimeout(() => setAddressToast(""), 2500);
                          }
                        }}
                          style={{ width: "100%", background: "none", border: "none", padding: "10px 14px", cursor: "pointer", textAlign: "left", borderBottom: i < searchResults.length - 1 ? "1px solid var(--border)" : "none" }}>
                          <p style={{ fontSize: 13, fontWeight: 600, margin: "0 0 2px", color: "var(--text)" }}>{place.place_name}</p>
                          <p style={{ fontSize: 11, color: "var(--text-muted)", margin: 0 }}>{place.road_address_name || place.address_name}</p>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* 매장 미디어 등록 (통합) */}
                <div>
                  <label style={{ fontSize: 14, fontWeight: 700, display: "block", marginBottom: 8 }}>
                    📸 매장 미디어 <span style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 400 }}>(사진 최대 10장, 영상 1개, 권장 3:2 비율)</span>
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
                        <img src={url} alt={`매장사진 ${index + 1}`} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                        <button onClick={(e) => { e.preventDefault(); setImageUrls(prev => prev.filter((_, i) => i !== index)); }}
                          style={{ position: "absolute", top: 4, right: 4, background: "rgba(0,0,0,0.6)", border: "none", color: "#f87171", width: 20, height: 20, borderRadius: "50%", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, padding: 0 }}>
                          ✕
                        </button>
                      </div>
                    ))}

                    {/* 추가 버튼 (사진 10장 미만이거나 동영상이 없을 때 노출) */}
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

                {/* 업종 선택 */}
                <div>
                  <label style={{ fontSize: 14, fontWeight: 700, display: "block", marginBottom: 10 }}>📂 업종 <span style={{ color: "#c4b5fd" }}>*</span></label>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: selectedParent ? 12 : 0 }}>
                    {parentCategories.map(cat => (
                      <button key={cat.id} onClick={() => { setSelectedParent(cat); updateForm("categoryId", ""); updateForm("customCategory", ""); }}
                        style={{ padding: "8px 14px", borderRadius: 20, fontSize: 13, cursor: "pointer", border: "none", background: selectedParent?.id === cat.id ? "linear-gradient(135deg, #8b5cf6, #7c3aed)" : "var(--surface2)", color: selectedParent?.id === cat.id ? "#fff" : "var(--text-muted)", fontWeight: selectedParent?.id === cat.id ? 700 : 400 }}>
                        {cat.emoji} {cat.name}
                      </button>
                    ))}
                  </div>
                  {selectedParent && (
                    <div style={{ ...cardStyle }}>
                      <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "0 0 10px", fontWeight: 600 }}>{selectedParent.emoji} {selectedParent.name} › 직무 선택</p>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                        {getChildCats(selectedParent.id).map(child => (
                          child.name === "직접입력" ? (
                            <div key={child.id} style={{ width: "100%", marginTop: 4 }}>
                              <button onClick={() => { const ids = form.categoryIds.includes(child.id) ? form.categoryIds.filter(id => id !== child.id) : [...form.categoryIds, child.id]; updateForm("categoryIds", ids); updateForm("categoryId", ids[0] || ""); }}
                                style={{ padding: "6px 12px", borderRadius: 20, fontSize: 12, cursor: "pointer", border: "none", background: form.categoryIds.includes(child.id) ? "var(--primary-light)" : "var(--surface2)", color: form.categoryIds.includes(child.id) ? "#c4b5fd" : "var(--text-muted)", marginBottom: form.categoryIds.includes(child.id) ? 8 : 0 }}>
                                ✏️ 직접입력
                              </button>
                              {form.categoryIds.includes(child.id) && (
                                <input type="text" value={form.customCategory} onChange={e => updateForm("customCategory", e.target.value)} placeholder="직종명을 입력해주세요"
                                  style={{ width: "100%", background: "var(--surface2)", border: "1px solid var(--primary-border)", borderRadius: 10, padding: "10px 12px", color: "var(--text)", fontSize: 13, outline: "none", boxSizing: "border-box" }} />
                              )}
                            </div>
                          ) : (
                            <button key={child.id} onClick={() => { const ids = form.categoryIds.includes(child.id) ? form.categoryIds.filter(id => id !== child.id) : [...form.categoryIds, child.id]; updateForm("categoryIds", ids); updateForm("categoryId", ids[0] || ""); updateForm("customCategory", ""); }}
                              style={{ padding: "6px 12px", borderRadius: 20, fontSize: 12, cursor: "pointer", border: "none", background: form.categoryIds.includes(child.id) ? "linear-gradient(135deg, #8b5cf6, #7c3aed)" : "var(--surface2)", color: form.categoryIds.includes(child.id) ? "#fff" : "var(--text-muted)" }}>
                              {child.emoji} {child.name}
                            </button>
                          )
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* 필수/우대 자격 요건 선택 */}
                {selectedParent && form.categoryIds.length > 0 && (
                  <div style={{ marginTop: 14, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: 14, padding: 14 }}>
                    <span style={{ fontSize: 10, color: "var(--primary)", fontWeight: 800, letterSpacing: 0.5, display: "block", marginBottom: 8 }}>REQUIRED CREDENTIALS</span>
                    <label style={{ fontSize: 14, fontWeight: 800, display: "block", marginBottom: 12 }}>🏅 관련 자격증 설정</label>
                    
                    {/* 선택된 각 소분류 직무별 루프 */}
                    {form.categoryIds.map(catId => {
                      const child = childCategories.find(c => c.id === catId);
                      if (!child) return null;

                      // 이 직무(소분류)에 해당되는 자격 요건들
                      const childCreds = [
                        ...credentialsMaster.filter(c => c.category_name === selectedParent?.name && c.duty_name === child.name && c.is_mandatory_by_law),
                        ...credentialsMaster.filter(c => c.category_name === selectedParent?.name && c.duty_name === child.name && !c.is_mandatory_by_law),
                      ];

                      return (
                        <div key={catId} style={{ marginBottom: 14 }}>
                          <p style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.85)", margin: "0 0 6px" }}>
                            {child.emoji} {child.name} 관련 조건
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
                                      c.category_name === selectedParent?.name &&
                                      c.duty_name === child.name &&
                                      c.name.toLowerCase().includes(val.toLowerCase()) &&
                                      !selectedCreds.some(sc => sc.name === c.name)
                                    );
                                    setSuggestions(matched.slice(0, 5));
                                  }}
                                  onBlur={() => {
                                    setTimeout(() => {
                                      if (customCredInput.trim() && !selectedCreds.some(sc => sc.name === customCredInput.trim())) {
                                        const presetMatch = credentialsMaster.find(c => c.category_name === selectedParent?.name && c.duty_name === child.name && c.name === customCredInput.trim());
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
                                        const presetMatch = credentialsMaster.find(c => c.category_name === selectedParent?.name && c.duty_name === child.name && c.name === customCredInput.trim());
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

                {/* 위치 */}
                <div>
                  <label style={{ fontSize: 14, fontWeight: 700, display: "block", marginBottom: 8 }}>📍 위치 <span style={{ color: "#c4b5fd" }}>*</span></label>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <select value={form.sido} onChange={e => { updateForm("sido", e.target.value); updateForm("gugun", ""); }}
                      style={{ width: "100%", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "12px 16px", color: form.sido ? "var(--text)" : "var(--text-muted)", fontSize: 14, outline: "none" }}>
                      <option value="">시/도 선택 *</option>
                      {Object.keys(REGIONS).map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                    {form.sido && (
                      <select value={form.gugun} onChange={e => updateForm("gugun", e.target.value)}
                        style={{ width: "100%", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "12px 16px", color: form.gugun ? "var(--text)" : "var(--text-muted)", fontSize: 14, outline: "none" }}>
                        <option value="">구/군 선택</option>
                        {REGIONS[form.sido]?.map(g => <option key={g} value={g}>{g}</option>)}
                      </select>
                    )}
                    <button onClick={openAddressSearch} type="button"
                      style={{ width: "100%", background: "var(--primary-light)", border: "1px solid var(--primary-border)", color: "#c4b5fd", fontWeight: 600, padding: "12px", borderRadius: 12, cursor: "pointer", fontSize: 14 }}>
                      🔍 상세 주소 검색
                    </button>
                    {addressToast && (
                      <div style={{ background: "rgba(34,197,94,0.15)", border: "1px solid rgba(34,197,94,0.3)", borderRadius: 10, padding: "8px 14px", fontSize: 13, color: "#86efac", textAlign: "center" }}>{addressToast}</div>
                    )}
                    {form.lat && form.lng && (
                      <iframe src={`/map.html?lat=${form.lat}&lng=${form.lng}&addr=${encodeURIComponent([form.sido, form.gugun, form.addressDetail].filter(Boolean).join(" "))}`}
                        style={{ width: "100%", height: 180, borderRadius: 12, border: "none" }} />
                    )}
                  </div>
                </div>

                <button onClick={() => {
                  if (!form.businessName.trim()) { setError("매장명을 입력해주세요"); return; }
                  if (!form.categoryIds.length && !form.categoryId) { setError("업종을 선택해주세요"); return; }
                  if (!form.sido) { setError("지역을 선택해주세요"); return; }
                  if ((form.jobType === "short" || form.jobType === "urgent") && !form.workStartDate) {
                    setError(form.jobType === "urgent" ? "필요한 날짜를 선택해주세요" : "근무 시작일을 선택해주세요"); return;
                  }
                  setError(""); setStep(2);
                }} style={{ ...btnPrimary, fontSize: 16 }}>다음 →</button>
                {error && <p style={{ color: "#f87171", fontSize: 13, textAlign: "center" }}>{error}</p>}
              </div>
            )}

            {step === 2 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

                {/* 근무요일 */}
                <div>
                  <label style={{ fontSize: 14, fontWeight: 700, display: "block", marginBottom: 10 }}>
                    📅 근무요일 {form.jobType === "regular" && <span style={{ color: "#c4b5fd" }}>*</span>}
                  </label>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
                    {["월","화","수","목","금","토","일"].map(d => (
                      <button key={d} onClick={() => {
                        const days = form.workDays ? form.workDays.split(",") : [];
                        const next = days.includes(d) ? days.filter(x => x !== d) : [...days, d];
                        const ordered = ["월","화","수","목","금","토","일"].filter(x => next.includes(x));
                        updateForm("workDays", ordered.join(","));
                      }}
                        style={{ width: 40, height: 40, borderRadius: 12, fontSize: 13, cursor: "pointer", border: "none", fontWeight: 700, background: form.workDays?.split(",").includes(d) ? "linear-gradient(135deg, #8b5cf6, #7c3aed)" : "var(--surface2)", color: form.workDays?.split(",").includes(d) ? "#fff" : "var(--text-muted)" }}>
                        {d}
                      </button>
                    ))}
                  </div>
                  <button onClick={() => updateForm("daysNegotiable", !form.daysNegotiable)}
                    style={{ padding: "6px 14px", borderRadius: 20, fontSize: 12, cursor: "pointer", background: form.daysNegotiable ? "var(--primary-light)" : "var(--surface2)", color: form.daysNegotiable ? "#c4b5fd" : "var(--text-muted)", border: form.daysNegotiable ? "1px solid var(--primary-border)" : "1px solid transparent" }}>
                    💬 협의 가능 {form.daysNegotiable ? "✓" : ""}
                  </button>
                </div>

                {/* 근무시간 */}
                <div>
                  <label style={{ fontSize: 14, fontWeight: 700, display: "block", marginBottom: 10 }}>⏰ 근무시간</label>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                    <div style={{ flex: 1 }}>
                      <p style={{ fontSize: 11, color: "var(--text-muted)", margin: "0 0 4px" }}>시작</p>
                      <div style={{ display: "flex", gap: 4 }}>
                        <select value={form.workStartHour ?? ""} onChange={e => updateForm("workStartHour", e.target.value === "" ? null : Number(e.target.value))}
                          style={{ flex: 1, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "10px 8px", color: "var(--text)", fontSize: 13, outline: "none" }}>
                          <option value="">시</option>
                          {Array.from({ length: 24 }, (_, i) => <option key={i} value={i}>{String(i).padStart(2,"0")}시</option>)}
                        </select>
                        <select value={(form as any).workStartMin ?? 0} onChange={e => updateForm("workStartMin" as any, Number(e.target.value))}
                          style={{ width: 64, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "10px 8px", color: "var(--text)", fontSize: 13, outline: "none" }}>
                          <option value={0}>00분</option><option value={30}>30분</option>
                        </select>
                      </div>
                    </div>
                    <span style={{ color: "var(--text-muted)", fontSize: 18, paddingTop: 18 }}>~</span>
                    <div style={{ flex: 1 }}>
                      <p style={{ fontSize: 11, color: "var(--text-muted)", margin: "0 0 4px" }}>종료</p>
                      <div style={{ display: "flex", gap: 4 }}>
                        <select value={form.workEndHour ?? ""} onChange={e => updateForm("workEndHour", e.target.value === "" ? null : Number(e.target.value))}
                          style={{ flex: 1, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "10px 8px", color: "var(--text)", fontSize: 13, outline: "none" }}>
                          <option value="">시</option>
                          {Array.from({ length: 24 }, (_, i) => <option key={i} value={i}>{String(i).padStart(2,"0")}시</option>)}
                        </select>
                        <select value={(form as any).workEndMin ?? 0} onChange={e => updateForm("workEndMin" as any, Number(e.target.value))}
                          style={{ width: 64, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "10px 8px", color: "var(--text)", fontSize: 13, outline: "none" }}>
                          <option value={0}>00분</option><option value={30}>30분</option>
                        </select>
                      </div>
                    </div>
                  </div>
                  <button onClick={() => updateForm("workHours", form.workHours === "협의 가능" ? "" : "협의 가능")}
                    style={{ padding: "7px 14px", borderRadius: 20, fontSize: 12, cursor: "pointer", background: form.workHours === "협의 가능" ? "var(--primary-light)" : "var(--surface2)", color: form.workHours === "협의 가능" ? "#c4b5fd" : "var(--text-muted)", border: form.workHours === "협의 가능" ? "1px solid var(--primary-border)" : "1px solid transparent" }}>
                    💬 시간 협의 가능 {form.workHours === "협의 가능" ? "✓" : ""}
                  </button>
                </div>

                {/* 휴게시간 */}
                <div>
                  <label style={{ fontSize: 14, fontWeight: 700, display: "block", marginBottom: 10 }}>☕ 휴게시간</label>
                  <div style={{ display: "flex", gap: 8 }}>
                    {[{ label: "없음", value: 0 }, { label: "30분", value: 0.5 }, { label: "1시간", value: 1 }].map(b => (
                      <button key={b.value} type="button" onClick={() => updateForm("breakHours", b.value)}
                        style={{ flex: 1, padding: "8px", borderRadius: 12, fontSize: 13, cursor: "pointer", border: "none", background: form.breakHours === b.value ? "linear-gradient(135deg, #8b5cf6, #7c3aed)" : "var(--surface2)", color: form.breakHours === b.value ? "#fff" : "var(--text-muted)", fontWeight: form.breakHours === b.value ? 700 : 400 }}>
                        {b.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 주휴일 - 정기채용만 */}
                {form.jobType === "regular" && (
                  <div>
                    <label style={{ fontSize: 14, fontWeight: 700, display: "block", marginBottom: 10 }}>📅 주휴일 (유급 휴일)</label>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {["월", "화", "수", "목", "금", "토", "일", "협의"].map(day => (
                        <button key={day} type="button" onClick={() => updateForm("weeklyHoliday", day)}
                          style={{ padding: "8px 12px", borderRadius: 12, fontSize: 13, cursor: "pointer", border: "none", fontWeight: form.weeklyHoliday === day ? 700 : 400,
                            background: form.weeklyHoliday === day ? "linear-gradient(135deg, #8b5cf6, #7c3aed)" : "var(--surface2)",
                            color: form.weeklyHoliday === day ? "#fff" : "var(--text-muted)" }}>
                          {day === "협의" ? "협의" : `${day}요일`}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* 시급 */}
                <div>
                  <label style={{ fontSize: 14, fontWeight: 700, display: "block", marginBottom: 8 }}>
                    💰 시급 <span style={{ color: "#c4b5fd" }}>*</span>
                    <span style={{ fontSize: 11, color: "var(--text-muted)", marginLeft: 8 }}>최저 {MIN_WAGE.toLocaleString()}원</span>
                  </label>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                    <input type="number" value={form.wage} onChange={e => updateForm("wage", e.target.value)}
                      style={{ flex: 1, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "12px 16px", color: "var(--text)", fontSize: 14, outline: "none" }} />
                    <span style={{ color: "var(--text-muted)", fontSize: 14 }}>원/시간</span>
                  </div>
                  <button onClick={() => updateForm("wageNegotiable", !form.wageNegotiable)}
                    style={{ padding: "6px 14px", borderRadius: 20, fontSize: 12, cursor: "pointer", background: form.wageNegotiable ? "var(--primary-light)" : "var(--surface2)", color: form.wageNegotiable ? "#c4b5fd" : "var(--text-muted)", border: form.wageNegotiable ? "1px solid var(--primary-border)" : "1px solid transparent" }}>
                    💬 협의 가능 {form.wageNegotiable ? "✓" : ""}
                  </button>
                </div>

                {/* 예상 급여 */}
                {(() => {
                  const wage = parseInt(form.wage) || 0;
                  const startH = form.workStartHour;
                  const startM = (form as any).workStartMin || 0;
                  const endH = form.workEndHour;
                  const endM = (form as any).workEndMin || 0;
                  const breakH = form.breakHours || 0;
                  const days = form.workDays && form.workDays !== "협의" ? form.workDays.split(",").filter(Boolean) : [];
                  const daysCount = days.length;
                  let dailyHours = 0;
                  if (startH != null && endH != null && startH !== endH) {
                    const startTotal = startH + startM / 60;
                    const endTotal = endH + endM / 60;
                    dailyHours = endTotal > startTotal ? endTotal - startTotal : 24 - startTotal + endTotal;
                    dailyHours = Math.max(0, dailyHours - breakH);
                  }
                  const weeklyHours = parseFloat((dailyHours * daysCount).toFixed(1));
                  const hasWeeklyPay = weeklyHours >= 15;
                  const weeklyPayHours = hasWeeklyPay ? Math.min(weeklyHours / daysCount, 8) : 0;
                  const weeklyPay = weeklyPayHours * wage;
                  const hasNight = startH != null && (startH >= 22 || endH! <= 6);
                  const nightExtra = hasNight ? dailyHours * wage * 0.5 * daysCount : 0;
                  const monthlyBasic = wage * dailyHours * daysCount * 4.345;
                  const monthlyTotal = Math.round(monthlyBasic + weeklyPay * 4.345 + nightExtra * 4.345);
                  const isReady = dailyHours > 0 && daysCount > 0 && wage >= MIN_WAGE;
                  return (
                    <div style={{ ...cardGradientStyle, padding: 14 }}>
                      <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "0 0 10px", fontWeight: 600 }}>📊 예상 급여 (세전)</p>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6, marginBottom: 10 }}>
                        {[
                          { label: "일 근로", value: dailyHours > 0 ? `${dailyHours.toFixed(dailyHours % 1 ? 1 : 0)}시간` : "--" },
                          { label: "주 근로", value: weeklyHours > 0 ? `${weeklyHours}시간` : "--" },
                          { label: "주휴수당", value: hasWeeklyPay ? "해당" : weeklyHours > 0 ? "미해당" : "--" },
                        ].map(item => (
                          <div key={item.label} style={{ background: "rgba(0,0,0,0.15)", borderRadius: 10, padding: "8px", textAlign: "center" }}>
                            <p style={{ fontSize: 9, color: "var(--text-muted)", margin: "0 0 2px" }}>{item.label}</p>
                            <p style={{ fontSize: 12, fontWeight: 700, margin: 0, color: item.label === "주휴수당" && hasWeeklyPay ? "#86efac" : "var(--text)" }}>{item.value}</p>
                          </div>
                        ))}
                      </div>
                      <div style={{ background: "rgba(0,0,0,0.15)", borderRadius: 10, padding: "10px 14px" }}>
                        {isReady ? (
                          <>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, paddingBottom: 8, borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
                              <span style={{ fontSize: 13, fontWeight: 700 }}>주 예상 급여</span>
                              <span style={{ fontSize: 17, fontWeight: 900, color: "#c4b5fd" }}>{Math.round(wage * dailyHours * daysCount + weeklyPay + nightExtra).toLocaleString()}원</span>
                            </div>
                            {(hasWeeklyPay || hasNight) && <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}><span style={{ fontSize: 12, color: "var(--text-muted)" }}>월 기본급</span><span style={{ fontSize: 12, fontWeight: 600 }}>{Math.round(monthlyBasic).toLocaleString()}원</span></div>}
                            {hasWeeklyPay && <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}><span style={{ fontSize: 12, color: "#86efac" }}>+ 주휴수당</span><span style={{ fontSize: 12, color: "#86efac", fontWeight: 600 }}>+{Math.round(weeklyPay * 4.345).toLocaleString()}원</span></div>}
                            {hasNight && <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}><span style={{ fontSize: 12, color: "#fbbf24" }}>+ 야간수당 🌙</span><span style={{ fontSize: 12, color: "#fbbf24", fontWeight: 600 }}>+{Math.round(nightExtra * 4.345).toLocaleString()}원</span></div>}
                            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}><span style={{ fontSize: 12, color: "var(--text-muted)" }}>월 평균 예상 (세전)</span><span style={{ fontSize: 12, fontWeight: 700, color: "var(--text)" }}>{monthlyTotal.toLocaleString()}원</span></div>
                            {!hasWeeklyPay && weeklyHours > 0 && <p style={{ fontSize: 10, color: "var(--text-muted)", margin: "4px 0 0" }}>※ 주 {weeklyHours}시간으로 주휴수당 미해당 (주 15시간↑ 시 발생)</p>}
                            <p style={{ fontSize: 10, color: "var(--text-muted)", margin: "6px 0 0", lineHeight: 1.5, borderTop: "1px solid rgba(255,255,255,0.05)", paddingTop: 6 }}>※ 월 평균은 4.345주 기준 참고용이며 실제 급여는 근무일수에 따라 다를 수 있어요</p>
                          </>
                        ) : (
                          <p style={{ fontSize: 12, color: "var(--text-muted)", textAlign: "center", margin: 0 }}>근무요일 · 시간 · 시급을 입력하면 자동 계산돼요</p>
                        )}
                      </div>
                    </div>
                  );
                })()}

                {/* 모집인원 */}
                <div>
                  <label style={{ fontSize: 14, fontWeight: 700, display: "block", marginBottom: 8 }}>👥 모집인원</label>
                  <select value={form.staffCount} onChange={e => updateForm("staffCount", e.target.value)}
                    style={{ width: "100%", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "12px 16px", color: "var(--text)", fontSize: 14, outline: "none" }}>
                    {[1,2,3,4,5,10].map(n => <option key={n} value={n}>{n}명{n === 10 ? " 이상" : ""}</option>)}
                  </select>
                </div>

                {/* 복지 */}
                <div>
                  <label style={{ fontSize: 14, fontWeight: 700, display: "block", marginBottom: 10 }}>✨ 복지</label>
                  <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                    <button onClick={() => updateForm("mealProvided", !form.mealProvided)}
                      style={{ flex: 1, padding: "10px", borderRadius: 12, border: "none", fontSize: 13, cursor: "pointer", background: form.mealProvided ? "rgba(34,197,94,0.15)" : "var(--surface2)", color: form.mealProvided ? "#86efac" : "var(--text-muted)", fontWeight: form.mealProvided ? 700 : 400 }}>
                      🍱 식사 제공
                    </button>
                    <button onClick={() => updateForm("parking", !form.parking)}
                      style={{ flex: 1, padding: "10px", borderRadius: 12, border: "none", fontSize: 13, cursor: "pointer", background: form.parking ? "rgba(34,197,94,0.15)" : "var(--surface2)", color: form.parking ? "#86efac" : "var(--text-muted)", fontWeight: form.parking ? 700 : 400 }}>
                      🚗 주차 가능
                    </button>
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                    {PRESET_TAGS.map(tag => (
                      <button key={tag} onClick={() => { const tags = form.selectedTags.includes(tag) ? form.selectedTags.filter(t => t !== tag) : [...form.selectedTags, tag]; updateForm("selectedTags", tags); }}
                        style={{ padding: "6px 12px", borderRadius: 20, fontSize: 12, cursor: "pointer", background: form.selectedTags.includes(tag) ? "var(--primary-light)" : "var(--surface2)", color: form.selectedTags.includes(tag) ? "#c4b5fd" : "var(--text-muted)", border: form.selectedTags.includes(tag) ? "1px solid var(--primary-border)" : "1px solid transparent" }}>
                        #{tag}
                      </button>
                    ))}
                  </div>
                </div>

                {error && <p style={{ color: "#f87171", fontSize: 13, textAlign: "center" }}>{error}</p>}

                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={() => setStep(1)} style={{ ...btnSecondary, flex: 1 }}>← 이전</button>
                  <button onClick={handleSave} disabled={saving} style={{ ...btnPrimary, flex: 2, opacity: saving ? 0.7 : 1 }}>
                    {saving ? "저장 중..." : isEdit ? "수정 완료 ✓" : "공고 등록하기 🎉"}
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
      {cropperOpen && tempImageSrc && (
        <ImageCropperModal imageSrc={tempImageSrc} onCrop={handleCropComplete} onClose={() => { setCropperOpen(false); setTempImageSrc(null); }} />
      )}
    </main>
  );
}

export default function EmployerRegister() {
  return (
    <Suspense fallback={<div style={{ minHeight: "100vh", background: "var(--bg)", display: "flex", alignItems: "center", justifyContent: "center" }}><p style={{ color: "var(--text-muted)" }}>불러오는 중...</p></div>}>
      <EmployerRegisterContent />
    </Suspense>
  );
}
