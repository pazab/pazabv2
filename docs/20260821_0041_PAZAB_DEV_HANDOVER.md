# PAZAB Dev Handover — 2026-08-21

## 오늘 작업 요약

세션은 "대타 정산/계약서 흐름 검토 의견 달라"는 요청으로 시작해서, 실제로 발견된 문제들을 순차적으로 구현까지 이어갔음.

### 1. 대타 정산 화면 개선
- **정산 확인 모달에 수령 계좌 표시** — `components/daeta/DaetaHistoryView.tsx`. 사장님이 실제 계좌이체를 하기 직전/직후에 확인하는 "완료 및 정산" 모달에 계약서 스냅샷의 계좌(복호화)를 같이 보여줌. 예전엔 계좌 정보가 이 화면 어디에도 없었음.
- **퇴근 미확인 정산 플래그** — `app/api/daeta/complete/route.ts`, `DaetaHistoryView.tsx`. 퇴근 체크아웃 없이(예정 시간 기준으로) 정산되면 `payslip.attendance_data.checkout_missing`에 항상 기록하고, 임금명세서 모달에 경고로 노출. 사장님이 퇴근처리 없이 바로 정산해도 막지는 않지만(기존 정책 유지), 나중에 분쟁 시 구분 가능하게 함.

### 2. 헤더 UI 일관성 정리
- `components/AppHeader.tsx` — 안 쓰이던 `showSettings` prop 제거(유일한 호출부 `app/mypage/page.tsx`도 같이 정리).
- `RoleToggleButton` 배치 기준을 STRATEGY.md §12.1에 명문화("콘텐츠가 activeRole에 따라 실제로 달라지는 화면에만"). 이 기준으로 재검토하다가 `app/payslip/list/page.tsx`가 both 계정의 일반 목록(`tmId` 없을 때)을 로그인 시점 localStorage 값 한 번만 읽어서 못 바꾸던 버그 발견 — `useActiveRole` 훅 + 헤더 토글로 교체.
- `app/daeta/page.tsx`, `components/daeta/DaetaSosHome.tsx`의 "대타 내역"/"내 대타내역" 버튼 문구를 목적지 페이지 타이틀("대타 이력")과 통일.

### 3. 대타 홈 정보구조 변경 — 매칭 확정~정산 전까지 계속 노출
- **문제**: `daeta_postings.status`가 수락 즉시 `'pending'→'matched'`로 바뀌면서 `/daeta` 홈 목록(`status='pending'`만 조회)에서 카드가 통째로 사라짐 — 이후 출퇴근/정산은 이름이 다른 "대타 이력"(`/mypage/daeta-history`)에서만 가능해서 사장님이 다음 액션을 놓치기 쉬웠음.
- **수정**: `components/daeta/DaetaSosHome.tsx`의 홈 쿼리를 `status IN ('pending','matched')`로 확장. 매칭 완료 카드에 출근/퇴근 상태 배지 + "💬 채팅"/"💸 정산하러 가기"(→ `/mypage/daeta-history?matchId=...` 딥링크) 버튼 추가. `status='completed'/'cancelled'/'expired'`가 될 때만 진짜로 빠짐(그때부터가 "이력"의 진짜 의미).
- **부작용 방어**: 남의 공고(지원 대상 목록)는 여전히 `status='pending'`만 노출(이미 매칭된 남의 공고에 지원 버튼이 뜨는 걸 막음), 1:1 지정 요청 대상 공고 선택도 동일하게 필터링.
- STRATEGY.md §6에 결정 근거 기록.

### 4. 신규자 대타 자동계약서 — 가짜 개인정보·무단 자동서명 제거
- **문제**: `app/api/lovecall/route.ts`의 대타 자동계약 생성이 생년월일 없으면 `"2000. 01. 01"`(성인 가짜값), 주소 없으면 `"서울시내"`로 채워넣고, `worker_signed: true`로 알바생이 본 적도 없는 계약서를 즉시 "서명완료" 처리하고 있었음. 정규 계약엔 있는 미성년자(만 18세 미만) 감지 로직이 대타는 이 가짜 성인 생년월일 때문에 원천 우회됨.
- **수정**: 가짜 기본값 제거(빈 값 유지), `status: "pending", worker_signed: false`로 변경해서 정규 계약과 동일하게 알바생이 실제로 열어 서명해야 확정되게 함.
- **연쇄 버그 3개 발견·수정** (자동서명이 없어지면서 "실제로 눌러볼 필요"가 생겨 처음 드러남) — `app/chat/[id]/page.tsx`:
  1. 채팅 시스템 메시지 문구가 `[📄 계약서 확인하기]` 버튼 트리거 문자열("근로계약서가 발행"/"근로계약서가 수정")과 안 맞아 버튼 자체가 안 뜸 → 정규 계약과 동일 문구로 수정.
  2. `loadContract()`/`checkContractStatus()`가 `team_members` 경유로만 계약을 찾아서, `team_members` 행이 없는 대타 매칭은 `employer_id=""`(항상 0건)로 조회하고 있었음 → `team_members` 없으면 `contracts.match_id`로 폴백하는 `findContractByMatch()` 헬퍼로 통합.
  3. 헤더 계약서 아이콘 버튼이 `progressStatus === "hired"`일 때만 노출되는데, 대타는 정산 완료 시점에만 `hired`가 되고 그 전까지 계속 `accepted`라 근무 확정~정산 전 기간 내내 안 보였음 → 대타는 `accepted`에서도 노출되게 조건 추가.

