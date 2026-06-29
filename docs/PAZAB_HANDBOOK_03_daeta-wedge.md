# PAZAB 핸드북 03 — STEP 3: 대타 wedge ⭐
### 출시의 창끝 — 속도 + 신뢰의 긴급 매칭
> **구현 순서**: 5번째 (공급·좌표가 준비된 뒤 소비하는 창끝)
> **의존**: STEP 2(검증 풀), STEP 4(초대 공급), STEP 6(좌표)
> **선행 읽기**: `00_blueprint.md`(결정 4·5·6·7), `02_employer-hr-first.md`
> **중요도**: ⭐⭐⭐ 최상. 파잡 출시의 wedge(쐐기).

---

## 1. 목표

### 1.1 이 STEP이 푸는 문제
대타는 파잡이 시장에 박는 **창끝**이다. 일반 알바 매칭은 "천천히 좋은 사람"이지만, 대타는 **"지금 당장, 믿을 수 있는 사람"**이다. 이 두 가치(속도 + 신뢰)가 대타의 전부이고, 온보딩·UX가 이 둘을 절대 깨면 안 된다.

핵심 메커니즘:
```
사장님이 카톡으로 긴급공고 공유
  → 받은 사람이 링크 1탭 → 해당 공고 직행 → 카톡 1탭 로그인
  → 근처 검증 인력 즉시 노출 (2티어)
  → SOS → 정산 직전 계좌인증 → 매칭 성사
```

### 1.2 완료 정의 (DoD)
```
✅ 카톡 공유 딥링크 → 해당 공고로 직행 (앱 탐색 거치지 않음)
✅ 비로그인 상태에서 공고 미리보기 → 카톡 1탭 로그인
✅ 2티어 피드 (검증✅ 상단 / 신규🔵 하단) 정상 정렬
✅ SOS 요청 → 정산 직전 단계에서만 알바생 계좌인증 (그 전엔 0)
✅ 사장님은 SOS/공고 전 계좌인증 필수 (결정5)
✅ GPS 강제 팝업 없음. 가게좌표 우선, 정밀GPS는 "내 위치로" 버튼만 (결정7)
```

### 1.3 이미 구현된 것 (재사용 자산)
```
✅ app/daeta/page.tsx — 매장좌표 우선 로드(getDbBase), 위치배지+바텀시트,
                        스와이프 피드(사진/영상 토글)
✅ DaetaRegisterModal — 공고 등록/수정(postingId)/취소, 계좌 실명인증
✅ DaetaHistoryView — 메모리 병렬조인(이력)
✅ /api/lovecall — SOS POST, 취소 PATCH
✅ 카카오 로그인 (결정6: 구현완료)
→ STEP3는 "신규 구축"보다 "딥링크·1탭·2티어 얹기"가 핵심
```

---

## 2. 화면 (UI 흐름)

### 2.1 딥링크 진입 (비로그인 → 공고 직행)
```
[카톡 메시지]
  "🚨 [파스쿠찌 신창점] 오늘 14시 대타 급구!
   시급 12,000원 · 4시간
   👉 pazab.app/d/AB12CD"
     │ (탭)
     ▼
[공고 미리보기] — 비로그인 OK
  ┌────────────────────────────┐
  │  🚨 오늘 대타 급구           │
  │  파스쿠찌 신창점            │
  │  14:00~18:00 · 시급 12,000  │
  │  📍 신창면 (내 위치서 1.2km) │
  │  필요: 보건증               │
  │                            │
  │  [카카오로 1탭 지원]        │  ← 여기서만 로그인 요구
  └────────────────────────────┘
     │
     ▼ (카톡 1탭 → 가입/로그인 → onboarded 분기)
[대타 피드 or 바로 이 공고에 SOS 수락 화면]
```

