# PAZAB 핸드북 02 — STEP 2: 사장님 HR-First 진입 ⭐
### "공고 올리러"가 아니라 "우리 가게 관리하러"
> **구현 순서**: 2번째 (공급 생성의 출발점 — 책 전체의 심장)
> **의존**: STEP 1 (온보딩 골격)
> **선행 읽기**: `00_blueprint.md`(결정 1·2·5), `01_onboarding-core.md`
> **중요도**: ⭐⭐⭐ 최상. 이 STEP이 콜드스타트를 깨는 엔진이다.

---

## 1. 목표

### 1.1 이 STEP이 푸는 문제
파잡의 진짜 제약은 가입 마찰이 아니라 **빈 마켓플레이스(콜드스타트)**다. 사장님을 "공고 올리는 사람"으로 받으면, 공고를 올린 직후 **빈 구직자 리스트**를 마주하고 첫인상이 타버린다.

STEP 2는 사장님의 진입 목적을 **"공고"에서 "우리 가게 관리(HR)"로 전환**한다. HR 자동화는 마켓플레이스가 비어 있어도 그 자체로 가치(zero-network value)가 있다. 그리고 사장님이 자기 직원을 등록하는 행위가 곧 **검증된 공급 풀의 씨앗**이 된다.

```
사장님이 HR로 직원 관리
  → 직원이 "검증된 채로" 시스템 편입
  → 이게 대타 풀 (STEP 3가 소비)
  → 인근 매장이 검증 인력 재호출
  → 지역 노동 공유 네트워크 발생
```

### 1.2 완료 정의 (DoD)
```
✅ 사장님이 공고 없이 "가게 관리"로 진입
✅ 직원 1명 등록 (별명만으로 시작 가능)
✅ 근태/급여 화면 즉시 사용 (마켓플레이스 미접촉)
✅ 직원이 펑크났을 때 "대타 구하기" 버튼이 자연스럽게 노출
✅ 등록된 직원이 대타 Tier1(검증) 후보로 자동 등록
```

### 1.3 0번 레퍼런스 (결정 1)
```
개발자 본인 매장(신창면 카페/식당)을 0번 사장님으로 셋업.
본인 매장의 실제 알바 2~3명을 첫 검증 인력으로 등록 →
출시 시점에 대타 풀이 "0이 아닌 상태"로 시작.
이것이 신창면 일대 liquidity의 시드(seed).
```

---

## 2. 화면 (UI 흐름)

### 2.1 진입 동선 전환 (AS-IS → TO-BE)
```
[AS-IS]
가입 → 역할(사장님) → 공고 등록(무거움) → 빈 구직자 리스트 😞

[TO-BE]
가입(STEP1 3필드) → 홈 → "우리 가게 관리 시작" 탭
  → (employer 잠정추론 + 컨펌)
  → 가게 셋업 3필드 → 근태/급여 대시보드 즉시 😊
  → [펑크 발생] → "대타 구하기" → STEP3 진입
```

### 2.2 가게 셋업 화면 (HR 진입용, 공고 아님)
```
[가게 셋업 1/1] — 단일 화면
  ┌──────────────────────────────┐
  │  우리 가게 알바 관리 시작        │
  │                              │
  │  ① 어떤 가게예요?              │
  │     [카페/음료 ▾]             │  ← 업종 (job_categories)
  │                              │
  │  ② 어디예요?                  │
  │     [📍 주소 검색_________]    │  ← 자동완성 → 좌표 (STEP1 재사용)
  │     ※ 온보딩서 받았으면 prefill │
  │                              │
  │  ③ 같이 일하는 알바 (선택)      │
  │     [+ 알바 추가]             │  ← 별명만 입력해도 OK
  │     · 재훈이                  │
  │     · 수진                   │
  │                              │
  │         [관리 시작하기]        │
  └──────────────────────────────┘
     │
     ▼
[HR 대시보드] ← 즉시 효용. 빈 피드 아님.
```

### 2.3 HR 대시보드 (사장님 홈)
```
┌──────────────────────────────────┐
│  파스쿠찌 신창점          [PAZ 🎙]  │
│                                  │
│  오늘 근태                        │
│  · 재훈이  ✅ 출근 09:02           │
│  · 수진    ⏳ 미출근               │
│                                  │
│  [출퇴근 관리] [급여] [계약서]      │
│                                  │
│  ⚠️ 수진이 오늘 못 나온대요?        │
│     [🚀 대타 구하기]  ← STEP3 트리거 │
│                                  │
│  ─────────────────────           │
│  사람 더 필요하세요?               │
│  [공고 올리기] [구직자 둘러보기]    │  ← 마켓은 여기, 강요 아님
└──────────────────────────────────┘
```

### 2.4 직원 등록 — 점진적 (별명 → 정식)
```
[최소] 별명만:  "재훈이"  → team_members row (worker_id=null, nickname 보유)
[승격] 초대 시:  STEP4에서 카톡 초대 → 실제 user 연결 → worker_id 채움 → Tier1 후보
```

---

## 3. 데이터 흐름

