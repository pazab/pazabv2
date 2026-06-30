# 📘 PAZAB v2 — 개발 인수인계 문서
> **작성일시**: 2026-06-30 (화) 15:00 KST  
> **작업 세션**: Claude Sonnet 4.6 (Anthropic)  
> **커밋**: `208089c` → `main` 브랜치 푸시 완료  
> **프로젝트 경로**: `C:\pazabv2`  
> **Supabase 프로젝트**: `clrjxxkgceluvzvrkvyl.supabase.co`

---

## 1. 오늘 작업 전체 요약

| # | 작업 | 파일 | 상태 |
|---|------|------|------|
| 1 | `/invite` 의도 탭 UX 개편 | `app/invite/page.tsx` | ✅ 완료 |
| 2 | worker → employer 역할 자동 승격 | `app/invite/page.tsx` | ✅ 완료 |
| 3 | `employer_profiles` 폴백 자동 생성 | `app/invite/page.tsx` | ✅ 완료 |
| 4 | 온보딩 완료 시 `employer_profiles` 자동 INSERT | `app/onboarding/page.tsx` | ✅ 완료 |
| 5 | PAZAB 계정 `employer_profiles` DB 직접 생성 | Supabase DB | ✅ 완료 |
| 6 | 전체 코드 + 문서 git push | `main` 브랜치 | ✅ 완료 |

---

## 2. 작업 배경 및 발견된 문제

### 2.1 테스트 환경
- **테스트 계정 3개** 운영 중
- PAZAB 계정: `pazab@kakao.com` (카카오 로그인)
  - `user_id`: `3edee908-53e0-45eb-921c-a870d6034f8b`
  - `user_type`: 초기 `worker` → 작업 후 `both`
  - `onboarding_data.region`: 충남 아산시 탕정면 매곡리
  - `onboarding_data.biz_name`: 파스쿠찌 탕정역점

### 2.2 발견된 버그 1 — `/invite` role gate 문제
**증상**: 알바(worker)로 가입한 계정이 `/invite` 진입 시 코드 입력창만 뜨고, 초대코드 생성(사장님 기능)에 접근 불가.

**원인**: `/invite` 페이지가 `user_type === "employer"` 여부로만 사장님 UI를 렌더링함. worker로 가입한 유저는 사장님 화면 자체가 렌더 안 됨.

```ts
// 기존 코드 (문제)
if (ut === "employer" || ut === "both") {
  // 사장님 UI 렌더
}
// worker면 코드 입력창만 노출
```

### 2.3 발견된 버그 2 — `employer_profiles` 미생성 문제
**증상**: 사장님으로 온보딩 완료해도 `/invite` 코드 보내기에서 매장 선택 버튼이 뜨지 않음.

**원인**: 온보딩 저장 로직이 `users.onboarding_data` JSONB에만 저장하고 `employer_profiles` 테이블에 INSERT를 하지 않았음.

```ts
// 기존 온보딩 저장 코드 (문제)
await supabase.from('users').upsert({ onboarding_data: od })
router.push('/')  // employer_profiles INSERT 없음
```

**DB 확인 결과**: `employer_profiles` 테이블 레코드 0건.

---

## 3. 작업 상세 내용

### 3.1 `/invite` — 의도(Intent) 기반 탭 UI 개편
**파일**: `app/invite/page.tsx`

**변경 전**: `user_type` 체크로 role-gate → worker면 코드 입력창만 노출  
**변경 후**: 페이지 최상단에 의도 선택 탭 2개 → 탭 클릭으로 UI 전환

```
┌──────────────────────────────────────────┐
│  🎫 코드 보내기      │  📥 코드 입력하기  │
│  직원 초대 (사장님)  │  사장님께 받은 코드 │
└──────────────────────────────────────────┘
```

**추가된 state**:
```ts
const [viewMode, setViewMode] = useState<"employer"|"worker"|null>(null);
```

**초기값 결정 로직**:
- URL에 `?code=XXXX` 파라미터 → `"worker"` 탭 자동 선택
- `user_type === "employer" || "both"` → `"employer"` 탭
- 그 외(worker) → `"worker"` 탭

**렌더 분기**:
```ts
// 기존: {isEmployer && (...)} {isWorker && (...)}
// 변경: {viewMode === "employer" && (...)} {viewMode === "worker" && (...)}
```

