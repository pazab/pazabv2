"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { Suspense } from "react";
import dynamic from "next/dynamic";
import ImageCropModal from "@/components/ImageCropModal";
import { convertHeicIfNeeded } from "@/lib/heicConvert";

import { fetchCredentialsWithFallback } from "@/lib/credentials";

const MapComponent = dynamic(() => import("@/components/MapComponent"), { ssr: false });

import { calcWorkPay, todayKstStr } from "@/lib/utils";
import { cardStyle, cardGradientStyle, btnPrimary, btnSecondary } from "@/lib/styles";


const MIN_WAGE = 10030;
const WORK_DAYS_OPTIONS = ["평일", "주말", "평일+주말", "협의"];
const PRESET_TAGS = ["즉시채용", "장기우대", "교육제공", "식사제공", "야간알바", "주말알바", "단기알바", "혼자근무", "팀근무", "주차가능"];
import { REGIONS } from "@/lib/regions";

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
  fullAddress: string;
  lat: number | null;
  lng: number | null;
  wage: string;
  wageType: string; // 'hourly' | 'daily' | 'monthly'
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
  description: string;
}

const emptyForm = (): JobForm => ({
  businessName: "", categoryId: "", categoryIds: [], customCategory: "", businessType: "",
  sido: "", gugun: "", addressDetail: "", fullAddress: "", lat: null, lng: null,
  wage: "", wageType: "hourly", wageNegotiable: false, workDays: "", daysNegotiable: false, workHours: "", workStartHour: null, workEndHour: null,
  selectedTags: [], staffCount: "1", mealProvided: false, parking: false,
  breakHours: 0.5, weeklyHoliday: "일",
  isUrgent: false, expiresAt: "",
  jobType: "regular", workStartDate: "", workEndDate: "",
  description: "",
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
  const storeId = searchParams.get("storeId"); // 내팀에서 "공고올리기" 진입 시
  const returnTo = searchParams.get("return") || "explore";

  const [userId, setUserId] = useState<string | null>(null);
  const [storeProfileId, setStoreProfileId] = useState<string | null>(null); // employer_profiles.id
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [newProfileId, setNewProfileId] = useState(""); // employer_profiles.id (봇 설정 진입용)
  const [step, setStep] = useState(1);
  const [confirmModalOpen, setConfirmModalOpen] = useState(false);
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
      const converted = await convertHeicIfNeeded(file);
      setOriginalFileName(converted.name);
      const reader = new FileReader();
      reader.onload = () => { setTempImageSrc(reader.result as string); setCropperOpen(true); };
      reader.readAsDataURL(converted);
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
    const { error } = await supabase.storage.from("media").upload(path, file, { upsert: true });
    if (!error) {
      const { data } = supabase.storage.from("media").getPublicUrl(path);
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
  const [myStores, setMyStores] = useState<any[]>([]);
  const [addressToast, setAddressToast] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);

  useEffect(() => { loadCategories(); checkAuth(); }, []);

  const loadCategories = async () => {
    const { data } = await supabase.from("job_categories").select("*").order("sort_order");
    if (data) {
      setParentCategories(data.filter((c: { parent_id: string | null }) => !c.parent_id));
      setChildCategories(data.filter((c: { parent_id: string | null }) => c.parent_id));
    }
    const creds = await fetchCredentialsWithFallback();
    setCredentialsMaster(creds);
  };

  const checkAuth = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { router.push("/login"); return; }
    setUserId(session.user.id);

    // 사용자의 모든 매장 목록 로드
    const { data: stores } = await supabase.from("employer_profiles")
      .select("*")
      .eq("user_id", session.user.id)
      .eq("is_deleted", false)
      .order("created_at", { ascending: false });
    if (stores && stores.length > 0) {
      setMyStores(stores);
    }

    if (storeId) {
      // 내팀 "공고올리기/수정" 진입 — 매장 정보 + 최신 공고 자동채움
      const { data: store } = await supabase.from("employer_profiles").select("*").eq("id", storeId).single();
      if (store) {
        setStoreProfileId(storeId);
        await loadFormFromStore(store);
        // 해당 매장의 최신 공고 로드
        const { data: job } = await supabase.from("jobs")
          .select("*").eq("employer_profile_id", storeId)
          .order("created_at", { ascending: false }).limit(1).maybeSingle();
        if (job) loadFormFromJob(job);
      }
    } else if (isEdit && editId) {
      // jobId로 직접 수정 진입 (mypage에서)
      const { data: job } = await supabase.from("jobs").select("*").eq("id", editId).single();
      if (job) {
        setStoreProfileId(job.employer_profile_id);
        loadFormFromJob(job);
        const { data: store } = await supabase.from("employer_profiles").select("*").eq("id", job.employer_profile_id).single();
        if (store) await loadFormFromStore(store);
      }
    } else if (isEdit && !editId) {
      // 가장 최근 공고 수정
      const { data: job } = await supabase.from("jobs")
        .select("*").eq("user_id", session.user.id)
        .order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (job) {
        setStoreProfileId(job.employer_profile_id);
        loadFormFromJob(job);
        const { data: store } = await supabase.from("employer_profiles").select("*").eq("id", job.employer_profile_id).single();
        if (store) await loadFormFromStore(store);
      }
    } else {
      // 신규 매장 등록 진입시 기존 매장이 있는지 먼저 확인
      if (stores && stores.length > 0) {
        const firstStore = stores[0];
        setStoreProfileId(firstStore.id);
        await loadFormFromStore(firstStore);
        // 최신 공고 로드
        const { data: job } = await supabase.from("jobs")
          .select("*").eq("employer_profile_id", firstStore.id)
          .order("created_at", { ascending: false }).limit(1).maybeSingle();
        if (job) loadFormFromJob(job);
      } else {
        const { data: userData } = await supabase.from("users")
          .select("region, name, phone").eq("id", session.user.id).maybeSingle();
        if (userData?.region) {
          const parts = userData.region.split(" ");
          setForm(prev => ({ ...prev, sido: parts[0] || "", gugun: parts[1] || "" }));
        }
      }
    }
    setLoading(false);
  };

  // 매장 정보 (employer_profiles) → form 채움
  const loadFormFromStore = async (store: any) => {
    const parts = (store.region || "").split(" ");
    setImageUrls(store.image_urls || (store.image_url ? [store.image_url] : []));
    setVideoUrl(store.video_url || null);

    let matchedCatId = store.category_id || "";
    let matchedCatIds = store.category_ids || [];
    let catObj = null;

    if (matchedCatId) {
      const { data } = await supabase.from("job_categories").select("*").eq("id", matchedCatId).maybeSingle();
      if (data) catObj = data;
    } else if (store.business_type) {
      const { data } = await supabase.from("job_categories")
        .select("*")
        .eq("name", store.business_type)
        .is("parent_id", null)
        .maybeSingle();
      if (data) {
        catObj = data;
        matchedCatId = data.id;
        matchedCatIds = [data.id];
      }
    }

    if (catObj) {
      setSelectedParent(catObj);
    }

    // 좌표 정보 복원 및 누락 시 자동 보정
    let storeLat = store.lat || null;
    let storeLng = store.lng || null;
    const fullAddr = store.address || store.region || "";

    if (!storeLat || !storeLng) {
      if (fullAddr) {
        try {
          const res = await fetch(
            `https://dapi.kakao.com/v2/local/search/address.json?query=${encodeURIComponent(fullAddr)}`,
            { headers: { Authorization: "KakaoAK 02e1711115a492598ea97b18764fc597" } }
          );
          const data = await res.json();
          if (data.documents && data.documents.length > 0) {
            storeLat = parseFloat(data.documents[0].y);
            storeLng = parseFloat(data.documents[0].x);
          }
        } catch {}
      }
    }

    setForm(prev => ({
      ...prev,
      businessName: store.business_name || "",
      businessType: store.business_type || "",
      categoryId: matchedCatId,
      categoryIds: matchedCatIds,
      sido: parts[0] || "",
      gugun: parts[1] || "",
      addressDetail: store.address_detail || "",
      fullAddress: fullAddr,
      lat: storeLat,
      lng: storeLng,
    }));
  };

  // 공고 정보 (jobs) → form 채움
  const loadFormFromJob = (job: any) => {
    const parsed = parseWorkHours(job.work_hours || "");
    setSelectedCreds(Array.isArray(job.required_credentials) ? job.required_credentials : []);
    const wageTypeTag = (job.tags || []).find((t: string) => t.startsWith("wage_type:"));
    const wageType = wageTypeTag ? wageTypeTag.split(":")[1] : "hourly";
    setForm(prev => ({
      ...prev,
      id: job.id, // jobs.id
      categoryId: job.category_id || "",
      categoryIds: job.category_ids || (job.category_id ? [job.category_id] : []),
      customCategory: job.custom_category || "",
      wage: String(job.wage || MIN_WAGE),
      wageType,
      wageNegotiable: job.wage_negotiable || false,
      workDays: job.work_days || "",
      daysNegotiable: job.days_negotiable || false,
      workHours: parsed.clean || "",
      workStartHour: job.work_start_hour ?? null,
      workEndHour: job.work_end_hour ?? null,
      selectedTags: (() => {
        let tags = Array.isArray(job.tags) ? job.tags : [];
        if (job.meal_provided && !tags.includes("식사제공")) tags = [...tags, "식사제공"];
        if (job.parking && !tags.includes("주차가능")) tags = [...tags, "주차가능"];
        return tags;
      })(),
      staffCount: String(job.staff_count || 1),
      mealProvided: job.meal_provided || false,
      parking: job.parking || false,
      breakHours: parsed.breakHours,
      weeklyHoliday: parsed.weeklyHoliday,
      isUrgent: job.is_urgent || false,
      expiresAt: job.expires_at ? job.expires_at.split("T")[0] : "",
      jobType: job.job_type || "regular",
      workStartDate: job.work_start_date || "",
      workEndDate: job.work_end_date || "",
      description: job.description || "",
    }));
    const catId = job.category_id;
    if (catId) {
      supabase.from("job_categories").select("*").eq("id", catId).single()
        .then((res) => {
          const cat = res.data;
          if (cat?.parent_id) {
            supabase.from("job_categories").select("*").eq("id", cat.parent_id).single()
              .then((r2) => { if (r2.data) setSelectedParent(r2.data); });
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
        `https://dapi.kakao.com/v2/local/search/address.json?query=${encodeURIComponent(fullAddress)}`,
        { headers: { Authorization: "KakaoAK 02e1711115a492598ea97b18764fc597" } }
      );
      const data = await res.json();
      if (data.documents && data.documents.length > 0) {
        updateForm("lat", parseFloat(data.documents[0].y));
        updateForm("lng", parseFloat(data.documents[0].x));
        setAddressToast("✓ 주소가 저장됐어요!");
        setTimeout(() => setAddressToast(""), 2500);
      } else {
        // Fallback to Nominatim
        const res2 = await fetch(
          `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(fullAddress)}&format=json&limit=1`,
          { headers: { "Accept-Language": "ko" } }
        );
        const data2 = await res2.json();
        if (data2.length > 0) {
          updateForm("lat", parseFloat(data2[0].lat));
          updateForm("lng", parseFloat(data2[0].lon));
          setAddressToast("✓ 주소가 저장됐어요!");
          setTimeout(() => setAddressToast(""), 2500);
        }
      }
    } catch {
      // Nominatim fallback directly on catch
      try {
        const res2 = await fetch(
          `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(fullAddress)}&format=json&limit=1`,
          { headers: { "Accept-Language": "ko" } }
        );
        const data2 = await res2.json();
        if (data2.length > 0) {
          updateForm("lat", parseFloat(data2[0].lat));
          updateForm("lng", parseFloat(data2[0].lon));
          setAddressToast("✓ 주소가 저장됐어요!");
          setTimeout(() => setAddressToast(""), 2500);
        }
      } catch {}
    }
  };

  const openAddressSearch = () => {
    const loadPostcode = () => {
      new (window as any).daum.Postcode({
        oncomplete: (data: any) => {
          const fullAddress = data.roadAddress || data.jibunAddress;
          const parts = fullAddress.split(" ");
          if (parts[0]) updateForm("sido", parts[0]);
          if (parts[1]) updateForm("gugun", parts[1]);
          updateForm("addressDetail", "");
          updateForm("fullAddress", fullAddress);
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
    if (form.wageType === "hourly" && parseInt(form.wage) < MIN_WAGE) { setError(`시급은 최저시급 ${MIN_WAGE.toLocaleString()}원 이상이어야 해요`); return; }
    if (!form.workDays && form.jobType === "regular") { setError("근무요일을 선택해주세요"); return; }
    if (form.jobType === "short" && !form.workStartDate) { setError("근무 시작일을 선택해주세요"); return; }
    if (form.jobType === "urgent" && !form.workStartDate) { setError("필요한 날짜를 선택해주세요"); return; }

    setError("");
    setConfirmModalOpen(true);
  };

  const executeSave = async () => {
    setSaving(true);
    setConfirmModalOpen(false);

    const fullRegion = form.fullAddress || [form.sido, form.gugun, form.addressDetail].filter(Boolean).join(" ");
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

    // 시도, 시군구, 읍면동 세분화 파싱
    const sidoVal = form.sido || "";
    const sigunguVal = form.gugun || "";
    let eupmyeondongVal = "";
    if (form.fullAddress) {
      const addrParts = form.fullAddress.split(" ");
      const thirdWord = addrParts[2] || "";
      if (thirdWord.endsWith("동") || thirdWord.endsWith("읍") || thirdWord.endsWith("면") || thirdWord.endsWith("리") || thirdWord.endsWith("가")) {
        eupmyeondongVal = thirdWord;
      }
    }

    // ── 매장 정보 (employer_profiles) ──
    const storeData: any = {
      business_name: form.businessName.trim(),
      business_type: businessType,
      region: fullRegion,
      address: form.fullAddress || fullRegion,
      address_detail: form.addressDetail,
      sido: sidoVal || null,
      sigungu: sigunguVal || null,
      eupmyeondong: eupmyeondongVal || null,
      lat: form.lat,
      lng: form.lng,
      image_url: imageUrls[0] || null,
      image_urls: imageUrls,
      video_url: videoUrl || null,
      is_active: true, // Mark store active
    };

    // ── 공고 정보 (jobs) ──
    const cleanTags = (form.selectedTags || []).filter(t => !t.startsWith("wage_type:"));
    const finalTags = [...cleanTags, `wage_type:${form.wageType}`];

    const jobData: any = {
      user_id: userId,
      wage: parseInt(form.wage),
      wage_negotiable: form.wageNegotiable,
      work_days: form.workDays || "협의",
      days_negotiable: form.daysNegotiable,
      work_hours: workHoursFormatted,
      work_start_hour: form.workStartHour,
      work_end_hour: form.workEndHour,
      category_id: form.categoryIds[0] || form.categoryId || null,
      category_ids: form.categoryIds.length ? form.categoryIds : (form.categoryId ? [form.categoryId] : []),
      custom_category: form.customCategory || null,
      tags: finalTags,
      staff_count: parseInt(form.staffCount) || 1,
      meal_provided: (form.selectedTags || []).includes("식사제공"),
      parking: (form.selectedTags || []).includes("주차가능"),
      is_active: true,
      job_status: "active",
      is_urgent: isUrgent,
      expires_at: calcExpiresAt(),
      job_type: form.jobType,
      work_start_date: form.workStartDate || null,
      work_end_date: form.workEndDate || null,
      required_credentials: selectedCreds,
      description: form.description || null,
      employer_type: interviewResult?.personalityType || null,
      bio5_data: interviewResult?.big5 || null,
      hexaco_data: interviewResult?.hexaco || null,
      tagline: interviewResult?.tagline || null,
      best_matches: interviewResult?.bestMatches || null,
      worst_matches: interviewResult?.worstMatches || null,
      caution: interviewResult?.caution || null,
      analyzed_mbti: interviewResult?.analyzedMbti || null,
      bot_knowledge: existingBotKnowledge,
      bot_interview_done: !!existingBotKnowledge,
    };

    // 1) 매장 저장
    let epId = storeProfileId;
    if (!epId) {
      const { data: existingEp } = await supabase.from("employer_profiles").select("id").eq("user_id", userId).maybeSingle();
      if (existingEp) {
        epId = existingEp.id;
        setStoreProfileId(epId);
      }
    }

    if (epId) {
      const { error: epErr } = await supabase.from("employer_profiles").update(storeData).eq("id", epId);
      if (epErr) { setError("매장 저장 오류: " + epErr.message); setSaving(false); return; }
    } else {
      // 새 매장 생성
      const { data: newStore, error: epErr } = await supabase.from("employer_profiles")
        .insert({ ...storeData, user_id: userId }).select("id").single();
      if (epErr || !newStore) { setError("매장 생성 오류: " + epErr?.message); setSaving(false); return; }
      epId = newStore.id;
      setStoreProfileId(epId);
    }

    // 2) 공고 저장
    jobData.employer_profile_id = epId;
    let saveError;
    if (form.id) {
      // 기존 공고 수정
      const { error } = await supabase.from("jobs").update(jobData).eq("id", form.id);
      saveError = error;
    } else {
      // 신규 공고 등록
      const { data: newJob, error } = await supabase.from("jobs").insert(jobData).select("id").single();
      saveError = error;
      if (newJob) setForm(prev => ({ ...prev, id: newJob.id }));
    }

    if (saveError) {
      setError("공고 저장 오류: " + saveError.message);
      setSaving(false);
    } else {
      const tabParam = searchParams.get("tab") || "";
      const sectionParam = searchParams.get("section") || "";
      const mypageUrl = `/mypage${tabParam || sectionParam ? `?${tabParam ? `tab=${tabParam}` : ""}${tabParam && sectionParam ? "&" : ""}${sectionParam ? `section=${sectionParam}` : ""}` : ""}`;
      const decodedReturn = returnTo ? decodeURIComponent(returnTo) : "";

      let targetUrl = "/explore";
      if (returnTo === "mypage") targetUrl = mypageUrl;
      else if (returnTo === "interview") targetUrl = "/interview";
      else if (returnTo === "result") targetUrl = "/result?type=employer&level=1";
      else if (decodedReturn.startsWith("/")) targetUrl = decodedReturn;

      router.replace(targetUrl);
    }
  };

  const getChildCats = (parentId: string) => childCategories.filter(c => c.parent_id === parentId);

  // 오늘 날짜 (date input min) — 반드시 todayKstStr() 사용, toISOString()은 UTC라 한국 자정~오전
  // 9시 사이 하루 전 날짜로 계산되는 버그가 있었음(2026-09-05)
  const today = todayKstStr();
  // 3일 후 (긴급대타 최대) — 이 "3일" 캡 자체는 이 화면(일반 구인공고)만의 별도 설정이라 안 건드림,
  // daeta_postings SOS의 7일 캡(components/daeta/DaetaRegisterModal.tsx)과는 다른 기능
  const in3days = todayKstStr(new Date(Date.now() + 3 * 86400000));

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

                {/* 등록된 매장 선택 */}
                {myStores.length > 0 && !isEdit && (
                  <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 16, padding: "14px 16px", marginBottom: 4 }}>
                    <label style={{ fontSize: 13, fontWeight: 700, display: "block", marginBottom: 10, color: "var(--text-muted)" }}>
                      🏢 등록된 매장 불러오기
                    </label>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                      {myStores.map(store => {
                        const isSelected = storeProfileId === store.id;
                        return (
                          <button
                            key={store.id}
                            type="button"
                            onClick={async () => {
                              setStoreProfileId(store.id);
                              await loadFormFromStore(store);
                              // 최신 공고 로드
                              const { data: job } = await supabase.from("jobs")
                                .select("*").eq("employer_profile_id", store.id)
                                .order("created_at", { ascending: false }).limit(1).maybeSingle();
                              if (job) {
                                loadFormFromJob(job);
                                setAddressToast("✓ 매장 정보와 최근 공고 내용을 불러왔어요!");
                              } else {
                                setAddressToast("✓ 매장 정보를 불러왔어요!");
                              }
                              setTimeout(() => setAddressToast(""), 2500);
                            }}
                            style={{
                              padding: "8px 14px",
                              borderRadius: 20,
                              border: "none",
                              fontSize: 13,
                              cursor: "pointer",
                              fontWeight: isSelected ? 700 : 400,
                              background: isSelected ? "linear-gradient(135deg, #8b5cf6, #7c3aed)" : "var(--surface2)",
                              color: isSelected ? "#fff" : "var(--text-muted)"
                            }}
                          >
                            {store.business_name || "등록 대기 매장"}
                          </button>
                        );
                      })}
                      <button
                        type="button"
                        onClick={() => {
                          setStoreProfileId(null);
                          setForm(emptyForm());
                          setImageUrls([]);
                          setVideoUrl(null);
                          setAddressToast("✓ 새 매장 등록 모드로 전환했어요.");
                          setTimeout(() => setAddressToast(""), 2500);
                        }}
                        style={{
                          padding: "8px 14px",
                          borderRadius: 20,
                          border: "none",
                          fontSize: 13,
                          cursor: "pointer",
                          fontWeight: !storeProfileId ? 700 : 400,
                          background: !storeProfileId ? "linear-gradient(135deg, #8b5cf6, #7c3aed)" : "var(--surface2)",
                          color: !storeProfileId ? "#fff" : "var(--text-muted)"
                        }}
                      >
                        ➕ 새 매장 등록
                      </button>
                    </div>
                  </div>
                )}

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
                          updateForm("fullAddress", addr);
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
                    <div style={{ display: "flex", gap: 6 }}>
                      <input
                        type="text"
                        value={form.fullAddress}
                        readOnly
                        placeholder="주소 검색"
                        style={{
                          width: "100%", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "12px 16px",
                          color: form.fullAddress ? "var(--text)" : "var(--text-muted)", fontSize: 14, outline: "none", flex: 1, textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap"
                        }}
                      />
                      <button
                        onClick={openAddressSearch}
                        type="button"
                        style={{ background: "rgba(124,58,237,0.15)", border: "1px solid rgba(124,58,237,0.3)", color: "#c4b5fd", fontWeight: 600, padding: "0 16px", borderRadius: 12, cursor: "pointer", fontSize: 13, whiteSpace: "nowrap" }}
                      >
                        🔍 검색
                      </button>
                    </div>
                    {form.fullAddress && (
                      <div style={{ width: "100%" }}>
                        <label style={{ fontSize: 11, color: "var(--text-muted)", display: "block", marginBottom: 4 }}>상세 주소 (건물명, 동/호수 등)</label>
                        <input
                          type="text"
                          value={form.addressDetail}
                          onChange={e => updateForm("addressDetail", e.target.value)}
                          placeholder="예) 3층, 301호"
                          style={{ width: "100%", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "12px 16px", color: "var(--text)", fontSize: 14, outline: "none", boxSizing: "border-box" }}
                        />
                      </div>
                    )}
                    {addressToast && (
                      <div style={{ background: "rgba(34,197,94,0.15)", border: "1px solid rgba(34,197,94,0.3)", borderRadius: 10, padding: "8px 14px", fontSize: 13, color: "#86efac", textAlign: "center" }}>{addressToast}</div>
                    )}
                    {form.lat && form.lng && (
                      <iframe src={`/map.html?lat=${form.lat}&lng=${form.lng}&addr=${encodeURIComponent(
                        form.fullAddress 
                          ? `${form.fullAddress} ${form.addressDetail || ""}`.trim() 
                          : [form.sido, form.gugun, form.addressDetail].filter(Boolean).join(" ")
                      )}`}
                        style={{ width: "100%", height: 180, borderRadius: 12, border: "none" }} />
                    )}

                    {/* 매장 소개 / 구인 상세 설명 추가 */}
                    <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: 6, marginTop: 10 }}>
                      <label style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>🏪 매장 소개 및 상세 설명 (선택)</label>
                      <textarea
                        value={form.description}
                        onChange={e => updateForm("description", e.target.value)}
                        placeholder="매장 분위기, 주로 맡게 될 업무, 혹은 구직자에게 바라는 점 등을 자유롭게 작성해주세요. (예: 초보자 환영, 가족같은 분위기, 단골 위주 손님 등)"
                        rows={4}
                        style={{ width: "100%", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "12px 16px", color: "var(--text)", fontSize: 14, outline: "none", boxSizing: "border-box", resize: "vertical", lineHeight: 1.5 }}
                      />
                    </div>
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

                {/* 급여 */}
                <div>
                  <label style={{ fontSize: 14, fontWeight: 700, display: "block", marginBottom: 10 }}>
                    💰 급여 형태 및 금액 <span style={{ color: "#c4b5fd" }}>*</span>
                    {form.wageType === "hourly" && (
                      <span style={{ fontSize: 11, color: "var(--text-muted)", marginLeft: 8 }}>최저 {MIN_WAGE.toLocaleString()}원</span>
                    )}
                  </label>
                  
                  {/* 급여 유형 선택 */}
                  <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
                    {[
                      { key: "hourly", label: "시급" },
                      { key: "daily", label: "일급" },
                      { key: "monthly", label: "월급" }
                    ].map(type => {
                      const isSelected = form.wageType === type.key;
                      return (
                        <button
                          key={type.key}
                          type="button"
                          onClick={() => {
                            updateForm("wageType", type.key);
                            updateForm("wage", "");
                          }}
                          style={{
                            flex: 1,
                            padding: "8px",
                            borderRadius: 12,
                            fontSize: 13,
                            cursor: "pointer",
                            border: "none",
                            fontWeight: isSelected ? 700 : 400,
                            background: isSelected ? "linear-gradient(135deg, #8b5cf6, #7c3aed)" : "var(--surface2)",
                            color: isSelected ? "#fff" : "var(--text-muted)",
                            transition: "all 0.15s"
                          }}
                        >
                          {type.label}
                        </button>
                      );
                    })}
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                    <input
                      type="number"
                      value={form.wage}
                      onChange={e => updateForm("wage", e.target.value)}
                      placeholder={form.wageType === "hourly" ? String(MIN_WAGE) : "금액 입력"}
                      style={{ flex: 1, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "12px 16px", color: "var(--text)", fontSize: 14, outline: "none" }}
                    />
                    <span style={{ color: "var(--text-muted)", fontSize: 14, minWidth: 45, textAlign: "right" }}>
                      {form.wageType === "hourly" ? "원/시간" : form.wageType === "daily" ? "원/일" : "원/월"}
                    </span>
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
                  const hasWeeklyPay = form.wageType === "hourly" && weeklyHours >= 15;
                  const weeklyPayHours = hasWeeklyPay ? Math.min(weeklyHours / daysCount, 8) : 0;
                  const weeklyPay = weeklyPayHours * wage;
                  const hasNight = form.wageType === "hourly" && startH != null && (startH >= 22 || endH! <= 6);
                  const nightExtra = hasNight ? dailyHours * wage * 0.5 * daysCount : 0;
                  
                  let monthlyBasic = 0;
                  let monthlyTotal = 0;
                  let weeklyTotal = 0;
                  
                  if (form.wageType === "hourly") {
                    monthlyBasic = wage * dailyHours * daysCount * 4.345;
                    monthlyTotal = Math.round(monthlyBasic + weeklyPay * 4.345 + nightExtra * 4.345);
                    weeklyTotal = Math.round(wage * dailyHours * daysCount + weeklyPay + nightExtra);
                  } else if (form.wageType === "daily") {
                    monthlyBasic = wage * daysCount * 4.345;
                    monthlyTotal = Math.round(monthlyBasic);
                    weeklyTotal = Math.round(wage * daysCount);
                  } else if (form.wageType === "monthly") {
                    monthlyBasic = wage;
                    monthlyTotal = wage;
                    weeklyTotal = Math.round(wage / 4.345);
                  }

                  const isReady = dailyHours > 0 && daysCount > 0 && wage > 0 && (form.wageType !== "hourly" || wage >= MIN_WAGE);
                  const isReadyLabel = form.wageType === "hourly" ? "근무요일 · 시간 · 시급" : form.wageType === "daily" ? "근무요일 · 시간 · 일급" : "근무요일 · 시간 · 월급";

                  return (
                    <div style={{ ...cardGradientStyle, padding: 14 }}>
                      <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "0 0 10px", fontWeight: 600 }}>📊 예상 급여 (세전)</p>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6, marginBottom: 10 }}>
                        {[
                          { label: "일 근로", value: dailyHours > 0 ? `${dailyHours.toFixed(dailyHours % 1 ? 1 : 0)}시간` : "--" },
                          { label: "주 근로", value: weeklyHours > 0 ? `${weeklyHours}시간` : "--" },
                          { label: "주휴수당", value: form.wageType !== "hourly" ? "해당무" : hasWeeklyPay ? "해당" : weeklyHours > 0 ? "미해당" : "--" },
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
                              <span style={{ fontSize: 17, fontWeight: 900, color: "#c4b5fd" }}>{weeklyTotal.toLocaleString()}원</span>
                            </div>
                            {form.wageType === "hourly" ? (
                              <>
                                {(hasWeeklyPay || hasNight) && <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}><span style={{ fontSize: 12, color: "var(--text-muted)" }}>월 기본급</span><span style={{ fontSize: 12, fontWeight: 600 }}>{Math.round(monthlyBasic).toLocaleString()}원</span></div>}
                                {hasWeeklyPay && <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}><span style={{ fontSize: 12, color: "#86efac" }}>+ 주휴수당</span><span style={{ fontSize: 12, color: "#86efac", fontWeight: 600 }}>+{Math.round(weeklyPay * 4.345).toLocaleString()}원</span></div>}
                                {hasNight && <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}><span style={{ fontSize: 12, color: "#fbbf24" }}>+ 야간수당 🌙</span><span style={{ fontSize: 12, color: "#fbbf24", fontWeight: 600 }}>+{Math.round(nightExtra * 4.345).toLocaleString()}원</span></div>}
                                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}><span style={{ fontSize: 12, color: "var(--text-muted)" }}>월 평균 예상 (세전)</span><span style={{ fontSize: 12, fontWeight: 700, color: "var(--text)" }}>{monthlyTotal.toLocaleString()}원</span></div>
                                {!hasWeeklyPay && weeklyHours > 0 && <p style={{ fontSize: 10, color: "var(--text-muted)", margin: "4px 0 0" }}>※ 주 {weeklyHours}시간으로 주휴수당 미해당 (주 15시간↑ 시 발생)</p>}
                              </>
                            ) : form.wageType === "daily" ? (
                              <>
                                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}><span style={{ fontSize: 12, color: "var(--text-muted)" }}>일 근로 일수</span><span style={{ fontSize: 12, fontWeight: 600 }}>주 {daysCount}일</span></div>
                                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}><span style={{ fontSize: 12, color: "var(--text-muted)" }}>월 평균 예상 (세전)</span><span style={{ fontSize: 12, fontWeight: 700, color: "var(--text)" }}>{monthlyTotal.toLocaleString()}원</span></div>
                              </>
                            ) : (
                              <>
                                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}><span style={{ fontSize: 12, color: "var(--text-muted)" }}>월 약정 급여</span><span style={{ fontSize: 12, fontWeight: 700, color: "var(--text)" }}>{monthlyTotal.toLocaleString()}원</span></div>
                              </>
                            )}
                            <p style={{ fontSize: 10, color: "var(--text-muted)", margin: "6px 0 0", lineHeight: 1.5, borderTop: "1px solid rgba(255,255,255,0.05)", paddingTop: 6 }}>※ 월 평균은 4.345주 기준 참고용이며 실제 급여는 근무일수에 따라 다를 수 있어요</p>
                          </>
                        ) : (
                          <p style={{ fontSize: 12, color: "var(--text-muted)", textAlign: "center", margin: 0 }}>{isReadyLabel}을 입력하면 자동 계산돼요</p>
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
      </div>
      {confirmModalOpen && (
        <div style={{
          position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
          background: "rgba(0,0,0,0.85)", zIndex: 1000,
          display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
          backdropFilter: "blur(8px)"
        }}>
          <div style={{
            background: "var(--surface)", border: "1px solid var(--border)",
            borderRadius: 24, width: "100%", maxWidth: 400, padding: 24,
            boxShadow: "0 10px 40px rgba(0,0,0,0.5)", display: "flex", flexDirection: "column", gap: 16
          }}>
            <h3 style={{ fontSize: 18, fontWeight: 800, margin: 0, textAlign: "center" }}>
              📢 공고 정보 확인
            </h3>
            <p style={{ fontSize: 12, color: "var(--text-muted)", margin: 0, textAlign: "center" }}>
              작성하신 공고 내용을 확인해주세요.
            </p>

            <div style={{
              background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)",
              borderRadius: 16, padding: 16, display: "flex", flexDirection: "column", gap: 10,
              fontSize: 13
            }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "var(--text-muted)" }}>매장명</span>
                <span style={{ fontWeight: 700 }}>{form.businessName}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "var(--text-muted)" }}>업종</span>
                <span style={{ fontWeight: 700 }}>{form.customCategory || selectedParent?.name || "미정"}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "var(--text-muted)" }}>위치</span>
                <span style={{ fontWeight: 700, textAlign: "right", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {form.fullAddress || "미입력"}
                </span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "var(--text-muted)" }}>급여</span>
                <span style={{ fontWeight: 700, color: "#c4b5fd" }}>
                  {form.wageType === "hourly" ? "시급" : form.wageType === "daily" ? "일급" : "월급"} {parseInt(form.wage || "0").toLocaleString()}원
                </span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "var(--text-muted)" }}>근무요일</span>
                <span style={{ fontWeight: 700 }}>{form.workDays || "협의"}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "var(--text-muted)" }}>근무시간</span>
                <span style={{ fontWeight: 700 }}>
                  {form.workStartHour != null && form.workEndHour != null
                    ? `${String(form.workStartHour).padStart(2,"0")}:${String((form as any).workStartMin || 0).padStart(2,"0")} ~ ${String(form.workEndHour).padStart(2,"0")}:${String((form as any).workEndMin || 0).padStart(2,"0")}`
                    : "시간 협의"}
                </span>
              </div>
            </div>

            <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
              <button
                type="button"
                onClick={() => setConfirmModalOpen(false)}
                style={{ ...btnSecondary, flex: 1, padding: "12px", borderRadius: 12, fontSize: 14 }}
              >
                취소
              </button>
              <button
                type="button"
                onClick={executeSave}
                style={{ ...btnPrimary, flex: 2, padding: "12px", borderRadius: 12, fontSize: 14 }}
              >
                {isEdit ? "수정하기" : "등록하기"}
              </button>
            </div>
          </div>
        </div>
      )}
      {cropperOpen && tempImageSrc && (
        <ImageCropModal
          imageSrc={tempImageSrc}
          aspect={16 / 9}
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

export default function EmployerRegister() {
  return (
    <Suspense fallback={<div style={{ minHeight: "100vh", background: "var(--bg)", display: "flex", alignItems: "center", justifyContent: "center" }}><p style={{ color: "var(--text-muted)" }}>불러오는 중...</p></div>}>
      <EmployerRegisterContent />
    </Suspense>
  );
}
