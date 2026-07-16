"use client";

import { useState, useRef, useEffect, MouseEvent as ReactMouseEvent, TouchEvent as ReactTouchEvent } from "react";
import { modalOverlay, modalSheet, btnPrimary, btnSecondary } from "@/lib/styles";

interface Props {
  imageSrc: string;
  aspect: number; // 가로/세로 비율 (예: 1, 16/9)
  isCircle?: boolean; // 원형 크롭 여부 (아바타 등)
  onClose: () => void;
  onCrop: (croppedBlob: Blob) => void;
}

export default function ImageCropModal({ imageSrc, aspect, isCircle = false, onClose, onCrop }: Props) {
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [imgLoaded, setImgLoaded] = useState(false);
  const [saving, setSaving] = useState(false);

  const imgRef = useRef<HTMLImageElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const isDragging = useRef(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const currentOffsetStart = useRef({ x: 0, y: 0 });

  // 뷰포트 기본 너비 설정 (모바일 스크린 크기에 맞춰 유연하게 조정)
  const vw = 280;
  const vh = 280 / aspect;

  // 마우스/터치 드래그 시작
  const handleStart = (clientX: number, clientY: number) => {
    if (!imgLoaded) return;
    isDragging.current = true;
    dragStart.current = { x: clientX, y: clientY };
    currentOffsetStart.current = { ...offset };
  };

  const handleMouseDown = (e: ReactMouseEvent) => {
    e.preventDefault();
    handleStart(e.clientX, e.clientY);
  };

  const handleTouchStart = (e: ReactTouchEvent) => {
    if (e.touches.length === 1) {
      handleStart(e.touches[0].clientX, e.touches[0].clientY);
    }
  };

  // 마우스/터치 드래그 중
  const handleMove = (clientX: number, clientY: number) => {
    if (!isDragging.current) return;
    const dx = clientX - dragStart.current.x;
    const dy = clientY - dragStart.current.y;
    setOffset({
      x: currentOffsetStart.current.x + dx,
      y: currentOffsetStart.current.y + dy,
    });
  };

  const handleMouseMove = (e: ReactMouseEvent) => {
    if (!isDragging.current) return;
    e.preventDefault();
    handleMove(e.clientX, e.clientY);
  };

  const handleTouchMove = (e: ReactTouchEvent) => {
    if (isDragging.current && e.touches.length === 1) {
      handleMove(e.touches[0].clientX, e.touches[0].clientY);
    }
  };

  // 드래그 종료
  const handleEnd = () => {
    isDragging.current = false;
  };

  useEffect(() => {
    const handleMouseUpGlobal = () => {
      isDragging.current = false;
    };
    window.addEventListener("mouseup", handleMouseUpGlobal);
    return () => window.removeEventListener("mouseup", handleMouseUpGlobal);
  }, []);

  // 자르기 처리
  const handleCropClick = () => {
    if (!imgRef.current || saving) return;
    setSaving(true);

    const img = imgRef.current;
    const iw = img.naturalWidth;
    const ih = img.naturalHeight;

    // 1. cover 스케일 계산 (뷰포트 채우기 최적 비율)
    const s0 = Math.max(vw / iw, vh / ih);
    const w_img = iw * s0 * zoom;
    const h_img = ih * s0 * zoom;

    // 2. 뷰포트 내부 좌표 계산
    const left = (vw - w_img) / 2 + offset.x;
    const top = (vh - h_img) / 2 + offset.y;

    // 3. 출력 캔버스 크기 결정 (디스플레이 퀄리티 확보를 위해 뷰포트의 약 2~2.5배 크기로 캔버스 렌더링)
    const cw = aspect === 1 ? 400 : 640;
    const ch = cw / aspect;

    const canvas = document.createElement("canvas");
    canvas.width = cw;
    canvas.height = ch;
    const ctx = canvas.getContext("2d");

    if (ctx) {
      // 뷰포트 -> 캔버스 스케일링 비율
      const ratio = cw / vw;
      const canvas_w = w_img * ratio;
      const canvas_h = h_img * ratio;
      const canvas_l = left * ratio;
      const canvas_t = top * ratio;

      // 흰색 캔버스 배경 채우기
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, cw, ch);

      // 드로잉
      ctx.drawImage(img, canvas_l, canvas_t, canvas_w, canvas_h);

      canvas.toBlob(
        (blob) => {
          if (blob) {
            onCrop(blob);
          }
          setSaving(false);
        },
        "image/jpeg",
        0.92
      );
    } else {
      setSaving(false);
    }
  };

  // 이미지 초기 로딩 시 기본 cover 사이즈 배치
  const getImgStyle = () => {
    if (!imgRef.current) return {};
    const img = imgRef.current;
    const iw = img.naturalWidth;
    const ih = img.naturalHeight;
    const s0 = Math.max(vw / iw, vh / ih);

    const w_img = iw * s0 * zoom;
    const h_img = ih * s0 * zoom;

    const left = (vw - w_img) / 2 + offset.x;
    const top = (vh - h_img) / 2 + offset.y;

    return {
      position: "absolute" as const,
      width: w_img,
      height: h_img,
      left: left,
      top: top,
      cursor: isDragging.current ? "grabbing" : "grab",
      userSelect: "none" as const,
      maxWidth: "none",
      maxHeight: "none",
    };
  };

  return (
    <div style={{ ...modalOverlay, zIndex: 350, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ ...modalSheet, width: "100%", maxWidth: 360, borderRadius: 28, padding: 24, display: "flex", flexDirection: "column", gap: 20, transform: "none", alignSelf: "center", maxHeight: "90vh" }}>
        
        {/* 헤더 */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 15, fontWeight: 800, color: "var(--text)" }}>사진 구도 조절</span>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "var(--text-muted)", fontSize: 18, cursor: "pointer", padding: 4 }}>✕</button>
        </div>

        {/* 안내문구 */}
        <p style={{ fontSize: 11, color: "var(--text-muted)", margin: 0, textAlign: "center" }}>
          사진을 드래그해서 위치를 맞추고,<br />아래 슬라이더로 크기를 조절해 보세요.
        </p>

        {/* 크롭 뷰포트 컨테이너 */}
        <div style={{ display: "flex", justifyContent: "center" }}>
          <div
            ref={containerRef}
            onMouseMove={handleMouseMove}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleEnd}
            onTouchCancel={handleEnd}
            style={{
              position: "relative",
              width: vw,
              height: vh,
              overflow: "hidden",
              borderRadius: isCircle ? "50%" : aspect === 1 ? "18px" : "12px",
              boxShadow: "0 0 0 9999px rgba(0,0,0,0.5), inset 0 0 0 2px rgba(255,255,255,0.4)",
              background: "#18181b",
              userSelect: "none",
            }}
          >
            <img
              ref={imgRef}
              src={imageSrc}
              alt="crop-source"
              onLoad={() => setImgLoaded(true)}
              onMouseDown={handleMouseDown}
              onTouchStart={handleTouchStart}
              onDragStart={(e) => e.preventDefault()}
              style={imgLoaded ? getImgStyle() : { display: "none" }}
            />
          </div>
        </div>

        {/* 줌 슬라이더 */}
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--text-muted)" }}>
            <span>확대 축소</span>
            <span>{Math.round(zoom * 100)}%</span>
          </div>
          <input
            type="range"
            min="1"
            max="3"
            step="0.01"
            value={zoom}
            onChange={(e) => {
              const nextZoom = parseFloat(e.target.value);
              setZoom(nextZoom);
            }}
            style={{
              width: "100%",
              height: 4,
              borderRadius: 2,
              background: "var(--border)",
              outline: "none",
              cursor: "pointer",
            }}
          />
        </div>

        {/* 버튼 영역 */}
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={onClose} style={{ ...btnSecondary, flex: 1, padding: "12px", fontSize: 13 }}>
            취소
          </button>
          <button
            onClick={handleCropClick}
            disabled={saving || !imgLoaded}
            style={{
              ...btnPrimary,
              flex: 1,
              padding: "12px",
              fontSize: 13,
              fontWeight: 700,
              opacity: saving || !imgLoaded ? 0.6 : 1,
            }}
          >
            {saving ? "자르는 중..." : "자르기 완료 ✓"}
          </button>
        </div>

      </div>
    </div>
  );
}