### 2.2 2티어 피드 (결정 4)
```
[대타 피드] (사장님이 인력 찾는 화면)
  📍 신창면 기준  🔍 변경         ← 기존 위치배지

  ─ 검증 인력 ─────────────────
  ┌──────────┐ ✅ 검증
  │ [재훈이]  │ 근태이력 · 계좌✓
  │  사진/영상 │ 1.2km
  │ [🚀 SOS] │
  └──────────┘
  ┌──────────┐ ✅ 검증
  │ [수진]    │ 팀이력
  └──────────┘

  ─ 신규 인력 ─────────────────
  ┌──────────┐ 🔵 신규
  │ [지원자A] │ 첫 대타
  │          │ 0.8km
  └──────────┘

정렬: Tier1(검증) 전부 → Tier2(신규). 각 티어 내부는 거리+매칭점수.
```

### 2.3 SOS → 정산 직전 계좌인증 (알바생, 결정5)
```
알바생 관점 (지원/수락):
  공고 수락 → [수락 완료, 정산 대기]
     │ (사장님이 최종 확정 = 돈 보낼 단계)
     ▼
  "정산을 위해 계좌를 한 번만 확인할게요"
  [계좌 실명인증]  ← 여기서 처음 요구. 이전 단계엔 0.
     │
     ▼
  매칭 성사 + worker_profiles.is_verified=true(bank_verified) 승격
  → 다음부터 Tier1
```

---

## 3. 데이터 흐름

### 3.1 딥링크 라우팅
```
pazab.app/d/[shortCode]
  → app/d/[code]/page.tsx (공개 라우트, 미들웨어 인증 가드 예외)
  → daeta_postings 조회 (shortCode → posting_id)
  → 공고 미리보기 렌더 (비로그인 OK)
  → [카카오 1탭] → auth → onboarded 분기(STEP1)
       · 신규 → 온보딩 3필드(단, 이 공고 컨텍스트 유지) → 이 공고로 복귀
       · 기존 → 바로 이 공고 수락 화면
```

### 3.2 2티어 정렬 데이터 흐름
```
대타 피드 로드:
  기준좌표(getDbBase: 가게좌표 우선 / 없으면 GPS)
  → worker_profiles 근처 조회 (lat/lng 거리 계산)
  → 각 worker: getTier() (STEP2 lib/verification.ts)
  → 정렬: tier(verified 먼저) → 거리 → 매칭점수
  → 피드 렌더 (티어별 섹션 구분)
```

### 3.3 SOS 시퀀스 (기존 lovecall 재사용 + 인증 가드)
```
사장님 [🚀 SOS]:
  → 사장님 bank_verified 체크 (결정5, 미인증→인증먼저)
  → /api/lovecall POST { daeta_posting_id, worker_id, match_score }
  → matches row 생성, 알바생에 푸시
  → 버튼 [✅ 요청완료] + [요청취소]
  → 취소 시 /api/lovecall PATCH cancel

알바생 수락 → 사장님 최종확정(정산단계):
  → 알바생 bank_verified 체크 (미인증→정산직전 인증모달)
  → 인증완료 → markVerified(reason='bank_verified') → 매칭성사
```

---

## 4. DB 변경

### 4.1 딥링크 단축코드
```sql
-- daeta_postings에 공유용 단축코드
ALTER TABLE daeta_postings ADD COLUMN IF NOT EXISTS short_code text DEFAULT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_daeta_short_code
  ON daeta_postings(short_code) WHERE short_code IS NOT NULL;
-- 생성: 6자리 base62 (앱레벨), 충돌 시 재생성
```

### 4.2 계좌인증 상태 (양쪽)
```sql
-- 사장님: employer 계정 / 알바생: worker 계정
ALTER TABLE users ADD COLUMN IF NOT EXISTS bank_verified boolean DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS bank_verified_at timestamptz DEFAULT NULL;
-- 계좌 원본은 저장 정책 주의 (PII). 인증 사실(boolean)만 보관 권장.
```