---

### 3.2 `switchToEmployerMode()` — worker → employer 자동 승격
**파일**: `app/invite/page.tsx`

코드 보내기 탭 클릭 시 호출되는 함수. worker 계정이어도 막힘 없이 사장님 기능 진입 가능.

```ts
async function switchToEmployerMode() {
  // 1. worker이면 user_type을 both로 자동 업데이트 (DB)
  if (!isEmployer) {
    await supabase.from("users").update({ user_type: "both" }).eq("id", user.id);
    setUserType("both");
  }

  // 2. employer_profiles 조회
  const { data: profiles } = await supabase.from("employer_profiles")...

  // 3. employer_profiles가 없으면 onboarding_data로 자동 생성
  if (p.length === 0 && onboarding_data) {
    await supabase.from("employer_profiles").insert({
      user_id, business_name: od.biz_name || od.region,
      region, sido, sigungu, eupmyeondong, lat, lng
    })
  }

  // 4. 탭 전환
  setViewMode("employer");
}
```

---

### 3.3 `employer_profiles` 폴백 자동 생성 (초기 로드 시)
**파일**: `app/invite/page.tsx` — `useEffect` 내부

`user_type === "employer" || "both"`인데 `employer_profiles`가 없는 **기존 가입자 마이그레이션** 처리.

```ts
if (p.length > 0) {
  // 기존: 프로필 선택 버튼 렌더
} else if (ud?.onboarding_data) {
  // 신규: onboarding_data로 employer_profiles 자동 생성
  const { data: created } = await supabase.from("employer_profiles").insert({
    user_id: u.id,
    business_name: od.biz_name || od.region || "",
    business_type: od.industries?.[0] || null,
    region: od.region, sido: od.sido, sigungu: od.sigungu,
    eupmyeondong: od.eupmyeondong || od.region?.split(" ").slice(-1)[0],
    lat: od.lat, lng: od.lng,
  }).select("id, business_name, wage, work_days, work_hours").single();

  if (created) {
    setMyProfiles([created]);
    setSelProfile(created.id);
    setBizName(created.business_name || "");
  }
}
```

---

### 3.4 온보딩 — `employer_profiles` 자동 INSERT
**파일**: `app/onboarding/page.tsx` — `handleStart()` 함수

사장님/both 역할로 온보딩 완료 시 `employer_profiles` 자동 생성. 이미 있으면 스킵.

```ts
// users 저장 후
if (userType === 'employer' || userType === 'both') {
  const { data: existing } = await supabase
    .from('employer_profiles').select('id')
    .eq('user_id', user.id).maybeSingle()

  if (!existing) {
    await supabase.from('employer_profiles').insert({
      user_id: user.id,
      business_name: od.biz_name || od.region || '',  // 사장님은 locationQuery = 상호명
      business_type: selectedIndustries[0] || null,
      region: resolvedAddr.region,
      sido: resolvedAddr.sido,
      sigungu: resolvedAddr.sigungu,
      eupmyeondong: resolvedAddr.eupmyeondong || resolvedAddr.region?.split(' ').slice(-1)[0],
      lat: resolvedAddr.lat,
      lng: resolvedAddr.lng,
    })
  }
}
```

**중요**: `onboarding_data.biz_name`은 `userType === 'employer'`일 때 `locationQuery` 값이 저장됨.  
사장님이 검색창에 "파스쿠찌 신창점"을 입력하면 → `biz_name: "파스쿠찌 신창점"` 으로 저장.

---

### 3.5 PAZAB 계정 DB 직접 픽스
스크립트로 기존 PAZAB 계정의 `employer_profiles` 직접 생성 및 `onboarding_data.biz_name` 보정.

```
생성된 레코드:
  id: d68ff4f4-1bda-43d7-ba60-80406faddf37
  user_id: 3edee908-53e0-45eb-921c-a870d6034f8b
  business_name: 파스쿠찌 탕정역점
  region: 충남 아산시 탕정면 매곡리
  lat: 36.7878637528719 / lng: 127.085918796561
```

---

## 4. 현재 DB 상태 (2026-06-30 기준)

### 4.1 `users` 테이블 (테스트 계정 3개)

