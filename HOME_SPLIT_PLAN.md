# 사장님 홈 / 매장 관리 분리 — 구현 계획

> 작성일: 2026-07-26
> 상태: 계획만 확정, 코드 미착수 (다음 세션에서 이 문서대로 진행)
> 관련: [DESIGN_PLAN.md](DESIGN_PLAN.md) §3(사장님 홈), §10(타이포 스케일 — 이번 계획과는 별개, 함께 취소됨)

## Context

사장님 홈(`/myteam`)에 "오늘 확인" 카드를 얹고 나머지(매장 카드·시간표·전체 팀원 목록)를 접었다 폈다 하는 방식을 두 차례 시도했으나, 사용자가 두 번 다 "그대로인 것 같다"고 피드백했다. 실제 시니어 UX 사례(Jitterbug/Lively, Apple Design Award 코멘트 "no login, no cloud sync, nothing extraneous")를 조사해보니 공통점은 "크게/접어서 보여주기"가 아니라 **애초에 화면에서 안 보이게 만드는 것**이었다. 접혀 있어도 "그게 이 화면에 있다"는 인지 자체가 부담이 된다.

그래서 리사이즈/재배치가 아니라 **물리적으로 페이지를 분리**한다: 사장님이 하루 1~2번 여는 홈(`/myteam`)은 "오늘 확인해야 할 것"만 남기고, 매장 운영에 필요한 나머지 전부(매장 정보·팀원 전체·초대·계약서 이동·시간표)는 별도 목적지(`/employer/team`)로 옮긴다. "확인 단계 vs 상세 단계" 원칙을 코드 구조로도 지키는 방식.

두 차례의 코드 탐색 + 한 차례의 계획 검증을 통해 실제 코드 의존관계(상태 공유 여부, 어떤 모달이 어디서 트리거되는지, `DESIGN_PLAN.md` §8.5의 기존 결정과의 충돌 지점)를 전부 확인했다. 아래는 그 결과를 반영한 최종 접근이다.

**2026-07-26 시행착오 기록**: 이날 실제로 타이포/터치 스케일 상향(§10) 60여 커밋 + 이 문서의 초기 버전(홈에 배너만 얹는 방식)을 구현했다가, 사용자 요청으로 `git reset --hard`로 전부 되돌렸다(`backup/pre-typography-scale-2026-07-25` 태그 지점, 커밋 `726f98f`까지). 되돌린 커밋들은 워크트리 브랜치 `claude/uiux-design-direction-6e8d23`와 태그에 그대로 남아있어 필요하면 부분적으로 다시 가져올 수 있다. §10(타이포 스케일)을 이번 계획과 같이 진행할지는 별도 논의 필요 — 이 문서는 레이아웃/구조 분리만 다룬다.

## 핵심 설계 결정

- **데이터 레이어(`loadTeam` 등)는 손대지 않는다.** "가볍게 만들자"는 처음 생각과 달리, `loadTeam`이 하는 일(매장·팀원·계약상태 조회)은 온보딩 가드와 "계약 확인 N건" 표시에 그대로 필요해서 줄일 실익이 없고, `loadUserType`/`upgradeToBoth`/visibilitychange 핸들러 3곳이 이 함수의 반환값·부작용에 의존한다. 손대면 위험만 커진다. **UI(JSX)만 들어낸다.**
- **`DESIGN_PLAN.md` §8.5의 기존 결정을 어기지 않는다.** 이 문서는 "both 계정에서 계약서 미확인 같은 걸 놓칠 위험이 있어 탭/네비로 가리는 방식을 이미 시도했다가 폐기"했다고 명시돼 있다. 그래서 홈에서 "계약 확인 N건"(현재 `statsByStore[storeId].pending`, 이미 계산돼 있음) 배지를 **출근 현황 카드와 나란히, 항상 보이게** 유지한다 — 대타 SOS처럼 별도 화면으로 안 옮김.
- **`/employer/team`(현재 존재하지만 아무 데서도 링크 안 되는 고아 페이지)를 "매장 관리" 목적지로 승격시킨다.** 새 라우트를 만들지 않고 이미 있는, 스켈레톤만 갖춘 페이지를 완성하는 쪽이 코드 중복을 줄인다.
- **3단계 온보딩 가이드는 홈에 남긴다.** 매장이 없는 신규 사장님에게 홈이 텅 비면 안 된다는 원칙(STRATEGY.md) 때문. 온보딩 완료 후엔 어차피 원래도 다시 안 보였으므로 이동시킬 필요가 없다.

## 실행 순서

### 1단계 — 공용 헬퍼 추출 (`lib/utils.ts`)
`myteam.tsx`에만 있던 `BIZ_ICON`, `PERSONALITY_EMOJI`(원본 기준 1020–1032줄), `contractBadge`(1643–1647, 순수함수), 그리고 계약서 `contract_data`로부터 wage/work_days/work_hours를 정규화하는 블록(1262–1307과 1560–1613에 이미 두 번 중복돼 있음)을 `lib/utils.ts`(기존 `WORKER_TYPE_INFO`/`EMPLOYER_TYPE_INFO` 옆)로 옮긴다. 2단계에서 `/employer/team`이 이걸 세 번째로 베껴 쓰는 걸 막기 위해 먼저 처리.