### 3.1 가게 셋업 시퀀스
```
유저(employer 잠정) → [관리 시작하기]
  → promoteProfile(supabase, userId, "employer")   // STEP1 함수 재사용
  → employer_profiles upsert:
       business_type, region, address, lat, lng
       (is_active=true, job_status는 'open' 강제 안 함 — 공고 아님)
  → 직원 별명들 → team_members 다건 INSERT:
       { employer_id, worker_id: null, nickname, status:'active' }
  → /employer/dashboard 진입
```

### 3.2 펑크 → 대타 트리거
```
사장님: 대시보드에서 "수진 오늘 못나옴" → [대타 구하기]
  → 해당 team_member의 근무조건(요일/시간/시급) prefill
  → daeta_postings INSERT 모달 (DaetaRegisterModal, postingId=null=신규)
  → 계좌 실명인증 체크 (결정5: 사장님 필수)
       · 미인증 → 인증 모달 먼저
       · 인증완료 → SOS 가능
  → STEP3 대타 피드로 이동
```

### 3.3 직원 = 공급 풀 편입 흐름
```
team_members에 등록된 직원 중 worker_id IS NOT NULL (초대수락 완료)
  → 대타 매칭 후보 풀에 포함
  → Tier 판정 (결정4):
       근태이력 OR 계좌인증 OR 팀이력 있음 → Tier1 ✅
       없음 → Tier2 🔵
```

---

## 4. DB 변경

### 4.1 team_members — 별명 단독 등록 허용
```sql
-- worker_id 없이 별명만으로 임시 직원 등록 허용
ALTER TABLE team_members ALTER COLUMN worker_id DROP NOT NULL;

-- 초대 상태 추적
ALTER TABLE team_members ADD COLUMN IF NOT EXISTS invite_status text DEFAULT 'none';
  -- 'none'(별명만) | 'invited'(초대보냄) | 'joined'(수락완료)
ALTER TABLE team_members ADD COLUMN IF NOT EXISTS invited_at timestamptz DEFAULT NULL;
```

### 4.2 대타 Tier 판정용 — 검증 신호 집계
```sql
-- worker_profiles에 검증 캐시 컬럼 (매번 조인 대신 캐싱)
ALTER TABLE worker_profiles ADD COLUMN IF NOT EXISTS is_verified boolean DEFAULT false;
ALTER TABLE worker_profiles ADD COLUMN IF NOT EXISTS verified_reason text DEFAULT NULL;
  -- 'team_history' | 'attendance' | 'bank_verified'

-- 트리거 또는 앱레벨에서 갱신:
--   team_members.invite_status='joined' 되면 is_verified=true, reason='team_history'
--   attendance row 생기면 reason 보강
--   계좌인증 완료 시 reason='bank_verified'
```

### 4.3 employer_profiles — HR 진입 vs 공고 구분
```sql
-- 가게가 "관리용으로만" 만들어졌는지 vs 공고 발행했는지 구분
-- (기존 job_status 활용: 'open'은 공고발행 상태로만 쓰고,
--  HR전용 진입은 별도 플래그)
ALTER TABLE employer_profiles ADD COLUMN IF NOT EXISTS hr_only boolean DEFAULT true;
  -- 가게 셋업만 한 상태=true. 공고 올리면 false 전환.
```

### 4.4 0번 레퍼런스 시드 SQL (출시 전 1회 실행)
```sql
-- 개발자 본인 매장 = hellopazab 계정 기준
-- 1. 본인 매장 employer_profiles 확인/생성 (신창면 좌표)
UPDATE employer_profiles
  SET region='충남 아산시 신창면', lat=36.78, lng=126.95, hr_only=true
  WHERE user_id='a2295abd-503d-4efe-8485-1315cfd2fcf8';

-- 2. 실제 알바 2~3명 team_members 등록 (초대 수락된 검증 인력으로)
--    → 출시 시점 대타 풀 seed
-- (실제 worker user_id로 채워서 invite_status='joined', is_verified=true)
```

---

## 5. 코드 설계

### 5.1 신규/수정 파일
```
신규:
  app/employer/setup/page.tsx        — 가게 셋업 3필드 (공고 아님)
  app/employer/dashboard/page.tsx    — HR 대시보드 (사장님 홈)
  components/employer/QuickStaffAdd.tsx — 별명만으로 직원 추가
  components/employer/PunchAlert.tsx    — "펑크 → 대타 구하기" 카드
  lib/verification.ts                — Tier 판정 + is_verified 갱신

수정:
  app/page.tsx                        — "우리 가게 관리" 진입 버튼 + employer 추론
  components/daeta/DaetaRegisterModal.tsx — 펑크 prefill 진입 케이스 추가
  app/employer/register/page.tsx      — 공고 등록 시 hr_only=false 전환
```