| nickname | email | user_type | onboarding_data.region |
|----------|-------|-----------|------------------------|
| PAZAB | pazab@kakao.com | both | 충남 아산시 탕정면 매곡리 |
| (null) | - | employer | 충남 아산시 신창면 창암리 |
| (null) | - | worker | 경기 성남시 중원구 |

> ⚠️ PAZAB 계정 nickname이 null임. mypage에서 닉네임 설정 필요.

### 4.2 `employer_profiles` 테이블

| id | user_id | business_name | region |
|----|---------|---------------|--------|
| d68ff4f4-... | 3edee908-... (PAZAB) | 파스쿠찌 탕정역점 | 충남 아산시 탕정면 매곡리 |

> 다른 사장님 계정(신창면)은 아직 `employer_profiles` 없음 → `/invite` 진입 시 폴백으로 자동 생성됨.

---

## 5. 주소 정책 확정

### 5.1 수집 vs 표시 분리 원칙

| 대상 | 수집 (DB 저장) | 표시 (UI 노출) |
|------|--------------|--------------|
| 알바생 | 정밀 좌표(lat/lng) + 전체 주소 | `eupmyeondong`만 (읍면동 단위) |
| 사장님 매장 | 정밀 좌표 + 전체 주소 | `region` 전체 표시 |
| 계약서 | `region` (정밀 주소) | 전체 표시, 유저 수정 가능 |

### 5.2 현재 저장 구조 예시
```json
onboarding_data: {
  "region": "충남 아산시 탕정면 매곡리",   // 표시용 (읍면동 수준)
  "eupmyeondong": "탕정면 매곡리",          // 알바생 표시용
  "lat": 36.7878637528719,                  // 정밀 수집
  "lng": 127.085918796561,                  // 정밀 수집
  "sido": "충남",
  "sigungu": "아산시",
  "biz_name": "파스쿠찌 탕정역점"           // 사장님만
}
```

### 5.3 GPS 현재 위치 정책
- GPS 좌표 수집은 됨 (`coordToAddress` → lat/lng 저장)
- 표시는 동 단위로 역지오코딩
- 대타 SOS 시에만 정밀 GPS 재요청 (강제 팝업 금지 원칙)

---

## 6. 현재 `/invite` 페이지 완성 상태

### 6.1 코드 보내기 탭 (employer)
- [x] 매장 선택 버튼 (employer_profiles 기반, 여러 매장 지원)
- [x] 매장 없으면 onboarding_data 폴백으로 자동 생성
- [x] 카카오 키워드 검색으로 매장명 직접 입력도 가능
- [x] 시급, 근무 요일, 근무 시간 입력
- [x] 코드 생성 (`PAZ-XXXX` 형식, 7일 유효, 1회 사용)
- [x] 생성된 코드 카카오톡 공유 / 클립보드 복사
- [x] 기존 유효 코드 목록, 만료/사용된 코드 내역

### 6.2 코드 입력하기 탭 (worker)
- [x] PAZ-XXXX 코드 입력 (8자리 자동 포맷)
- [x] 코드 유효성 검증 (만료/사용됨/없음 에러 처리)
- [x] 매장 정보 미리보기 (시급, 요일, 시간)
- [x] 팀원 등록 → matches + team_members + contracts(draft) 동시 생성
- [x] 등록 완료 후 채팅방 자동 이동

---

## 7. 다음 작업 우선순위 (P0 → P2)

### P0 — 즉시 필요
- [ ] **PAZAB 계정 nickname 설정** — 현재 null. mypage에서 "PAZAB" 또는 실제 이름 입력 필요.
- [ ] **신창면 사장님 계정 employer_profiles 생성** — `/invite` 진입 시 자동 생성되지만, 미리 확인 권장.
- [ ] **worker 계정 초대 코드 수락 테스트** — PAZAB(사장님)이 코드 생성 → worker 계정으로 코드 입력 → team_members 생성 전 과정 검증.

### P1 — 이번 주
- [ ] **myteam 근태 체크인 테스트** — team_member 생성 후 알바 계정에서 출근/퇴근 버튼 동작 확인.
- [ ] **계약서 초안 → 서명 흐름** — `/contract/view` 페이지에서 사장님 작성 → 알바 서명 플로우 E2E 테스트.
- [ ] **닉네임 null 버그** — users 테이블에 nickname이 null인 계정이 있음. 채팅/팀원 카드에서 fallback 처리 확인 필요.