### 2단계 — `app/employer/team/page.tsx`를 "매장 관리" 화면으로 완성 (myteam.tsx는 아직 안 건드림 → 안전하게 독립 검증 가능)
`myteam.tsx`의 `isEmployer` 블록(원본 기준 1925–2453줄)에서 아래를 그대로 포팅:
- 매장 목록 + `activeJob` 조회, 매장별 `team_members` 그룹핑, 매장별 통계(`statsByStore`) — `myteam.tsx`의 `loadTeam`(1190–1332) 로직을 1단계 헬퍼를 쓰며 이식 (기존 orphan 페이지의 단일-매장 `loadTeam`은 폐기)
- 매장 스택카드 스위처, 요일별 근무 시간표, 초대/공고 버튼, 전체 팀원 로스터(아바타 퀵프로필·계약서 이동·매니저 토글·퇴사)
- 6개 모달: `StoreRegisterModal`, `InviteBottomSheet`, 계약취소 확인, 퇴사 확인(+`handleResign`), 매장삭제 확인(+`openDeleteModal`), `UserProfileBottomSheet` 퀵프로필
- `team_members` 리얼타임 구독 (`myteam.tsx` 1095–1120 패턴)
- `activeStoreId`를 `sessionStorage`의 동일 키(`myteam_activeStoreId`)로 유지 — 홈과 관리 화면이 "선택된 매장"을 공유하게

검증: `npx tsc --noEmit`. 이 단계가 끝나면 `/employer/team`은 URL로 직접 가면 완전히 동작하는 상태 (아직 어디서도 링크 안 됨) — myteam.tsx는 무수정이라 회귀 위험 없음.

### 3단계 — `app/myteam/page.tsx`의 `isEmployer` 블록을 최소 홈으로 축소
남기는 것: 3단계 온보딩 가이드(미완료 시만) + "오늘 출근 현황" 카드(예외우선: 지각·결근·미기록만 표시, 정상 출근자는 아예 렌더 안 함 — 이전처럼 "확인 불필요 접기"를 만들지 않고 애초에 안 그림) + "계약 확인 N건" 배지(있을 때만, `statsByStore` 재사용) + "매장 관리 →" 버튼(→ `/employer/team`).

들어내는 것: 매장 스택카드 JSX, 시간표 JSX, 초대/공고 버튼, 전체 로스터 JSX, 6개 모달 JSX, `openDeleteModal`/`handleResign` 함수, 그리고 이제 안 쓰는 상태(`deleteTarget`/`cancelContractTarget`/`resignTarget`/`inviteOpen`/`storeModalOpen`/`editingStore`/`activeQuickProfile`/`selectedTimetableDay`/`teamOpen`). `loadUserType` 안의 `setTeamOpen(...)` 호출 한 줄만 제거(그 함수의 나머지 로직·반환값은 무수정).

`loadTeam`의 attendance 쿼리에 `check_in` 컬럼 추가, enrich 시 `todayRecord`/`scheduledToday` 계산 — **단, `scheduledToday`는 처음부터 "요일 명확히 설정 + 오늘 포함일 때만 true"로** (근무요일 미설정 팀원을 잘못 경보하지 않도록 — 2026-07-26에 겪은 오탐 버그를 처음부터 반영).

검증: `npx tsc --noEmit`.

### 4단계 — 내비게이션 정합성
`components/BottomNav.tsx`의 "홈" 탭 active 판정에 `/employer` prefix 추가 — 지금은 `/employer/team`으로 이동해도 하단 탭이 아무것도 안 켜짐. 한 줄 추가.

### 5단계 — 문서 업데이트
`DESIGN_PLAN.md` §3(사장님 홈 = "...팀 관리"까지 포함한다고 적힌 원래 문장)을 갱신: 팀 관리가 `/employer/team`으로 분리됐음을 명시. 날짜 붙여서 §3 하단에 기록(기존 §9/§10처럼).

## 스코프에서 제외

- 알바생(worker) 쪽 홈 화면 — 이번 계획엔 포함 안 함, worker 관련 상태(`loadMyWork` 등)는 employer 블록과 분리돼 있어 안 건드림.
- 하단 네비 탭 개수(4개, "확정") — 유지, 새 탭 안 만듦.
- `AppHeader`의 ⋮ 메뉴에 "매장 관리" 항목 추가 — 안 함, 홈의 버튼 하나로 충분. 나중에 필요하면 별도로.

## Critical Files

- `lib/utils.ts` — 헬퍼 추가
- `app/employer/team/page.tsx` — 매장 관리 화면으로 재작성
- `app/myteam/page.tsx` — employer 블록 축소
- `components/BottomNav.tsx` — active-path 1줄 추가
- `DESIGN_PLAN.md` — §3 갱신 + 날짜 기록

## 검증

- 각 단계마다 `npx tsc --noEmit` (신규 에러 0건 확인, 기존 무관 에러 3개 파일은 그대로 둠)
- 브라우저 직접 실행은 하지 않음(CLAUDE.md 절대 규칙) — 코드 리뷰(원래 블록과 이식된 코드를 줄 단위로 대조)로 기능 누락 여부 확인, 최종 확인은 사용자가 직접
- 완료 후 git 커밋을 단계별로 분리(1~5단계 각각) — 문제 생기면 특정 단계만 되돌릴 수 있게
