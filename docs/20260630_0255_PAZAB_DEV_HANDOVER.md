# PAZAB 개발 인수인계 문서
**작성일:** 2026-06-30  
**작성시간:** 18:30  
**커밋:** `3aa7856`  
**브랜치:** `main`

---

## 1. 오늘 완료된 작업 전체 목록

### 1-1. 알림 시스템 (신규)
- `lib/notify.ts` — 서버사이드 알림 생성 + 웹푸시 발송 헬퍼
- `app/api/notifications/route.ts` — GET(목록), PATCH(읽음처리), POST(발송) API
- `components/NotificationBell.tsx` — 헤더 벨 아이콘, Supabase Realtime 미읽음 카운트
- `app/notifications/page.tsx` — 알림함 인박스 페이지

### 1-2. 초대 플로우 전면 재설계
- `app/invite/page.tsx` — 코드 공유 방식 제거, 닉네임 검색 → 직접 초대
- `app/i/[code]/page.tsx` — 수락 페이지 앱 테마 적용, 로그인 여부 감지 버튼 분기

### 1-3. 매니저 역할 시스템
- `lib/permissions.ts` — `canSendInvite()` 함수 (사장님 or 매니저 여부 확인)
- `supabase/patch_manager_role.sql` — `team_members.member_role` 컬럼, RLS 정책, `invite_codes.created_by` 컬럼
- `app/myteam/page.tsx` — 매니저 지정/해제 토글 버튼

### 1-4. 닉네임 고유성
- `app/auth/callback/page.tsx` — OAuth 가입 시 name → nickname 자동 저장, 중복이면 `홍길동2` 형태로 suffix
- `app/mypage/page.tsx` — 닉네임 변경 시 중복 체크 추가
- `supabase/patch_nickname_unique.sql` — `users.nickname` unique index (lower)

### 1-5. myteam UX 리디자인
- 탭/토글 전부 제거 → 단일 스크롤 페이지
- `worker` → 내 소속 섹션만, `employer` → 내 팀 섹션만, `both` → 내 소속 위 + 내 팀 아래
- 소속 카드: 근무조건 한눈에 + 입사일 인라인 수정 + 이번달 요약 + 최근 근무 5개

### 1-6. TimeWheelPicker (신규)
- `components/TimeWheelPicker.tsx` — Android 스타일 3컬럼 휠 (오전/오후 · 시 · 분)
- Pointer Capture API로 각 컬럼 독립 드래그, requestAnimationFrame 모멘텀

### 1-7. 기타 버그 수정
- `components/AppHeader.tsx` — NotificationBell 추가 (수도쿠와 아바타 사이)
- `app/settings/page.tsx` — 전체 너비 배경 고정 (maxWidth를 inner div로 이동)

---

## 2. Supabase에서 실행해야 할 SQL (미실행 확인 필요)

### 완료된 것
```sql
-- push_subscriptions 테이블 생성 (완료)
-- patch_manager_role.sql (완료: member_role 컬럼, RLS 정책, invite_codes.created_by)
-- team_members work_days, hire_date 컬럼 추가 (완료)
-- users_select_public_basic RLS 정책 추가 (완료)
```

### 아직 실행 안 한 것 (다음 세션 시작 전 실행)
```sql
-- 1. 닉네임 unique index
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_nickname_lower ON users (lower(nickname))
  WHERE nickname IS NOT NULL AND nickname != '';

-- 2. 기존 유저 nickname 채우기 (null인 경우 name으로)
UPDATE users SET nickname = name WHERE nickname IS NULL AND name IS NOT NULL;

-- 3. 초대 수락자가 자기 자신을 팀원으로 insert 가능하도록
CREATE POLICY "team_members_self_join" ON team_members FOR INSERT WITH CHECK (
  auth.uid() = worker_id
);
```

---

## 3. 현재 DB 스키마 주요 변경사항

### team_members 테이블
```sql
-- 추가된 컬럼
member_role text DEFAULT 'staff'   -- 'staff' | 'manager'
work_days   text                   -- 초대 시 입력값 복사
hire_date   date                   -- 알바생이 직접 수정 가능
```

### invite_codes 테이블
```sql
-- 추가된 컬럼 (patch_manager_role.sql에 포함)
employer_profile_id uuid REFERENCES employer_profiles(id)
biz_name    text
wage        integer
work_days   text
work_hours  text
created_by  uuid REFERENCES users(id)
```

