"use client";

import { useState, useRef, useEffect, MouseEvent as ReactMouseEvent, TouchEvent as ReactTouchEvent, TouchList as ReactTouchList } from "react";
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
  const [minZoom, setMinZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [imgLoaded, setImgLoaded] = useState(false);
  const [imgError, setImgError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showGrid, setShowGrid] = useState(false);

  const imgRef = useRef<HTMLImageElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const isDragging = useRef(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const currentOffsetStart = useRef({ x: 0, y: 0 });
  const pinchStartDist = useRef<number | null>(null);
  const pinchStartZoom = useRef(1);

  // 뷰포트 기본 너비 설정 (모바일 스크린 크기에 맞춰 유연하게 조정)
  const vw = 280;
  const vh = 280 / aspect;

  const clampZoom = (z: number) => Math.max(minZoom, Math.min(3, z));

  // 사진이 뷰포트를 벗어나 빈 배경만 크롭되는 걸 막기 위한 최대 이동 범위
  const getMaxOffset = (currentZoom: number) => {
    const img = imgRef.current;
    if (!img || !img.naturalWidth) return { x: 0, y: 0 };
    const s0 = Math.max(vw / img.naturalWidth, vh / img.naturalHeight);
    const w_img = img.naturalWidth * s0 * currentZoom;
    const h_img = img.naturalHeight * s0 * currentZoom;
    return { x: Math.max(0, (w_img - vw) / 2), y: Math.max(0, (h_img - vh) / 2) };
  };

  const constrainOffset = (o: { x: number; y: number }, currentZoom: number) => {
    const max = getMaxOffset(currentZoom);
    return { x: Math.max(-max.x, Math.min(max.x, o.x)), y: Math.max(-max.y, Math.min(max.y, o.y)) };
  };

  // 마우스/터치 드래그 시작
  const handleStart = (clientX: number, clientY: number) => {
    if (!imgLoaded) return;
    isDragging.current = true;
    setShowGrid(true);
    dragStart.current = { x: clientX, y: clientY };
    currentOffsetStart.current = { ...offset };
  };

  const handleMouseDown = (e: ReactMouseEvent) => {
    e.preventDefault();
    handleStart(e.clientX, e.clientY);
  };

  const touchDistance = (touches: ReactTouchList) => {
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
  };

  const handleTouchStart = (e: ReactTouchEvent) => {
    if (e.touches.length === 2) {
      isDragging.current = false;
      pinchStartDist.current = touchDistance(e.touches);
      pinchStartZoom.current = zoom;
      setShowGrid(true);
    } else if (e.touches.length === 1) {
      handleStart(e.touches[0].clientX, e.touches[0].clientY);
    }
  };

  // 마우스/터치 드래그 중
  const handleMove = (clientX: number, clientY: number) => {
    if (!isDragging.current) return;
    const dx = clientX - dragStart.current.x;
    const dy = clientY - dragStart.current.y;
    setOffset(constrainOffset({
      x: currentOffsetStart.current.x + dx,
      y: currentOffsetStart.current.y + dy,
    }, zoom));
  };

  const handleMouseMove = (e: ReactMouseEvent) => {
    if (!isDragging.current) return;
    e.preventDefault();
    handleMove(e.clientX, e.clientY);
  };

  const handleTouchMove = (e: ReactTouchEvent) => {
    if (e.touches.length === 2 && pinchStartDist.current) {
      const dist = touchDistance(e.touches);
      const scale = dist / pinchStartDist.current;
      const nextZoom = clampZoom(pinchStartZoom.current * scale);
      setZoom(nextZoom);
      setOffset(prev => constrainOffset(prev, nextZoom));
    } else if (isDragging.current && e.touches.length === 1) {
      handleMove(e.touches[0].clientX, e.touches[0].clientY);
    }
  };

  // 드래그 종료
  const handleEnd = () => {
    isDragging.current = false;
    pinchStartDist.current = null;
    setShowGrid(false);
  };

  useEffect(() => {
    const handleMouseUpGlobal = () => {
      isDragging.current = false;
      setShowGrid(false);
    };
    window.addEventListener("mouseup", handleMouseUpGlobal);
    return () => window.removeEventListener("mouseup", handleMouseUpGlobal);
  }, []);

  const applyZoom = (nextZoom: number) => {
    const z = clampZoom(nextZoom);
    setZoom(z);
    setOffset(prev => constrainOffset(prev, z));
  };
  const nudgeZoom = (delta: number) => applyZoom(zoom + delta);

  // imageSrc가 바뀌면(같은 모달 인스턴스를 재사용해 여러 장을 순서대로 크롭하는 경우) zoom/offset을 반드시 리셋
  // — 이전 사진 기준 offset이 남아있으면 새 사진에서는 크롭 영역이 사진 밖으로 나가 흰 화면만 저장되는 버그가 생김
  useEffect(() => {
    setZoom(1);
    setMinZoom(1);
    setOffset({ x: 0, y: 0 });
    setImgLoaded(false);
    setImgError(false);
  }, [imageSrc]);

  // 원본 크기를 알고 나서(=로드 완료 시점) 계산: 크롭 비율과 원본 비율이 다르면(예: 세로로 긴 인물사진을
  // 가로 3:2 틀에 넣을 때) "채우기" 배율이 이미 사진을 절반 넘게 잘라내는 문제가 있었음 — 얼굴 사진을
  // 넣었는데 눈코입만 확대되어 보이는 원인. 시작 배율을 "전체 사진이 다 보이는 배율"로 낮추고,
  // 사용자가 원하면 슬라이더로 더 확대해서 잘라낼 수 있게 최소 줌만 낮춰줌(최대 줌 3배는 그대로).
  const handleImgLoad = () => {
    const img = imgRef.current;
    if (img && img.naturalWidth && img.naturalHeight) {
      const sCover = Math.max(vw / img.naturalWidth, vh / img.naturalHeight);
      const sContain = Math.min(vw / img.naturalWidth, vh / img.naturalHeight);
      const initialZoom = Math.min(1, sContain / sCover);
      setMinZoom(initialZoom);
      setZoom(initialZoom);
      setOffset({ x: 0, y: 0 });
    }
    setImgLoaded(true);
  };

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
          드래그로 위치를, 손가락 두 개(또는 슬라이더)로 크기를 조절해 보세요.
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
              background: imgLoaded ? "#fff" : "#18181b",
              userSelect: "none",
            }}
          >
            <img
              ref={imgRef}
              src={imageSrc}
              alt="crop-source"
              onLoad={handleImgLoad}
              onError={() => setImgError(true)}
              onMouseDown={handleMouseDown}
              onTouchStart={handleTouchStart}
              onDragStart={(e) => e.preventDefault()}
              style={imgLoaded ? getImgStyle() : { display: "none" }}
            />

            {/* 브라우저가 디코딩 못 하는 형식(예: 변환 안 된 HEIC) — 검정 화면 대신 원인 안내 */}
            {imgError && (
              <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, textAlign: "center" }}>
                <p style={{ fontSize: 12, color: "rgba(255,255,255,0.8)", margin: 0, lineHeight: 1.6 }}>
                  이 사진 형식을 불러올 수 없어요.<br />다른 사진으로 다시 시도해주세요.
                </p>
              </div>
            )}

            {/* 3분할 구도 가이드 — 드래그/핀치 중에만 살짝 보여서 방해되지 않게 */}
            {imgLoaded && (
              <div style={{
                position: "absolute", inset: 0, pointerEvents: "none",
                opacity: showGrid ? 1 : 0, transition: "opacity 0.15s ease",
              }}>
                {[1, 2].map(i => (
                  <div key={`v${i}`} style={{ position: "absolute", left: `${(i / 3) * 100}%`, top: 0, bottom: 0, width: 1, background: "rgba(255,255,255,0.55)" }} />
                ))}
                {[1, 2].map(i => (
                  <div key={`h${i}`} style={{ position: "absolute", top: `${(i / 3) * 100}%`, left: 0, right: 0, height: 1, background: "rgba(255,255,255,0.55)" }} />
                ))}
              </div>
            )}

            {/* 줌 배지 */}
            {imgLoaded && (
              <div style={{ position: "absolute", top: 8, right: 8, background: "rgba(0,0,0,0.55)", color: "#fff", fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 20, pointerEvents: "none" }}>
                {Math.round(zoom * 100)}%
              </div>
            )}
          </div>
        </div>

        {/* 줌 컨트롤 */}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button onClick={() => nudgeZoom(-0.15)} disabled={!imgLoaded}
            style={{ width: 28, height: 28, borderRadius: "50%", border: "1px solid var(--border)", background: "var(--surface2)", color: "var(--text)", fontSize: 15, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, opacity: imgLoaded ? 1 : 0.5 }}>
            −
          </button>
          <input
            type="range"
            min="1"
            max="3"
            step="0.01"
            value={zoom}
            onChange={(e) => applyZoom(parseFloat(e.target.value))}
            style={{
              flex: 1,
              height: 4,
              borderRadius: 2,
              accentColor: "var(--primary, #8b5cf6)",
              background: "var(--border)",
              outline: "none",
              cursor: "pointer",
            }}
          />
          <button onClick={() => nudgeZoom(0.15)} disabled={!imgLoaded}
            style={{ width: 28, height: 28, borderRadius: "50%", border: "1px solid var(--border)", background: "var(--surface2)", color: "var(--text)", fontSize: 15, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, opacity: imgLoaded ? 1 : 0.5 }}>
            +
          </button>
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
