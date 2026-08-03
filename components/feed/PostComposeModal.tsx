"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import ImageCropModal from "@/components/ImageCropModal";

const isVideoFile = (file: File) => {
  if (!file) return false;
  if (file.type && file.type.startsWith("video/")) return true;
  const ext = file.name.split(".").pop()?.toLowerCase();
  return ext ? ["mp4", "webm", "ogg", "mov", "avi", "mkv", "quicktime"].includes(ext) : false;
};

interface Props {
  userId: string;
  employerProfileId?: string | null; // 매장 소식으로 고정 귀속할 매장 id (없으면 개인 소식)
  title?: string;
  placeholder?: string;
  onClose: () => void;
  onPosted: (post: any) => void;
}

// /feed 페이지를 거치지 않고 프로필/매장홈 등 어디서든 바로 뜰 수 있는 가벼운 소식 작성 모달.
// 전체 피드 훑어보기 페이지로 이동시키지 않기 위해 /feed 내부 작성 로직을 독립시켰다.
// 사진은 그리드에서 정사각형으로 보여지므로, 올리기 전에 직접 구도를 잡을 수 있게 크롭 단계를 거친다.
export default function PostComposeModal({ userId, employerProfileId = null, title = "새 소식 등록", placeholder = "오늘의 이야기를 들려주세요... ✨", onClose, onPosted }: Props) {
  const [content, setContent] = useState("");
  const [mediaFiles, setMediaFiles] = useState<File[]>([]);
  const [mediaPreviews, setMediaPreviews] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);

  // 이미지 크롭 큐 — 여러 장을 한 번에 고르면 한 장씩 순서대로 크롭
  const [cropQueue, setCropQueue] = useState<File[]>([]);
  const [cropTarget, setCropTarget] = useState<{ file: File; url: string; editIndex: number | null } | null>(null);

  const openCrop = (file: File, editIndex: number | null) => {
    setCropTarget({ file, url: URL.createObjectURL(file), editIndex });
  };

  const handleMediaChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files ? Array.from(e.target.files) : [];
    if (files.length === 0) return;
    e.target.value = ""; // 같은 파일 재선택도 onChange가 다시 뜨도록

    const images = files.filter(f => !isVideoFile(f));
    const videos = files.filter(f => isVideoFile(f));

    // 비디오는 크롭 없이 바로 추가
    if (videos.length > 0) {
      const previews = videos.map(file => URL.createObjectURL(file));
      setMediaFiles(prev => [...prev, ...videos]);
      setMediaPreviews(prev => [...prev, ...previews]);
    }

    // 이미지는 한 장씩 순서대로 크롭 화면으로
    if (images.length > 0) {
      const [first, ...rest] = images;
      setCropQueue(rest);
      openCrop(first, null);
    }
  };

  const handleCropDone = (blob: Blob) => {
    if (!cropTarget) return;
    const croppedFile = new File([blob], cropTarget.file.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" });
    const previewUrl = URL.createObjectURL(croppedFile);

    if (cropTarget.editIndex != null) {
      setMediaFiles(prev => prev.map((f, i) => (i === cropTarget.editIndex ? croppedFile : f)));
      setMediaPreviews(prev => prev.map((u, i) => (i === cropTarget.editIndex ? previewUrl : u)));
    } else {
      setMediaFiles(prev => [...prev, croppedFile]);
      setMediaPreviews(prev => [...prev, previewUrl]);
    }

    // 큐에 남은 다음 이미지로
    if (cropQueue.length > 0) {
      const [next, ...rest] = cropQueue;
      setCropQueue(rest);
      openCrop(next, null);
    } else {
      setCropTarget(null);
    }
  };

  const handleCropCancel = () => {
    if (!cropTarget) return;
    // 재수정 중 취소면 기존 사진 유지, 신규 선택 중 취소면 그 사진만 건너뛰고 큐의 다음으로
    if (cropTarget.editIndex == null && cropQueue.length > 0) {
      const [next, ...rest] = cropQueue;
      setCropQueue(rest);
      openCrop(next, null);
    } else {
      setCropTarget(null);
    }
  };

  const editPreview = (idx: number) => {
    const file = mediaFiles[idx];
    if (!file || isVideoFile(file)) return;
    openCrop(file, idx);
  };

  const removePreview = (idx: number) => {
    setMediaPreviews(prev => prev.filter((_, i) => i !== idx));
    setMediaFiles(prev => prev.filter((_, i) => i !== idx));
  };

  const handleSubmit = async () => {
    if (!content.trim() && mediaFiles.length === 0) return;
    setUploading(true);
    try {
      const uploadedUrls: string[] = [];
      for (const file of mediaFiles) {
        const fileExt = file.name.split(".").pop();
        const randId = Math.random().toString(36).substring(2, 9);
        const fileName = `${Date.now()}-${randId}.${fileExt}`;
        const path = `feeds/${userId}/${fileName}`;
        const { error: uploadError } = await supabase.storage.from("media").upload(path, file, { upsert: true });
        if (uploadError) throw uploadError;
        const { data } = supabase.storage.from("media").getPublicUrl(path);
        if (data?.publicUrl) uploadedUrls.push(data.publicUrl);
      }

      const mediaType = mediaFiles.some(f => isVideoFile(f)) ? "video" : "image";

      const res = await fetch("/api/feed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, media_urls: uploadedUrls, media_type: mediaType, employerProfileId }),
      });
      const data = await res.json();
      if (data.success) {
        onPosted(data.data);
        onClose();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setUploading(false);
    }
  };

  return (
    <>
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
        <div className="bg-surface rounded-3xl border border-border shadow-2xl w-full max-w-sm overflow-hidden flex flex-col">
          <div className="flex justify-between items-center px-4 py-3 border-b border-border">
            <span className="font-bold text-sm">{title}</span>
            <button onClick={onClose} className="text-text-muted hover:text-text focus:outline-none">
              <i className="ti ti-x text-lg" aria-hidden="true" />
            </button>
          </div>

          <div className="p-4 flex flex-col gap-4">
            <textarea placeholder={placeholder}
              value={content}
              onChange={e => setContent(e.target.value)}
              rows={4}
              className="w-full text-xs bg-surface2 border border-border rounded-xl p-3 focus:outline-none focus:ring-1 focus:ring-primary resize-none leading-relaxed" />

            <div className="flex flex-col gap-2">
              <span className="text-[10px] font-bold text-text-sub">사진 또는 비디오 추가</span>
              <label className="w-full h-24 border border-dashed border-border rounded-xl bg-surface2 hover:bg-surface2/50 cursor-pointer transition flex flex-col items-center justify-center gap-1.5">
                <input type="file" accept="image/*,video/*" multiple onChange={handleMediaChange} className="hidden" />
                <i className="ti ti-camera text-2xl text-text-muted" aria-hidden="true" />
                <span className="text-[10px] text-text-muted">사진 최대 10장 / 동영상 1개</span>
              </label>
            </div>

            {mediaPreviews.length > 0 && (
              <div className="flex gap-2 overflow-x-auto py-1 scrollbar-thin">
                {mediaPreviews.map((url, idx) => {
                  const isVideo = isVideoFile(mediaFiles[idx]);
                  return (
                    <div key={idx} onClick={() => !isVideo && editPreview(idx)}
                      className="relative w-16 h-16 rounded-lg overflow-hidden border border-border flex-shrink-0 bg-black"
                      style={{ cursor: isVideo ? "default" : "pointer" }}>
                      {isVideo ? (
                        <video src={url} className="w-full h-full object-cover" />
                      ) : (
                        <img src={url} alt={`preview-${idx}`} className="w-full h-full object-cover" />
                      )}
                      {!isVideo && (
                        <div className="absolute bottom-0 left-0 right-0 bg-black/55 flex items-center justify-center py-0.5">
                          <i className="ti ti-crop text-white text-[10px]" aria-hidden="true" />
                        </div>
                      )}
                      <button onClick={(e) => { e.stopPropagation(); removePreview(idx); }} className="absolute top-0.5 right-0.5 bg-black/70 text-white w-4 h-4 rounded-full flex items-center justify-center hover:bg-black focus:outline-none">
                        <i className="ti ti-x text-[8px]" aria-hidden="true" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="px-4 py-3 border-t border-border flex gap-2 justify-end bg-surface2">
            <button onClick={onClose} disabled={uploading}
              className="px-4 py-2 rounded-xl text-xs font-bold transition active:scale-95"
              style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text-sub)" }}>
              취소
            </button>
            <button onClick={handleSubmit} disabled={uploading || (!content.trim() && mediaFiles.length === 0)}
              className="px-4 py-2 rounded-xl text-xs font-bold transition active:scale-95 disabled:opacity-50"
              style={{ background: "var(--primary)", color: "#fff" }}>
              {uploading ? "업로드 중..." : "공유하기"}
            </button>
          </div>
        </div>
      </div>

      {cropTarget && (
        <ImageCropModal
          imageSrc={cropTarget.url}
          aspect={1}
          onClose={handleCropCancel}
          onCrop={handleCropDone}
        />
      )}
    </>
  );
}