### 4.3 대타 매칭에 티어 기록 (분석/정렬 캐시)
```sql
ALTER TABLE matches ADD COLUMN IF NOT EXISTS worker_tier text DEFAULT NULL;
  -- 'verified' | 'new' — SOS 시점 스냅샷
```

### 4.4 거리 계산 (좌표 기반)
```sql
-- 옵션: PostGIS 없이 앱레벨 Haversine 사용 (현재 구조 유지)
-- 대량이면 RPC로 위경도 박스 1차 필터 후 앱에서 정밀거리
CREATE OR REPLACE FUNCTION nearby_workers(
  p_lat double precision, p_lng double precision, p_radius_km double precision
) RETURNS SETOF worker_profiles AS $$
  SELECT * FROM worker_profiles
  WHERE lat BETWEEN p_lat - (p_radius_km/111.0) AND p_lat + (p_radius_km/111.0)
    AND lng BETWEEN p_lng - (p_radius_km/88.0)  AND p_lng + (p_radius_km/88.0)
    AND is_active = true;
$$ LANGUAGE sql STABLE;
```

---

## 5. 코드 설계

### 5.1 신규/수정 파일
```
신규:
  app/d/[code]/page.tsx              — 딥링크 공개 공고 미리보기
  lib/shortcode.ts                   — base62 단축코드 생성/검증
  lib/daetaShare.ts                  — 카톡 공유 메시지 빌더
  components/daeta/TierBadge.tsx     — ✅검증 / 🔵신규 뱃지
  components/daeta/TierSection.tsx   — 티어별 섹션 래퍼

수정:
  app/daeta/page.tsx                 — 2티어 정렬/섹션 렌더, 공유버튼
  components/daeta/DaetaRegisterModal.tsx — short_code 생성, 공유 CTA
  app/api/lovecall/route.ts          — bank_verified 가드, worker_tier 스냅샷
  middleware.ts                      — /d/* 인증 예외 (공개 라우트)
```

### 5.2 lib/shortcode.ts
```typescript
const ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
export function genShortCode(len = 6): string {
  let s = "";
  for (let i = 0; i < len; i++) s += ALPHABET[Math.floor(Math.random()*62)];
  return s;
}
// 공고 등록 시: genShortCode → 중복조회 → 충돌이면 재생성 → daeta_postings.short_code
```

### 5.3 lib/daetaShare.ts (카톡 공유 메시지)
```typescript
export function buildDaetaShareText(p: {
  storeName: string; date: string; time: string;
  wage: number; shortCode: string;
}): string {
  return `🚨 [${p.storeName}] ${p.date} ${p.time} 대타 급구!\n`
       + `시급 ${p.wage.toLocaleString()}원\n`
       + `👉 https://pazab.app/d/${p.shortCode}`;
}
// 카카오 SDK 공유 or 단순 텍스트 공유 둘 다 지원
```

### 5.4 2티어 정렬 (app/daeta/page.tsx)
```typescript
import { getTier } from "@/lib/verification";

const sorted = workers
  .map(w => ({ ...w, tier: getTier(w), dist: haversine(base, w) }))
  .sort((a, b) => {
    if (a.tier !== b.tier) return a.tier === "verified" ? -1 : 1; // 검증 먼저
    if (a.dist !== b.dist) return a.dist - b.dist;                // 가까운 순
    return b.matchScore - a.matchScore;                          // 점수 높은 순
  });

const verified = sorted.filter(w => w.tier === "verified");
const fresh    = sorted.filter(w => w.tier === "new");
// → <TierSection title="검증 인력" badge="✅" items={verified} />
//   <TierSection title="신규 인력" badge="🔵" items={fresh} />
```

### 5.5 계좌인증 가드 (api/lovecall)
```typescript
// SOS POST 진입부
const { data: emp } = await supabaseAdmin
  .from("users").select("bank_verified").eq("id", employer_id).single();
