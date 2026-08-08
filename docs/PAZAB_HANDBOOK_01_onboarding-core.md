# PAZAB 핸드북 01 — STEP 1: 온보딩 골격
### 역할 지연 · 3필드 가입 · 즉시 진입
> **구현 순서**: 1번째 (모든 진입점의 공통 토대)
> **의존**: 없음
> **선행 읽기**: `PAZAB_HANDBOOK_00_blueprint.md` (특히 결정 2, 7)

> ⚠️ **실제 구현과의 괴리 (2026-08-08 확인)**: 아래 3필드+역할지연(`inferRole`/`RoleConfirmSheet`/`onboarding_data` JSONB 임시보관) 설계는 코드로 구현되지 않았다. 실제 `app/onboarding/page.tsx`는 "사장님이에요 / 알바 찾아요" 2버튼 즉시선택 화면이고, 선택 즉시 `users.user_type`을 확정한다. 초대 수락(`app/i/[code]/page.tsx`)은 이 화면 자체를 우회한다. 재검토 결과 되돌릴 필요성은 낮다고 판단(초대·대타 콜드유입 등 실제 진입 경로가 이미 이 화면을 우회하거나 즉시선택이 자연스러움) — 이 문서는 과거 설계 의도 기록으로만 남기고, 신규 작업 시 실제 코드를 기준으로 판단할 것.

---

## 1. 목표

### 1.1 이 STEP이 푸는 문제
현재 가입은 `회원가입 → 역할선택 → 무거운 프로필 → HEXACO 10턴 → (빈)탐색` 순서로, 가치 체감 전에 4개 허들을 쌓는다. STEP 1은 이 입구를 **3필드 + 역할 지연 + 즉시 진입**으로 재설계해 **모든 진입점이 공유할 마찰 없는 공통 토대**를 만든다.

### 1.2 완료 정의 (DoD)
```
✅ 신규 유저가 역할 선택 없이 3필드만으로 가입 → 첫 화면 진입
✅ 첫 가치 행동 후 user_type을 1탭으로 확정
✅ 가입 동선 내 이탈 지점 0 (HEXACO·대량 프로필 모두 동선 밖)
```

### 1.3 설계 철학 (결정 2·7 적용)
```
역할: 입구에서 안 물어봄 → user_type=null로 시작 → 행동으로 잠정추론 → 첫 가치 후 1탭 컨펌
위치: 주소 자동완성으로 읍면동 좌표만 확보 (GPS 강제 없음)
정보: 가치 체감 전엔 최소만 (progressive)
```

---

## 2. 화면 (UI 흐름)

### 2.1 전체 플로우
```
[랜딩]
  "내 주변 알바, 30초면 시작"
  [카카오로 시작]  [구글로 시작]
     │
     ▼
[온보딩 1/1] — 단일 화면, 3필드 (스크롤 없이 한 눈)
  ┌─────────────────────────────┐
  │  어디서 시작할까요?           │
  │  [📍 동네 검색____________]   │  ← 주소 자동완성 (Kakao Local)
  │   최근: 신창면 · 음봉면        │
  │                             │
  │  관심 분야 (최대 3개)         │
  │  [카페][한식][편의점][...]     │  ← 업종 칩 멀티선택
  │                             │
  │  가능한 때                   │
  │  [평일][주말][아무때나]        │  ← 가벼운 칩
  │                             │
  │         [시작하기]           │
  └─────────────────────────────┘
     │
     ▼
[홈/탐색 즉시 진입]  ← 빈 화면 금지. 동네 기반 추천 즉시 노출
     │
     ▼  (첫 가치 행동: 카드탭 / SOS / 성향카드 등)
[마이크로 컨펌 바텀시트]
  "사장님으로 시작할게요. 맞아요?"
  [네, 사장님이에요]  [알바 구하는 중이에요]
     │
     ▼
user_type 확정 → 해당 진입점으로 분기
```

### 2.2 역할 잠정추론 → 컨펌 트리거 규칙
```
행동 신호 → 잠정 user_type:
  · "가게 관리" / "대타 구하기(사장)" / 공고 등록 시도  → employer 잠정
  · "성향카드" / 구직 탐색 / 공고에 러브콜            → worker 잠정

컨펌 시점: 첫 "가치 행동" 직후 단 1회.
  · 잠정값을 기본 선택(굵게)으로 → 1탭이면 끝
  · 반대 선택 시 즉시 전환
  · both는 이 단계에서 안 물음 (설정에서 나중에)
```

