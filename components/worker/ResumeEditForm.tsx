"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { cardStyle, btnPrimary, toggleTrack, toggleThumb } from "@/lib/styles";
import { fetchCredentialsWithFallback } from "@/lib/credentials";

interface Category {
  id: string;
  parent_id: string | null;
  name: string;
  emoji: string;
  sort_order: number;
}

const inputStyle: React.CSSProperties = { width: "100%", boxSizing: "border-box", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "12px 16px", color: "var(--text)", fontSize: 14, outline: "none" };

interface ResumeEditFormProps {
  userId: string;
  profileId?: string; // 관리자가 남의 프로필 수정할 때만 사용, 보통은 비움
  onSaved: () => void;
  saveLabel?: string;
}

// 이력서 본문(직종·자격증·자기소개·개인정보·공개여부) 편집 폼 — /worker/profile 페이지와
// /worker/[id]의 "이력서 수정" 바텀시트가 이 컴포넌트 하나를 같이 씀(로직 두 벌 관리 방지).
// 프로필 사진/영상은 여기 없음 — 히어로 사진의 연필 아이콘(갤러리 전용 편집)이 따로 담당.
export default function ResumeEditForm({ userId, profileId, onSaved, saveLabel }: ResumeEditFormProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [isPublic, setIsPublic] = useState(true);

  const [parentCategories, setParentCategories] = useState<Category[]>([]);
  const [childCategories, setChildCategories] = useState<Category[]>([]);
  const [selectedParents, setSelectedParents] = useState<string[]>([]);
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<string[]>([]);
  const [customCategories, setCustomCategories] = useState<string[]>([]);
  const [customInput, setCustomInput] = useState("");

  const [bio, setBio] = useState("");

  const [credentialsMaster, setCredentialsMaster] = useState<any[]>([]);
  const [selectedCreds, setSelectedCreds] = useState<any[]>([]);
  const [customCredInput, setCustomCredInput] = useState("");
  const [showCustomInput, setShowCustomInput] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<any[]>([]);

  // 개인정보 — users(id) SOT. 계약서 작성 시(app/contract/page.tsx) 이 값을 그대로 불러다 쓰고,
  // 계약서 저장 시 다시 이 컬럼들로 역sync됨.
  const [realName, setRealName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [addressDetail, setAddressDetail] = useState("");

  const [imageUrl, setImageUrl] = useState<string | null>(null); // 저장 payload용으로만 필요(대표 이미지 유지), 편집은 안 함

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [{ data: cats }, creds, { data: userRow }] = await Promise.all([
        supabase.from("job_categories").select("*").order("sort_order"),
        fetchCredentialsWithFallback(),
        supabase.from("users").select("bio, real_name, phone, address, address_detail").eq("id", userId).maybeSingle(),
      ]);
      if (cancelled) return;
      if (cats) {
        setParentCategories(cats.filter((c: { parent_id: string | null }) => !c.parent_id));
        setChildCategories(cats.filter((c: { parent_id: string | null }) => c.parent_id));
      }
      setCredentialsMaster(creds);
      if (userRow) {
        setRealName(userRow.real_name || "");
        setPhone(userRow.phone || "");
        setAddress(userRow.address || "");
        setAddressDetail(userRow.address_detail || "");
      }

      const query = supabase.from("worker_profiles").select("*").eq("user_id", userId);
      const { data } = profileId
        ? await query.eq("id", profileId).maybeSingle()
        : await query.order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (cancelled) return;

      if (data) {
        setBio(data.bio || userRow?.bio || "");
        setIsPublic(data.is_public !== false);
        setSelectedCreds(data.credentials || []);
        setImageUrl(data.image_url || null);

        if (data.category_ids?.length) {
          setSelectedCategoryIds(data.category_ids);
          const children = (cats || []).filter((c: any) => c.parent_id);
          const parentIds = [...new Set(
            data.category_ids.map((id: string) => children.find((c: any) => c.id === id)?.parent_id).filter(Boolean)
          )];
          setSelectedParents(parentIds as string[]);
        }
        if (data.custom_categories?.length) setCustomCategories(data.custom_categories);
        if (!data.category_ids?.length && data.desired_type) {
          setCustomCategories(data.desired_type.split(",").filter(Boolean));
        }
      } else if (userRow?.bio) {
        setBio(userRow.bio);
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [userId, profileId]);

  const getChildCats = (parentId: string) => childCategories.filter(c => c.parent_id === parentId);

  const toggleParent = (parentId: string) => {
    setSelectedParents(prev => prev.includes(parentId) ? prev.filter(id => id !== parentId) : [...prev, parentId]);
  };

  const toggleCategory = (catId: string) => {
    setSelectedCategoryIds(prev => prev.includes(catId) ? prev.filter(id => id !== catId) : [...prev, catId]);
  };

  const addCustom = () => {
    if (!customInput.trim()) return;
    setCustomCategories(prev => [...prev, customInput.trim()]);
    setCustomInput("");
  };

  const handleSave = async () => {
    if (selectedCategoryIds.length === 0 && customCategories.length === 0) { setError("주요 업무/직종을 선택해주세요"); return; }
    setSaving(true); setError("");

    const getInterviewResult = () => {
      const r = localStorage.getItem("interview_result_advanced_worker") || localStorage.getItem("interview_result_basic_worker");
      return r ? JSON.parse(r) : null;
    };
    const interviewResult = getInterviewResult();

    const selectedParentNames = [...new Set(
      selectedCategoryIds.map(id => {
        const child = childCategories.find(c => c.id === id);
        if (!child) return "";
        const parent = parentCategories.find(p => p.id === child.parent_id);
        return parent ? parent.name : child.name;
      }).filter(Boolean)
    )];
    const desiredType = [...selectedParentNames, ...customCategories].join(",");

    const { data: existing } = profileId
      ? await supabase.from("worker_profiles").select("id, user_id").eq("id", profileId).maybeSingle()
      : await supabase.from("worker_profiles").select("id, user_id").eq("user_id", userId).order("created_at", { ascending: false }).limit(1).maybeSingle();

    const profileData: any = {
      desired_type: desiredType,
      category_ids: selectedCategoryIds,
      custom_categories: customCategories,
      bio: bio.trim(),
      is_public: isPublic,
      credentials: selectedCreds,
    };
    if (interviewResult?.personalityType) {
      profileData.worker_type = interviewResult.personalityType;
    }
    if (!existing) {
      profileData.user_id = userId;
    }

    let saveError;
    if (existing) {
      const { error: err } = await supabase.from("worker_profiles").update(profileData).eq("id", existing.id);
      saveError = err;
    } else {
      const { error: err } = await supabase.from("worker_profiles").insert({ ...profileData, job_status: "active" });
      saveError = err;
    }
    if (saveError) { setError("저장 중 오류: " + saveError.message); setSaving(false); return; }

    const userUpdate: any = {
      real_name: realName.trim() || null,
      phone: phone.trim() || null,
      address: address.trim() || null,
      address_detail: addressDetail.trim() || null,
      profile_completed: true,
    };
    await supabase.from("users").update(userUpdate).eq("id", userId);

    setSaving(false);
    onSaved();
  };

  if (loading) return <p style={{ color: "var(--text-muted)", fontSize: 14, textAlign: "center", padding: "30px 0" }}>불러오는 중...</p>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* 주요 업무/직종 */}
      <div>
        <label style={{ fontSize: 14, fontWeight: 700, display: "block", marginBottom: 10 }}>
          💼 주요 업무/직종 <span style={{ color: "#c4b5fd" }}>*</span>
          <span style={{ fontSize: 11, color: "var(--text-muted)", marginLeft: 8 }}>여러 개 선택 가능</span>
        </label>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
          {parentCategories.map(cat => (
            <button key={cat.id} onClick={() => toggleParent(cat.id)}
              style={{ padding: "8px 14px", borderRadius: 20, fontSize: 13, cursor: "pointer", border: "none", background: selectedParents.includes(cat.id) ? "linear-gradient(135deg, #8b5cf6, #7c3aed)" : "var(--surface2)", color: selectedParents.includes(cat.id) ? "#fff" : "var(--text-muted)", fontWeight: selectedParents.includes(cat.id) ? 700 : 400 }}>
              {cat.emoji} {cat.name}
            </button>
          ))}
        </div>

        {selectedParents.map(parentId => {
          const parent = parentCategories.find(c => c.id === parentId);
          const children = getChildCats(parentId);
          if (!parent) return null;
          return (
            <div key={parentId} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14, padding: 14, marginBottom: 8 }}>
              <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "0 0 10px", fontWeight: 600 }}>
                {parent.emoji} {parent.name} › 직무
              </p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {children.map(child => (
                  child.name === "직접입력" ? (
                    <div key={child.id} style={{ width: "100%" }}>
                      <div style={{ display: "flex", gap: 8 }}>
                        <input type="text" value={customInput}
                          onChange={e => setCustomInput(e.target.value)}
                          onKeyDown={e => e.key === "Enter" && addCustom()}
                          placeholder="직종명 입력 후 Enter"
                          style={{ flex: 1, background: "var(--surface2)", border: "1px solid var(--primary-border)", borderRadius: 10, padding: "8px 12px", color: "var(--text)", fontSize: 12, outline: "none" }} />
                        <button onClick={addCustom}
                          style={{ background: "var(--primary-light)", border: "1px solid var(--primary-border)", color: "#c4b5fd", fontSize: 12, padding: "8px 12px", borderRadius: 10, cursor: "pointer" }}>
                          추가
                        </button>
                      </div>
                      {customCategories.length > 0 && (
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
                          {customCategories.map(c => (
                            <span key={c} style={{ background: "var(--primary-light)", border: "1px solid var(--primary-border)", color: "#c4b5fd", fontSize: 11, padding: "4px 10px", borderRadius: 20, display: "flex", alignItems: "center", gap: 4 }}>
                              {c}
                              <button onClick={() => setCustomCategories(prev => prev.filter(x => x !== c))}
                                style={{ background: "none", border: "none", color: "#c4b5fd", cursor: "pointer", fontSize: 12, padding: 0 }}>×</button>
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  ) : (
                    <button key={child.id} onClick={() => toggleCategory(child.id)}
                      style={{ padding: "6px 12px", borderRadius: 20, fontSize: 12, cursor: "pointer", border: "none", background: selectedCategoryIds.includes(child.id) ? "linear-gradient(135deg, #8b5cf6, #7c3aed)" : "var(--surface2)", color: selectedCategoryIds.includes(child.id) ? "#fff" : "var(--text-muted)" }}>
                      {child.emoji} {child.name}
                    </button>
                  )
                ))}
              </div>
            </div>
          );
        })}

        {(selectedCategoryIds.length > 0 || customCategories.length > 0) && (
          <div style={{ background: "rgba(139,92,246,0.1)", border: "1px solid var(--primary-border)", borderRadius: 12, padding: "10px 14px", marginTop: 8 }}>
            <p style={{ fontSize: 11, color: "var(--text-muted)", margin: "0 0 6px" }}>선택된 직종</p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {selectedCategoryIds.map(id => {
                const cat = childCategories.find(c => c.id === id);
                return cat ? (
                  <span key={id} style={{ fontSize: 11, background: "var(--primary-light)", color: "#c4b5fd", padding: "3px 8px", borderRadius: 20 }}>
                    {cat.emoji} {cat.name}
                  </span>
                ) : null;
              })}
              {customCategories.map(c => (
                <span key={c} style={{ fontSize: 11, background: "var(--primary-light)", color: "#c4b5fd", padding: "3px 8px", borderRadius: 20 }}>✏️ {c}</span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 자격 요건 / 보유 기술 등록 */}
      <div>
        <label style={{ fontSize: 14, fontWeight: 700, display: "block", marginBottom: 8 }}>🏅 보유 자격증 및 실무기술</label>

        {selectedCreds.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
            {selectedCreds.map(sc => (
              <span key={sc.name} style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "rgba(139,92,246,0.15)", border: "1px solid rgba(139,92,246,0.3)", padding: "4px 10px", borderRadius: 20, fontSize: 11, color: "#c4b5fd" }}>
                {sc.name}
                <button type="button" onClick={() => setSelectedCreds(prev => prev.filter(x => x.name !== sc.name))}
                  style={{ background: "none", border: "none", color: "#f87171", cursor: "pointer", fontSize: 10, padding: 0 }}>
                  ✕
                </button>
              </span>
            ))}
          </div>
        )}

        {selectedCategoryIds.length > 0 ? (
          <div>
            <p style={{ fontSize: 11, color: "var(--text-muted)", margin: "0 0 12px" }}>선택하신 직무와 매핑되는 보유 자격 요건들을 체크해 주세요!</p>
            {selectedCategoryIds.map(catId => {
              const child = childCategories.find(c => c.id === catId);
              if (!child) return null;
              const seen = new Set<string>();
              const childCreds = [
                ...credentialsMaster.filter(c => c.duty_name === child.name && c.is_mandatory_by_law && !seen.has(c.name) && (seen.add(c.name), true)),
                ...credentialsMaster.filter(c => c.duty_name === child.name && !c.is_mandatory_by_law && !seen.has(c.name) && (seen.add(c.name), true)),
              ];
              return (
                <div key={catId} style={{ marginBottom: 14 }}>
                  <p style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.85)", margin: "0 0 6px" }}>
                    {child.emoji} {child.name} 관련 자격 추천
                  </p>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
                    {childCreds.map(c => {
                      const isSelected = selectedCreds.some(sc => sc.name === c.name);
                      const isMandatory = c.is_mandatory_by_law;
                      return (
                        <button key={c.id || `${c.category_name}_${c.duty_name}_${c.name}`} type="button"
                          onClick={() => {
                            if (isSelected) setSelectedCreds(prev => prev.filter(sc => sc.name !== c.name));
                            else setSelectedCreds(prev => [...prev, { id: c.id, name: c.name, is_preset: true }]);
                          }}
                          style={{
                            padding: "6px 12px", borderRadius: 20,
                            border: isMandatory && !isSelected ? "1px solid var(--danger-border)" : "none",
                            fontSize: 11, cursor: "pointer", fontWeight: isSelected ? 700 : 400,
                            background: isSelected ? (isMandatory ? "linear-gradient(135deg, #dc2626, #ef4444)" : "linear-gradient(135deg, #8b5cf6, #7c3aed)") : (isMandatory ? "var(--danger-bg)" : "var(--surface2)"),
                            color: isSelected ? "#fff" : (isMandatory ? "var(--danger)" : "var(--text-muted)"),
                            outline: "none"
                          }}>
                          {isMandatory && "⚠️ "}{c.name}
                        </button>
                      );
                    })}
                    {showCustomInput === catId ? (
                      <div style={{ position: "relative", display: "inline-block" }}>
                        <input type="text" autoFocus value={customCredInput}
                          onChange={e => {
                            const val = e.target.value;
                            setCustomCredInput(val);
                            if (!val.trim()) { setSuggestions([]); return; }
                            const matched = credentialsMaster.filter(c => c.duty_name === child.name && c.name.toLowerCase().includes(val.toLowerCase()) && !selectedCreds.some(sc => sc.name === c.name));
                            setSuggestions(matched.slice(0, 5));
                          }}
                          onBlur={() => {
                            setTimeout(() => {
                              if (customCredInput.trim() && !selectedCreds.some(sc => sc.name === customCredInput.trim())) {
                                const presetMatch = credentialsMaster.find(c => c.duty_name === child.name && c.name === customCredInput.trim());
                                setSelectedCreds(prev => [...prev, { id: presetMatch ? presetMatch.id : null, name: customCredInput.trim(), is_preset: !!presetMatch }]);
                              }
                              setCustomCredInput(""); setSuggestions([]); setShowCustomInput(null);
                            }, 200);
                          }}
                          onKeyDown={e => {
                            if (e.key === "Enter") {
                              if (customCredInput.trim() && !selectedCreds.some(sc => sc.name === customCredInput.trim())) {
                                const presetMatch = credentialsMaster.find(c => c.duty_name === child.name && c.name === customCredInput.trim());
                                setSelectedCreds(prev => [...prev, { id: presetMatch ? presetMatch.id : null, name: customCredInput.trim(), is_preset: !!presetMatch }]);
                              }
                              setCustomCredInput(""); setSuggestions([]); setShowCustomInput(null);
                            }
                          }}
                          placeholder="직접 입력..."
                          style={{ padding: "6px 12px", borderRadius: 20, border: "1px solid #c4b5fd", background: "var(--surface)", color: "#fff", fontSize: 11, width: 100, outline: "none" }} />
                        {suggestions.length > 0 && (
                          <div style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, width: 180, background: "#1e1e24", border: "1px solid var(--border)", borderRadius: 10, zIndex: 100, overflow: "hidden", boxShadow: "0 8px 24px rgba(0,0,0,0.5)" }}>
                            {suggestions.map((c, i) => (
                              <button key={c.id || `${c.category_name}_${c.duty_name}_${c.name}`} type="button"
                                onMouseDown={() => { setSelectedCreds(prev => [...prev, { id: c.id, name: c.name, is_preset: true }]); setCustomCredInput(""); setSuggestions([]); setShowCustomInput(null); }}
                                style={{ width: "100%", padding: "8px 12px", background: "none", border: "none", borderBottom: i < suggestions.length - 1 ? "1px solid rgba(255,255,255,0.05)" : "none", textAlign: "left", cursor: "pointer", color: "#fff", fontSize: 11, display: "block" }}
                                onMouseEnter={e => e.currentTarget.style.background = "rgba(139,92,246,0.1)"}
                                onMouseLeave={e => e.currentTarget.style.background = "none"}>
                                {c.name}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    ) : (
                      <button type="button" onClick={() => { setShowCustomInput(catId); setCustomCredInput(""); setSuggestions([]); }}
                        style={{ padding: "6px 12px", borderRadius: 20, border: "none", fontSize: 11, cursor: "pointer", background: "var(--surface2)", color: "var(--text-muted)", outline: "none" }}>
                        ✏️ 직접입력
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div>
            <p style={{ fontSize: 11, color: "var(--text-muted)", margin: "0 0 10px" }}>아래 직접입력 버튼을 통해 보유하신 자격증이나 기술을 적어주세요.</p>
            {showCustomInput === "general" ? (
              <div style={{ position: "relative", display: "inline-block" }}>
                <input type="text" autoFocus value={customCredInput}
                  onChange={e => {
                    const val = e.target.value;
                    setCustomCredInput(val);
                    if (!val.trim()) { setSuggestions([]); return; }
                    const matched = credentialsMaster.filter(c => c.name.toLowerCase().includes(val.toLowerCase()) && !selectedCreds.some(sc => sc.name === c.name));
                    setSuggestions(matched.slice(0, 5));
                  }}
                  onBlur={() => {
                    setTimeout(() => {
                      if (customCredInput.trim() && !selectedCreds.some(sc => sc.name === customCredInput.trim())) {
                        const presetMatch = credentialsMaster.find(c => c.name === customCredInput.trim());
                        setSelectedCreds(prev => [...prev, { id: presetMatch ? presetMatch.id : null, name: customCredInput.trim(), is_preset: !!presetMatch }]);
                      }
                      setCustomCredInput(""); setSuggestions([]); setShowCustomInput(null);
                    }, 200);
                  }}
                  onKeyDown={e => {
                    if (e.key === "Enter") {
                      if (customCredInput.trim() && !selectedCreds.some(sc => sc.name === customCredInput.trim())) {
                        const presetMatch = credentialsMaster.find(c => c.name === customCredInput.trim());
                        setSelectedCreds(prev => [...prev, { id: presetMatch ? presetMatch.id : null, name: customCredInput.trim(), is_preset: !!presetMatch }]);
                      }
                      setCustomCredInput(""); setSuggestions([]); setShowCustomInput(null);
                    }
                  }}
                  placeholder="예: 보건증, 지게차"
                  style={{ padding: "8px 16px", borderRadius: 20, border: "1px solid #c4b5fd", background: "var(--surface)", color: "#fff", fontSize: 12, width: 180, outline: "none" }} />
                {suggestions.length > 0 && (
                  <div style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, width: 180, background: "#1e1e24", border: "1px solid var(--border)", borderRadius: 10, zIndex: 100, overflow: "hidden", boxShadow: "0 8px 24px rgba(0,0,0,0.5)" }}>
                    {suggestions.map((c, i) => (
                      <button key={c.id || `${c.category_name}_${c.duty_name}_${c.name}`} type="button"
                        onMouseDown={() => { setSelectedCreds(prev => [...prev, { id: c.id, name: c.name, is_preset: true }]); setCustomCredInput(""); setSuggestions([]); setShowCustomInput(null); }}
                        style={{ width: "100%", padding: "8px 12px", background: "none", border: "none", borderBottom: i < suggestions.length - 1 ? "1px solid rgba(255,255,255,0.05)" : "none", textAlign: "left", cursor: "pointer", color: "#fff", fontSize: 11, display: "block" }}
                        onMouseEnter={e => e.currentTarget.style.background = "rgba(139,92,246,0.1)"}
                        onMouseLeave={e => e.currentTarget.style.background = "none"}>
                        {c.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <button type="button" onClick={() => { setShowCustomInput("general"); setCustomCredInput(""); setSuggestions([]); }}
                style={{ padding: "8px 16px", borderRadius: 12, border: "none", fontSize: 12, cursor: "pointer", fontWeight: 600, background: "var(--surface2)", color: "var(--text-sub)", outline: "none" }}>
                ➕ 자격증/기술 직접 추가
              </button>
            )}
          </div>
        )}
      </div>

      {/* 자기소개 */}
      <div>
        <label style={{ fontSize: 14, fontWeight: 700, display: "block", marginBottom: 8 }}>✏️ 자기소개 <span style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 400 }}>선택</span></label>
        <input type="text" value={bio} onChange={e => setBio(e.target.value.slice(0, 50))}
          placeholder="예: 성실하고 빠르게 배워요! 장기 근무 원해요 😊"
          style={inputStyle} />
        <p style={{ fontSize: 11, color: "var(--text-muted)", margin: "4px 0 0", textAlign: "right" }}>{bio.length}/50</p>
      </div>

      {/* 개인정보 — 계약서(app/contract)와 공유되는 users SOT. 미리 채워두면 계약서 작성 때 자동으로 불러와짐 */}
      <div>
        <label style={{ fontSize: 14, fontWeight: 700, display: "block", marginBottom: 4 }}>👤 개인정보 <span style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 400 }}>선택</span></label>
        <p style={{ fontSize: 11, color: "var(--text-muted)", margin: "0 0 10px" }}>여기 채워두면 나중에 근로계약서 쓸 때 자동으로 불러와져요.</p>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <input type="text" value={realName} onChange={e => setRealName(e.target.value)} placeholder="실명" style={inputStyle} />
          <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="연락처 (예: 010-1234-5678)" style={inputStyle} />
          <input type="text" value={address} onChange={e => setAddress(e.target.value)} placeholder="주소" style={inputStyle} />
          <input type="text" value={addressDetail} onChange={e => setAddressDetail(e.target.value)} placeholder="상세주소 (동·호수 등)" style={inputStyle} />
        </div>
      </div>

      {/* 공개 여부 */}
      <div style={{ ...cardStyle }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <p style={{ fontSize: 14, fontWeight: 700, margin: "0 0 2px" }}>이력서 공개</p>
            <p style={{ fontSize: 12, color: "var(--text-muted)", margin: 0 }}>
              {isPublic ? "사장님들이 내 이력서를 볼 수 있어요" : "내 이력서가 숨겨져 있어요"}
            </p>
          </div>
          <div onClick={() => setIsPublic(!isPublic)} style={toggleTrack(isPublic)}>
            <div style={toggleThumb(isPublic)} />
          </div>
        </div>
      </div>

      {error && <p style={{ color: "#f87171", fontSize: 13, textAlign: "center" }}>{error}</p>}

      <button onClick={handleSave} disabled={saving}
        style={{ ...btnPrimary, fontSize: 16, opacity: saving ? 0.7 : 1 }}>
        {saving ? "저장 중..." : (saveLabel || "저장하기 ✓")}
      </button>
    </div>
  );
}
