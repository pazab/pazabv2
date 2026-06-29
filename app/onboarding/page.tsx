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
import { useState, useRef, useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { resolveAddress, coordToAddress, type AddressResult, type OnboardingData } from '@/lib/onboarding'

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

  // 유저 역할 상태 ('employer' | 'worker' | 'both')
  const [userType, setUserType] = useState<'employer' | 'worker' | 'both'>('worker')

  // 3필드 상태
  const [locationQuery, setLocationQuery] = useState('')
  const [resolvedAddr, setResolvedAddr] = useState<AddressResult | null>(null)
  const [addrSuggestions, setAddrSuggestions] = useState<KakaoKeywordDoc[]>([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [gpsLoading, setGpsLoading] = useState(false)

  const [selectedIndustries, setSelectedIndustries] = useState<string[]>([])
  const [availability, setAvailability] = useState<Availability>('any')

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // 로그인한 유저의 역할(user_type) 불러오기
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        supabase.from('users').select('user_type').eq('id', user.id).single()
          .then(({ data }) => {
            if (data?.user_type) {
              setUserType(data.user_type as any)
            } else {
              const pending = localStorage.getItem('pending_user_type')
              if (pending) setUserType(pending as any)
            }
          })
      }
    })
  }, [])

  // ============================================================
  // 주소 자동완성 (Kakao Local 키워드 검색)
  // ============================================================
  const fetchSuggestions = useCallback(async (q: string) => {
    if (q.length < 2) { setAddrSuggestions([]); return }
    const REST_KEY = process.env.NEXT_PUBLIC_KAKAO_REST_KEY
    if (!REST_KEY) return
    try {
      // 1. 키워드(상호명/장소) 검색 우선 시도
      const res = await fetch(
        `https://dapi.kakao.com/v2/local/search/keyword.json?query=${encodeURIComponent(q)}&size=5`,
        { headers: { Authorization: `KakaoAK ${REST_KEY}` } }
      )
      const data = await res.json()
      let docs = data.documents ?? []

      // 2. 키워드 결과가 없거나 부족한 경우 행정동/지번 주소 검색을 폴백으로 연동
      if (docs.length < 3) {
        try {
          const addrRes = await fetch(
            `https://dapi.kakao.com/v2/local/search/address.json?query=${encodeURIComponent(q)}&size=5`,
            { headers: { Authorization: `KakaoAK ${REST_KEY}` } }
          )
          const addrData = await addrRes.json()
          const addrDocs = addrData.documents ?? []
          
          // 중복 방지 병합 (주소명 기준)
          const seen = new Set(docs.map((d: any) => d.address_name || d.place_name))
          addrDocs.forEach((d: any) => {
            const name = d.address_name || d.place_name
            if (name && !seen.has(name)) {
              docs.push(d)
            }
          })
        } catch (e) {
          console.warn('Address fallback failed:', e)
        }
      }

      setAddrSuggestions(docs.slice(0, 5))
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
  // GPS 현재 위치로 설정
  // ============================================================
  const handleGetCurrentLocation = () => {
    if (typeof window === 'undefined' || !navigator.geolocation) {
      setError('이 브라우저 혹은 장치에서는 GPS를 지원하지 않아요.')
      return
    }

    setGpsLoading(true)
    setError(null)

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords
        try {
          const result = await coordToAddress(latitude, longitude)
          if (result) {
            setResolvedAddr(result)
            setLocationQuery(result.region || result.address)
          } else {
            setError('현재 위치의 주소를 카카오 Local API를 통해 불러오지 못했어요. 수동 검색을 이용해주세요.')
          }
        } catch (err) {
          setError('주소 변환에 실패했습니다. 네트워크 상태를 확인해주세요.')
        } finally {
          setGpsLoading(false)
        }
      },
      (err) => {
        console.error('[getCurrentPosition] error details:', err.code, err.message)
        if (err.code === 1) {
          setError('위치 정보 수집 권한이 거부되었습니다. 주소창 왼쪽의 자물쇠 아이콘을 눌러 위치 권한을 허용해주세요.')
        } else if (err.code === 2) {
          setError('위치 정보를 확인할 수 없습니다. 장치의 GPS 수신 상태나 네트워크 연결을 확인해주세요.')
        } else if (err.code === 3) {
          setError('위치 측정 제한 시간(10초)을 초과했습니다. 다시 누르시거나 검색창에 수동 검색을 입력해주세요.')
        } else {
          setError('현재 위치를 가져오는 도중 오류가 발생했습니다. 수동 입력을 이용해주세요.')
        }
        setGpsLoading(false)
      },
      { enableHighAccuracy: false, timeout: 10000 }
    )
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

      const od: OnboardingData & { biz_name?: string } = {
        region: resolvedAddr.region,
        lat: resolvedAddr.lat,
        lng: resolvedAddr.lng,
        sido: resolvedAddr.sido,
        sigungu: resolvedAddr.sigungu,
        eupmyeondong: resolvedAddr.eupmyeondong,
        industries: selectedIndustries,
        availability,
        created_at: new Date().toISOString(),
        biz_name: userType === 'employer' ? locationQuery : undefined,
      }

      // users 테이블에 onboarded=true + onboarding_data + user_type 저장
      const { error: upsertErr } = await supabase.from('users').upsert({
        id: user.id,
        onboarded: true,
        user_type: userType,
        onboarding_data: od,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'id' })

      if (upsertErr) throw upsertErr

      // 사장님 역할이면 employer_profiles 자동 생성 (없을 때만)
      if (userType === 'employer' || userType === 'both') {
        const { data: existing } = await supabase
          .from('employer_profiles')
          .select('id')
          .eq('user_id', user.id)
          .maybeSingle()

        if (!existing) {
          const bizName = od.biz_name || od.region || ''
          // eupmyeondong이 비어있으면 region에서 마지막 단위 추출
          const eupmyeondong = resolvedAddr.eupmyeondong ||
            resolvedAddr.region?.split(' ').slice(-1)[0] || ''

          await supabase.from('employer_profiles').insert({
            user_id: user.id,
            business_name: bizName,
            business_type: selectedIndustries[0] || null,
            region: resolvedAddr.region,
            sido: resolvedAddr.sido,
            sigungu: resolvedAddr.sigungu,
            eupmyeondong,
            lat: resolvedAddr.lat,
            lng: resolvedAddr.lng,
          })
        }
      }

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
    <div className="min-h-screen bg-[#0A0A0A] text-white flex flex-col items-center justify-center p-4 relative overflow-hidden">
      {/* 백그라운드 그라디언트 블롭 */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute top-[-10%] left-[-10%] w-[400px] h-[400px] rounded-full bg-[#8b5cf6] opacity-10 blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[400px] h-[400px] rounded-full bg-[#ec4899] opacity-5 blur-[100px]" />
      </div>

      <div className="w-full max-w-md relative z-10">
        {/* 헤더 */}
        <div className="text-center mb-8">
          <div className="text-4xl mb-3">🗺️</div>
          <h1 className="text-2xl font-black text-white mb-1">어디서 시작할까요?</h1>
          <p className="text-white/40 text-sm">
            {userType === 'employer' 
              ? '매장 정보와 구인 요건을 확인하기 위해 30초면 끝나요'
              : '내 주변 알바·대타, 30초면 시작해요'}
          </p>
        </div>

        {/* 카드 */}
        <div className="bg-white/5 border border-white/10 rounded-2xl p-6 space-y-6 shadow-2xl backdrop-blur-md">

          {/* 역할 전환 탭 (온보딩 단계에서 최종 조율) */}
          <div className="flex bg-white/5 p-1 rounded-xl border border-white/5">
            <button
              type="button"
              onClick={() => setUserType('worker')}
              className={`flex-1 py-2.5 text-xs font-bold rounded-lg transition-all ${
                userType === 'worker'
                  ? 'bg-gradient-to-r from-[#8b5cf6] to-[#ec4899] text-white shadow-md border-transparent'
                  : 'text-white/50 hover:text-white/80 border-transparent bg-transparent'
              }`}
            >
              ⚡ 알바생으로 시작
            </button>
            <button
              type="button"
              onClick={() => setUserType('employer')}
              className={`flex-1 py-2.5 text-xs font-bold rounded-lg transition-all ${
                userType === 'employer'
                  ? 'bg-gradient-to-r from-[#8b5cf6] to-[#ec4899] text-white shadow-md border-transparent'
                  : 'text-white/50 hover:text-white/80 border-transparent bg-transparent'
              }`}
            >
              🏪 사장님으로 시작
            </button>
          </div>

          {/* 필드 1: 동네/매장 검색 */}
          <div>
            <label className="block text-sm font-semibold text-white/90 mb-1">
              {userType === 'employer' ? '🏪 매장 주소 / 상호명 검색' : '📍 희망 근무 지역 / 거주 주소'}
            </label>
            <span className="text-[11px] text-white/40 block mb-2 leading-relaxed">
              {userType === 'employer'
                ? '상호명(예: 파스쿠찌 신창점) 또는 주소를 검색하면 위치와 상호명이 함께 등록됩니다.'
                : '일하고 싶은 동네명(예: 신창면) 또는 주소를 검색해 주세요.'}
            </span>
            <div className="relative">
              <input
                id="onboarding-location"
                type="text"
                value={locationQuery}
                onChange={e => handleLocationInput(e.target.value)}
                onFocus={() => addrSuggestions.length > 0 && setShowSuggestions(true)}
                placeholder={userType === 'employer' ? '예) 파스쿠찌 신창점 또는 도로명 주소 입력' : '예) 신창면, 배방읍 또는 도로명 주소 입력'}
                className="w-full border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#8b5cf6]/50 bg-white/5 text-white placeholder-white/30"
              />
              {resolvedAddr && (
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-emerald-400 text-sm">✓</span>
              )}
            </div>

            {/* 선택된 실제 주소 확인 피드백 */}
            {resolvedAddr && (
              <p className="text-[11px] text-emerald-400 mt-2 block font-medium">
                ✓ {userType === 'employer' ? '매장 주소' : '위치 주소'}: {resolvedAddr.region || resolvedAddr.address}
              </p>
            )}

            {/* 자동완성 드롭다운 */}
            {showSuggestions && addrSuggestions.length > 0 && (
                <div className="absolute z-20 left-0 right-0 mt-1 bg-zinc-900 border border-white/10 rounded-xl shadow-2xl overflow-hidden max-h-[220px] overflow-y-auto">
                  {addrSuggestions.map((doc, i) => (
                    <button
                      key={i}
                      onClick={() => selectSuggestion(doc)}
                      className="w-full text-left px-4 py-3 text-sm hover:bg-[#8b5cf6]/10 border-b border-white/5 last:border-0 text-white/90 transition-colors"
                    >
                      <span className="font-medium">{doc.place_name || doc.address_name}</span>
                      {doc.address_name && doc.place_name && (
                        <span className="text-white/40 ml-2 text-xs">{doc.address_name}</span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            {/* GPS 버튼 & 최근 지역 힌트 */}
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <button
                type="button"
                onClick={handleGetCurrentLocation}
                disabled={gpsLoading}
                className="text-xs text-white bg-emerald-600/90 hover:bg-emerald-600 rounded-full px-3 py-1.5 flex items-center gap-1 transition-all disabled:opacity-50 cursor-pointer shadow-sm hover:shadow"
              >
                <span>📍</span>
                <span>{gpsLoading ? '위치 측정 중...' : '현재 위치로 설정'}</span>
              </button>

              <div className="w-[1px] h-3 bg-white/10 mx-1" />

              {(userType === 'employer' ? ['파스쿠찌 신창점', '아산시 신창면'] : ['신창면', '배방읍', '온양온천역']).map(hint => (
                <button
                  key={hint}
                  onClick={() => { setLocationQuery(hint); handleLocationInput(hint) }}
                  className="text-xs text-[#a78bfa] bg-[#8b5cf6]/10 rounded-full px-3 py-1.5 hover:bg-[#8b5cf6]/20 transition-colors cursor-pointer"
                >
                  {hint}
                </button>
              ))}
            </div>
          </div>

          {/* 필드 2: 관심 분야 */}
          <div>
            <label className="block text-sm font-semibold text-white/90 mb-1">
              {userType === 'employer' ? '🏪 매장 주요 업종' : '⚡ 희망 근무 업종'}
              <span className="text-white/40 font-normal text-xs ml-1">(최대 3개)</span>
            </label>
            <span className="text-[11px] text-white/40 block mb-3">
              {userType === 'employer' ? '해당 매장의 주력 업태를 선택해 주세요.' : '일하고 싶은 선호 업태를 지정해 주세요.'}
            </span>
            <div className="flex flex-wrap gap-2 max-h-[140px] overflow-y-auto pr-1">
              {INDUSTRIES.map(ind => {
                const selected = selectedIndustries.includes(ind)
                return (
                  <button
                    key={ind}
                    id={`industry-${ind}`}
                    onClick={() => toggleIndustry(ind)}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all border ${
                      selected
                        ? 'bg-gradient-to-r from-[#8b5cf6] to-[#ec4899] text-white border-transparent shadow-md scale-105'
                        : 'bg-white/5 text-white/70 border-white/5 hover:bg-white/10'
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
            <label className="block text-sm font-semibold text-white/90 mb-2">
              {userType === 'employer' ? '📅 구인 희망 시기' : '⏰ 근무 가능 시기'}
            </label>
            <div className="flex gap-2">
              {([
                { value: 'weekday', label: '평일' },
                { value: 'weekend', label: '주말' },
                { value: 'any',     label: '상관없음' },
              ] as { value: Availability; label: string }[]).map(opt => (
                <button
                  key={opt.value}
                  id={`availability-${opt.value}`}
                  onClick={() => setAvailability(opt.value)}
                  className={`flex-1 py-3 rounded-xl text-sm font-medium transition-all border ${
                    availability === opt.value
                      ? 'bg-gradient-to-r from-[#8b5cf6] to-[#ec4899] text-white border-transparent shadow-md'
                      : 'bg-white/5 text-white/70 border-white/5 hover:bg-white/10'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* 에러 */}
          {error && (
            <p className="text-red-400 text-sm text-center bg-red-950/20 border border-red-900/30 rounded-lg py-2 px-3">
              {error}
            </p>
          )}

          {/* 시작 버튼 */}
          <button
            id="onboarding-start"
            onClick={handleStart}
            disabled={loading || !resolvedAddr}
            className="w-full py-4 bg-gradient-to-r from-[#8b5cf6] to-[#ec4899] hover:opacity-90 disabled:bg-white/5 disabled:text-white/20 disabled:border disabled:border-white/5 text-white font-bold text-base rounded-xl transition-all shadow-md enabled:hover:shadow-lg disabled:cursor-not-allowed"
          >
            {loading ? '잠깐만요...' : '시작하기 →'}
          </button>
        </div>

        {/* 하단 안내 */}
        <p className="text-center text-white/30 text-xs mt-4">
          나중에 설정에서 언제든 바꿀 수 있어요
        </p>
      </div>
    </div>
  );
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