if (!emp?.bank_verified) {
  return Response.json({ error: "BANK_VERIFY_REQUIRED" }, { status: 403 });
}
// 클라이언트는 이 에러코드 받으면 인증모달 오픈
```

---

## 6. 연결관계

```
STEP 3 ──consumes──> 검증풀(STEP2·4) + 좌표(STEP6) → 긴급 매칭 성사
   │
   ├─→ STEP 1: 딥링크 1탭 로그인도 온보딩 분기 통과. 공고 컨텍스트 유지가 관건.
   ├─→ STEP 2: PunchAlert가 SOS 주요 진입. getTier()/markVerified 재사용.
   │           가게좌표가 매칭 기준점.
   ├─→ STEP 4: 초대로 들어온 직원이 Tier1으로 피드 상단.
   ├─→ STEP 6: nearby_workers RPC가 좌표 인프라 위에서 작동.
   └─→ 기존 lovecall/매칭: matches 테이블 공유. worker_tier만 추가.
```

### 6.1 기존 기능 영향 (양쪽 동시 처리)
```
· /api/lovecall: 일반 러브콜과 대타 SOS가 같은 엔드포인트 →
  daeta_posting_id 유무로 분기. bank_verified 가드는 대타에만 적용.
· 딥링크 미들웨어 예외: /d/* 공개. 단 SOS/수락 액션은 로그인 필수.
· DaetaRegisterModal: 등록 성공 시 short_code 생성 + 공유 CTA 추가.
```

---

## 7. 검증

### 7.1 테스트 시나리오
```
A (딥링크 비로그인):
  시크릿창에서 pazab.app/d/{code} → 공고 미리보기 보임(로그인 전) →
  [카카오 1탭] → 가입 → 이 공고로 복귀

B (2티어 정렬):
  검증직원 + 신규지원자 섞인 상태 → 피드에서 ✅가 🔵보다 항상 위 →
  같은 티어 내 가까운 순 정렬 확인

C (사장님 계좌 가드):
  미인증 사장님 SOS → 403 BANK_VERIFY_REQUIRED → 인증모달 → 인증후 SOS 성공

D (알바생 정산직전 인증):
  알바생 가입~지원~수락까지 계좌 0회 요구 →
  사장님 최종확정(정산) 단계에서만 인증모달 → 인증후 is_verified 승격

E (GPS 비강제):
  대타 진입 시 GPS 팝업 안 뜸(가게좌표 우선) →
  "내 위치로" 눌렀을 때만 권한 요청
```

### 7.2 빌드/Git
```powershell
npx tsc --noEmit
```
```powershell
git add app/d/ lib/shortcode.ts lib/daetaShare.ts components/daeta/ app/daeta/page.tsx app/api/lovecall/route.ts middleware.ts && git commit -m "feat: 대타 wedge - 딥링크/카톡1탭/2티어풀/정산직전 계좌인증" && git push
```

---

## 부록 A — 딥링크 인프라 체크리스트
```
□ pazab.app/d/* 라우트가 미들웨어 인증에서 예외 처리됐는지
□ 카카오 공유 SDK 키 / 또는 텍스트공유 폴백
□ short_code 충돌 재생성 로직
□ 딥링크로 들어온 비로그인 유저의 공고 컨텍스트 유지(로그인 후 복귀)
□ 만료된 공고 딥링크 → "마감된 공고" 안내 화면
```

## 부록 B — 의사결정 체크리스트
```
□ 계좌 원본 저장 여부 → 권장: 인증사실(boolean)만, 원본 비저장(PII)
□ 거리 계산: 앱레벨 Haversine vs PostGIS → 초기엔 앱레벨 충분
□ 2티어를 사장님에게만 보일지, 알바생 관점에도 적용할지
□ 딥링크 미리보기에 어디까지 노출(매장명 공개 vs 익명)
```

---

*PAZAB Handbook 03 — STEP 3 대타 wedge | 2026.06.29 | ⭐ 핵심 챕터*
