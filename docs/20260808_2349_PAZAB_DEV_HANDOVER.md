# PAZAB Dev Handover — 2026-08-08

## 오늘 작업 요약

### 1. 워크트리 정리
- `.claude/worktrees/` 밑에 과거 세션이 남긴 워크트리 13개 중 12개 삭제(전부 main에 이미 병합 확인됨, 커밋 안 된 변경분도 main이 이미 최신으로 덮어씀).
- `profile-display-consistency-9b9ae0`는 **삭제 안 함** — main에 병합 안 된 실제 커밋 63개(§10 타이포/터치스케일 접근성 작업)가 들어있음. 나중에 검토 필요(아래 "미완료" 참고).

### 2. 온보딩 가이드 전면 검토 + 알바생 진입 가이드 신설
- `app/onboarding/page.tsx`(2버튼 즉시선택)는 실제 진입 경로(초대링크·대타콜드유입)엔 잘 맞아 유지 결정. 대신 `docs/PAZAB_HANDBOOK_01_onboarding-core.md`가 그리는 "3필드+역할지연" 설계와 실제 코드가 다르다는 괴리 경고를 문서에 추가.
- 사장님은 `/myteam`에 "3단계 시작 가이드"가 있는데 알바생 쪽엔 대칭되는 게 없던 문제 → `app/explore/page.tsx`에 1회성 안내 배너 신설(하트=지원, 성향분석=궁합점수, 긴급순=대타), localStorage로 재노출 안 함.
- 매장 홈 정보(영업시간/복지태그/휴무일, 어제 커밋에서 막 추가된 필드)를 아직 아무도 안 채워도 된다는 넛지 부재 → `app/myteam/page.tsx` 3단계 가이드에 "매장 홈 꾸미기" 보너스 줄(선택, 카운트 안 됨) 추가. 알바생 쪽엔 explore 배너에 "내 파잡 프로필 채우기" 버튼 추가.
- `to_do.md`에 반영, `components/InfoTip.tsx` 신규(탭하면 여는 바텀시트형 도움말) — `TierBadge`(✅검증/🔵신규/노쇼위험낮음)와 마이페이지 신뢰도 점수 옆에 적용. 전역 물음표 배치는 안 함(모바일 화면 밀도상 근거 있는 곳에만).

### 3. 매장소식/커리어 피드 팝업 레이아웃 버그
- `app/store/[id]/page.tsx`, `components/profile/PersonalFeedSection.tsx`, `app/mypage/page.tsx` 3곳에 복붙돼 있던 동일한 사진+댓글 팝업이 **BottomNav(z-index 50)와 z-index가 같아서 DOM 순서상 네비바가 팝업 위에 그려지는 버그**였음(입력창이 네비에 가려짐). z-index 상향(`z-[60]`), 팝업 전체 높이 축소(94vh→80vh), 사진 영역 `aspect-square`로 키우고 댓글 목록은 줄여서 비율 개선.

### 4. 보안·개인정보보호법 전면 감사 (에이전트 2개 병렬) + 치명적 6건 수정
**감사 결과 요약** — 치명적 보안 4건: `/api/chat`·`/api/chatrooms` 무인증 열람/스푸핑, `/api/contract` service_role 무조건 폴백으로 무인증 열람, `supabase/patch_contract_rls.sql`의 `OR auth.role()='authenticated'`가 RLS를 사실상 무력화. 치명적 컴플라이언스 2건: 회원탈퇴가 `/api/withdraw` 라우트 자체가 없어서 동작 안 함, 계좌번호가 `contracts.contract_data`에 평문 저장(CLAUDE.md 자체 규칙 위반).