### 5.2 lib/verification.ts — Tier 판정
```typescript
export type VerifyTier = "verified" | "new";

export function getTier(w: {
  is_verified?: boolean;
  verified_reason?: string | null;
}): VerifyTier {
  return w.is_verified ? "verified" : "new";
}

// 검증 신호 발생 시 호출 (team join / 첫 출근 / 계좌인증)
export async function markVerified(
  supabase: SupabaseClient,
  workerUserId: string,
  reason: "team_history" | "attendance" | "bank_verified"
): Promise<void> {
  await supabase.from("worker_profiles")
    .update({ is_verified: true, verified_reason: reason })
    .eq("user_id", workerUserId);
}
```

### 5.3 별명 직원 추가 (QuickStaffAdd)
```typescript
// worker_id 없이 별명만 → team_members INSERT
async function addStaff(nickname: string) {
  await supabase.from("team_members").insert({
    employer_id: employerId,
    worker_id: null,
    nickname,
    status: "active",
    invite_status: "none",
  });
  // 규칙: <form> 금지, onClick. 성공 시 ToastModal.
}
```

### 5.4 펑크 → 대타 prefill (PunchAlert → DaetaRegisterModal)
```typescript
// team_member 근무조건을 daeta 공고 초기값으로
function openDaetaFromPunch(member: TeamMember) {
  const prefill = {
    wage: member.wage,
    work_hours: member.work_hours,
    work_date: today(),     // 펑크는 보통 당일
    duty: member.role_desc,
  };
  // 계좌인증 가드 (결정5)
  if (!employer.bank_verified) return openBankVerify();
  openDaetaRegister({ postingId: null, prefill });
}
```

---

## 6. 연결관계

```
STEP 2 ──creates──> 사장님 + 검증직원(공급 풀 시드) + 펑크→대타 트리거
   │
   ├─→ STEP 1: promoteProfile("employer") 호출처. 온보딩 좌표 재사용.
   ├─→ STEP 4: 별명직원(invite_status='none') → 카톡 초대 → 'joined' → Tier1
   ├─→ STEP 3: PunchAlert가 대타 진입의 주요 트리거. is_verified가 2티어 정렬 입력.
   ├─→ STEP 6: 가게 좌표(lat/lng)가 대타 매칭 기준점(getDbBase)
   └─→ 기존 HR(근태/급여/계약): 대시보드가 기존 employer/team/[id] 기능 재노출
```

### 6.1 기존 기능 영향 (양쪽 동시 처리)
```
영향:
  · employer/register(공고)는 유지하되, 진입을 "선택"으로 강등
  · 기존 team_members.worker_id NOT NULL 의존 코드 점검 (4.1로 nullable 됨)
    → worker_id null인 별명직원 표시/필터 분기 추가
  · 근태/급여 화면이 worker_id null인 직원을 어떻게 다룰지
    → 별명직원은 "초대 전" 상태로 근태입력 비활성 + "초대하기" CTA
```

---

## 7. 검증

### 7.1 테스트 시나리오
```
A (HR 진입):
  사장님 가입 → "가게 관리" → 셋업3필드 → 대시보드 즉시 진입(빈피드 없음)

B (별명직원):
  대시보드 → 별명 "재훈이" 추가 → team_members worker_id=null row 확인

C (펑크→대타):
  "수진 못나옴" → 대타구하기 → 계좌미인증이면 인증모달 →
  인증 후 daeta_postings prefill 모달 → SOS

D (Tier 시드):
  0번 레퍼런스 SQL 실행 → 본인매장 직원 is_verified=true →
  대타 피드에서 ✅ 검증 뱃지로 상단 노출 확인

E (공고 전환):
  대시보드 → "공고 올리기" → employer_profiles.hr_only=false 전환 확인
```

### 7.2 빌드/Git
```powershell
npx tsc --noEmit
```
```powershell
git add app/employer/setup/ app/employer/dashboard/ components/employer/ lib/verification.ts app/page.tsx && git commit -m "feat: 사장님 HR-First 진입 - 가게셋업/대시보드/별명직원/펑크대타/Tier판정" && git push
```

---

## 부록 A — 0번 레퍼런스 셋업 체크리스트 (출시 전)
```
□ 본인 매장 employer_profiles 신창면 좌표로 셋업
□ 실제 알바 2~3명 동의받고 team_members 등록 (invite_status='joined')
□ 해당 직원 worker_profiles.is_verified=true 셋업
□ 본인 계좌 실명인증 완료 (사장님 필수)
□ 대타 피드에서 본인 직원이 검증 뱃지로 노출되는지 실측
□ 출시 시점 신창면 대타 풀 ≥ 3명 확보 확인
```

## 부록 B — 이 STEP의 의사결정 체크리스트
```
□ HR 대시보드를 사장님 기본 홈으로 할지, 탭으로 둘지
□ 별명직원 근태입력 정책 (초대 전엔 비활성 권장)
□ hr_only 플래그로 "공고 안 올린 가게"를 탐색에서 숨길지 노출할지
   → 권장: 숨김 (구직자 탐색엔 공고발행 가게만)
□ 펑크 케이스 외에 대타 진입점 더 둘지 (예: 대시보드 상시 버튼)
```

---

*PAZAB Handbook 02 — STEP 2 사장님 HR-First | 2026.06.29 | ⭐ 핵심 챕터*
