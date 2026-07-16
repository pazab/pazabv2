"use client";
import { useState, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { modalOverlay, modalSheet, btnPrimary, btnSecondary, inputStyle } from "@/lib/styles";
import ImageCropModal from "@/components/ImageCropModal";

const BIZ_CATEGORIES = [
  { emoji: "🍽️", name: "식당/음식점" },
  { emoji: "☕", name: "카페/음료" },
  { emoji: "🏪", name: "편의점/마트" },
  { emoji: "💄", name: "뷰티/미용" },
  { emoji: "🚚", name: "물류/배송" },
  { emoji: "💼", name: "사무/행정" },
  { emoji: "🛍️", name: "판매/매장" },
  { emoji: "🎪", name: "이벤트/행사" },
  { emoji: "📚", name: "교육/돌봄" },
  { emoji: "🏥", name: "의료/복지" },
  { emoji: "🏗️", name: "생산/제조" },
  { emoji: "⛏️", name: "건설/노무" },
  { emoji: "📦", name: "기타" },
];

// 카카오 category_group_name → 우리 카테고리 매핑 (job_categories 부모 이름과 일치)
const KAKAO_CAT_MAP: Record<string, string> = {
  "음식점": "식당/음식점", "한식": "식당/음식점", "일식": "식당/음식점",
  "중식": "식당/음식점", "양식": "식당/음식점", "패스트푸드": "식당/음식점",
  "분식": "식당/음식점", "술집": "식당/음식점",
  "카페": "카페/음료", "커피": "카페/음료", "제과": "카페/음료",
  "베이커리": "카페/음료", "디저트": "카페/음료",
  "편의점": "편의점/마트", "마트": "편의점/마트", "슈퍼마켓": "편의점/마트",
  "미용실": "뷰티/미용", "네일": "뷰티/미용", "피부": "뷰티/미용",
  "물류": "물류/배송", "배송": "물류/배송",
};

function mapKakaoCategory(categoryName: string): string {
  for (const [key, val] of Object.entries(KAKAO_CAT_MAP)) {
    if (categoryName.includes(key)) return val;
  }
  return "";
}

interface Props {
  userId: string;
  existingStore?: any;
  onClose: () => void;
  onSaved: () => void;
}

export default function StoreRegisterModal({ userId, existingStore, onClose, onSaved }: Props) {
  const isEdit = !!existingStore;
  const [bizName, setBizName] = useState(existingStore?.business_name || "");
  const [bizType, setBizType] = useState(existingStore?.business_type || "");
  // region은 항상 도로명만 저장 — address는 구버전에서 상세 합쳐진 경우 있어 region 우선
  const [address, setAddress] = useState(existingStore?.region || existingStore?.address || "");
  const [addressDetail, setAddressDetail] = useState(existingStore?.address_detail || "");
  const [lat, setLat] = useState<number | null>(existingStore?.lat || null);
  const [lng, setLng] = useState<number | null>(existingStore?.lng || null);
  const [bizTel, setBizTel] = useState(existingStore?.biz_tel || "");
  const [description, setDescription] = useState(existingStore?.description || "");
  const [logoUrl, setLogoUrl] = useState<string | null>(existingStore?.logo_url || null);
  const [imageUrls, setImageUrls] = useState<string[]>(existingStore?.image_urls || (existingStore?.image_url ? [existingStore.image_url] : []));
  const [videoUrl, setVideoUrl] = useState<string | null>(existingStore?.video_url || null);
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [directInput, setDirectInput] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [showConfirm, setShowConfirm] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [logoUploading, setLogoUploading] = useState(false);
  const [tempImage, setTempImage] = useState<{ src: string; aspect: number; type: "logo" | "cover" } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const logoFileRef = useRef<HTMLInputElement>(null);

  const handleNameSearch = async (val: string) => {
    setBizName(val);
    if (directInput || val.length < 2) { setSearchResults([]); return; }
    try {
      const res = await fetch(
        `https://dapi.kakao.com/v2/local/search/keyword.json?query=${encodeURIComponent(val)}&size=5`,
        { headers: { Authorization: `KakaoAK 02e1711115a492598ea97b18764fc597` } }
      );
      const data = await res.json();
      setSearchResults(data.documents || []);
    } catch {}
  };

  const selectPlace = (place: any) => {
    setBizName(place.place_name);
    const addr = place.road_address_name || place.address_name || "";
    setAddress(addr);
    if (place.x) setLng(parseFloat(place.x));
    if (place.y) setLat(parseFloat(place.y));
    const autoType = mapKakaoCategory(place.category_group_name || place.category_name || "");
    if (autoType) setBizType(autoType);
    setSearchResults([]);
  };

  const openDaumPostcode = () => {
    const load = () => {
      new (window as any).daum.Postcode({
        oncomplete: async (data: any) => {
          const fullAddress = data.roadAddress || data.jibunAddress;
          setAddress(fullAddress);
          setAddressDetail("");
          try {
            const res = await fetch(
              `https://dapi.kakao.com/v2/local/search/address.json?query=${encodeURIComponent(fullAddress)}`,
              { headers: { Authorization: "KakaoAK 02e1711115a492598ea97b18764fc597" } }
            );
            const resData = await res.json();
            if (resData.documents && resData.documents.length > 0) {
              setLng(parseFloat(resData.documents[0].x));
              setLat(parseFloat(resData.documents[0].y));
            }
          } catch {}
        },
      }).open();
    };
    if ((window as any).daum?.Postcode) { load(); return; }
    const s = document.createElement("script");
    s.src = "//t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js";
    s.onload = load;
    document.head.appendChild(s);
  };

  const uploadLogoBlob = async (blob: Blob) => {
    setLogoUploading(true);
    setError("");
    const path = `employer/logos/${userId}_${Date.now()}.jpg`;
    const { error: upErr } = await supabase.storage.from("media").upload(path, blob, { upsert: true });
    if (upErr) {
      setError("로고 업로드 실패: " + upErr.message);
    } else {
      const { data } = supabase.storage.from("media").getPublicUrl(path);
      setLogoUrl(`${data.publicUrl}?t=${Date.now()}`);
    }
    setLogoUploading(false);
  };

  const uploadCoverBlob = async (blob: Blob) => {
    setUploading(true);
    setError("");
    const path = `employer/${userId}_${Date.now()}.jpg`;
    const { error: upErr } = await supabase.storage.from("media").upload(path, blob, { upsert: true });
    if (upErr) {
      setError("업로드 실패: " + upErr.message);
    } else {
      const { data } = supabase.storage.from("media").getPublicUrl(path);
      setImageUrls(p => [...p.slice(0, 9), `${data.publicUrl}?t=${Date.now()}`]);
    }
    setUploading(false);
  };

  const uploadFileDirectly = async (file: File, isVideo: boolean) => {
    setUploading(true);
    setError("");
    const ext = file.name.split(".").pop() || "jpg";
    const path = `employer/${isVideo ? "videos/" : ""}${userId}_${Date.now()}.${ext}`;
    const { error: upErr } = await supabase.storage.from("media").upload(path, file, { upsert: true });
    if (upErr) {
      setError("업로드 실패: " + upErr.message);
    } else {
      const { data } = supabase.storage.from("media").getPublicUrl(path);
      if (isVideo) setVideoUrl(data.publicUrl);
      else setImageUrls(p => [...p.slice(0, 9), `${data.publicUrl}?t=${Date.now()}`]);
    }
    setUploading(false);
  };

  const handleLogoFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setTempImage({ src: reader.result as string, aspect: 1, type: "logo" });
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const isVideo = file.type.startsWith("video/");
    if (isVideo) {
      uploadFileDirectly(file, true);
    } else {
      const reader = new FileReader();
      reader.onload = () => {
        setTempImage({ src: reader.result as string, aspect: 16 / 9, type: "cover" });
      };
      reader.readAsDataURL(file);
    }
    e.target.value = "";
  };

  const handleSave = async () => {
    if (!bizName.trim()) { setError("매장명을 입력해주세요"); return; }
    if (!bizType) { setError("업종을 선택해주세요"); return; }
    if (!address) { setError("주소를 입력해주세요"); return; }
    setSaving(true); setError("");
    // 시도, 시군구, 읍면동 세분화 파싱
    const addrParts = address.split(" ");
    const sidoVal = addrParts[0] || null;
    const sigunguVal = addrParts[1] || null;
    let eupmyeondongVal = null;
    const thirdWord = addrParts[2] || "";
    if (thirdWord.endsWith("동") || thirdWord.endsWith("읍") || thirdWord.endsWith("면") || thirdWord.endsWith("리") || thirdWord.endsWith("가")) {
      eupmyeondongVal = thirdWord;
    }

    // 업종 ID 매핑
    let categoryId = null;
    let categoryIds: string[] = [];
    try {
      const { data: catData } = await supabase.from("job_categories")
        .select("id")
        .eq("name", bizType)
        .is("parent_id", null)
        .maybeSingle();
      if (catData) {
        categoryId = catData.id;
        categoryIds = [catData.id];
      }
    } catch {}

    const payload: any = {
      business_name: bizName.trim(),
      business_type: bizType,
      region: address,
      address: address,
      address_detail: addressDetail,
      sido: sidoVal,
      sigungu: sigunguVal,
      eupmyeondong: eupmyeondongVal,
      category_id: categoryId,
      category_ids: categoryIds,
      lat, lng,
      biz_tel: bizTel,
      description: description.trim(),
      logo_url: logoUrl,
      image_url: imageUrls[0] || null,
      image_urls: imageUrls,
      video_url: videoUrl,
      // 신규 매장은 is_active: false — 공고는 공고등록(/employer/register)에서 별도 처리
      // 수정 시엔 is_active 건드리지 않음 (공고 상태 유지)
    };
    let err;
    if (isEdit) {
      ({ error: err } = await supabase.from("employer_profiles").update(payload).eq("id", existingStore.id));
    } else {
      payload.user_id = userId;
      payload.is_active = false;

      // 신규 매장 등록 전, 기존 매장 중 가장 오래된 것 파악
      const { data: existingStores } = await supabase
        .from("employer_profiles")
        .select("id")
        .eq("user_id", userId)
        .or("is_deleted.is.null,is_deleted.eq.false")
        .not("business_name", "is", null)
        .order("created_at", { ascending: true })
        .limit(1);
      const oldestStoreId = existingStores?.[0]?.id ?? null;

      ({ error: err } = await supabase.from("employer_profiles").insert(payload));

      // 기존 팀원 중 employer_profile_id가 null인 경우 가장 오래된 매장으로 연결
      if (!err && oldestStoreId) {
        await supabase.from("team_members")
          .update({ employer_profile_id: oldestStoreId })
          .eq("employer_id", userId)
          .is("employer_profile_id", null);
      }
    }
    setSaving(false);
    if (err) { setError("저장 실패: " + err.message); return; }
    onSaved();
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 200, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
      <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.6)" }} onClick={onClose} />
      <div style={{
        position: "relative", width: "100%", maxWidth: 480,
        background: "var(--surface)", borderRadius: "20px 20px 0 0",
        padding: "0 0 40px", maxHeight: "92dvh", overflowY: "auto",
      }}>
        {/* 핸들 */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px 12px", borderBottom: "1px solid var(--border)", position: "sticky", top: 0, background: "var(--surface)", zIndex: 1 }}>
          <span style={{ fontSize: 16, fontWeight: 800, color: "var(--text)" }}>{isEdit ? "매장 정보 수정" : "매장 등록하기"}</span>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "var(--text-muted)", fontSize: 20, cursor: "pointer", padding: 4 }}>✕</button>
        </div>

        <div style={{ padding: "20px 20px 0", display: "flex", flexDirection: "column", gap: 20 }}>

          {/* 매장 로고 */}
          <div>
            <label style={{ fontSize: 12, color: "var(--text-muted)", display: "block", marginBottom: 8 }}>🏪 매장 로고 (아바타용)</label>
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <div style={{ position: "relative", width: 68, height: 68, borderRadius: 12, overflow: "hidden", border: "1px solid var(--border)", background: "var(--surface2)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                {logoUrl ? (
                  <img src={logoUrl} alt="logo" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                ) : (
                  <span style={{ fontSize: 24 }}>🏪</span>
                )}
                {logoUploading && (
                  <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, color: "#fff" }}>업로드...</div>
                )}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <input ref={logoFileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handleLogoFile} />
                <div style={{ display: "flex", gap: 6 }}>
                  <button type="button" onClick={() => logoFileRef.current?.click()} disabled={logoUploading}
                    style={{ ...btnSecondary, width: "auto", padding: "6px 12px", fontSize: 11 }}>
                    사진 변경
                  </button>
                  {logoUrl && (
                    <button type="button" onClick={() => setLogoUrl(null)}
                      style={{ ...btnSecondary, width: "auto", padding: "6px 12px", fontSize: 11, color: "#f87171" }}>
                      삭제
                    </button>
                  )}
                </div>
                <span style={{ fontSize: 10, color: "var(--text-muted)" }}>채팅, 피드 아바타 등에 둥근 사각형으로 표시될 로고입니다.</span>
              </div>
            </div>
          </div>

          {/* 상호명 */}
          <div style={{ position: "relative" }}>
            <label style={{ fontSize: 12, color: "var(--text-muted)", display: "block", marginBottom: 8 }}>🏪 매장명 *</label>
            <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
              <button onClick={() => { setDirectInput(false); setSearchResults([]); }}
                style={{ flex: 1, padding: "7px", borderRadius: 10, fontSize: 12, cursor: "pointer", border: "none",
                  background: !directInput ? "linear-gradient(135deg,#7c3aed,#ec4899)" : "var(--surface2)",
                  color: !directInput ? "#fff" : "var(--text-muted)", fontWeight: !directInput ? 700 : 400 }}>
                🔍 검색으로 찾기
              </button>
              <button onClick={() => { setDirectInput(true); setSearchResults([]); }}
                style={{ flex: 1, padding: "7px", borderRadius: 10, fontSize: 12, cursor: "pointer", border: "none",
                  background: directInput ? "linear-gradient(135deg,#7c3aed,#ec4899)" : "var(--surface2)",
                  color: directInput ? "#fff" : "var(--text-muted)", fontWeight: directInput ? 700 : 400 }}>
                ✏️ 직접 입력
              </button>
            </div>
            <input
              value={bizName}
              onChange={e => handleNameSearch(e.target.value)}
              placeholder={directInput ? "매장명을 직접 입력하세요" : "매장명으로 검색하세요"}
              style={inputStyle}
            />
            {directInput && (
              <p style={{ fontSize: 11, color: "var(--text-muted)", margin: "6px 0 0" }}>📍 직접 입력 시 아래에서 주소를 검색해 주세요</p>
            )}
            {searchResults.length > 0 && (
              <div style={{ position: "absolute", top: "100%", left: 0, right: 0, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, zIndex: 50, overflow: "hidden", boxShadow: "0 8px 24px rgba(0,0,0,0.4)" }}>
                {searchResults.map((p: any, i: number) => (
                  <button key={i} onClick={() => selectPlace(p)}
                    style={{ width: "100%", background: "none", border: "none", padding: "10px 14px", cursor: "pointer", textAlign: "left", borderBottom: i < searchResults.length - 1 ? "1px solid var(--border)" : "none" }}>
                    <p style={{ fontSize: 13, fontWeight: 600, margin: "0 0 2px", color: "var(--text)" }}>{p.place_name}</p>
                    <p style={{ fontSize: 11, color: "var(--text-muted)", margin: 0 }}>{p.road_address_name || p.address_name}</p>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* 업종 */}
          <div>
            <label style={{ fontSize: 12, color: "var(--text-muted)", display: "block", marginBottom: 8 }}>📂 업종 *</label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {BIZ_CATEGORIES.map(cat => (
                <button key={cat.name} onClick={() => setBizType(cat.name)}
                  style={{ padding: "7px 14px", borderRadius: 20, fontSize: 13, cursor: "pointer", border: "none",
                    background: bizType === cat.name ? "linear-gradient(135deg,#7c3aed,#ec4899)" : "var(--surface2)",
                    color: bizType === cat.name ? "#fff" : "var(--text-muted)",
                    fontWeight: bizType === cat.name ? 700 : 400 }}>
                  {cat.emoji} {cat.name}
                </button>
              ))}
            </div>
          </div>

          {/* 주소 */}
          <div>
            <label style={{ fontSize: 12, color: "var(--text-muted)", display: "block", marginBottom: 6 }}>📍 주소 *</label>
            <div style={{ display: "flex", gap: 6 }}>
              <input value={address} readOnly placeholder="주소 검색" style={{ ...inputStyle, flex: 1 }} />
              <button onClick={openDaumPostcode}
                style={{ ...btnSecondary, width: "auto", padding: "10px 14px", fontSize: 12 }}>🔍 검색</button>
            </div>
            {address && (
              <input value={addressDetail} onChange={e => setAddressDetail(e.target.value)}
                placeholder="상세주소 (동·호수·층 등)" style={{ ...inputStyle, marginTop: 6 }} />
            )}
          </div>

          {/* 대표번호 */}
          <div>
            <label style={{ fontSize: 12, color: "var(--text-muted)", display: "block", marginBottom: 6 }}>📞 대표번호 (선택)</label>
            <input value={bizTel} onChange={e => setBizTel(e.target.value)} placeholder="02-0000-0000" style={inputStyle} />
          </div>

          {/* 설명(소개글) */}
          <div>
            <label style={{ fontSize: 12, color: "var(--text-muted)", display: "block", marginBottom: 6 }}>📝 매장 소개글 (선택)</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="매장 소개 및 안내 문구를 입력하세요."
              rows={3}
              style={{ ...inputStyle, resize: "none", height: "auto", padding: "10px 12px" }}
            />
          </div>

          {/* 미디어 */}
          <div>
            <label style={{ fontSize: 12, color: "var(--text-muted)", display: "block", marginBottom: 8 }}>📸 매장 커버 및 홍보 사진 / 영상 <span style={{ fontSize: 11, opacity: 0.6 }}>(사진 최대 10장, 영상 1개)</span></label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
              {videoUrl && (
                <div style={{ position: "relative", width: 80, height: 80, borderRadius: 12, overflow: "hidden", border: "1px solid var(--border)" }}>
                  <video src={videoUrl} muted style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  <span style={{ position: "absolute", bottom: 3, left: 3, background: "rgba(124,58,237,0.9)", color: "#fff", fontSize: 8, padding: "1px 4px", borderRadius: 4 }}>영상</span>
                  <button onClick={() => setVideoUrl(null)} style={{ position: "absolute", top: 3, right: 3, background: "rgba(0,0,0,0.6)", border: "none", color: "#f87171", width: 18, height: 18, borderRadius: "50%", cursor: "pointer", fontSize: 10, padding: 0 }}>✕</button>
                </div>
              )}
              {imageUrls.map((url, i) => (
                <div key={url} style={{ position: "relative", width: 80, height: 80, borderRadius: 12, overflow: "hidden", border: "1px solid var(--border)" }}>
                  <img src={url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  <button onClick={() => setImageUrls(p => p.filter((_, j) => j !== i))} style={{ position: "absolute", top: 3, right: 3, background: "rgba(0,0,0,0.6)", border: "none", color: "#f87171", width: 18, height: 18, borderRadius: "50%", cursor: "pointer", fontSize: 10, padding: 0 }}>✕</button>
                </div>
              ))}
              {(imageUrls.length < 10 || !videoUrl) && (
                <label style={{ cursor: uploading ? "not-allowed" : "pointer" }}>
                  <input ref={fileRef} type="file" accept="image/*,video/mp4,video/quicktime" style={{ display: "none" }} onChange={handleFile} />
                  <div style={{ width: 80, height: 80, borderRadius: 12, border: "2px dashed var(--border)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "var(--surface2)", gap: 2 }}>
                    {uploading ? <span style={{ fontSize: 10, color: "var(--text-muted)", textAlign: "center" }}>업로드 중...</span> : <><span style={{ fontSize: 22 }}>+</span><span style={{ fontSize: 10, color: "var(--text-muted)" }}>추가</span></>}
                  </div>
                </label>
              )}
            </div>
          </div>

          {error && <p style={{ color: "#f87171", fontSize: 13, textAlign: "center", margin: 0 }}>{error}</p>}

          <button onClick={() => isEdit ? setShowConfirm(true) : handleSave()} disabled={saving}
            style={{ ...btnPrimary, fontSize: 15, opacity: saving ? 0.7 : 1 }}>
            {saving ? "저장 중..." : isEdit ? "수정 완료 ✓" : "매장 등록하기 🎉"}
          </button>
        </div>
      </div>

      {/* 수정 확인 모달 */}
      {showConfirm && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
          <div style={{ background: "var(--surface)", borderRadius: 20, padding: 28, width: "100%", maxWidth: 340, textAlign: "center" }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>🏪</div>
            <p style={{ fontSize: 16, fontWeight: 800, color: "var(--text)", margin: "0 0 8px" }}>매장 정보를 수정할까요?</p>
            <p style={{ fontSize: 13, color: "var(--text-muted)", margin: "0 0 24px", lineHeight: 1.6 }}>
              변경된 내용이 저장되며<br />계약서 작성 시 자동으로 반영됩니다.
            </p>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setShowConfirm(false)}
                style={{ flex: 1, padding: 13, borderRadius: 12, background: "var(--surface2)", border: "1px solid var(--border)", color: "var(--text-muted)", fontSize: 14, cursor: "pointer" }}>
                취소
              </button>
              <button onClick={() => { setShowConfirm(false); handleSave(); }}
                style={{ flex: 1, padding: 13, borderRadius: 12, background: "linear-gradient(135deg,#7c3aed,#ec4899)", border: "none", color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
                수정 완료
              </button>
            </div>
          </div>
        </div>
      )}

      {tempImage && (
        <ImageCropModal
          imageSrc={tempImage.src}
          aspect={tempImage.aspect}
          onClose={() => setTempImage(null)}
          onCrop={async (blob) => {
            setTempImage(null);
            if (tempImage.type === "logo") {
              await uploadLogoBlob(blob);
            } else {
              await uploadCoverBlob(blob);
            }
          }}
        />
      )}
    </div>
  );
}