**수정 내역**:
- `app/api/chat/route.ts`, `app/api/chatrooms/route.ts`: 세션 인증 + 매칭 당사자 검증 추가.
- `app/api/contract/route.ts`: 인증 헤더 없을 때 service_role 폴백 제거, 로그인 세션 필수 + 계약 당사자만 조회 가능.
- `supabase/patch_fix_rls_bypass.sql` 신규(**Supabase SQL Editor 수동 실행 필요 — 사용자가 이미 실행 완료함**): matches/contracts/team_members/notifications의 `authenticated` 우회 제거, 당사자만 허용.
- `app/api/withdraw/route.ts` 신규: 개인정보 익명화 + 프로필 비활성화 + 푸시구독 해지 + 재로그인 차단(auth ban). 계약서/임금명세서는 근로기준법 보존의무로 삭제 안 함.
- 계좌번호 암호화: `lib/bankCryptoServer.ts`(AES-256-GCM, 서버 전용) + `app/api/bank-crypto/route.ts` + `lib/bankCryptoClient.ts` 신규. `app/contract/page.tsx`·`app/contract/view/page.tsx`·`app/chat/[id]/page.tsx`의 계좌정보 저장/조회 지점 8곳에 암복호화 연결(기존 평문 데이터와 하위호환 — `enc:v1:` 접두사 없으면 평문으로 간주).
- **미조치**(사용자가 보류 선택): `/api/push`·`/api/daeta/sos` 무인증, `min_wages`/`ai_usage_logs` RLS 상태 미확인, 위치정보 별도동의 없음, 미성년자 법정대리인 동의 검증 로직 없음(기본값 true), rate limiting 전무.

### 5. 대타 내역 → MY 페이지로 이전
- 기존엔 대타 탭(`app/daeta/page.tsx`, `DaetaSosHome.tsx`, `DaetaWorkerHome.tsx` 3곳에 복붙된 진입점)에서 별도 전체화면으로 열리던 구조. "정산 완료 기록은 받은지원/보낸제안과 같은 성격"이라는 판단으로 MY 페이지로 이전.
- `components/daeta/DaetaHistoryView.tsx`에 `embedded` prop 추가, `userType`이 "worker"/"employer"로 명확하면 그 역할 매칭만 필터링하도록 쿼리 수정.
- 딥링크(채팅방 "대타 관리하기", 임금미지급 신고 알림) 전부 `/mypage/daeta-history?tab=...&matchId=...`로 교체. `?tab=` 파라미터가 죽은 코드였던 것도 발견해서 `useActiveRole`에 연결(both 계정이 딥링크로 들어오면 해당 역할 탭 자동 전환).

### 6. MY 페이지 구조 재편
- "지원현황"(받은/보낸 지원·제안)·"대타이력"을 인라인 아코디언(접고펼치기)에서 **요약 배지 + 전용 페이지 링크**로 전환 — 섹션이 늘어나도 MY 자체 길이는 안 늘어나게.
- `app/mypage/applications/page.tsx`, `app/mypage/daeta-history/page.tsx` 신규.
- 공용 로직 추출(중복 방지): `components/LoveCallSection.tsx`, `components/ConfirmModal.tsx`, `components/MatchSuccessModal.tsx`, `lib/useLoveCalls.ts`(지원/러브콜 상태관리+API 훅) — MY와 새 지원현황 페이지가 공유.
- 하단 바로가기(내프로필/내팀소속/팀원초대/채팅보관함/임금명세서보관함/대타이력) 6개를 글자수에 따라 늘어나던 풀폭 버튼에서 **3열 균일 카드 그리드**로 통일, 대타이력은 `--warning`(주황) 톤으로 구분. 알바생 모드(5개, 빈칸 1개 생김)엔 점선 테두리+흐린 로고로 빈칸 채움.

### 7. both 계정(사장님/알바생) 모드 전환 시각 강화
- 기존엔 헤더 구석의 작은 `RoleToggleButton` 색상만 바뀌어서 전환 인지가 잘 안 됐음.
- `app/globals.css`에 `--role-worker-tint`/`--role-employer-tint`(+border) 신규, 라이트/다크 각각 값 다르게(다크는 더 진하게 — 안 그러면 안 보임).
- `components/AppHeader.tsx`·`components/BottomNav.tsx`에 `lib/useRoleTint.ts` 훅 연결 — both 계정이 전환하면 헤더/네비 배경이 은은하게 보라/핑크로 물듦. DB 조회 없이 localStorage+커스텀 이벤트(`pazab-role-change`)로만 반응(성능 영향 없음).
- `RoleToggleButton` 클릭 시 상단에 "🏪 사장님 모드로 전환했어요" 확인 토스트 1.8초 노출.

