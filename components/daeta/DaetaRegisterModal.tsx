"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/lib/useToast";
import { fetchCredentialsWithFallback } from "@/lib/credentials";
import { fetchMinWage } from "@/lib/minWage";
import { parseWorkHoursRange, daetaDayCount, calcLegalBreakMinutes, formatDaetaDateRange, todayKstStr } from "@/lib/utils";
import { convertHeicIfNeeded } from "@/lib/heicConvert";
import ImageCropModal from "@/components/ImageCropModal";
import DateSheetPicker from "@/components/DateSheetPicker";

const WEEKDAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"];
function formatDateWithWeekday(dateStr: string): string {
  if (!dateStr) return "";
  const d = new Date(`${dateStr}T00:00:00`);
  if (isNaN(d.getTime())) return dateStr;
  return `${formatDaetaDateRange(dateStr)} (${WEEKDAY_LABELS[d.getDay()]})`;
}

const MAX_DAETA_PHOTOS = 3;

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
    lat: number | null;
    lng: number | null;
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
  // 네이티브 input[type=date]가 iOS 휠피커/안드로이드 다이얼로그 등 기기마다 다르게 뜨면서 이 앱의
  // 다크테마·커스텀 바텀시트 톤과 어긋난다는 피드백으로, 자체 바텀시트(DateSheetPicker)로 교체함(2026-09-05)
  const [showDateSheet, setShowDateSheet] = useState(false);
  // 근무시간이 같은 기간을 한번에 등록할 때 사용 (신규 등록에서만, 요일별로 시간이 다르면 각각 따로 등록해야 함)
  const [isSingleDay, setIsSingleDay] = useState(true);
  const [endDate, setEndDate] = useState("");
  const [startHour, setStartHour] = useState("12");
  const [startMin, setStartMin] = useState("00");
  const [endHour, setEndHour] = useState("18");
  const [endMin, setEndMin] = useState("00");
  const [wage, setWage] = useState("11000"); // 기본 추천 우대 시급
  const [wageTouched, setWageTouched] = useState(false); // 사장님이 직접 수정하면 자동 할증 제안 중단
  const [urgentPct, setUrgentPct] = useState({ sameDay: 20, h3: 30 }); // DB daeta_sos_config에서 로드
  const [minWage, setMinWage] = useState(10030);
  // 근무 시작까지 최소 확보해야 하는 시간(분) — DB daeta_sos_config에서 로드, 없으면 60분 기본값.
  // 에스컬레이션 사다리(팀내10+동네30+신규30=70분)가 돌아갈 최소한의 여유를 보장하기 위함
  const [minLeadMinutes, setMinLeadMinutes] = useState(60);
  // 자동 할증 상한이 설정된 채로 등록하기 전 마지막 확인 — 발행(되돌리기 힘든 액션) 직전 1회
  const [showSurgeConfirm, setShowSurgeConfirm] = useState(false);
  const [wageHint, setWageHint] = useState("");
  // 안 잡히고 단계가 오를수록(escalation_stage) 자동으로 오르는 시급의 상한(%) — 사장님이 등록 시 직접 동의한 값만큼만 오름
  const [maxUrgentPct, setMaxUrgentPct] = useState(20); // 기본값 넛지 — 강제 아님, 0으로 낮추면 자동 할증 끔. 30%는 사장님 심리적 거부감 우려로 2026-08-13 20%로 완화
  const [autoPct, setAutoPct] = useState({ stage2: 10, stage3: 20, stage4: 30 }); // DB daeta_sos_config에서 로드
  const [duty, setDuty] = useState("");
  const [allowNew, setAllowNew] = useState(false); // 🔵 신규(Tier2) 알바생에게도 노출 opt-in
  const [breakMinutes, setBreakMinutes] = useState(0); // 근로기준법 54조 — 근무시간대 바뀔 때 법정 최소로 자동 제안
  const [breakTouched, setBreakTouched] = useState(false); // 사장님이 직접 수정하면 자동 제안 중단(수정 모드는 저장값 유지 위해 처음부터 true)

  // 업무 사진 — 인터뷰 없이 바로 수락 여부를 결정해야 하는 대타 특성상 미스매치/노쇼 방지용
  const [imageUrls, setImageUrls] = useState<string[]>([]);
  const [imageUploading, setImageUploading] = useState(false);
  const [pastPhotos, setPastPhotos] = useState<string[]>([]); // 이 사장님이 예전 공고에 올렸던 사진 재사용 후보
  // 여러 장을 한 번에 고르면 한 장씩 순서대로 구도 보정(크롭) 화면을 거침 — PostComposeModal과 동일 패턴
  const [cropQueue, setCropQueue] = useState<File[]>([]);
  const [cropTarget, setCropTarget] = useState<{ file: File; url: string } | null>(null);

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

  // 오늘 날짜 계산 (min 설정용) — 반드시 lib/utils.ts의 todayKstStr() 사용. toISOString()은 UTC
  // 기준이라 한국 자정~오전 9시 사이엔 하루 전 날짜가 나오는 버그가 있었음(2026-09-05)
  const todayStr = todayKstStr();
  // 원래 3일이었는데(긴급 땜빵만 상정), 휴가 등으로 미리 확정된 펑크를 앞당겨 구하고 싶은 사장님도
  // 있어서 늘림(2026-09-04). 14일까지 고려했으나, escalation_stage는 등록 후 경과시간만 보고
  // 70분 안에 전체공개까지 다 도는 구조라(lib/daetaEscalation.ts) 리드타임이 길수록 "안 급한데
  // 전체공개+할증" 상태로 방치되는 기간이 늘어남 — 시급 자동인상은 실제 근무 임박(24시간 이내)
  // 때로 따로 게이팅해뒀지만(computeAutoWage), 그래도 "확정된 미래 펑크" 커버(보통 근무표는 1주
  // 단위로 확정)와 방치 기간을 같이 저울질해 7일로 확정
  const maxDateStr = todayKstStr(new Date(Date.now() + 7 * 86400000));

  // 자동 할증 미리보기 — 사장님이 정한 max_urgent_pct 상한과 단계별 할증률(autoPct) 중 작은 쪽만 적용
  const previewWage = (stagePct: number) => {
    const base = parseInt(wage) || 0;
    const applied = Math.min(stagePct, maxUrgentPct);
    return Math.round((base * (1 + applied / 100)) / 10) * 10;
  };

  // 예상 일급 미리보기 — 시급만 보고는 하루에 얼마 나가는지 감이 안 와서 등록 전에 바로 확인할 수 있게 함.
  // 초과근무 할증 등 실제 정산 규칙(app/api/daeta/complete)까지는 반영하지 않은 단순 시간×시급 견적.
  const estimatedPay = (() => {
    const rawHoursPerDay = parseWorkHoursRange(`${startHour}:${startMin} ~ ${endHour}:${endMin}`);
    const base = parseInt(wage) || 0;
    if (!rawHoursPerDay || base <= 0) return null;
    const hoursPerDay = Math.max(0, Math.round((rawHoursPerDay - breakMinutes / 60) * 10) / 10);
    const days = !isSingleDay && !postingId && endDate && endDate !== workDate ? daetaDayCount(workDate, endDate) : 1;
    return { hoursPerDay, days, totalPay: Math.round(hoursPerDay * base * days) };
  })();

  useEffect(() => {
    loadCredentials();
    loadWageConfig();
    loadPastPhotos();
    if (postingId) {
      loadPostingDetails(postingId);
    } else {
      checkEmployerProfile();
    }
  }, [postingId, userId]);

  // 법적 필수 자격(예: 카페의 보건증)은 등록을 막는 게 아니라 직무를 고르는 순간 자동으로 미리
  // 체크해둠 — 급한 SOS 등록까지 "저거 눌렀냐"로 막을 필요는 없다는 피드백으로 되돌림(2026-09-04).
  // 그래도 눈에는 보이게(칩이 이미 선택된 상태로) 남겨서 지원자에게는 여전히 안내가 나간다.
  // selectedCreds는 의존성에서 뺐음 — 사장님이 특수한 사정으로 직접 해제해도 다시 강제로 안 붙게.
  useEffect(() => {
    if (!duty || !selectedParent) return;
    const mandatory = credentialsMaster.filter(c => c.category_name === selectedParent.name && c.duty_name === duty && c.is_mandatory_by_law);
    if (mandatory.length === 0) return;
    setSelectedCreds(prev => {
      const toAdd = mandatory.filter(c => !prev.some(sc => sc.name === c.name));
      return toAdd.length > 0 ? [...prev, ...toAdd.map(c => ({ id: c.id, name: c.name, is_preset: true }))] : prev;
    });
  }, [duty, selectedParent, credentialsMaster]);

  // 이 사장님이 예전 대타 공고에 올렸던 사진들을 모아 재사용 후보로 보여줌 — 매번 새로 찍게 하지 않기 위함
  const loadPastPhotos = async () => {
    const { data } = await supabase
      .from("daeta_postings")
      .select("image_urls")
      .eq("user_id", userId)
      .not("image_urls", "is", null)
      .order("created_at", { ascending: false })
      .limit(20);
    if (data) {
      const urls = Array.from(new Set(data.flatMap((d: { image_urls: string[] | null }) => d.image_urls || [])));
      setPastPhotos(urls.slice(0, 12));
    }
  };

  // heic2any는 WASM 디코더라 번들이 무거워서 최초 1회 동적 import 시 1~2초 정도 아무 반응 없이
  // 멈춘 것처럼 보이는 원인이 됨 — 사진 등록 단계에 들어오면 미리 백그라운드로 받아둬서
  // 실제로 아이폰 사진을 고를 때는 이미 캐시돼 있게 한다(변환 자체는 그대로 필요할 때만 실행).
  useEffect(() => {
    if (step === "form") import("heic2any").catch(() => {});
  }, [step]);

  const openCrop = (file: File) => setCropTarget({ file, url: URL.createObjectURL(file) });

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files ? Array.from(e.target.files) : [];
    if (files.length === 0) return;
    e.target.value = ""; // 같은 파일 재선택도 onChange가 다시 뜨도록

    const room = MAX_DAETA_PHOTOS - imageUrls.length;
    if (room <= 0) {
      showToast(`사진은 최대 ${MAX_DAETA_PHOTOS}장까지 올릴 수 있어요.`, "error");
      return;
    }
    // HEIC 변환이 끝날 때까지 버튼에 아무 표시가 없으면 멈춘 것처럼 보이므로, 선택 즉시 로딩 상태부터 표시
    setImageUploading(true);
    try {
      // HEIC(아이폰 기본 포맷)는 크롭 미리보기 <img>가 디코딩을 못 해 검정 화면만 뜨므로 큐에 넣기 전에 변환
      const converted = await Promise.all(files.slice(0, room).map(convertHeicIfNeeded));
      const [first, ...rest] = converted;
      setCropQueue(rest);
      openCrop(first);
    } finally {
      setImageUploading(false);
    }
  };

  const uploadPhoto = async (file: File) => {
    setImageUploading(true);
    try {
      const fileExt = file.name.split(".").pop();
      const randId = Math.random().toString(36).substring(2, 9);
      const fileName = `${Date.now()}-${randId}.${fileExt}`;
      const path = `daeta/${userId}/${fileName}`;
      const { error: uploadError } = await supabase.storage.from("media").upload(path, file, { upsert: true });
      if (uploadError) throw uploadError;
      const { data } = supabase.storage.from("media").getPublicUrl(path);
      if (data?.publicUrl) setImageUrls(prev => [...prev, data.publicUrl]);
    } catch (err: any) {
      console.error(err);
      showToast("사진 업로드에 실패했습니다: " + err.message, "error");
    } finally {
      setImageUploading(false);
    }
  };

  const advanceCropQueue = () => {
    if (cropQueue.length > 0) {
      const [next, ...rest] = cropQueue;
      setCropQueue(rest);
      openCrop(next);
    } else {
      setCropTarget(null);
    }
  };

  const handleCropDone = async (blob: Blob) => {
    if (!cropTarget) return;
    const croppedFile = new File([blob], cropTarget.file.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" });
    await uploadPhoto(croppedFile);
    advanceCropQueue();
  };

  const handleCropCancel = () => {
    if (!cropTarget) return;
    advanceCropQueue();
  };

  const removeImage = (idx: number) => {
    setImageUrls(prev => prev.filter((_, i) => i !== idx));
  };

  const togglePastPhoto = (url: string) => {
    setImageUrls(prev => {
      if (prev.includes(url)) return prev.filter(u => u !== url);
      if (prev.length >= MAX_DAETA_PHOTOS) {
        showToast(`사진은 최대 ${MAX_DAETA_PHOTOS}장까지 선택할 수 있어요.`, "error");
        return prev;
      }
      return [...prev, url];
    });
  };

  const loadWageConfig = async () => {
    const mw = await fetchMinWage();
    setMinWage(mw);
    const { data } = await supabase
      .from("daeta_sos_config")
      .select("key, value")
      .in("key", ["urgent_pct_same_day", "urgent_pct_3h", "stage2_pct", "stage3_pct", "stage4_pct", "min_lead_minutes"]);
    if (data) {
      const map: Record<string, number> = {};
      data.forEach((r: { key: string; value: number }) => { map[r.key] = r.value; });
      setUrgentPct({ sameDay: map.urgent_pct_same_day ?? 20, h3: map.urgent_pct_3h ?? 30 });
      setAutoPct({ stage2: map.stage2_pct ?? 10, stage3: map.stage3_pct ?? 20, stage4: map.stage4_pct ?? 30 });
      if (map.min_lead_minutes != null) setMinLeadMinutes(map.min_lead_minutes);
    }
  };

  // 긴급 할증 시급 기본값 제안 (당일 +20%, 3시간 내 +30%) — 사장님이 직접 수정하면 중단
  useEffect(() => {
    if (!workDate) { setWageHint(""); return; }
    const start = new Date(`${workDate}T${startHour}:${startMin}:00`);
    const hoursUntil = (start.getTime() - Date.now()) / 3600000;
    const isSameDay = workDate === todayKstStr();

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

  // 휴게시간 법정 최소 자동 제안 — 근무시간을 바꿀 때마다 재계산, 사장님이 직접 고치면 중단
  useEffect(() => {
    if (breakTouched) return;
    const hoursPerDay = parseWorkHoursRange(`${startHour}:${startMin} ~ ${endHour}:${endMin}`);
    if (hoursPerDay != null) setBreakMinutes(calcLegalBreakMinutes(hoursPerDay));
  }, [startHour, startMin, endHour, endMin, breakTouched]);

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
        setWage(String(data.base_wage || data.wage || 10030));
        setWageTouched(true); // 수정 모드에서는 저장된 시급 유지
        setBreakMinutes(data.break_minutes ?? 0);
        setBreakTouched(true); // 수정 모드에서는 저장된 휴게시간 유지(자동 재계산으로 덮어쓰지 않음)
        setMaxUrgentPct(data.max_urgent_pct ?? 0);
        setDuty(data.duty || "");
        setAllowNew(!!data.allow_new);
        setImageUrls(data.image_urls || []);
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
          lat: data.lat ?? null,
          lng: data.lng ?? null,
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
          lat: profile.lat ?? null,
          lng: profile.lng ?? null,
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

  // 유효성 검증 실패 시 인라인 텍스트만으로는 스크롤 위치에 따라 안 보일 수 있어 토스트로도 반드시 알림
  const fail = (msg: string) => {
    setErrMsg(msg);
    showToast(msg, "error");
  };

  // 대타 공고 저장 처리
  const handleRegister = async () => {
    if (step === "cert") {
      // 1단계 유효성 검증
      if (!newBusinessName.trim()) {
        fail("매장 상호명을 입력해 주세요.");
        return;
      }
      if (!selectedAddress) {
        fail("매장 주소를 검색하여 선택해 주세요.");
        return;
      }
      // 검색결과에 좌표가 없으면 parseFloat이 NaN을 만들고, 그게 JSON으로 전송되며 조용히 null로 저장돼 이후 동네 알림 반경 계산이 통째로 깨짐
      if (isNaN(parseFloat(selectedAddress.y)) || isNaN(parseFloat(selectedAddress.x))) {
        fail("선택하신 주소의 좌표를 확인할 수 없어요. 다른 검색 결과를 선택하거나 주소를 다시 검색해 주세요.");
        return;
      }
      if (!phoneVerified) {
        fail("휴대폰 간편인증 동의가 필요합니다.");
        return;
      }
      if (!accountVerified) {
        fail("정산용 은행 계좌 실명 인증을 완료해 주세요.");
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
            lat: insertedData.lat ?? null,
            lng: insertedData.lng ?? null,
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
        fail("매장 등록에 실패했습니다: " + err.message);
      } finally {
        setSaving(false);
      }
      return;
    }

    // 2단계 구인 정보 유효성 검증
    if (!workDate) {
      fail("대타가 필요한 날짜를 선택해 주세요.");
      return;
    }
    // 날짜 입력창 min 속성만으로는 일부 모바일 브라우저·수정 모드(과거로 만료된 공고를 다시 저장)에서 과거 날짜가 그대로 통과할 수 있어 한 번 더 확인
    if (workDate < todayStr) {
      fail("대타 필요 날짜가 과거예요. 날짜를 다시 확인해 주세요.");
      return;
    }
    // 최소 리드타임 — 에스컬레이션 사다리(팀내→동네→신규, 기본 70분)가 돌아갈 최소한의 여유도
    // 없이 등록되면(예: 10분 뒤 시작) 검증 인력에게 먼저 노출될 기회조차 없이 의미가 없어짐
    const shiftStart = new Date(`${workDate}T${startHour}:${startMin}:00+09:00`);
    const minutesUntilShift = (shiftStart.getTime() - Date.now()) / 60000;
    if (minutesUntilShift < minLeadMinutes) {
      fail(`대타는 근무 시작 최소 ${minLeadMinutes}분 전까지는 등록해야 해요. 그보다 급하면 팀원이나 아는 알바생에게 직접 연락해 주세요.`);
      return;
    }
    const finalWage = parseInt(wage);
    // minWage는 fetchMinWage()로 DB에서 매년 갱신되는 값을 가져오는데, 정작 이 검증만 리터럴
    // 10030으로 하드코딩돼 있었음 — 안내문구·자동제안은 맞는 값을 쓰면서 실제 차단 기준만 옛날 값에
    // 머물러있던 불일치를 수정 (CLAUDE.md: 매년 바뀌는 숫자 하드코딩 금지)
    if (isNaN(finalWage) || finalWage < minWage) {
      fail(`시급은 최저시급(${minWage.toLocaleString()}원) 이상이어야 합니다.`);
      return;
    }
    // 최소 근무시간(정책값, 법정 의무 아님) — 어뷰징·비현실적 초단기 등록 방지. 1시간 미만 차단.
    const hoursPerDayForBreak = parseWorkHoursRange(`${startHour}:${startMin} ~ ${endHour}:${endMin}`);
    if (hoursPerDayForBreak != null && hoursPerDayForBreak < 1) {
      fail("대타 근무시간은 최소 1시간 이상이어야 해요.");
      return;
    }
    // 근로기준법 54조 — 4시간↑ 30분, 8시간↑ 1시간 이상 휴게 필수(초단기도 예외 없음)
    if (hoursPerDayForBreak != null) {
      const legalBreakMin = calcLegalBreakMinutes(hoursPerDayForBreak);
      if (breakMinutes < legalBreakMin) {
        fail(`근무시간이 ${hoursPerDayForBreak}시간이라 휴게시간을 최소 ${legalBreakMin}분 이상 줘야 해요(근로기준법 제54조).`);
        return;
      }
    }
    if (!selectedParent) {
      fail("업종을 선택해 주세요.");
      return;
    }
    // 매장 주소는 저장돼 있어도 좌표(lat/lng) 지오코딩이 조용히 실패해 null로 남는 경우가 있음 — 동네 알림 반경 계산이 이 좌표 기준이라 없으면 막아야 함
    if (!postingId && (shopInfo?.lat == null || shopInfo?.lng == null)) {
      fail("매장 위치 정보가 없어요. 매장 정보에서 주소를 다시 검색해서 저장해 주세요.");
      return;
    }
    const finalDuty = duty === "직접입력" ? customDuty.trim() : duty;
    if (!finalDuty) {
      fail("대타 담당 업무를 선택하거나 입력해 주세요.");
      return;
    }
    if (!postingId && !isSingleDay) {
      if (!endDate) { fail("종료일을 선택해 주세요."); return; }
      if (endDate < workDate) { fail("종료일은 시작일과 같거나 이후여야 합니다."); return; }
    }

    // 무단 노쇼 이력이 있으면 정지 기간 동안 신규 SOS 등록 제한 (사전 취소는 신뢰점수만 깎일 뿐 정지는 안 걸림)
    if (!postingId) {
      const { data: userRow } = await supabase.from("users").select("daeta_cancel_suspended_until").eq("id", userId).maybeSingle();
      if (userRow?.daeta_cancel_suspended_until && new Date(userRow.daeta_cancel_suspended_until) > new Date()) {
        fail(`무단 노쇼 이력으로 ${new Date(userRow.daeta_cancel_suspended_until).toLocaleString("ko-KR")}까지 새 대타 등록이 제한돼요.`);
        return;
      }
    }

    // 안 잡히면 시급이 자동으로 오르는 조건(상한 20%·30%처럼 낮지 않은 값)으로 등록하기 직전엔
    // 확인 없이 그대로 발행되고 있었음 — 발행 자체가 되돌리기 힘든 액션(CLAUDE.md)인 데다,
    // 자동 할증은 사장님이 나중에 "이런 조건인 줄 몰랐다"고 할 수 있는 금전적 약속이라 한 번 더 확인시킨다.
    if (maxUrgentPct > 0) {
      setShowSurgeConfirm(true);
      return;
    }
    await proceedRegister();
  };

  const proceedRegister = async () => {
    setSaving(true);
    setErrMsg("");

    try {
      // handleRegister에서 검증까지 마친 값을 그대로 다시 계산 — 검증과 제출 사이(자동 할증 확인
      // 시트가 떠있는 동안)에도 상태가 바뀌지 않으므로 안전함
      const finalWage = parseInt(wage);
      const finalDuty = duty === "직접입력" ? customDuty.trim() : duty;
      const finalShop = shopInfo!;
      // 기간(시작일~종료일)을 고르면 한 공고가 그 기간 전체를 커버 — 지원/수락도 기간 전체 단위로 한 번에
      // 이뤄짐(하루씩 따로 지원해야 했던 이전 방식 폐기). 정산은 app/api/daeta/complete에서 일수만큼 곱해서 계산.
      const finalEndDate = !postingId && !isSingleDay && endDate && endDate !== workDate ? endDate : null;

      const sharedFields = {
        work_date: workDate,
        work_date_end: finalEndDate,
        work_hours: `${startHour}:${startMin} ~ ${endHour}:${endMin}`,
        break_minutes: breakMinutes,
        wage: finalWage,
        base_wage: finalWage, // 자동 할증 계산의 기준값 — 수정 시 새로 입력한 시급이 새 기준이 됨
        max_urgent_pct: maxUrgentPct,
        duty: finalDuty,
        allow_new: allowNew,
        image_urls: imageUrls,
        required_credentials: JSON.stringify(selectedCreds),
        // 에스컬레이션 만료는 "첫 근무 시작 시각" 기준 — 기간 중 첫날까지 응답 없으면 만료.
        // "Z"(UTC)를 붙이면 KST 벽시계 시각이 그대로 UTC로 오인돼 실제보다 9시간 늦게 만료되던
        // 버그였음 — 명시적으로 +09:00을 붙여야 서버 타임존과 무관하게 항상 올바른 시각이 됨.
        // 수정 시에도 갱신해야 함(예전엔 insert에만 있어서 시간을 바꿔 수정해도 만료 시각이 그대로였음).
        expires_at: `${workDate}T${startHour}:${startMin}:00+09:00`,
      };

      if (postingId) {
        const { error } = await supabase
          .from("daeta_postings")
          .update(sharedFields)
          .eq("id", postingId);
        if (error) throw error;
        showToast("⚡ 대타 공고가 성공적으로 수정되었습니다!");
        setTimeout(() => onSuccess(postingId), 1500);
      } else {
        const { data: inserted, error } = await supabase
          .from("daeta_postings")
          .insert({
            user_id: userId,
            employer_profile_id: finalShop.id,
            business_name: finalShop.businessName,
            business_type: finalShop.businessType,
            region: finalShop.region,
            lat: finalShop.lat,
            lng: finalShop.lng,
            status: "pending",
            ...sharedFields,
          })
          .select("id")
          .single();
        if (error) throw error;
        showToast("⚡ SOS 발동! 우리 팀에게 가장 먼저 알릴게요");
        setTimeout(() => onSuccess(inserted?.id), 1500);
      }
    } catch (err: any) {
      console.error(err);
      fail("대타 공고 등록에 실패했습니다: " + err.message);
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
                              lat: s.lat ?? null,
                              lng: s.lng ?? null,
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

                {/* 대타 일자 — "하루만 진행" 토글이 시트 안에 내장돼 있어서(DateSheetPicker) 진입점은
                    하나뿐. 토글 상태에 따라 시트 안에서 단일 날짜 선택 ↔ 기간(여행앱 숙박일처럼
                    시작~종료 탭) 선택으로 바로 전환됨(2026-09-05). 고를 수 있는 날짜는 항상
                    오늘~최대 7일 이내(maxDateStr)로 같다 — 오늘부터 시작하면 최대 7일짜리 기간까지,
                    며칠 뒤부터 시작하면 그만큼 짧아짐(전체 창이 "오늘 기준 7일"이라 시작일이 늦을수록
                    남는 기간이 줄어듦). 수정 모드(postingId 있음)에선 토글 자체를 숨기고 항상 단일. */}
                <div>
                  <label style={{ fontSize: 13, fontWeight: 700, display: "block", marginBottom: 6 }}>📅 대타 필요한 날짜 *</label>
                  <button type="button" onClick={() => setShowDateSheet(true)}
                    style={{ width: "100%", boxSizing: "border-box", display: "flex", alignItems: "center", gap: 8, background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 12, padding: "12px", color: workDate ? "var(--text)" : "var(--text-muted)", fontSize: 14, cursor: "pointer", textAlign: "left" }}>
                    <i className="ti ti-calendar" style={{ fontSize: 16, color: "var(--text-muted)" }} aria-hidden="true" />
                    {!isSingleDay && workDate && endDate
                      ? `${formatDateWithWeekday(workDate)} ~ ${formatDateWithWeekday(endDate)}`
                      : workDate ? formatDateWithWeekday(workDate) : "날짜를 선택해 주세요"}
                  </button>
                  <span style={{ fontSize: 10, color: "var(--text-muted)", display: "block", marginTop: 4 }}>
                    * 대타 구인은 오늘 기준 7일 이내 일정만 가능합니다. 근무 시작 최소 {minLeadMinutes}분 전까지 등록해 주세요.
                  </span>
                  {showDateSheet && (
                    <DateSheetPicker
                      title="대타 필요한 날짜"
                      value={workDate}
                      rangeEnd={endDate}
                      min={todayStr}
                      max={maxDateStr}
                      todayStr={todayStr}
                      isSingleDay={isSingleDay}
                      showModeToggle={!postingId}
                      onToggleSingleDay={v => { setIsSingleDay(v); if (v) setEndDate(""); }}
                      onConfirmSingle={setWorkDate}
                      onConfirmRange={(s, e) => { setWorkDate(s); setEndDate(e); }}
                      onClose={() => setShowDateSheet(false)}
                    />
                  )}
                </div>

                {/* 근무시간 */}
                <div>
                  <label style={{ fontSize: 13, fontWeight: 700, display: "block", marginBottom: 6 }}>⏰ 근무시간 *</label>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <select value={startHour} onChange={e => setStartHour(e.target.value)}
                      style={{ flex: 1, background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 12, padding: "12px", color: "var(--text)", fontSize: 14, outline: "none" }}>
                      {Array.from({ length: 24 }, (_, i) => <option key={i} value={String(i).padStart(2, "0")}>{String(i).padStart(2, "0")}시</option>)}
                    </select>
                    <select value={startMin} onChange={e => {
                      // 근무는 보통 시작·종료 분이 같음(예: 02:30~10:30) — 매번 종료 분까지 따로 고르게
                      // 하지 말고 시작 분을 바꾸면 종료 분도 같이 맞춰줌. 다르게 하고 싶으면 종료 분을 직접 바꾸면 됨.
                      setStartMin(e.target.value);
                      setEndMin(e.target.value);
                    }}
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
                  {(endHour < startHour || (endHour === startHour && endMin <= startMin)) && (
                    <span style={{ fontSize: 11, color: "var(--warning)", fontWeight: 700, display: "block", marginTop: 4 }}>
                      🌙 종료시간이 시작시간보다 빨라요 — 익일까지 이어지는 야간 근무로 등록돼요. 잘못 고르셨다면 다시 확인해 주세요.
                    </span>
                  )}
                </div>

                {/* 휴게시간 — 근로기준법 54조: 4시간↑ 30분, 8시간↑ 1시간 이상 근무 도중 부여 필수(초단기도 예외 없음) */}
                <div>
                  <label style={{ fontSize: 13, fontWeight: 700, display: "block", marginBottom: 6 }}>😴 휴게시간</label>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 12, padding: "10px 12px" }}>
                    <input type="number" min={0} step={10} value={breakMinutes}
                      onChange={e => { setBreakTouched(true); setBreakMinutes(Math.max(0, parseInt(e.target.value) || 0)); }}
                      style={{ width: 64, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "8px", color: "var(--text)", fontSize: 14, outline: "none" }} />
                    <span style={{ fontSize: 13, color: "var(--text-muted)" }}>분</span>
                    {breakTouched && (() => {
                      const hoursPerDay = parseWorkHoursRange(`${startHour}:${startMin} ~ ${endHour}:${endMin}`);
                      const legalMin = hoursPerDay != null ? calcLegalBreakMinutes(hoursPerDay) : 0;
                      return legalMin > 0 ? (
                        <button type="button" onClick={() => { setBreakTouched(false); setBreakMinutes(legalMin); }}
                          style={{ marginLeft: "auto", background: "none", border: "none", color: "var(--purple-text)", fontSize: 11, fontWeight: 700, cursor: "pointer", padding: 0 }}>
                          법정 최소 {legalMin}분으로
                        </button>
                      ) : null;
                    })()}
                  </div>
                  <span style={{ fontSize: 10, color: "var(--text-muted)", display: "block", marginTop: 4 }}>* 근로기준법상 근무 4시간↑ 30분, 8시간↑ 1시간 이상 근무 도중 휴게를 줘야 해요.</span>
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
                  {estimatedPay && (
                    <div style={{ marginTop: 8, background: "var(--surface2)", borderRadius: 10, padding: "8px 12px", fontSize: 12, color: "var(--text)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ color: "var(--text-muted)" }}>
                        🧮 예상 {estimatedPay.days > 1 ? "총액" : "일급"} ({estimatedPay.hoursPerDay}시간{estimatedPay.days > 1 ? ` × ${estimatedPay.days}일` : ""})
                      </span>
                      <strong style={{ color: "#c4b5fd" }}>{estimatedPay.totalPay.toLocaleString()}원</strong>
                    </div>
                  )}
                </div>

                {/* 자동 할증 상한 — 착각/불이익 없도록 계산 방식과 미리보기를 명시적으로 보여줌 */}
                <div style={{ background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 14, padding: "14px 16px" }}>
                  <label style={{ fontSize: 13, fontWeight: 700, display: "block", marginBottom: 6 }}>⚡ 안 잡히면 자동으로 시급을 올릴까요?</label>
                  <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "0 0 10px", lineHeight: 1.6 }}>
                    대타가 계속 안 잡히면 요청 범위가 <b style={{ color: "var(--text)" }}>팀 → 동네 검증인력 → 신규 포함 → 전체 공개</b> 순으로 넓어지는데,
                    이때마다 아래 시급이 <b style={{ color: "var(--text)" }}>자동으로</b> 오릅니다. 지금 정하는 <b style={{ color: "var(--text)" }}>상한(%)을 넘는 일은 절대 없어요</b> — 그 이상은 사장님이 직접 수정해야만 올라갑니다.
                    {" "}단, 시급 인상은 <b style={{ color: "var(--text)" }}>근무 시작 24시간 전부터만</b> 적용돼요 — 며칠 뒤 공고라 요청 범위만 먼저 넓어져도 시급은 아직 안 오릅니다.
                  </p>

                  <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
                    {[0, 10, 20, 30, 50].map(pct => (
                      <button key={pct} type="button" onClick={() => setMaxUrgentPct(pct)}
                        style={{
                          flex: 1, padding: "8px 0", borderRadius: 12, border: "none", cursor: "pointer",
                          fontSize: 12, fontWeight: maxUrgentPct === pct ? 700 : 400,
                          background: maxUrgentPct === pct ? "var(--primary)" : "var(--surface)",
                          color: maxUrgentPct === pct ? "#fff" : "var(--text-muted)",
                        }}>
                        {pct === 0 ? "끔" : `${pct}%`}
                      </button>
                    ))}
                  </div>

                  {maxUrgentPct === 0 ? (
                    <p style={{ fontSize: 11, color: "var(--text-muted)", margin: 0 }}>자동 할증을 꺼뒀어요. 시급은 위에 입력한 금액으로 고정돼요.</p>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 11, color: "var(--text-muted)" }}>
                      <div style={{ display: "flex", justifyContent: "space-between" }}>
                        <span>2단계 · 동네 ✅검증인력 공개 시 (+{Math.min(autoPct.stage2, maxUrgentPct)}%)</span>
                        <span style={{ color: "var(--text)", fontWeight: 700 }}>{previewWage(autoPct.stage2).toLocaleString()}원</span>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between" }}>
                        <span>3단계 · 🔵신규 포함 시 (+{Math.min(autoPct.stage3, maxUrgentPct)}%)</span>
                        <span style={{ color: "var(--text)", fontWeight: 700 }}>{previewWage(autoPct.stage3).toLocaleString()}원</span>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between" }}>
                        <span>4단계 · 전체 공개 SOS 시 (+{Math.min(autoPct.stage4, maxUrgentPct)}%, 최대)</span>
                        <span style={{ color: "var(--text)", fontWeight: 700 }}>{previewWage(autoPct.stage4).toLocaleString()}원</span>
                      </div>
                    </div>
                  )}
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

                {/* 필수/우대 자격 요건 선택 — 직무 선택 직후 바로 이어지게 사진 위로 옮김(2026-09-04):
                    사장님이 직무를 고른 다음 흐름에서 자연스레 이어지는 입력이라, 사이에 사진 업로드가
                    끼어있으면 다시 스크롤해서 찾아야 했음 */}
                {duty && (
                  <div>
                    <label style={{ fontSize: 13, fontWeight: 700, display: "block", marginBottom: 6 }}>🏅 필수/우대 자격 요건</label>
                    {/* ⚠️ 표시가 눌러야 추가되는 건지 이미 걸린 건지 헷갈린다는 피드백이 있어서(2026-09-04)
                        안내 문구를 추가 — 실제로는 위 useEffect가 직무 선택 시 자동으로 미리 체크해둠 */}
                    {credentialsMaster.some(c => c.category_name === selectedParent?.name && c.duty_name === duty && c.is_mandatory_by_law) && (
                      <span style={{ fontSize: 11, color: "var(--danger)", display: "block", marginBottom: 8, lineHeight: 1.5 }}>
                        ⚠️ 표시는 이 업무에 법적으로 필수인 자격이라 자동으로 켜뒀어요. 해당 안 되면 눌러서 빼도 돼요.
                      </span>
                    )}

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

                {/* 업무 이해를 돕는 사진 — 인터뷰 없이 바로 지원 여부를 결정해야 하는 대타 특성상 미스매치·노쇼를 줄여줌 */}
                <div>
                  <label style={{ fontSize: 13, fontWeight: 700, display: "block", marginBottom: 6 }}>📸 업무 사진 (선택)</label>
                  <span style={{ fontSize: 11, color: "var(--text-muted)", display: "block", marginBottom: 8, lineHeight: 1.5 }}>
                    업무 이해를 돕는 사진 위주로 올려주세요 (예: 작업 공간, 사용 장비 등). 처음 지원하는 분도 감이 잡혀요.
                  </span>

                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: pastPhotos.length > 0 ? 10 : 0 }}>
                    {imageUrls.map((url, idx) => (
                      <div key={url + idx} style={{ position: "relative", width: 72, height: 72, borderRadius: 12, overflow: "hidden", border: "1px solid var(--border)" }}>
                        <img src={url} alt="업무 사진" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                        <button type="button" onClick={() => removeImage(idx)}
                          style={{ position: "absolute", top: 2, right: 2, width: 20, height: 20, borderRadius: "50%", background: "rgba(0,0,0,0.6)", color: "#fff", border: "none", fontSize: 12, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: 0 }}>
                          ✕
                        </button>
                      </div>
                    ))}
                    {imageUrls.length < MAX_DAETA_PHOTOS && (
                      <label style={{ width: 72, height: 72, borderRadius: 12, border: "1px dashed var(--border)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 2, cursor: imageUploading ? "default" : "pointer", color: "var(--text-muted)", fontSize: 11 }}>
                        {imageUploading ? "업로드 중" : (<><span style={{ fontSize: 18, lineHeight: 1 }}>＋</span>사진 추가</>)}
                        <input type="file" accept="image/*" multiple disabled={imageUploading} onChange={handlePhotoUpload} style={{ display: "none" }} />
                      </label>
                    )}
                  </div>

                  {pastPhotos.length > 0 && (
                    <div>
                      <span style={{ fontSize: 11, color: "var(--text-muted)", display: "block", marginBottom: 6 }}>최근 올린 사진에서 선택</span>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                        {pastPhotos.map(url => {
                          const selected = imageUrls.includes(url);
                          return (
                            <button key={url} type="button" onClick={() => togglePastPhoto(url)}
                              style={{ position: "relative", width: 56, height: 56, borderRadius: 10, overflow: "hidden", border: selected ? "2px solid var(--primary)" : "1px solid var(--border)", padding: 0, cursor: "pointer" }}>
                              <img src={url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                              {selected && (
                                <span style={{ position: "absolute", inset: 0, background: "rgba(124,58,237,0.35)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 16, fontWeight: 900 }}>✓</span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>

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

                {/* 안심 보장 — 결제 상품이 아니라 신뢰도 노출 + 자동 재확산으로 대체 (DESIGN_PLAN.md §11) */}
                <div style={{ background: "rgba(34,197,94,0.06)", border: "1px solid rgba(34,197,94,0.18)", borderRadius: 14, padding: "12px 14px", marginTop: 4 }}>
                  <p style={{ fontSize: 13, fontWeight: 800, color: "var(--success)", margin: "0 0 6px" }}>🛡️ 안심하고 요청하세요 (무료)</p>
                  <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                    <span style={{ fontSize: 11, color: "var(--text-muted)", lineHeight: 1.5 }}>✅ 노쇼 이력 없는 검증 인력에게 먼저 노출돼요</span>
                    <span style={{ fontSize: 11, color: "var(--text-muted)", lineHeight: 1.5 }}>🚨 만약 노쇼가 나도, 신고 즉시 자동으로 다음 대체 인력을 찾아드려요 — 잡힐 때까지</span>
                    <span style={{ fontSize: 11, color: "var(--text-muted)", lineHeight: 1.5 }}>⛔ 노쇼한 알바생은 신뢰점수가 크게 깎이고 일정 기간 대타 참여가 제한돼요</span>
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
                      lat: firstShop.lat ?? null,
                      lng: firstShop.lng ?? null,
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

      {/* 업무 사진 구도 보정 — 여러 장을 골랐으면 한 장씩 순서대로 */}
      {cropTarget && (
        <ImageCropModal
          imageSrc={cropTarget.url}
          aspect={16 / 11}
          onClose={handleCropCancel}
          onCrop={handleCropDone}
        />
      )}

      {/* 자동 할증 상한을 켠 채로 등록하기 직전 최종 확인 — 발행(되돌리기 힘든 액션) 전 1회 */}
      {showSurgeConfirm && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", zIndex: 1100, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div style={{ width: "100%", maxWidth: 360, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 20, padding: 22, color: "var(--text)" }}>
            <div style={{ fontSize: 32, textAlign: "center", marginBottom: 8 }}>⚡</div>
            <p style={{ fontSize: 15, fontWeight: 800, textAlign: "center", margin: "0 0 10px" }}>이 조건으로 등록할까요?</p>
            <div style={{ background: "var(--surface2)", borderRadius: 12, padding: "12px 14px", fontSize: 12, color: "var(--text-muted)", lineHeight: 1.8, marginBottom: 16 }}>
              시급 {parseInt(wage || "0").toLocaleString()}원으로 등록되고, 근무 시작 24시간 전부터 안 잡히면 최대 <strong style={{ color: "var(--text)" }}>{maxUrgentPct}%</strong> 오른
              <strong style={{ color: "#fb923c" }}> {previewWage(maxUrgentPct).toLocaleString()}원</strong>까지 사장님 확인 없이 자동으로 시급이 인상될 수 있어요.
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button type="button" onClick={() => setShowSurgeConfirm(false)}
                style={{ flex: 1, padding: 12, borderRadius: 12, background: "var(--surface2)", border: "1px solid var(--border)", color: "var(--text-muted)", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                다시 확인할게요
              </button>
              <button type="button" onClick={() => { setShowSurgeConfirm(false); proceedRegister(); }}
                style={{ flex: 1, padding: 12, borderRadius: 12, background: "var(--primary)", border: "none", color: "#fff", fontSize: 13, fontWeight: 800, cursor: "pointer" }}>
                이대로 등록
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
