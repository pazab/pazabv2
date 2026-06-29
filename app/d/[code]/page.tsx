/**
 * app/d/[code]/page.tsx — STEP 3: 대타 딥링크 공개 미리보기
 * 비로그인 OK. [카카오 1탭] 누를 때만 로그인 요구.
 */
import { createSupabaseServerClient } from '@/lib/supabase-server'
import DaetaPreviewClient from './DaetaPreviewClient'

interface Props {
  params: Promise<{ code: string }>
}

export default async function DaetaDeepLinkPage({ params }: Props) {
  const { code } = await params
  const supabase = await createSupabaseServerClient()

  // 공고 조회 (short_code 기준)
  const { data: posting } = await supabase
    .from('daeta_postings')
    .select('*')
    .eq('short_code', code)
    .single()

  // 만료/없는 공고 처리
  if (!posting) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center p-8">
          <div className="text-5xl mb-4">📭</div>
          <h1 className="text-xl font-bold text-gray-800 mb-2">마감된 공고예요</h1>
          <p className="text-gray-500 text-sm mb-6">이미 채워졌거나 기간이 지났어요</p>
          <a href="/" className="inline-block bg-blue-500 text-white px-6 py-3 rounded-xl font-medium">
            다른 대타 보기
          </a>
        </div>
      </div>
    )
  }

  const isExpired = new Date(posting.expires_at) < new Date()
  const isCancelled = posting.status === 'cancelled'

  if (isExpired || isCancelled) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center p-8">
          <div className="text-5xl mb-4">⏰</div>
          <h1 className="text-xl font-bold text-gray-800 mb-2">
            {isCancelled ? '취소된 공고예요' : '마감된 공고예요'}
          </h1>
          <p className="text-gray-500 text-sm mb-6">대타가 이미 구해졌을 수 있어요</p>
          <a href="/" className="inline-block bg-blue-500 text-white px-6 py-3 rounded-xl font-medium">
            다른 대타 보기
          </a>
        </div>
      </div>
    )
  }

  return <DaetaPreviewClient posting={posting} shortCode={code} />
}
