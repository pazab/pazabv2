"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { btnPrimary } from "@/lib/styles";
import ImageCropModal from "@/components/ImageCropModal";
import { convertHeicIfNeeded } from "@/lib/heicConvert";

interface GalleryEditFormProps {
  userId: string;
  profileId?: string;
  onSaved: () => void;
}

// 구직카드 히어로 사진/영상 전용 편집 — /worker/profile(?start=gallery)와 /worker/[id]의
// 히어로 사진 위 연필 아이콘 팝업이 같이 씀. 이력서 본문(직종/자격증/자기소개 등)은 안 건드림(독립 저장).
export default function GalleryEditForm({ userId, profileId, onSaved }: GalleryEditFormProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [existingProfileId, setExistingProfileId] = useState<string | null>(null);

  const [imageUrls, setImageUrls] = useState<string[]>([]);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoUploading, setVideoUploading] = useState(false);
  const [imageUploading, setImageUploading] = useState(false);
  const [cropperOpen, setCropperOpen] = useState(false);
  const [tempImageSrc, setTempImageSrc] = useState<string | null>(null);
  const [originalFileName, setOriginalFileName] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const query = supabase.from("worker_profiles").select("id, image_url, image_urls, video_url");
      const { data } = profileId
        ? await query.eq("id", profileId).maybeSingle()
        : await query.eq("user_id", userId).order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (cancelled) return;
      if (data) {
        setExistingProfileId(data.id);
        setImageUrls(data.image_urls || (data.image_url ? [data.image_url] : []));
        setVideoUrl(data.video_url || null);
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [userId, profileId]);

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

  const handleSave = async () => {
    setSaving(true); setError("");
    const mediaFields = {
      image_url: imageUrls[0] || null,
      image_urls: imageUrls,
      video_url: videoUrl || null,
    };
    const { error } = existingProfileId
      ? await supabase.from("worker_profiles").update(mediaFields).eq("id", existingProfileId)
      : await supabase.from("worker_profiles").insert({ user_id: userId, ...mediaFields });
    if (error) { setSaving(false); setError("저장 중 오류: " + error.message); return; }

    if (mediaFields.image_url) {
      await supabase.from("users").update({ avatar_url: mediaFields.image_url }).eq("id", userId);
      // 매장 사진이 아직 없는 경우에만 대체 채움 — 이미 매장 고유 사진이 있으면 덮어쓰지 않음
      await supabase.from("employer_profiles").update({ image_url: mediaFields.image_url }).eq("user_id", userId).is("image_url", null);
    }
    setSaving(false);
    onSaved();
  };

  if (loading) return <p style={{ color: "var(--text-muted)", fontSize: 14, textAlign: "center", padding: "30px 0" }}>불러오는 중...</p>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div>
        <label style={{ fontSize: 14, fontWeight: 700, display: "block", marginBottom: 8 }}>
          🖼️ 구직카드 사진 갤러리 <span style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 400 }}>(사진 최대 10장, 영상 1개, 권장 3:2 비율)</span>
        </label>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 12 }}>
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
          {imageUrls.map((url, index) => (
            <div key={url} style={{ position: "relative", width: 90, height: 90, borderRadius: 12, overflow: "hidden", border: "1px solid var(--border)", background: "var(--surface2)" }}>
              <img src={url} alt={`프로필사진 ${index + 1}`} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              <button onClick={(e) => { e.preventDefault(); setImageUrls(prev => prev.filter((_, i) => i !== index)); }}
                style={{ position: "absolute", top: 4, right: 4, background: "rgba(0,0,0,0.6)", border: "none", color: "#f87171", width: 20, height: 20, borderRadius: "50%", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, padding: 0 }}>
                ✕
              </button>
            </div>
          ))}
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
      {error && <p style={{ color: "#f87171", fontSize: 13, textAlign: "center" }}>{error}</p>}
      <button onClick={handleSave} disabled={saving}
        style={{ ...btnPrimary, fontSize: 15, opacity: saving ? 0.7 : 1 }}>
        {saving ? "저장 중..." : "저장하기 ✓"}
      </button>

      {cropperOpen && tempImageSrc && (
        <ImageCropModal
          imageSrc={tempImageSrc}
          aspect={3 / 2}
          onCrop={handleCropComplete}
          onClose={() => {
            setCropperOpen(false);
            setTempImageSrc(null);
          }}
        />
      )}
    </div>
  );
}
