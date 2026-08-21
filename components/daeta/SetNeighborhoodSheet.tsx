"use client";

/**
 * SetNeighborhoodSheet — 대타 거리 계산용 "내 동네" 수동 설정
 * GPS 거부/실패 시 대체 기준점. worker_profiles.lat/lng(주소검색 또는 지도 핀, GPS 강제 없음)에 저장.
 */
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/lib/useToast";
import { ensureUserRow } from "@/lib/onboarding";

interface AddressDoc {
  address_name: string;
  x: string;
  y: string;
  address?: {
    region_1depth_name?: string;
    region_2depth_name?: string;
    region_3depth_name?: string;
  } | null;
}

interface PickedLocation {
  lat: number;
  lng: number;
  address: string;
  sido: string;
  sigungu: string;
  eupmyeondong: string;
}

interface Props {
  userId: string;
  onClose: () => void;
  onSaved: (loc: { lat: number; lng: number; label: string | null }) => void;
}

export default function SetNeighborhoodSheet({ userId, onClose, onSaved }: Props) {
  const { showToast, ToastUI } = useToast();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<AddressDoc[]>([]);
  const [saving, setSaving] = useState(false);
  const [picked, setPicked] = useState<PickedLocation | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // 지도 iframe(public/map-picker.html)이 드래그로 멈출 때마다 중심 좌표를 역지오코딩해서 postMessage로 보내줌 —
  // 검색 없이 지도만 움직여도 항상 "지금 핀이 가리키는 주소"를 알 수 있게
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e.data?.type === "paz-map-picked" && typeof e.data.lat === "number" && typeof e.data.lng === "number") {
        setPicked({
          lat: e.data.lat,
          lng: e.data.lng,
          address: e.data.address || "",
          sido: e.data.sido || "",
          sigungu: e.data.sigungu || "",
          eupmyeondong: e.data.eupmyeondong || "",
        });
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, []);

  const search = async (q: string) => {
    setQuery(q);
    if (q.trim().length < 2) { setResults([]); return; }
    try {
      const res = await fetch(
        `https://dapi.kakao.com/v2/local/search/address.json?query=${encodeURIComponent(q)}`,
        { headers: { Authorization: "KakaoAK 02e1711115a492598ea97b18764fc597" } }
      );
      const data = await res.json();
      setResults(data.documents || []);
    } catch {
      setResults([]);
    }
  };

  // 검색 결과를 고르면 바로 저장하지 않고 지도 핀을 그 위치로 옮김 — 핀 드래그로 미세조정 후 저장할 수 있게
  const selectResult = (doc: AddressDoc) => {
    const lat = parseFloat(doc.y);
    const lng = parseFloat(doc.x);
    if (isNaN(lat) || isNaN(lng)) {
      showToast("이 주소의 좌표를 확인할 수 없어요. 다른 결과를 선택해 주세요.", "error");
      return;
    }
    setPicked({
      lat, lng,
      address: doc.address_name,
      sido: doc.address?.region_1depth_name || "",
      sigungu: doc.address?.region_2depth_name || "",
      eupmyeondong: doc.address?.region_3depth_name || "",
    });
    setQuery(doc.address_name);
    setResults([]);
    iframeRef.current?.contentWindow?.postMessage({ type: "paz-map-recenter", lat, lng }, "*");
  };

  const save = async () => {
    if (!picked) {
      showToast("주소를 검색하거나 지도를 움직여 위치를 먼저 지정해 주세요.", "error");
      return;
    }
    const eupmyeondong = picked.eupmyeondong || null;
    const sido = picked.sido || null;
    const sigungu = picked.sigungu || null;
    const label = eupmyeondong || sigungu || picked.address;

    setSaving(true);
    // users(id) FK 자가치유 — public.users 행이 없는 계정이면 아래 upsert가 항상 FK 위반으로 실패했음
    await ensureUserRow(supabase, userId);
    const { error } = await supabase
      .from("worker_profiles")
      .upsert({
        user_id: userId,
        region: picked.address,
        sido,
        sigungu,
        eupmyeondong,
        lat: picked.lat,
        lng: picked.lng,
      }, { onConflict: "user_id" });
    setSaving(false);
    if (error) {
      showToast("저장 실패: " + error.message, "error");
      return;
    }
    showToast(`📍 ${label} 설정됐어요`);
    onSaved({ lat: picked.lat, lng: picked.lng, label });
    onClose();
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 1200, background: "rgba(0,0,0,0.65)", display: "flex", alignItems: "flex-end" }}>
      <div style={{ width: "100%", maxWidth: 480, margin: "0 auto", background: "var(--surface, #18181b)", borderRadius: "24px 24px 0 0", padding: 20, borderTop: "1px solid var(--border, rgba(255,255,255,0.1))", maxHeight: "92dvh", overflowY: "auto" }}>
        <h3 style={{ fontSize: 16, fontWeight: 900, color: "var(--text, #fff)", margin: "0 0 4px" }}>📍 내 동네 설정</h3>
        <p style={{ fontSize: 12, color: "var(--text-muted, rgba(255,255,255,0.55))", margin: "0 0 14px", lineHeight: 1.5 }}>
          대타 공고 거리 계산 기준이에요. GPS를 안 쓸 때 이 값을 대신 씁니다. 나중에 마이페이지에서 다시 바꿀 수 있어요.
        </p>
        <div style={{ position: "relative" }}>
          <input
            value={query}
            onChange={e => search(e.target.value)}
            placeholder="동/읍/면 주소를 검색해 주세요"
            style={{ width: "100%", boxSizing: "border-box", background: "var(--surface2, rgba(255,255,255,0.06))", border: "1px solid var(--border, rgba(255,255,255,0.15))", borderRadius: 12, padding: "12px 14px", color: "var(--text, #fff)", fontSize: 14, outline: "none", marginBottom: 10 }}
          />
          {results.length > 0 && (
            <div style={{ position: "absolute", top: "100%", left: 0, right: 0, marginTop: -6, zIndex: 20, display: "flex", flexDirection: "column", gap: 6, maxHeight: 220, overflowY: "auto", marginBottom: 10, background: "var(--surface, #18181b)", padding: 6, borderRadius: 12, border: "1px solid var(--border, rgba(255,255,255,0.12))", boxShadow: "0 8px 24px rgba(0,0,0,0.4)" }}>
              {results.map((r, i) => (
                <button key={i} type="button" disabled={saving} onClick={() => selectResult(r)}
                  style={{ textAlign: "left", padding: "10px 12px", borderRadius: 10, background: "var(--surface2, rgba(255,255,255,0.06))", border: "1px solid var(--border, rgba(255,255,255,0.1))", color: "var(--text, #fff)", fontSize: 13, cursor: "pointer" }}>
                  {r.address_name}
                </button>
              ))}
            </div>
          )}
        </div>

        <div style={{ position: "relative", width: "100%", height: 200, borderRadius: 14, overflow: "hidden", marginBottom: 8, border: "1px solid var(--border, rgba(255,255,255,0.15))" }}>
          <iframe
            ref={iframeRef}
            src="/map-picker.html"
            style={{ width: "100%", height: "100%", border: "none", display: "block" }}
            title="내 동네 위치 지정"
          />
        </div>
        <p style={{ fontSize: 11, color: "var(--text-muted, rgba(255,255,255,0.5))", margin: "0 0 4px", textAlign: "center" }}>
          🖐️ 지도를 움직여 핀 위치를 맞춰보세요
        </p>
        {picked?.address && (
          <p style={{ fontSize: 12, color: "var(--text, rgba(255,255,255,0.85))", fontWeight: 700, margin: "0 0 14px", textAlign: "center", lineHeight: 1.4 }}>
            📍 {picked.address}
          </p>
        )}

        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={onClose} disabled={saving}
            style={{ flex: 1, padding: 12, background: "var(--surface2, rgba(255,255,255,0.06))", border: "1px solid var(--border, rgba(255,255,255,0.15))", borderRadius: 12, color: "var(--text-muted, rgba(255,255,255,0.6))", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
            닫기
          </button>
          <button onClick={save} disabled={saving || !picked}
            style={{ flex: 2, padding: 12, background: !picked ? "var(--surface2, rgba(255,255,255,0.1))" : "linear-gradient(135deg, #0ea5e9, #38bdf8)", border: "none", borderRadius: 12, color: !picked ? "var(--text-muted, rgba(255,255,255,0.4))" : "#fff", fontSize: 13, fontWeight: 800, cursor: saving || !picked ? "default" : "pointer" }}>
            {saving ? "저장 중..." : "이 위치로 저장"}
          </button>
        </div>
      </div>
      {ToastUI}
    </div>
  );
}