---

## 3. 데이터 흐름

### 3.1 가입~진입 시퀀스
```
유저: [카카오로 시작]
  → Supabase Auth (kakao provider)
  → onAuthStateChange: users row 존재? 없으면 INSERT (user_type=null)
  → 온보딩 미완료 플래그 확인 (onboarded=false)
  → /onboarding 라우팅

유저: 3필드 입력 → [시작하기]
  → 주소문자열 → Kakao Local API → {lat, lng, sido, sigungu, eupmyeondong}
  → upsert: worker_profiles & employer_profiles 공통 좌표 컬럼에 저장
     (역할 미정이므로 양쪽 프로필 stub을 좌표/업종/요일만으로 생성하거나,
      onboarding_data JSONB 임시 보관 후 역할 확정 시 정식 프로필로 승격)
  → users.onboarded = true
  → /home (탐색) 진입

유저: 첫 가치 행동
  → 행동 핸들러가 inferRole() 호출 → 잠정 user_type
  → 컨펌 바텀시트 → 확정값 users.user_type UPDATE
  → onboarding_data → 정식 프로필(worker_profiles or employer_profiles) 승격
```

### 3.2 임시 보관 vs 양쪽 stub — 선택
```
권장: onboarding_data(JSONB) 임시 보관 방식
  · 역할 미정 상태에서 양쪽 프로필 빈 row 만드는 것보다 깔끔
  · 역할 확정 순간 한쪽 프로필로 승격, 나머지는 안 만듦
  · both 전환 시 그때 반대편 프로필 생성
```

---

## 4. DB 변경

### 4.1 users 테이블 — 온보딩 상태 컬럼
```sql
-- 온보딩 완료 플래그 + 임시 데이터 보관
ALTER TABLE users ADD COLUMN IF NOT EXISTS onboarded boolean DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS onboarding_data jsonb DEFAULT NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS role_inferred text DEFAULT NULL; -- 'employer'|'worker' 잠정값 로깅(분석용)

-- user_type은 기존 컬럼 유지. 단 신규 가입 시 NULL 허용 확인:
-- (기존 NOT NULL 제약이면 제거)
ALTER TABLE users ALTER COLUMN user_type DROP NOT NULL;
```

### 4.2 공통 좌표 컬럼 (양쪽 프로필) — STEP 6과 공유
```sql
-- 읍면동 중심좌표 저장 (강제 GPS 없이 주소검색으로 확보)
ALTER TABLE worker_profiles  ADD COLUMN IF NOT EXISTS lat double precision DEFAULT NULL;
ALTER TABLE worker_profiles  ADD COLUMN IF NOT EXISTS lng double precision DEFAULT NULL;
ALTER TABLE employer_profiles ADD COLUMN IF NOT EXISTS lat double precision DEFAULT NULL;
ALTER TABLE employer_profiles ADD COLUMN IF NOT EXISTS lng double precision DEFAULT NULL;
-- region 3단계는 기존 컬럼 활용 (sido/sigungu/eupmyeondong은 region 문자열 파싱)
```

### 4.3 onboarding_data JSONB 구조 (애플리케이션 약속)
```json
{
  "region": "충남 아산시 신창면",
  "lat": 36.78, "lng": 126.95,
  "industries": ["카페", "편의점"],
  "availability": "weekday",
  "created_at": "2026-06-29T..."
}
```

---

## 5. 코드 설계

### 5.1 신규/수정 파일 목록
```
신규:
  app/onboarding/page.tsx          — 3필드 단일 온보딩 화면
  lib/onboarding.ts                — inferRole(), promoteProfile(), 좌표파싱
  components/RoleConfirmSheet.tsx  — 마이크로 컨펌 바텀시트

수정:
  app/login/page.tsx 또는 auth 콜백 — 가입 후 onboarded 분기 라우팅
  app/page.tsx (홈/탐색)            — 첫 가치 행동 핸들러에 inferRole+컨펌 연결
  middleware.ts (있으면)            — onboarded=false → /onboarding 가드
```

