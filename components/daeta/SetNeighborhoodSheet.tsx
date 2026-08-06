"use client";

/**
 * SetNeighborhoodSheet — 대타 거리 계산용 "내 동네" 수동 설정
 * GPS 거부/실패 시 대체 기준점. worker_profiles.lat/lng(주소검색, GPS 강제 없음)에 저장.
 */
import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/lib/useToast";

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

  const select = async (doc: AddressDoc) => {
    const lat = parseFloat(doc.y);
    const lng = parseFloat(doc.x);
    if (isNaN(lat) || isNaN(lng)) {
      showToast("이 주소의 좌표를 확인할 수 없어요. 다른 결과를 선택해 주세요.", "error");
      return;
    }
    // 헤더에 "신창면"처럼 짧게 보여줄 읍/면/동 단위 라벨 — 카카오 응답의 3단계 행정구역명
    const eupmyeondong = doc.address?.region_3depth_name || null;
    const sido = doc.address?.region_1depth_name || null;
    const sigungu = doc.address?.region_2depth_name || null;
    const label = eupmyeondong || sigungu || doc.address_name;

    setSaving(true);
    const { error } = await supabase
      .from("worker_profiles")
      .upsert({
        user_id: userId,
        region: doc.address_name,
        sido,
        sigungu,
        eupmyeondong,
        lat,
        lng,
      }, { onConflict: "user_id" });
    setSaving(false);
    if (error) {
      showToast("저장 실패: " + error.message, "error");
      return;
    }
    showToast(`📍 ${label} 설정됐어요`);
    onSaved({ lat, lng, label });
    onClose();
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 1200, background: "rgba(0,0,0,0.65)", display: "flex", alignItems: "flex-end" }}>
      <div style={{ width: "100%", maxWidth: 480, margin: "0 auto", background: "var(--surface, #18181b)", borderRadius: "24px 24px 0 0", padding: 20, borderTop: "1px solid var(--border, rgba(255,255,255,0.1))" }}>
        <h3 style={{ fontSize: 16, fontWeight: 900, color: "var(--text, #fff)", margin: "0 0 4px" }}>📍 내 동네 설정</h3>
        <p style={{ fontSize: 12, color: "var(--text-muted, rgba(255,255,255,0.55))", margin: "0 0 14px", lineHeight: 1.5 }}>
          대타 공고 거리 계산 기준이에요. GPS를 안 쓸 때 이 값을 대신 씁니다. 나중에 마이페이지에서 다시 바꿀 수 있어요.
        </p>
        <input
          value={query}
          onChange={e => search(e.target.value)}
          placeholder="동/읍/면 주소를 검색해 주세요"
          style={{ width: "100%", boxSizing: "border-box", background: "var(--surface2, rgba(255,255,255,0.06))", border: "1px solid var(--border, rgba(255,255,255,0.15))", borderRadius: 12, padding: "12px 14px", color: "var(--text, #fff)", fontSize: 14, outline: "none", marginBottom: 10 }}
        />
        {results.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 260, overflowY: "auto", marginBottom: 10 }}>
            {results.map((r, i) => (
              <button key={i} type="button" disabled={saving} onClick={() => select(r)}
                style={{ textAlign: "left", padding: "10px 12px", borderRadius: 12, background: "var(--surface2, rgba(255,255,255,0.06))", border: "1px solid var(--border, rgba(255,255,255,0.1))", color: "var(--text, #fff)", fontSize: 13, cursor: "pointer" }}>
                {r.address_name}
              </button>
            ))}
          </div>
        )}
        <button onClick={onClose} disabled={saving}
          style={{ width: "100%", padding: 12, background: "var(--surface2, rgba(255,255,255,0.06))", border: "1px solid var(--border, rgba(255,255,255,0.15))", borderRadius: 12, color: "var(--text-muted, rgba(255,255,255,0.6))", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
          닫기
        </button>
      </div>
      {ToastUI}
    </div>
  );
}
