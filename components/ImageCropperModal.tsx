"use client";

import React, { useState, useEffect, useRef } from "react";

interface ImageCropperModalProps {
  imageSrc: string;
  onCrop: (blob: Blob) => void;
  onClose: () => void;
  aspectRatio?: number; // 가로 / 세로 비율
}

export default function ImageCropperModal({
  imageSrc,
  onCrop,
  onClose,
  aspectRatio = 16 / 9,
}: ImageCropperModalProps) {
  const imgRef = useRef<HTMLImageElement>(null);
  const [zoom, setZoom] = useState(1.0);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0 });

  const [selectedRatio, setSelectedRatio] = useState(aspectRatio);

  // 크롭 윈도우 기본 크기 (반응형)
  const [cropDimensions, setCropDimensions] = useState({ width: 320, height: 180 });
  // 원본 및 화면 표시용 이미지 크기 정보
  const [imageSize, setImageSize] = useState({ iw: 0, ih: 0, nw: 0, nh: 0 });

  // 화면 크기에 맞추어 크롭 박스 크기 동적 조절
  useEffect(() => {
    const updateDimensions = () => {
      const maxWidth = Math.min(window.innerWidth - 42, 400);
      const width = maxWidth;
      const height = maxWidth / selectedRatio;
      setCropDimensions({ width, height });
    };

    updateDimensions();
    window.addEventListener("resize", updateDimensions);
    return () => window.removeEventListener("resize", updateDimensions);
  }, [selectedRatio]);

  const recalculateImageSize = (ratio: number) => {
    const img = imgRef.current;
    if (!img) return;
    const nw = img.naturalWidth;
    const nh = img.naturalHeight;

    const maxWidth = Math.min(window.innerWidth - 42, 400);
    const cw = maxWidth;
    const ch = maxWidth / ratio;

    const scaleX = cw / nw;
    const scaleY = ch / nh;
    const baseScale = Math.max(scaleX, scaleY);

    const iw = nw * baseScale;
    const ih = nh * baseScale;

    setImageSize({ iw, ih, nw, nh });
    setOffset({ x: 0, y: 0 });
    setZoom(1.0);
  };

  const handleRatioChange = (newRatio: number) => {
    setSelectedRatio(newRatio);
    recalculateImageSize(newRatio);
  };

  const handleImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    const nw = img.naturalWidth;
    const nh = img.naturalHeight;

    const cw = cropDimensions.width;
    const ch = cropDimensions.height;

    // 이미지가 크롭 윈도우를 cover하도록 기본 스케일 계산
    const scaleX = cw / nw;
    const scaleY = ch / nh;
    const baseScale = Math.max(scaleX, scaleY);

    const iw = nw * baseScale;
    const ih = nh * baseScale;

    setImageSize({ iw, ih, nw, nh });
    setOffset({ x: 0, y: 0 });
    setZoom(1.0);
  };

  // offset의 한계 구하기
  const getConstrainedOffset = (x: number, y: number, currentZoom: number) => {
    const { iw, ih } = imageSize;
    if (iw === 0 || ih === 0) return { x: 0, y: 0 };

    const cw = cropDimensions.width;
    const ch = cropDimensions.height;

    const maxX = Math.max(0, (iw * currentZoom - cw) / 2);
    const maxY = Math.max(0, (ih * currentZoom - ch) / 2);

    const constrainedX = Math.max(-maxX, Math.min(maxX, x));
    const constrainedY = Math.max(-maxY, Math.min(maxY, y));

    return { x: constrainedX, y: constrainedY };
  };

  // 마우스/터치 시작
  const handleStart = (clientX: number, clientY: number) => {
    setIsDragging(true);
    dragStart.current = { x: clientX - offset.x, y: clientY - offset.y };
  };

  // 마우스/터치 이동
  const handleMove = (clientX: number, clientY: number) => {
    if (!isDragging) return;
    const targetX = clientX - dragStart.current.x;
    const targetY = clientY - dragStart.current.y;

    setOffset(getConstrainedOffset(targetX, targetY, zoom));
  };

  // 마우스/터치 종료
  const handleEnd = () => {
    setIsDragging(false);
  };

  // 줌 조절 시 밖으로 벗어나는 것 방지
  const handleZoomChange = (newZoom: number) => {
    setZoom(newZoom);
    setOffset((prev) => getConstrainedOffset(prev.x, prev.y, newZoom));
  };

  // 크롭 처리
  const handleSave = () => {
    const { iw, ih, nw, nh } = imageSize;
    if (!nw || !nh || !imgRef.current) return;

    const cw = cropDimensions.width;
    const ch = cropDimensions.height;

    const ratio = (iw * zoom) / nw;

    // 이미지 좌상단 기준 크롭 윈도우의 픽셀 좌표
    const imageX = (iw * zoom) / 2 - cw / 2 - offset.x;
    const imageY = (ih * zoom) / 2 - ch / 2 - offset.y;

    const sourceX = imageX / ratio;
    const sourceY = imageY / ratio;
    const sourceWidth = cw / ratio;
    const sourceHeight = ch / ratio;

    const canvas = document.createElement("canvas");
    canvas.width = 1920; // 고화질 출력 (가로 최대 1920px)
    canvas.height = 1920 / selectedRatio;

    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.drawImage(
        imgRef.current,
        sourceX,
        sourceY,
        sourceWidth,
        sourceHeight,
        0,
        0,
        canvas.width,
        canvas.height
      );

      canvas.toBlob(
        (blob) => {
          if (blob) {
            onCrop(blob);
          }
        },
        "image/jpeg",
        0.85
      );
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 1000,
        background: "rgba(9, 9, 11, 0.85)",
        backdropFilter: "blur(10px)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        color: "#fff",
        fontFamily: "system-ui, sans-serif",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 440,
          background: "var(--surface, #18181b)",
          border: "1px solid var(--border, #27272a)",
          borderRadius: 24,
          padding: "24px 20px",
          display: "flex",
          flexDirection: "column",
          gap: 20,
          boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 10px 10px -5px rgba(0, 0, 0, 0.4)",
          boxSizing: "border-box",
        }}
      >
        {/* 헤더 */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "var(--text, #fff)" }}>
            🖼️ 사진 크롭하기
          </h3>
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              color: "var(--text-muted, #a1a1aa)",
              fontSize: 20,
              cursor: "pointer",
              padding: 0,
            }}
          >
            ×
          </button>
        </div>

        {/* 크롭 컨테이너 */}
        <div
          style={{
            position: "relative",
            width: "100%",
            height: 260,
            background: "#09090b",
            borderRadius: 16,
            overflow: "hidden",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            touchAction: "none",
            userSelect: "none",
          }}
          onMouseDown={(e) => handleStart(e.clientX, e.clientY)}
          onMouseMove={(e) => handleMove(e.clientX, e.clientY)}
          onMouseUp={handleEnd}
          onMouseLeave={handleEnd}
          onTouchStart={(e) => {
            if (e.touches[0]) {
              handleStart(e.touches[0].clientX, e.touches[0].clientY);
            }
          }}
          onTouchMove={(e) => {
            if (e.touches[0]) {
              handleMove(e.touches[0].clientX, e.touches[0].clientY);
            }
          }}
          onTouchEnd={handleEnd}
        >
          {/* 크롭 가이드 윈도우 */}
          <div
            style={{
              position: "absolute",
              width: cropDimensions.width,
              height: cropDimensions.height,
              border: "2px solid #8b5cf6",
              boxShadow: "0 0 0 9999px rgba(9, 9, 11, 0.65)",
              borderRadius: 8,
              zIndex: 10,
              pointerEvents: "none",
            }}
          />

          {/* 대상 이미지 */}
          {imageSrc && (
            <img
              ref={imgRef}
              src={imageSrc}
              alt="Crop target"
              onLoad={handleImageLoad}
              style={{
                position: "absolute",
                maxWidth: "none",
                maxHeight: "none",
                width: imageSize.iw * zoom || "auto",
                height: imageSize.ih * zoom || "auto",
                left: `calc(50% + ${offset.x}px)`,
                top: `calc(50% + ${offset.y}px)`,
                transform: "translate(-50%, -50%)",
                pointerEvents: "none", // 드래그 이벤트는 컨테이너에서 처리
              }}
            />
          )}
        </div>

        {/* 가이드 문구 */}
        <p style={{ margin: 0, fontSize: 12, color: "var(--text-muted, #a1a1aa)", textAlign: "center" }}>
          사진을 드래그해서 위치를 조정해보세요
        </p>

        {/* 비율 선택 버튼 */}
        <div style={{ display: "flex", justifyContent: "center", gap: 12, margin: "2px 0 6px" }}>
          {[
            { label: "16:9", val: 16 / 9 },
            { label: "4:3", val: 4 / 3 },
            { label: "3:2", val: 3 / 2 },
          ].map(r => (
            <button key={r.label} onClick={() => handleRatioChange(r.val)}
              style={{
                padding: "6px 12px",
                borderRadius: 10,
                fontSize: 12,
                border: "none",
                background: selectedRatio === r.val ? "linear-gradient(135deg, #8b5cf6, #7c3aed)" : "var(--surface2, #27272a)",
                color: "#fff",
                cursor: "pointer",
                fontWeight: selectedRatio === r.val ? 700 : 400
              }}>
              {r.label}
            </button>
          ))}
        </div>

        {/* 줌 컨트롤 슬라이더 */}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 13, color: "var(--text-muted, #a1a1aa)" }}>➖</span>
          <input
            type="range"
            min="1.0"
            max="3.0"
            step="0.05"
            value={zoom}
            onChange={(e) => handleZoomChange(parseFloat(e.target.value))}
            style={{
              flex: 1,
              accentColor: "#8b5cf6",
              height: 4,
              borderRadius: 2,
              background: "#27272a",
              cursor: "pointer",
            }}
          />
          <span style={{ fontSize: 13, color: "var(--text-muted, #a1a1aa)" }}>➕</span>
        </div>

        {/* 액션 버튼 */}
        <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
          <button
            onClick={onClose}
            style={{
              flex: 1,
              background: "var(--surface2, #27272a)",
              color: "var(--text, #fff)",
              border: "none",
              borderRadius: 14,
              padding: "12px 0",
              fontWeight: 600,
              fontSize: 14,
              cursor: "pointer",
            }}
          >
            취소
          </button>
          <button
            onClick={handleSave}
            style={{
              flex: 2,
              background: "linear-gradient(135deg, #8b5cf6, #7c3aed)",
              color: "#fff",
              border: "none",
              borderRadius: 14,
              padding: "12px 0",
              fontWeight: 700,
              fontSize: 14,
              cursor: "pointer",
              boxShadow: "0 4px 10px rgba(139, 92, 246, 0.3)",
            }}
          >
            크롭 완료 ✓
          </button>
        </div>
      </div>
    </div>
  );
}
