'use client'
/**
 * app/d/[code]/DaetaPreviewClient.tsx
 * 비로그인 공개 미리보기 + 카카오 1탭 지원 CTA
 */
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { daetaDayCount } from '@/lib/utils'

interface Posting {
  id: string
  business_name: string
  business_type: string
  region: string
  work_date: string
  work_date_end?: string | null
  work_hours: string
  wage: number
  duty: string
  short_code: string
  image_urls?: string[] | null
}

interface Props {
  posting: Posting
  shortCode: string
}

export default function DaetaPreviewClient({ posting, shortCode }: Props) {
  const router = useRouter()

  const handleKakaoLogin = async () => {
    // 딥링크 컨텍스트 저장 (로그인 후 이 공고로 복귀)
    sessionStorage.setItem('daeta_redirect', `/d/${shortCode}`)
    await supabase.auth.signInWithOAuth({
      provider: 'kakao',
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=/d/${shortCode}`,
      },
    })
  }

  const formatDate = (d: string) => {
    const date = new Date(d)
    const today = new Date()
    const tomorrow = new Date(today)
    tomorrow.setDate(tomorrow.getDate() + 1)
    if (date.toDateString() === today.toDateString()) return '오늘'
    if (date.toDateString() === tomorrow.toDateString()) return '내일'
    return `${date.getMonth() + 1}/${date.getDate()}(${['일', '월', '화', '수', '목', '금', '토'][date.getDay()]})`
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 via-white to-red-50 flex flex-col">
      {/* 상단 긴급 배너 */}
      <div className="bg-red-500 text-white text-center py-2 text-sm font-medium animate-pulse">
        🚨 긴급 대타 구인 중
      </div>

      <div className="flex-1 flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-sm">
          {/* 공고 카드 */}
          <div className="bg-white rounded-2xl shadow-xl overflow-hidden mb-6">
            {/* 헤더 */}
            <div className="bg-gradient-to-r from-red-500 to-orange-500 px-6 py-5 text-white">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-2xl">🚨</span>
                <span className="text-sm font-medium opacity-90">오늘 대타 급구</span>
              </div>
              <h1 className="text-xl font-bold">{posting.business_name}</h1>
              <p className="text-sm opacity-80 mt-0.5">{posting.business_type}</p>
            </div>

            {/* 업무 사진 — 인터뷰 없이 바로 지원 여부를 결정해야 해서, 어떤 일인지 감을 잡게 해줌 */}
            {posting.image_urls && posting.image_urls.length > 0 && (
              <div className="flex gap-2 px-6 pt-4 overflow-x-auto">
                {posting.image_urls.map((url, i) => (
                  <img key={url + i} src={url} alt="업무 사진" className="w-28 h-28 rounded-xl object-cover flex-shrink-0" />
                ))}
              </div>
            )}

            {/* 상세 정보 */}
            <div className="px-6 py-5 space-y-3">
              <div className="flex items-center gap-3">
                <span className="w-8 h-8 bg-orange-100 rounded-full flex items-center justify-center text-sm">📅</span>
                <div>
                  <p className="text-xs text-gray-400">날짜·시간</p>
                  <p className="font-semibold text-gray-800">
                    {formatDate(posting.work_date)}
                    {posting.work_date_end && posting.work_date_end !== posting.work_date
                      ? ` ~ ${new Date(posting.work_date_end).getMonth() + 1}/${new Date(posting.work_date_end).getDate()} (${daetaDayCount(posting.work_date, posting.work_date_end)}일)`
                      : ''} {posting.work_hours}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <span className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center text-sm">💰</span>
                <div>
                  <p className="text-xs text-gray-400">시급</p>
                  <p className="font-bold text-green-600 text-lg">
                    {posting.wage.toLocaleString()}원
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <span className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center text-sm">📍</span>
                <div>
                  <p className="text-xs text-gray-400">위치</p>
                  <p className="font-semibold text-gray-800">{posting.region}</p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <span className="w-8 h-8 bg-purple-100 rounded-full flex items-center justify-center text-sm">💼</span>
                <div>
                  <p className="text-xs text-gray-400">담당 업무</p>
                  <p className="font-semibold text-gray-800">{posting.duty}</p>
                </div>
              </div>

            </div>
          </div>

          {/* CTA */}
          <button
            id="daeta-kakao-login"
            onClick={handleKakaoLogin}
            className="w-full py-4 bg-yellow-400 hover:bg-yellow-500 text-gray-900 font-bold text-base rounded-xl shadow-lg transition-all hover:shadow-xl flex items-center justify-center gap-2"
          >
            <span className="text-xl">🗨️</span>
            카카오로 1탭 지원하기
          </button>

          <p className="text-center text-gray-400 text-xs mt-3">
            30초면 가입 완료 · 파잡
          </p>
        </div>
      </div>
    </div>
  )
}
