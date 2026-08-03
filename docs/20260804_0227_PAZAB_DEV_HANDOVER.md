# PAZAB Dev Handover — 2026-08-04

## 오늘 작업 요약

### 1. 근태 마감 로직 — "지금 시각" 대신 "정상 근무시간" 기준으로

- **문제**: 사장님이 미출근/미퇴근 알바생을 뒤늦게 확인해서 마감 처리할 때, 기존엔 "지금 시각"을 그대로 퇴근시간으로 저장 — 사장님이 늦게 확인할수록 근태 기록이 실제와 멀어지는 구조였음.
- **`app/employer/team/[id]/page.tsx`**:
  - 근태입력 모달 기본값 로직에 `scheduledEndTime` 도입 — 계약 `work_hours`가 "HH:MM~HH:MM" 범위면 그대로, `dailyHours`(숫자만, 예: "8")로만 저장된 계약이면 **출근시간 + 근무시간으로 정상 퇴근시간을 역산**해서 채움.
  - 오늘 날짜 + 아직 정상 퇴근시간 전이면 계속 빈칸(알바생 셀프 퇴근 유도), 정상 퇴근시간이 지났으면 자동으로 채워서 바로 저장 가능.
  - "🔒 지금 시각으로 바로 마감 처리" 원클릭 버튼도 `scheduledEndTime` 있으면 "정상 근무시간(18:00)으로 마감 처리"로 라벨/동작 변경, 없을 때만 지금 시각 폴백.

### 2. 입사일(hire_date) 미입력 알림

- 초대 수락 흐름에서 `team_members.hire_date`가 채워지지 않는 갭을 발견 (연차/퇴직금 등 근속 계산 기준일인데 비어있으면 계산이 틀어짐).
- 즉시 입력 강제 대신, **사후 눈에 띄게 유도**하는 쪽으로: `app/myteam/page.tsx` "확인/조치 필요" 배너에 "입사일 미입력" 항목 추가, `app/employer/team/[id]/page.tsx` 팀원 상세 화면 상단에 경고 뱃지 추가.

### 3. 파잡 커리어 + 소셜 프로필 통합 (`app/profile/[userId]`, `app/worker/[id]`)

- 지원자 프로필을 볼 때 신뢰 신호(경력·근무이력·뱃지·활동)가 두 페이지로 쪼개져 있던 문제. `/worker/[id]`를 정본으로 통합, `/profile/[userId]`는 얇은 서버 리다이렉트로 축소 (`app/api/lovecall/route.ts`가 알림에 `/worker/${id}`를 영구 저장하고 있어서 이쪽을 정본으로 결정).
- **신규 API** `app/api/worker/career-history/route.ts` — `team_members` RLS(본인/사장님 전용)를 서비스 롤로 우회해서 임금 제외 근무이력(매장명·업무·기간·재직상태)만 반환. "✅ 파잡 근무 이력" 섹션으로 노출.
- **신규 테이블** `worker_career_entries` (사용자가 Supabase SQL 에디터에서 직접 실행) — 파잡 밖 경력을 본인이 직접 입력. `app/worker/[id]/page.tsx`에 CRUD 모달 내장.
- 두 섹션 모두 `worker_profiles` 등록 여부(`hasWorkerProfile`)와 무관하게, 지원자의 `user_type`(`isWorkerRole`)만으로 노출 — 온보딩 안 거친 지원자도 근무이력/경력은 보이도록.
- 하단 채용제안/대타SOS 액션바도 `hasWorkerProfile` 게이트에서 뗌 — 구직 정보 미등록 지원자에게도 채용 제안 가능하도록.
- 소셜 프로필의 뱃지·개인피드를 이식: `components/profile/PersonalFeedSection.tsx` 신규 컴포넌트로 피드 그리드+상세모달+줌뷰어 분리(자체 로딩, 메인 페이지 안 막음), 🏅뱃지 섹션 추가, 사장님 전용 계정용 신뢰도 바 헤더(3번째 헤더 모드) 신규.
- **버그 발견/수정**: 뱃지 조회 쿼리가 `user_badges`에 없는 컬럼(`earned_at`, 실제로는 `created_at`)을 select하고 있었음 — PostgREST가 에러 없이 조용히 실패해서, 원래 소셜 프로필의 뱃지 섹션이 계속 비어 보였을 것으로 추정. 두 곳(통합 프로필, 매장홈) 모두 올바른 컬럼으로 수정.
- 호출부 갱신: `app/store/[id]/page.tsx`, `app/feed/page.tsx`, `app/chat/[id]/page.tsx`, `app/mypage/page.tsx`의 `/profile/` 링크를 `/worker/`로 변경. mypage의 중복 프로필 바로가기 버튼 2개를 "내 프로필" 1개로 통합.

