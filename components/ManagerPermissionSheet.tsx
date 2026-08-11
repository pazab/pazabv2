"use client";
import React, { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/lib/useToast";
import { modalOverlay, modalSheet, btnPrimary, btnSecondary } from "@/lib/styles";
import type { ManagerPermissions } from "@/lib/permissions";

interface ManagerPermissionSheetProps {
  isOpen: boolean;
  onClose: () => void;
  teamMemberId: string;
  memberName: string;
  currentRole: string;
  currentPermissions: ManagerPermissions | null;
  onSaved?: (role: string, permissions: ManagerPermissions) => void;
}

const PERMISSION_ITEMS: { key: keyof ManagerPermissions; label: string; desc: string; icon: string }[] = [
  { key: "attendance_approve", label: "근태 승인/수정", desc: "팀원 출퇴근 기록 확인 및 수정", icon: "ti-clock-check" },
  { key: "wage_edit", label: "시급/근무조건 수정", desc: "팀원 시급, 근무요일·시간 변경", icon: "ti-cash" },
  { key: "payroll_confirm", label: "정산/급여 확정", desc: "임금 명세서 발행", icon: "ti-receipt" },
  { key: "sos_request", label: "SOS 대타요청 발행", desc: "펑크 시 대타 구인 공고 등록", icon: "ti-speakerphone" },
];

export default function ManagerPermissionSheet({
  isOpen,
  onClose,
  teamMemberId,
  memberName,
  currentRole,
  currentPermissions,
  onSaved,
}: ManagerPermissionSheetProps) {
  const { showToast, ToastUI } = useToast();
  const [isManager, setIsManager] = useState(currentRole === "manager");
  const [permissions, setPermissions] = useState<ManagerPermissions>(currentPermissions || {});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setIsManager(currentRole === "manager");
    setPermissions(currentPermissions || {});
  }, [isOpen, currentRole, currentPermissions]);

  if (!isOpen) return null;

  function togglePermission(key: keyof ManagerPermissions) {
    setPermissions(prev => ({ ...prev, [key]: !prev[key] }));
  }

  async function handleSave() {
    setSaving(true);
    const newRole = isManager ? "manager" : "staff";
    const newPermissions = isManager ? permissions : {};
    const { error } = await supabase.from("team_members")
      .update({ member_role: newRole, permissions: newPermissions })
      .eq("id", teamMemberId);
    setSaving(false);
    if (error) {
      showToast("저장 실패: " + error.message, "error");
      return;
    }
    showToast("매니저 권한이 저장됐어요");
    onSaved?.(newRole, newPermissions);
    onClose();
  }

  return (
    <div style={modalOverlay} onClick={onClose}>
      {ToastUI}
      <div
        style={{
          ...modalSheet,
          maxHeight: "85vh",
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
          gap: 16,
          boxShadow: "0 -8px 30px rgba(0,0,0,0.5)",
          borderTop: "1px solid var(--border)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ width: 40, height: 4, background: "var(--border)", borderRadius: 2, alignSelf: "center", marginBottom: -4 }} />

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <h3 style={{ fontSize: 17, fontWeight: 900, color: "var(--text)", margin: 0 }}>
              🛠 {memberName}님 권한 설정
            </h3>
            <p style={{ fontSize: 11, color: "var(--text-muted)", margin: "4px 0 0" }}>
              매니저로 지정하고 필요한 권한만 켜주세요.
            </p>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 18, color: "var(--text-muted)", cursor: "pointer", padding: 4 }}>
            ✕
          </button>
        </div>

        {/* 매니저 지정 스위치 */}
        <button
          onClick={() => setIsManager(v => !v)}
          style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            background: isManager ? "rgba(245,158,11,0.08)" : "var(--surface2)",
            border: `1.5px solid ${isManager ? "#f59e0b" : "var(--border)"}`,
            borderRadius: 14, padding: "12px 14px", cursor: "pointer", textAlign: "left",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <i className="ti ti-shield-star" style={{ fontSize: 18, color: isManager ? "#f59e0b" : "var(--text-muted)" }} aria-hidden="true" />
            <div>
              <p style={{ fontSize: 13, fontWeight: 800, color: "var(--text)", margin: 0 }}>매니저로 지정</p>
              <p style={{ fontSize: 10, color: "var(--text-muted)", margin: "2px 0 0" }}>초대장 발송 권한이 기본으로 함께 부여돼요</p>
            </div>
          </div>
          <div style={{
            width: 40, height: 24, borderRadius: 12,
            background: isManager ? "#f59e0b" : "var(--surface)",
            border: `1px solid ${isManager ? "#f59e0b" : "var(--border)"}`,
            position: "relative", flexShrink: 0, transition: "background 0.15s",
          }}>
            <div style={{
              width: 18, height: 18, borderRadius: "50%", background: "#fff",
              position: "absolute", top: 2, left: isManager ? 19 : 2, transition: "left 0.15s",
              boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
            }} />
          </div>
        </button>

        {/* 세부 권한 체크박스 */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8, opacity: isManager ? 1 : 0.4, pointerEvents: isManager ? "auto" : "none" }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", margin: "0 0 2px" }}>세부 권한</p>
          {PERMISSION_ITEMS.map(item => {
            const checked = !!permissions[item.key];
            return (
              <button
                key={item.key}
                onClick={() => togglePermission(item.key)}
                style={{
                  display: "flex", alignItems: "center", gap: 10,
                  background: checked ? "rgba(139,92,246,0.06)" : "var(--surface2)",
                  border: `1.5px solid ${checked ? "#8b5cf6" : "var(--border)"}`,
                  borderRadius: 12, padding: "10px 12px", cursor: "pointer", textAlign: "left",
                }}
              >
                <div style={{
                  width: 32, height: 32, borderRadius: 8,
                  background: checked ? "rgba(139,92,246,0.15)" : "var(--surface)",
                  display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                }}>
                  <i className={`ti ${item.icon}`} style={{ fontSize: 16, color: checked ? "#8b5cf6" : "var(--text-muted)" }} aria-hidden="true" />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: checked ? "#8b5cf6" : "var(--text)" }}>{item.label}</p>
                  <p style={{ margin: "1px 0 0", fontSize: 10, color: "var(--text-muted)" }}>{item.desc}</p>
                </div>
                <i
                  className={checked ? "ti ti-circle-check-filled" : "ti ti-circle"}
                  style={{ fontSize: 18, color: checked ? "#8b5cf6" : "var(--text-muted)", flexShrink: 0 }}
                  aria-hidden="true"
                />
              </button>
            );
          })}
        </div>

        <div style={{ display: "flex", gap: 10, marginTop: 6 }}>
          <button onClick={onClose} style={{ ...btnSecondary, flex: 1, padding: "12px 16px" }}>
            취소
          </button>
          <button onClick={handleSave} disabled={saving} style={{ ...btnPrimary, flex: 2, padding: "12px 16px", opacity: saving ? 0.6 : 1 }}>
            {saving ? "저장 중..." : "저장"}
          </button>
        </div>
      </div>
    </div>
  );
}
