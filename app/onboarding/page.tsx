'use client'
/**
 * app/onboarding/page.tsx — STEP 1: 3필드 단일 온보딩 화면
 *
 * 핸드북 §2.1 기반:
 *  - 동네 검색 (Kakao Local 자동완성 → 좌표 저장)
 *  - 관심 분야 칩 (최대 3개)
 *  - 가능한 때 (평일/주말/아무때나)
 *  → [시작하기] → 홈 즉시 진입 (빈 화면 금지)
 */
import { useState, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { resolveAddress, type AddressResult, type OnboardingData } from '@/lib/onboarding'

// ============================================================
// 상수
// ============================================================
const INDUSTRIES = [
  '카페', '한식', '일식', '중식', '피자/버거',
  '편의점', '마트', '베이커리', '술집/호프', '패스트푸드',
  '분식', '치킨', '아이스크림', '기타',
]

type Availability = 'weekday' | 'weekend' | 'any'

// ============================================================
// 컴포넌트
// ============================================================
export default function OnboardingPage() {
  const router = useRouter()

  // 3필드 상태
  const [locationQuery, setLocationQuery] = useState('')
  const [resolvedAddr, setResolvedAddr] = useState<AddressResult | null>(null)
  const [addrSuggestions, setAddrSuggestions] = useState<KakaoKeywordDoc[]>([])
  const [showSuggestions, setShowSuggestions] = useState(false)

  const [selectedIndustries, setSelectedIndustries] = useState<string[]>([])
  const [availability, setAvailability] = useState<Availability>('any')

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ============================================================
  // 주소 자동완성 (Kakao Local 키워드 검색)
  // ============================================================
  const fetchSuggestions = useCallback(async (q: string) => {
    if (q.length < 2) { setAddrSuggestions([]); return }
    const REST_KEY = process.env.NEXT_PUBLIC_KAKAO_REST_KEY
    if (!REST_KEY) return
    try {
      const res = await fetch(
        `https://dapi.kakao.com/v2/local/search/keyword.json?query=${encodeURIComponent(q)}&size=5`,
        { headers: { Authorization: `KakaoAK ${REST_KEY}` } }
      )
      const data = await res.json()
      setAddrSuggestions(data.documents ?? [])
      setShowSuggestions(true)
    } catch { setAddrSuggestions([]) }
  }, [])

  const handleLocationInput = (val: string) => {
    setLocationQuery(val)
    setResolvedAddr(null)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => fetchSuggestions(val), 350)
  }

  const selectSuggestion = async (doc: KakaoKeywordDoc) => {
    setShowSuggestions(false)
    const displayName = doc.address_name || doc.place_name
    setLocationQuery(displayName)
    const result = await resolveAddress(displayName)
    if (result) {
      setResolvedAddr(result)
    } else {
      // 폴백: 제안 doc에서 직접 추출
      setResolvedAddr({
        lat: parseFloat(doc.y),
        lng: parseFloat(doc.x),
        region: doc.address_name,
        sido: '', sigungu: '', eupmyeondong: '',
        address: displayName,
      })
    }
  }

  // ============================================================
  // 업종 칩 선택 (최대 3개)
  // ============================================================
  const toggleIndustry = (ind: string) => {
    setSelectedIndustries(prev => {
      if (prev.includes(ind)) return prev.filter(i => i !== ind)
      if (prev.length >= 3) return prev
      return [...prev, ind]
    })
  }

  // ============================================================
  // 시작하기 — onboarding_data 저장 → 홈 진입
  // ============================================================
  const handleStart = async () => {
    if (!resolvedAddr) {
      setError('동네를 먼저 검색해서 선택해주세요')
      return
    }

    setLoading(true)
    setError(null)

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }

      const od: OnboardingData = {
        region: resolvedAddr.region,
        lat: resolvedAddr.lat,
        lng: resolvedAddr.lng,
        sido: resolvedAddr.sido,
        sigungu: resolvedAddr.sigungu,
        eupmyeondong: resolvedAddr.eupmyeondong,
        industries: selectedIndustries,
        availability,
        created_at: new Date().toISOString(),
      }

      // users 테이블에 onboarded=true + onboarding_data 저장
      const { error: upsertErr } = await supabase.from('users').upsert({
        id: user.id,
        onboarded: true,
        onboarding_data: od,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'id' })

      if (upsertErr) throw upsertErr

      // 홈 즉시 진입 (빈 화면 금지)
      router.push('/')
    } catch (e) {
      console.error(e)
      setError('저장 중 오류가 발생했어요. 다시 시도해주세요.')
    } finally {
      setLoading(false)
    }
  }

  // ============================================================
  // 렌더
  // ============================================================
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* 헤더 */}
        <div className="text-center mb-8">
          <div className="text-4xl mb-3">🗺️</div>
          <h1 className="text-2xl font-bold text-gray-900 mb-1">어디서 시작할까요?</h1>
          <p className="text-gray-500 text-sm">내 주변 알바·대타, 30초면 시작해요</p>
        </div>

        {/* 카드 */}
        <div className="bg-white rounded-2xl shadow-lg p-6 space-y-6">

          {/* 필드 1: 동네 검색 */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              📍 동네 검색
            </label>
            <div className="relative">
              <input
                id="onboarding-location"
                type="text"
                value={locationQuery}
                onChange={e => handleLocationInput(e.target.value)}
                onFocus={() => addrSuggestions.length > 0 && setShowSuggestions(true)}
                placeholder="예) 신창면, 배방읍, 아산시..."
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 bg-gray-50"
              />
              {resolvedAddr && (
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-green-500 text-sm">✓</span>
              )}

              {/* 자동완성 드롭다운 */}
              {showSuggestions && addrSuggestions.length > 0 && (
                <div className="absolute z-20 left-0 right-0 mt-1 bg-white border border-gray-100 rounded-xl shadow-lg overflow-hidden">
                  {addrSuggestions.map((doc, i) => (
                    <button
                      key={i}
                      onClick={() => selectSuggestion(doc)}
                      className="w-full text-left px-4 py-3 text-sm hover:bg-blue-50 border-b border-gray-50 last:border-0"
                    >
                      <span className="font-medium text-gray-800">{doc.place_name || doc.address_name}</span>
                      {doc.address_name && doc.place_name && (
                        <span className="text-gray-400 ml-2 text-xs">{doc.address_name}</span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
            {/* 최근 지역 힌트 */}
            <div className="flex gap-2 mt-2 flex-wrap">
              {['신창면', '배방읍', '온양온천역'].map(hint => (
                <button
                  key={hint}
                  onClick={() => { setLocationQuery(hint); handleLocationInput(hint) }}
                  className="text-xs text-blue-500 bg-blue-50 rounded-full px-3 py-1 hover:bg-blue-100"
                >
                  {hint}
                </button>
              ))}
            </div>
          </div>

          {/* 필드 2: 관심 분야 */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              관심 분야 <span className="text-gray-400 font-normal">(최대 3개)</span>
            </label>
            <div className="flex flex-wrap gap-2">
              {INDUSTRIES.map(ind => {
                const selected = selectedIndustries.includes(ind)
                return (
                  <button
                    key={ind}
                    id={`industry-${ind}`}
                    onClick={() => toggleIndustry(ind)}
                    className={`px-3 py-1.5 rounded-full text-sm font-medium transition-all ${
                      selected
                        ? 'bg-blue-500 text-white shadow-sm scale-105'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    {ind}
                  </button>
                )
              })}
            </div>
          </div>

          {/* 필드 3: 가능한 때 */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              가능한 때
            </label>
            <div className="flex gap-2">
              {([
                { value: 'weekday', label: '평일' },
                { value: 'weekend', label: '주말' },
                { value: 'any',     label: '아무때나' },
              ] as { value: Availability; label: string }[]).map(opt => (
                <button
                  key={opt.value}
                  id={`availability-${opt.value}`}
                  onClick={() => setAvailability(opt.value)}
                  className={`flex-1 py-3 rounded-xl text-sm font-medium transition-all ${
                    availability === opt.value
                      ? 'bg-blue-500 text-white shadow-sm'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* 에러 */}
          {error && (
            <p className="text-red-500 text-sm text-center bg-red-50 rounded-lg py-2 px-3">
              {error}
            </p>
          )}

          {/* 시작 버튼 */}
          <button
            id="onboarding-start"
            onClick={handleStart}
            disabled={loading || !resolvedAddr}
            className="w-full py-4 bg-blue-500 hover:bg-blue-600 disabled:bg-gray-200 disabled:text-gray-400 text-white font-bold text-base rounded-xl transition-all shadow-md hover:shadow-lg disabled:shadow-none"
          >
            {loading ? '잠깐만요...' : '시작하기 →'}
          </button>
        </div>

        {/* 하단 안내 */}
        <p className="text-center text-gray-400 text-xs mt-4">
          나중에 언제든 바꿀 수 있어요
        </p>
      </div>
    </div>
  )
}

// ============================================================
// 타입 (Kakao Local API 응답)
// ============================================================
interface KakaoKeywordDoc {
  place_name: string
  address_name: string
  x: string  // lng
  y: string  // lat
}