### 4. 매장홈(`app/store/[id]/page.tsx`) 보강

- **신규 API** `app/api/store/team-count/route.ts` — 서비스 롤로 매장별 재직 인원만 집계 (개별 정보 비노출).
- 사장님 신뢰 뱃지(계약왕/약속사장/베테랑사장 등) 노출 + "팔로워 N명 · 함께 일하는 중 N명" 표시.

### 5. 하단 네비 (`components/BottomNav.tsx`)

- **"피드" 탭 제거** — CLAUDE.md에 이미 있던 "피드 확장 동결" 결정이 실제로는 실행이 안 돼 있었음(5탭 중 하나로 여전히 노출 중이었음). 밀도 낮은 콜드스타트 단계에서 빈 피드 탐색은 "죽은 앱" 인상만 준다는 판단으로 4탭([대타][홈][채팅][MY])으로 축소. `/feed` 페이지·작성 기능 자체는 코드 삭제 없이 유지, 나중에 밀도 생기면 탭만 복구.
- 홈 탭에만 있던 붕 뜬 원형 FAB 스타일 제거하고 4탭 통일 여러 라운드 시도 끝에 **탭 자기 아이콘 위에서 활성화 시 작은 바(20px)가 가운데서 자라나는 원래 방식**으로 최종 확정 (사용자가 슬라이딩 원형/바 등 다른 시안들을 다 반려하고 이전 방식 요청).

### 6. 소식 등록 플로우 독립 + 사진 크롭 고도화

- **문제**: "소식 등록" 버튼이 `/feed?write=true`로 이동해서 모달을 여는 방식이라, 방금 하단 네비에서 뺀 전체 공개 피드 화면이 뒤에 깔리는 모순이 있었음.
- **신규** `components/feed/PostComposeModal.tsx` — `/feed` 페이지를 거치지 않는 독립 작성 모달. `PersonalFeedSection`(개인 소식)과 매장홈(매장 소식, `employerProfileId` 고정)에서 재사용.
- 사진 업로드 시 **크롭 단계 신규 추가** (그리드가 정사각 타일이라 aspect=1 고정) — 여러 장 선택 시 한 장씩 순서대로, 이미 추가한 사진도 썸네일 재탭으로 재수정 가능.
- **`components/ImageCropModal.tsx` 고도화 + 버그 수정** (아바타/매장로고·커버/구직사진 등 앱 전체에서 공용으로 쓰는 크로퍼):
  - 드래그 중에만 나타나는 3분할 구도 가이드, 핀치줌 지원, 줌 배지 + −/+ 버튼 추가
  - **실버그 수정**: 팬 이동 범위 제한이 원래 없어서, 사진을 뷰포트 밖까지 드래그할 수 있었고, 특히 여러 장 순서대로 크롭할 때 이전 사진의 zoom/offset이 다음 사진에 그대로 남아 크롭 영역이 사진 밖으로 벗어나 흰 배경만 저장되는 버그가 있었음. `imageSrc` 변경 시 zoom/offset 리셋 + 드래그·핀치·줌 전부 경계 클램핑 추가. 이 컴포넌트를 쓰는 다른 모든 화면(아바타 등)에도 동일하게 적용됨.

### 7. (참고) 대타 공고 2-Tier 노출 로직 — 조사만, 변경 없음

