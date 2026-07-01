"use client";
import { useState, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { modalOverlay, modalSheet, btnPrimary, btnSecondary, inputStyle } from "@/lib/styles";

const BIZ_CATEGORIES = [
  { emoji: "🍽️", name: "음식점" },
  { emoji: "☕", name: "카페" },
  { emoji: "🏪", name: "편의점" },
  { emoji: "🛒", name: "마트/슈퍼" },
  { emoji: "💊", name: "약국" },
  { emoji: "👗", name: "의류/잡화" },
  { emoji: "💈", name: "미용/뷰티" },
  { emoji: "🏋️", name: "스포츠/레저" },
  { emoji: "🏨", name: "숙박/관광" },
  { emoji: "🚚", name: "물류/배달" },
  { emoji: "🏗️", name: "건설/제조" },
  { emoji: "📦", name: "기타" },
];

// 카카오 category_group_name → 우리 카테고리 매핑
const KAKAO_CAT_MAP: Record<string, string> = {
  "음식점": "음식점", "카페": "카페", "편의점": "편의점",
  "마트": "마트/슈퍼", "슈퍼마켓": "마트/슈퍼",
  "약국": "약국", "의류": "의류/잡화", "미용실": "미용/뷰티",
  "스포츠": "스포츠/레저", "숙박": "숙박/관광",
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
  const [address, setAddress] = useState(existingStore?.address || existingStore?.region || "");
  const [addressDetail, setAddressDetail] = useState(existingStore?.address_detail || "");
  const [lat, setLat] = useState<number | null>(existingStore?.lat || null);
  const [lng, setLng] = useState<number | null>(existingStore?.lng || null);
  const [bizTel, setBizTel] = useState(existingStore?.biz_tel || "");
  const [imageUrls, setImageUrls] = useState<string[]>(existingStore?.image_urls || (existingStore?.image_url ? [existingStore.image_url] : []));
  const [videoUrl, setVideoUrl] = useState<string | null>(existingStore?.video_url || null);
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [directInput, setDirectInput] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

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
        oncomplete: (data: any) => {
          setAddress(data.roadAddress || data.jibunAddress);
          setAddressDetail("");
        },
      }).open();
    };
    if ((window as any).daum?.Postcode) { load(); return; }
    const s = document.createElement("script");
    s.src = "//t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js";
    s.onload = load;
    document.head.appendChild(s);
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    setUploading(true);
    const isVideo = file.type.startsWith("video/");
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

  const handleSave = async () => {
    if (!bizName.trim()) { setError("매장명을 입력해주세요"); return; }
    if (!bizType) { setError("업종을 선택해주세요"); return; }
    if (!address) { setError("주소를 입력해주세요"); return; }
    setSaving(true); setError("");
    const payload: any = {
      business_name: bizName.trim(),
      business_type: bizType,
      region: address,
      address: [address, addressDetail].filter(Boolean).join(" "),
      address_detail: addressDetail,
      lat, lng,
      biz_tel: bizTel,
      image_url: imageUrls[0] || null,
      image_urls: imageUrls,
      video_url: videoUrl,
      is_active: true,
    };
    let err;
    if (isEdit) {
      ({ error: err } = await supabase.from("employer_profiles").update(payload).eq("id", existingStore.id));
    } else {
      payload.user_id = userId;
      ({ error: err } = await supabase.from("employer_profiles").insert(payload));
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

          {/* 미디어 */}
          <div>
            <label style={{ fontSize: 12, color: "var(--text-muted)", display: "block", marginBottom: 8 }}>📸 매장 사진 / 영상 <span style={{ fontSize: 11, opacity: 0.6 }}>(사진 최대 10장, 영상 1개)</span></label>
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

          <button onClick={handleSave} disabled={saving}
            style={{ ...btnPrimary, fontSize: 15, opacity: saving ? 0.7 : 1 }}>
            {saving ? "저장 중..." : isEdit ? "수정 완료 ✓" : "매장 등록하기 🎉"}
          </button>
        </div>
      </div>
    </div>
  );
}
