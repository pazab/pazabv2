'use client'
/**
 * components/RoleConfirmSheet.tsx — STEP 1 마이크로 컨펌 바텀시트
 * 잠정 추론된 역할을 기본 선택으로 굵게 표시 → 1탭으로 확정
 */
import { useState } from 'react'

interface RoleConfirmSheetProps {
  inferred: 'employer' | 'worker'
  onConfirm: (role: 'employer' | 'worker') => Promise<void>
  onClose?: () => void
}

export default function RoleConfirmSheet({ inferred, onConfirm, onClose }: RoleConfirmSheetProps) {
  const [loading, setLoading] = useState(false)

  const handleConfirm = async (role: 'employer' | 'worker') => {
    setLoading(true)
    try {
      await onConfirm(role)
    } finally {
      setLoading(false)
    }
  }

  const isEmployer = inferred === 'employer'

  return (
    <>
      {/* 백드롭 */}
      <div
        className="fixed inset-0 bg-black/40 z-40 animate-fade-in"
        onClick={onClose}
      />

      {/* 바텀시트 */}
      <div className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-2xl shadow-2xl animate-slide-up max-w-md mx-auto">
        <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mt-3 mb-4" />

        <div className="px-6 pb-8">
          {/* 헤더 */}
          <p className="text-center text-gray-500 text-sm mb-1">파잡 시작 방법</p>
          <h2 className="text-center text-xl font-bold text-gray-900 mb-6">
            {isEmployer
              ? '사장님으로 시작할게요. 맞아요?'
              : '알바 구하는 분으로 시작할게요. 맞아요?'}
          </h2>

          {/* 추천 선택 (굵게) */}
          <button
            id="role-confirm-primary"
            onClick={() => handleConfirm(inferred)}
            disabled={loading}
            className="w-full py-4 bg-blue-500 hover:bg-blue-600 text-white font-bold text-base rounded-xl mb-3 transition-colors disabled:opacity-60"
          >
            {loading ? '처리 중...' : isEmployer ? '네, 사장님이에요' : '네, 알바 구하는 중이에요'}
          </button>

          {/* 반대 선택 (고스트) */}
          <button
            id="role-confirm-alternate"
            onClick={() => handleConfirm(inferred === 'employer' ? 'worker' : 'employer')}
            disabled={loading}
            className="w-full py-4 border border-gray-200 hover:bg-gray-50 text-gray-600 font-medium text-base rounded-xl transition-colors disabled:opacity-60"
          >
            {isEmployer ? '아니요, 알바 구하는 중이에요' : '아니요, 사장님이에요'}
          </button>

          <p className="text-center text-gray-400 text-xs mt-4">
            나중에 설정에서 언제든 바꿀 수 있어요
          </p>
        </div>
      </div>

      <style>{`
        @keyframes fade-in {
          from { opacity: 0 }
          to { opacity: 1 }
        }
        @keyframes slide-up {
          from { transform: translateY(100%) }
          to { transform: translateY(0) }
        }
        .animate-fade-in { animation: fade-in 0.2s ease-out }
        .animate-slide-up { animation: slide-up 0.3s cubic-bezier(0.4,0,0.2,1) }
      `}</style>
    </>
  )
}
