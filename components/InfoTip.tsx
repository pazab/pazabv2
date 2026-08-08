'use client'
import { useState, type ReactNode } from 'react'
import { modalOverlay, modalSheet, btnPrimary } from '@/lib/styles'

interface InfoTipProps {
  title: string
  children: ReactNode
  size?: number
}

// 탭하면 여는 짧은 바텀시트형 도움말. hover 없는 모바일 환경 기준, alert/confirm 금지 규칙과 호환.
export default function InfoTip({ title, children, size = 15 }: InfoTipProps) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        onClick={(e) => { e.stopPropagation(); setOpen(true) }}
        aria-label={`${title} 도움말`}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: size,
          height: size,
          borderRadius: '50%',
          background: 'var(--surface2)',
          border: '1px solid var(--border)',
          color: 'var(--text-muted)',
          fontSize: Math.round(size * 0.65),
          fontWeight: 700,
          cursor: 'pointer',
          flexShrink: 0,
          lineHeight: 1,
          padding: 0,
        }}
      >
        ?
      </button>

      {open && (
        <div onClick={(e) => { e.stopPropagation(); setOpen(false) }} style={modalOverlay}>
          <div onClick={(e) => e.stopPropagation()} style={modalSheet}>
            <p style={{ fontSize: 15, fontWeight: 800, color: 'var(--text)', margin: '0 0 10px' }}>{title}</p>
            <div style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6, marginBottom: 20 }}>
              {children}
            </div>
            <button onClick={(e) => { e.stopPropagation(); setOpen(false) }} style={btnPrimary}>확인</button>
          </div>
        </div>
      )}
    </>
  )
}