### notifications 테이블 (기존)
```sql
-- 이미 존재함, 변경 없음
-- RLS: "notifications_own" — auth.uid() = user_id
-- 서비스 롤 키로 insert (lib/notify.ts)
```

---

## 4. 핵심 파일별 현재 상태

### `app/invite/page.tsx`
- 매장 목록 드롭다운 (employer_profiles에서 로드)
- 닉네임 검색 → 실시간 피드백 (검색중/찾음/없음)
- 이미 팀원인 경우 차단
- 전송 성공 → 성공 화면 → "우리 팀 보러 가기" / "한 명 더 초대하기"

### `app/i/[code]/page.tsx`
- 로그인 상태: 보라색 "✅ 초대 수락하기" 버튼
- 비로그인: 노란색 카카오 로그인 버튼
- 수락 시: `team_members` insert (wage, work_days, work_hours 복사), user_type `employer→both` 처리
- `router.replace('/myteam')` 로 히스토리 비축적

### `app/myteam/page.tsx`
- 완전 재설계: 탭/토글 없음
- `WorkerMemberScroll` 컴포넌트: 소속 매장 카드 + 출퇴근 + 월간요약 + 최근기록
- `loadTeam()` / `loadMyWork()` 분리 호출
- `visibilitychange` 이벤트로 포그라운드 복귀 시 자동 새로고침

### `lib/permissions.ts`
```typescript
canSendInvite(supabase, userId, employerProfileId?)
// returns { allowed: boolean, employerId?: string }
// 조건: user_type이 employer/both OR team_members.member_role = 'manager'
```

### `components/NotificationBell.tsx`
- Supabase Realtime `event: "*"` 단일 핸들러
- 채널명에 `Date.now()` suffix로 re-render 충돌 방지
- 클릭 시 `/notifications` 이동

---

## 5. 알려진 이슈 / 미완성 항목

| 항목 | 상태 | 비고 |
|------|------|------|
| 근태 전체보기 페이지 `/myteam/attendance` | ❌ 미구현 | 버튼 제거로 임시 처리 |
| 웹푸시 실제 발송 | ⚠️ 미테스트 | VAPID 키 설정됨, 서비스워커 등록 여부 확인 필요 |
| 닉네임 unique index | ⏳ SQL 미실행 | 위 섹션 2번 참고 |
| team_members_self_join RLS | ⏳ SQL 미실행 | 수락 시 insert 실패 가능 |
| 매장 주소 (address 컬럼) | ⚠️ 초대 카드에 미표시 | employer_profiles에 address 있으나 invite 카드 미연결 |
| 입사일 이전 데이터 | ❌ null | 수동 SQL UPDATE 필요 |

---

## 6. 환경 변수 (`.env.local`)

```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...        ← notify.ts 서버사이드 사용
NEXT_PUBLIC_VAPID_PUBLIC_KEY=...     ← 웹푸시
VAPID_PRIVATE_KEY=...                ← 웹푸시
```

---

## 7. 테스트 계정

| 계정 | email | user_type | 비고 |
|------|-------|-----------|------|
| 사장님(본인) | ftc2sun@gmail.com | employer | 파스쿠찌 탕정역점 |
| aabb | aabbuju@gmail.com | both | 초대 수락 테스트 완료 |

**테스트된 플로우:**
- ✅ 사장님 → aabb 닉네임 검색 → 초대장 발송 → 알림 수신 → 수락 → team_members 연결
- ✅ aabb user_type: both로 전환 확인
- ⚠️ team_members_self_join RLS 미설치로 수락 시 수동 SQL 필요했음 (위 2번 실행 시 해결)

---

## 8. 다음 세션 우선순위

1. **Supabase SQL 3개 실행** (섹션 2번)
2. **근태 전체보기 페이지** `/myteam/attendance?memberId=xxx` 구현
3. **웹푸시 실제 테스트** — 브라우저에서 푸시 권한 허용 후 알림 수신 확인
4. **사장님 팀원 상세 페이지** `/employer/team/[id]` 근무조건 수정 기능
5. **계약서 플로우** 재검토 (match_id 없이 team_member_id 기반으로 연결)