### 5.2 lib/onboarding.ts — 핵심 함수 시그니처
```typescript
// 'use server' 또는 클라이언트 유틸로 분리 설계
export type InferSignal =
  | "manage_store" | "post_job" | "daeta_sos_employer"   // → employer
  | "personality_card" | "browse_jobs" | "lovecall_worker"; // → worker

export function inferRole(signal: InferSignal): "employer" | "worker" {
  const employerSignals = ["manage_store", "post_job", "daeta_sos_employer"];
  return employerSignals.includes(signal) ? "employer" : "worker";
}

// 주소 문자열 → 좌표 + region 3단계
export async function resolveAddress(query: string): Promise<{
  lat: number; lng: number; region: string;
  sido: string; sigungu: string; eupmyeondong: string;
}> { /* Kakao Local API */ }

// onboarding_data → 정식 프로필 승격
export async function promoteProfile(
  supabase: SupabaseClient,
  userId: string,
  role: "employer" | "worker"
): Promise<void> {
  // 1. users.onboarding_data 읽기
  // 2. role에 맞는 프로필 테이블에 upsert (좌표/업종/요일)
  // 3. users.user_type = role UPDATE
}
```

### 5.3 컨펌 바텀시트 패턴 (결정 2)
```typescript
// components/RoleConfirmSheet.tsx
// 잠정값을 기본 선택으로 굵게 → 1탭 확정
<RoleConfirmSheet
  inferred="employer"
  onConfirm={(role) => promoteProfile(supabase, userId, role)}
/>
// 카피: "사장님으로 시작할게요. 맞아요?"
//       [네, 사장님이에요](primary)  [알바 구하는 중이에요](ghost)
```

> 규칙 준수: `<form>` 금지 → onClick/onChange만. ToastModal로 피드백.

---

## 6. 연결관계

```
STEP 1 ──provides──> 공통 입구 + user_type 지연확정 + 좌표 stub
   │
   ├─→ STEP 2(사장님 HR-First): employer 확정 시 promoteProfile→employer_profiles
   ├─→ STEP 3(대타): daeta_sos_employer 신호가 inferRole의 입력
   ├─→ STEP 4(초대): 초대 수락도 온보딩의 변형 (직원은 worker 확정 + team 편입)
   ├─→ STEP 5(HEXACO): 가입 동선에서 완전 제거 = STEP1이 보장
   └─→ STEP 6(좌표): 4.2 좌표 컬럼을 STEP1 가입 시점에 채움
```

### 6.1 기존 기능 영향 (양쪽 동시 처리 원칙)
```
영향: signup/login 라우팅, explore 첫 진입, 프로필 생성 로직
주의: 기존 user_type NOT NULL 의존 코드 전수 점검
      → null 가드 추가 (user_type ?? 'guest' 분기)
```

---

## 7. 검증

### 7.1 테스트 시나리오
```
시나리오 A (사장님 추론):
  카카오 가입 → 3필드 → 홈 → "가게 관리" 탭
  → 컨펌 "사장님으로?" [네] → user_type=employer → employer_profiles 생성 확인

시나리오 B (알바생 추론):
  구글 가입 → 3필드 → 홈 → "성향카드" 탭
  → 컨펌 [알바 구하는 중] → user_type=worker → worker_profiles 생성 확인

시나리오 C (재진입):
  온보딩 완료 유저 재로그인 → /onboarding 안 거치고 바로 홈

시나리오 D (좌표):
  3필드에서 "신창면" 검색 → lat/lng 저장 확인 → 매칭 지역가중치 작동
```

### 7.2 빌드/타입 체크
```powershell
npx tsc --noEmit
npm run build
```

### 7.3 Git
```powershell
git add app/onboarding/ lib/onboarding.ts components/RoleConfirmSheet.tsx app/page.tsx app/login/page.tsx && git commit -m "feat: 온보딩 골격 - 3필드 가입 + 역할 지연 확정 + 좌표 stub" && git push
```

---

## 부록 A — 이 STEP의 의사결정 체크리스트
```
□ onboarding_data 임시보관 방식 vs 양쪽 stub → 권장: 임시보관
□ 컨펌 바텀시트 카피 최종 확정
□ Kakao Local API 키 환경변수 확인 (대타에서 이미 사용 중인지)
□ user_type NULL 허용으로 인한 기존 분기 영향 전수 점검 리스트 작성
```

---

*PAZAB Handbook 01 — STEP 1 온보딩 골격 | 2026.06.29*