### 5. `contracts.team_member_id`/`match_id` 이중 키 조회 정리
- 정규 계약(`team_member_id`만 채움)과 대타 자동계약(`match_id`만 채움)이 서로 다른 키로 매칭에 연결되던 걸, `app/contract/page.tsx` doSave()가 신규/수정 계약 저장 시 두 컬럼 다 채우도록 통일(매치 생성 타이밍을 저장 이전으로 앞당김).
- `app/chat/[id]/page.tsx`에 흩어져 있던 "team_members 먼저 → 안 되면 폴백" 중복 로직을 `findContractByMatch()` 헬퍼 하나로 정리.
- `supabase/patch_contracts_match_id_backfill.sql` 신규 작성 — 기존 정규 계약에 `match_id` 소급 채움. **실행 완료(2026-08-21).**
- `team_member_id` 컬럼 자체는 유지(payslip·employer/team·cron 등 팀원 기준 조회가 계속 씀) — 컬럼 제거가 아니라 "조회 방식 통일"만 한 것.

### 6. 비로그인 첫 화면(`app/page.tsx`) 정리 + 디자인 개선
- **PAZ 기능 카드/문구 제거** — `AI 매니저 PAZ`가 실제로는 `app/layout.tsx`(전역 플로팅 버튼, 2026-08-08부터 렌더 주석 처리), `app/chat/page.tsx`(`PAZ_CHAT_ENABLED = false`), 하단 네비(4탭 어디에도 없음) 전부에서 꺼져있는 걸 확인 → 없는 기능을 약속하고 있었음. 자리에 실제로 살아있는 핵심 차별점(Tier1/Tier2 검증 매칭)으로 교체.
- 나머지 문구(반경 10km 등)는 실제 코드값과 대조 확인 후 그대로 유지.
- 히어로/기능카드/CTA 레이아웃 리디자인 — 아이콘 배지, 브랜드 그라디언트 강조, 2차 로그인 링크 추가.
- 로고 반영 — 사용자 제공 SVG(`public/pazab-icon.svg`, 보라 배경 앱아이콘용 — 이미 `public/icon-192.png`와 동일 로고였음)와 배경 없는 변형(`public/pazab-mark.svg`, 헤더용, 색상은 원본과 완전 동일)을 분리 생성. 처음엔 히어로에 큰 아이콘을 독립 배치했다가 "위치 어정쩡함" 피드백으로 제거, 헤더의 워드마크 옆 작은 로고만 유지.

### 7. 이용약관 재점검
- `app/terms/page.tsx` 제8조② "AI 서비스 이용 시 개인정보 자동 마스킹 처리" — 실제로 AI 호출 파이프라인(`lib/pazAiGate.ts`)에 그런 마스킹 로직이 없음을 확인, 사실에 맞는 문구(주민등록번호 미수집·계좌번호 암호화)로 수정.
- 제2조 "PAZ AI 에이전트"(서비스 정의 조항)와 제9조 유료 서비스 환불 조항(결제 기능 자체가 아직 없음)은 검토만 하고 유지 — 전자는 정의 조항이라 기능 재개 시 재동의 부담을 피하기 위한 통상적 관례, 후자는 향후 유료화 대비 표준 문구라 당장 오해 소지가 적다고 판단.

---

## DB 마이그레이션
- [x] `supabase/patch_contracts_match_id_backfill.sql` — **실행 완료(2026-08-21)**.

## 검증
- `npx tsc --noEmit` — 매 변경 후 반복 실행, 전부 통과(기존부터 있던 무관 에러 3건만 잔존: `app/explore/page.tsx`, `app/job/[id]/page.tsx`, `.next/types/validator.ts`의 team-compat 모듈 에러).
- 브라우저 실기동 테스트는 안 함(사용자 방침에 따라 dev 서버/preview 직접 실행 안 함).

---

## 미완료 / 다음 작업
- [ ] 계약서 PDF 생성 Python 서브프로세스 → Node 네이티브(pdf-lib) 재구현 — 2026-08-14 핸드오버부터 이월, 이번에도 미착수. Vercel 배포 환경에서 여전히 100% 실패 상태로 추정.
- [ ] 미성년 알바생 대타 계약 — 이번 세션에서 "나이 판정을 우회하던 버그"는 막았지만(가짜 생년월일 제거 + 정규 서명 플로우 재사용으로 미성년자 감지 모달이 다시 작동함), **연소근로자 실제 고용 제한**(근로시간 제한, 친권자 동의서 수집 절차)은 여전히 별도 법적 조사가 먼저 필요한 상태로 남아있음.
- [ ] `contracts.team_member_id`/`match_id` 완전 단일화(컬럼 하나로 합치기)는 이번에 안 함 — 조회 경로만 통일했고, 컬럼 자체는 용도가 남아있어 유지 결정.

---

> 작성: 2026-08-21 00:41 KST
> 브랜치: claude/substitute-settlement-contract-review-c83630
