# PAZAB 핸드북 04 — STEP 4: 알바생 초대 공급 경로
### 콜드 획득 대신 "이미 일하는 사람"을 검증 풀로 편입
> **구현 순서**: 3번째
> **의존**: STEP 2(사장님·별명직원)
> **선행 읽기**: `00_blueprint.md`(결정 4), `02_employer-hr-first.md`

---

## 1. 목표

### 1.1 문제
얇은 시장에서 알바생을 **콜드로 신규 획득**하는 건 비싸고 느리다. 대신 **이미 사장님 밑에서 일하는 사람**을 시스템에 편입시키면, 가입 마찰이 거의 없고(사장님이 보증) 곧바로 **검증된 공급(Tier1)**이 된다.

### 1.2 완료 정의 (DoD)
```
✅ 사장님이 별명직원에게 카톡 링크로 초대 발송
✅ 직원이 링크 1탭 → 카톡 로그인 → 본인 확인 → team_members 연결
✅ worker_id 채워지고 invite_status='joined'
✅ is_verified=true (reason='team_history') → 대타 Tier1 후보
```

---

## 2. 화면

```
[사장님] 대시보드 → 별명직원 "재훈이" → [초대하기]
   → 카톡 공유: "재훈님, 파스쿠찌 알바 관리 초대 👉 pazab.app/i/XYZ"
        │
        ▼
[직원] 링크 1탭
   ┌────────────────────────────┐
   │  파스쿠찌 신창점이            │
   │  재훈님을 초대했어요         │
   │  근태·급여를 앱으로 받아보세요│
   │  [카카오로 1탭 수락]         │
   └────────────────────────────┘
        │ (카톡 로그인 → onboarded 분기)
        ▼
[연결 완료] → 내 근무정보/급여 확인 (worker 관점 myteam)
```

---

## 3. 데이터 흐름

```
사장님 [초대하기]:
  → invite_codes INSERT { code, employer_id, team_member_id, role:'worker' }
  → team_members.invite_status='invited', invited_at=now
  → 카톡 공유 텍스트 (lib/inviteShare.ts)

직원 링크 수락:
  → app/i/[code]/page.tsx → invite_codes 조회
  → 카카오 로그인 → users upsert (worker 잠정확정)
  → team_members.worker_id = 직원 user_id, invite_status='joined'
  → worker_profiles upsert + markVerified('team_history') (STEP2 함수)
  → 직원 관점 myteam 진입
```

---

## 4. DB 변경

```sql
-- invite_codes 확장 (기존 테이블 활용)
ALTER TABLE invite_codes ADD COLUMN IF NOT EXISTS team_member_id uuid DEFAULT NULL;
ALTER TABLE invite_codes ADD COLUMN IF NOT EXISTS role text DEFAULT 'worker';
ALTER TABLE invite_codes ADD COLUMN IF NOT EXISTS used_at timestamptz DEFAULT NULL;
ALTER TABLE invite_codes ADD COLUMN IF NOT EXISTS expires_at timestamptz DEFAULT NULL;
-- 단축코드는 STEP3 lib/shortcode.ts 재사용
```

---

## 5. 코드 설계

```
신규:
  app/i/[code]/page.tsx        — 초대 수락 공개 라우트
  lib/inviteShare.ts           — 카톡 초대 메시지 빌더
  components/employer/InviteButton.tsx — 별명직원 초대 버튼

수정:
  app/employer/dashboard/page.tsx — 별명직원 행에 [초대하기] (STEP2와 연계)
  middleware.ts                   — /i/* 인증 예외
```

```typescript
// lib/inviteShare.ts
export function buildInviteText(p: { storeName: string; nick: string; code: string }) {
  return `${p.nick}님, ${p.storeName} 알바 관리 초대 🙌\n`
       + `근태·급여를 앱으로 받아보세요\n`
       + `👉 https://pazab.app/i/${p.code}`;
}
```

```typescript
// app/i/[code]/page.tsx 핵심
// 1. invite_codes 조회 (만료/사용 체크)
// 2. 카카오 로그인
// 3. team_members 연결 + worker_profiles 생성 + markVerified('team_history')
// 4. invite_codes.used_at = now
```

---

## 6. 연결관계

```
STEP 4 ──upgrades──> 별명직원(STEP2) → 검증된 worker(Tier1)
   ├─→ STEP 2: team_members 별명 row를 worker_id로 채움
   ├─→ STEP 3: 편입된 직원이 대타 피드 ✅검증 상단
   ├─→ STEP 1: 초대수락 = 온보딩 변형(worker 자동확정, 3필드 최소화 가능)
   └─→ 기존 myteam: 직원 관점 근무정보/급여 화면 재사용
```

기존 영향: 기존 invite_codes(이미 아는 알바생 초대) 로직과 통합 — 충돌 없게 role/team_member_id로 분기.

---

## 7. 검증

```
A: 별명직원 초대 → 카톡링크 → 시크릿창 1탭수락 → team_members.worker_id 채워짐
B: 수락 후 worker_profiles.is_verified=true, reason='team_history'
C: 만료/사용된 코드 → "유효하지 않은 초대" 안내
D: 수락 직원이 대타 피드에서 ✅검증으로 노출
```

```powershell
git add app/i/ lib/inviteShare.ts components/employer/InviteButton.tsx app/employer/dashboard/page.tsx middleware.ts && git commit -m "feat: 알바생 초대 공급 - 카톡 초대링크/1탭수락/팀편입/검증승격" && git push
```

---

*PAZAB Handbook 04 — STEP 4 알바생 초대 공급 | 2026.06.29*