- `lib/daetaTier.ts` + `lib/daetaEscalation.ts` + `app/api/cron/daeta-escalate/route.ts` + `components/daeta/DaetaWorkerHome.tsx`로 이미 end-to-end 구현돼 있음을 확인 (전략 문서상 목표가 아니라 실동작 코드). 갭 2건 발견, 착수는 안 함: ① Tier1 판정이 노쇼 이력을 안 봄(STRATEGY.md에 이미 기록됨) ② 외부 크론(cron-job.org) 실제 가동 여부는 코드로 확인 불가.

---

## DB 변경 (수동 실행)

`worker_career_entries` 테이블 — 사용자가 Supabase SQL 에디터에서 직접 생성 완료 (레포에 마이그레이션 파일 없음, `db-schema.md` 갱신 완료).

```sql
create table if not exists worker_career_entries (
  id uuid primary key default gen_random_uuid(),
  worker_id uuid not null references users(id) on delete cascade,
  company_name text not null,
  role_desc text,
  start_date date,
  end_date date,
  is_current boolean default false,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table worker_career_entries enable row level security;
create policy "worker_career_entries_select_all" on worker_career_entries for select using (true);
create policy "worker_career_entries_insert_own" on worker_career_entries for insert with check (auth.uid() = worker_id);
create policy "worker_career_entries_update_own" on worker_career_entries for update using (auth.uid() = worker_id);
create policy "worker_career_entries_delete_own" on worker_career_entries for delete using (auth.uid() = worker_id);
create index if not exists idx_worker_career_entries_worker on worker_career_entries(worker_id);
```

---

## 파일 변경 목록

| 파일 | 비고 |
|------|------|
| `app/worker/[id]/page.tsx` | 최대 변경 — 통합 프로필 정본, +293 |
| `app/profile/[userId]/page.tsx` | 524줄 → 리다이렉트 9줄로 축소 |
| `app/employer/team/[id]/page.tsx` | 근태 마감 로직 + 입사일 경고 |
| `app/myteam/page.tsx` | 확인/조치 배너에 입사일 항목 추가 |
| `app/store/[id]/page.tsx` | 뱃지 + 팀원수 + 소식등록 모달화 |
| `components/BottomNav.tsx` | 피드 탭 제거 + 스타일 정리 |
| `components/ImageCropModal.tsx` | 그리드/핀치줌/경계클램핑(버그수정) |
| `app/api/worker/career-history/route.ts` | 신규 |
| `app/api/store/team-count/route.ts` | 신규 |
| `components/profile/PersonalFeedSection.tsx` | 신규 |
| `components/feed/PostComposeModal.tsx` | 신규 |
| `app/chat/[id]/page.tsx`, `app/feed/page.tsx`, `app/mypage/page.tsx` | `/profile/` → `/worker/` 링크 갱신 |
| `db-schema.md` | `worker_career_entries` 추가 |

**총합**: 11 files changed, 469 insertions(+), 646 deletions(-) (수정) + 4개 신규 파일

---

## 미완료 / 다음 작업

- [ ] 대타 Tier1 판정에 노쇼 이력 반영 (STRATEGY.md 기록된 기존 갭, 이번엔 미착수)
- [ ] cron-job.org 외부 크론이 `daeta-escalate`를 실제로 5분마다 호출하고 있는지 대시보드에서 직접 확인 필요
- [ ] 카카오맵 위치 미리보기 (매장홈에 주소는 있는데 지도 없음 — 사용자가 별도 진행 원함, 이번엔 보류)
- [ ] mypage "내 프로필" 버튼 통합 후 실제 화면에서 레이아웃 확인 필요 (그리드 2칸 → 1칸 풀와이드로 바뀜)

---

> 작성: 2026-08-04 02:27 KST
> 브랜치: main
> ⚠️ 이번 세션 전반부는 실수로 워크트리 경로(`.claude/worktrees/home-status-message-link-e761a7`)에서 작업했다가 뒤늦게 발견 — `C:\pazabv2` 본체로 수동 복사 후 이후 작업은 전부 본체에서 직접 진행함 (자세한 경위는 메모리 `feedback_no_worktree` 참고)