### P2 — 향후
- [ ] **대타 SOS 피드** (`/daeta`) — 현재 UI만 있고 실제 near_workers RPC 연동 미완.
- [ ] **Web Push 알림** — 출근 알림, 채팅 미읽음 배지 브라우저 푸시.
- [ ] **급여 명세서 자동 발행** — 월말 payslips INSERT 자동화.
- [ ] **HEXACO 성향분석 CTA화** — 온보딩에서 분리, 탐색/매칭 진입 후 유도.

---

## 8. 코드 구조 핵심 파일 맵

```
C:\pazabv2\
├── app/
│   ├── invite/page.tsx          ← 오늘 주요 수정
│   ├── onboarding/page.tsx      ← 오늘 employer_profiles INSERT 추가
│   ├── myteam/page.tsx          ← 근태/급여/계약 통합 (사장님+알바 양면)
│   ├── chat/[id]/page.tsx       ← Realtime 채팅 + 계약 연동
│   ├── contract/                ← 계약서 작성/서명 (미확인)
│   ├── daeta/page.tsx           ← 대타 SOS (UI 구현, RPC 미연동)
│   └── auth/callback/page.tsx   ← 소셜 로그인 콜백 → /mode-select
│
├── components/
│   ├── BottomNav.tsx            ← 5탭 네비게이션
│   └── AuthGuard.tsx            ← 전역 세션 감시
│
├── lib/
│   ├── supabase.ts              ← createBrowserClient (SSR 쿠키 동기화)
│   ├── onboarding.ts            ← resolveAddress, coordToAddress
│   ├── inviteShare.ts           ← 카카오 공유 / 클립보드
│   └── trustScore.ts            ← 신뢰점수 계산
│
└── supabase/
    ├── patch_schema.sql         ← DB 스키마 패치 전체 이력
    └── seed_test_data.sql       ← 테스트 데이터 시드
```

---

## 9. 환경 변수 (.env.local)

```
NEXT_PUBLIC_SUPABASE_URL=https://clrjxxkgceluvzvrkvyl.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...          ← 서버사이드/스크립트 전용
ANTHROPIC_API_KEY=...                  ← Claude AI 인터뷰/분석
NEXT_PUBLIC_KAKAO_MAP_KEY=e86fd6c4b97c3607fb429d8f75526f41
NEXT_PUBLIC_KAKAO_JS_KEY=e86fd6c4b97c3607fb429d8f75526f41
NEXT_PUBLIC_KAKAO_REST_KEY=02e1711115a492598ea97b18764fc597
```

---

## 10. 개발 서버 실행

```bash
cd C:\pazabv2
npm run dev       # http://localhost:3000
```

> Next.js 16 + Turbopack 사용. 빌드 에러 중 `TS7006 implicit any` 에러들은 기존 코드 pre-existing 에러로 런타임 동작에 영향 없음.

---

## 11. 테스트 시나리오 (다음 세션 즉시 실행)

### 시나리오 A — 초대 코드 전 과정
1. PAZAB 계정으로 로그인 (`pazab@kakao.com`)
2. `/invite` 진입 → **코드 보내기** 탭 클릭
3. "파스쿠찌 탕정역점" 매장 버튼이 뜨는지 확인
4. 시급/요일/시간 입력 후 코드 생성
5. 생성된 `PAZ-XXXX` 코드 복사
6. **worker 계정**으로 전환 → `/invite` → **코드 입력하기** 탭
7. 코드 입력 → 매장 정보 확인 → 팀원 등록
8. 채팅방으로 자동 이동 확인
9. `/myteam` 에서 사장님 뷰 → 팀원 목록에 등록됐는지 확인

### 시나리오 B — 근태 체크인
1. worker 계정 `/myteam` → 소속 탭
2. 출근하기 버튼 클릭
3. attendance 레코드 생성 확인
4. 사장님 계정 `/myteam` → 팀원 카드에서 오늘 근무 표시 확인

---

*PAZAB v2 Dev Handover | 2026-06-30 15:00 KST*