### 8. PazFloatingButton 비활성화
- 음성인식 기반 PAZ 라우팅 등 실제 기능은 있으나(완전한 빈 코드는 아니었음), 화면에 도움 안 된다고 판단 → `app/layout.tsx`에서 렌더만 제거(주석으로 사유 남김). 컴포넌트 파일은 그대로 유지, 필요시 import+렌더 한 줄 복원하면 됨.

---

## 파일 변경 목록

| 파일 | 비고 |
|------|------|
| `app/api/chat/route.ts`, `app/api/chatrooms/route.ts`, `app/api/contract/route.ts` | 인증/소유권 검증 추가 |
| `app/api/withdraw/route.ts` | 신규 — 회원탈퇴 |
| `app/api/bank-crypto/route.ts`, `lib/bankCryptoServer.ts`, `lib/bankCryptoClient.ts` | 신규 — 계좌정보 암복호화 |
| `app/contract/page.tsx`, `app/contract/view/page.tsx`, `app/chat/[id]/page.tsx` | 계좌정보 암복호화 연결 |
| `supabase/patch_fix_rls_bypass.sql` | 신규 — **실행 완료**(사용자 확인) |
| `app/api/daeta/report-unpaid/route.ts`, `app/api/daeta/notified-count/route.ts` | 알림 링크 갱신 / 신규(사장님용 알림인원 집계) |
| `components/daeta/DaetaHistoryView.tsx`, `DaetaSosHome.tsx`, `DaetaWorkerHome.tsx`, `app/daeta/page.tsx` | 대타이력 MY 이전, 딥링크 정리 |
| `app/mypage/page.tsx`, `app/mypage/applications/page.tsx`, `app/mypage/daeta-history/page.tsx` | MY 구조 재편 |
| `components/LoveCallSection.tsx`, `ConfirmModal.tsx`, `MatchSuccessModal.tsx`, `lib/useLoveCalls.ts` | mypage.tsx에서 추출한 공용 컴포넌트/훅 |
| `components/InfoTip.tsx`, `components/TierBadge.tsx` | 도움말 바텀시트 |
| `app/explore/page.tsx`, `app/myteam/page.tsx` | 알바생 진입가이드, 매장홈꾸미기 넛지 |
| `app/store/[id]/page.tsx`, `components/profile/PersonalFeedSection.tsx` | 피드 팝업 레이아웃 버그 수정 |
| `app/globals.css`, `components/AppHeader.tsx`, `components/BottomNav.tsx`, `components/RoleToggleButton.tsx`, `lib/useActiveRole.ts`, `lib/useRoleTint.ts` | 모드 전환 시각 강화 |
| `app/layout.tsx` | PazFloatingButton 렌더 제거 |
| `docs/PAZAB_HANDBOOK_01_onboarding-core.md`, `to_do.md` | 문서 갱신 |

---

## 미완료 / 다음 작업

- [ ] **`BANK_ENCRYPTION_KEY` 환경변수** — Vercel + 로컬 `.env.local`에 설정 여부 미확인. 없으면 계좌정보 저장/조회 시 조용히 실패할 수 있음. `openssl rand -hex 32`로 생성.
- [ ] 기존에 이미 저장된 계좌번호는 여전히 평문(하위호환 처리만 됨, 소급 암호화 안 함) — 필요시 별도 백필 스크립트.
- [ ] 보안 감사에서 나온 보류 항목: `/api/push`·`/api/daeta/sos` 무인증, `min_wages`/`ai_usage_logs` RLS 상태 확인, 위치정보 별도동의, 미성년자 법정대리인 동의 검증, rate limiting.
- [ ] `.claude/worktrees/profile-display-consistency-9b9ae0` — main에 병합 안 된 §10 접근성(폰트/터치스케일) 커밋 63개. main에 반영할지 폐기할지 결정 필요.
- [ ] (참고) `docs/20260804_0227_PAZAB_DEV_HANDOVER.md`의 남은 미완료 항목(대타 Tier1 노쇼 반영, 카카오맵 위치 미리보기, mypage 레이아웃 확인)은 이번 세션에서도 다루지 않음 — 여전히 유효.

---

> 작성: 2026-08-08 23:49 KST
> 브랜치: main
