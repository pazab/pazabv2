# PAZAB Dev Handover — 2026-08-11

## 오늘 작업 요약

### 1. 매니저 세분화 권한(토글) 신규 구현
- 기존 `team_members.member_role`('staff'/'manager')은 실제로는 `/invite` 초대 권한 하나뿐이었음(RLS SELECT 정책도 employer_id/worker_id만 허용 — 매니저가 팀원 조회조차 못 함). 이걸 4개 개별 권한으로 세분화: **근태 승인/수정**, **시급/근무조건 수정**, **정산/급여 확정**, **SOS 대타요청 발행**.
- `team_members.permissions` jsonb 컬럼 신규(`{attendance_approve, wage_edit, payroll_confirm, sos_request}`). `lib/permissions.ts`에 `getEmployerContext()` 추가 — 로그인 유저가 사장님 본인인지 특정 사장님의 매니저인지 판별해서 employer_id/권한을 반환.
- `components/ManagerPermissionSheet.tsx` 신규 — 매니저 지정 + 4개 권한 토글 바텀시트, `app/myteam/page.tsx`의 기존 원터치 토글 버튼 대체.
- `app/employer/records/page.tsx`, `app/employer/team/[id]/page.tsx`, `app/payslip/page.tsx`, `app/daeta/page.tsx`에 owner-or-permitted-manager 가드 적용(버튼 숨김 + 함수 진입점 이중 체크). 매니저가 근태 캘린더/최근근태 목록을 볼 순 있되(정보 파악용) 권한 없으면 클릭 비활성 + 시각적으로도 흐리게/연필아이콘 제거.
- **셀프딜링 방지**(사용자 지적으로 발견) — 매니저가 자기 자신의 근태/시급/명세서를 스스로 승인·발행 못 하게 화면 가드 + DB 트리거/RLS 둘 다 추가. `patch_manager_no_self_deal.sql`.
- **감사로그 실제 작성자 반영** — `attendance_logs.actor_id`/`actor_role`이 매니저가 처리해도 무조건 "사장님"으로 하드코딩돼 있던 버그 발견·수정. 매니저가 처리하면 실제로 매니저 본인 닉네임+"매니저" 뱃지로 표시됨.

### 2. RLS 무한재귀 버그 (긴급 수정, 배포 직후 발견)
- 매니저용 `team_members` SELECT 정책이 자기 테이블을 서브쿼리로 참조하면서 Postgres가 "infinite recursion detected in policy" 에러를 던짐. 이 에러 때문에 **사장님을 포함한 전원의 team_members SELECT가 실패**했는데, 프론트가 `error`를 체크 안 해서 콘솔에 아무 에러 없이 팀원 목록만 조용히 사라짐 — 원인 파악에 시간 소요.
- 해결: `is_active_manager_of(employer_id, permission?)` SECURITY DEFINER 함수로 RLS 우회해서 재귀 차단, 모든 매니저 정책이 이 함수 경유하도록 교체. `patch_manager_permissions_fix.sql`.

### 3. 계약서 매칭 버그 3건 (`employer/records`·`employer/team/[id]` 실사용 중 발견)
- (a) 목록 페이지가 계약서를 `worker_id`로만 느슨하게 매칭 → 재입사자(퇴사 후 재초대로 team_members 행이 2개)의 계약서가 다른 재직 건에 섞여 보임 (강민경/윤서현 케이스).
- (b) `/contract` 페이지가 매칭(marketplace) 플로우로 들어왔을 때 `contracts.team_member_id`에 `team_members.id`가 아니라 **`matches.id`를 잘못 저장**해온 레거시 데이터 존재 (효리수 케이스 — 예전 초대사고 복구 이력과 얽혀 요일이 "토·일"로 잘못 표시됨).
- (c) 최종 해결: "team_member_id로 정확매칭되는 계약서가 하나라도 있으면 그것만 신뢰, 없을 때만 worker_id 폴백" 로직으로 양쪽 다 커버. **`계약 상태 뱃지` 자체는 `myteam` 홈이 쓰는 `team_members.contract_status`(이미 계산되어 저장된 authoritative 컬럼)를 그대로 참조하도록 변경 — `employer/records`가 이 컬럼을 아예 안 가져오고 매번 join 재계산하던 게 근본 원인.

### 4. `useRoleTint` 훅 hydration mismatch 수정
- `useState(readTint)`로 초기값을 즉시 계산 → 서버는 `typeof window==='undefined'`라 항상 null, 클라이언트 첫 렌더는 localStorage 실값을 바로 읽어서 SSR/CSR 출력이 갈리는 전형적 버그. 초기값을 무조건 null로 고정하고 `useEffect`에서만 실값 반영하도록 수정. `lib/useRoleTint.ts`.

### 5. 성향분석(HEXACO) 표시·가중치 전면 연결 해제
- 콜드스타트 단계에서 비용 대비 가치 재검토 — `lib/daetaTier.ts`(대타 SOS Tier1/2)는 HEXACO를 전혀 안 쓰고 순수 `trust_score` 기반. HEXACO는 `/api/match`의 정규 채용 매칭 스코어(40% 가중치)에만 기여하는데, 후보가 적은 지금 단계엔 체감가치가 낮고 인터뷰 1건마다 Claude API 비용 실비 발생.
- 조사 에이전트 3개 병렬로 23개 관련 파일 전수 스캔 → "실제 화면 표시" vs "약관/마케팅 문구(안 건드림)" vs "false positive" 분류.
- `app/api/match/route.ts`: `(hexacoScore-70)*0.40` 가중치 제거, 인터뷰 미완료자 `match_score=null` 게이트 제거(이제 인터뷰 여부 무관하게 항상 스코어 계산).
- `app/explore/page.tsx`: 성향분석 유도 배너 2개, 알림 점, 온보딩 팁 문구 제거.
- `app/worker/[id]/page.tsx`, `app/job/[id]/page.tsx`: 성향 카드, HEXACO 차트, 팀 궁합 섹션, `TierBadge`의 `noShowSafe`(HEXACO 유래 노쇼위험 뱃지) 제거.
- `app/employer/team/[id]/page.tsx`, `app/employer/team/page.tsx`, `app/myteam/page.tsx`: 성향 뱃지·아바타 이모지 제거(이니셜로 대체).
- **`components/SwipeNav.tsx`** — `/personality`가 그냥 표시가 아니라 메인 스와이프 탭바 순서(`explore→chat→personality→mypage`)에 실제로 끼어있었음. `/team`(팀 성향 대시보드 전용 페이지)도 SWIPEABLE 목록에만 있고 다른 진입 링크는 없었음. 둘 다 탭 순서에서 제거.
- `worker_result`/`employer_result`/`hexaco_results` 데이터, `/interview`·`/personality`·`/result`·`/team` 페이지 코드, `/api/interview`·`/api/analyze` 백엔드는 전부 유지 — 진입 경로만 끊음(PAZ 챗과 동일 패턴, 아래 §6 참조).
- `docs/PAZAB_HANDBOOK_05_hexaco-defer.md`에 이 결정으로 문서 무효화됐다는 경고 추가함(그 문서는 "가입동선 밖 + CTA 유도" 절충안이었는데 이번엔 CTA까지 다 없앰).

### 6. PAZ 챗봇 연결 해제 + 관련 정리
- `app/chat/page.tsx`의 채팅 목록에 합성으로 끼워넣던 PAZ 채팅방 항목을 `PAZ_CHAT_ENABLED = false` 플래그로 끔(코드/데이터 유지).
- AI API 사용처 전수조사 결과: `createPazClient()`(AiGate 외부 프록시, `AIGATE_URL` 경유)를 실제로 쓰는 곳은 `/api/paz-chat` 하나뿐이었음 — 나머지 Claude 호출(`interview`, `analyze`, `pre-meet`, `paz-register`, `contract/ocr-haiku`)은 전부 `new Anthropic()` 직접 호출. OpenAI도 별도로 씀(`paz-transcribe`=Whisper STT, `paz-memory`=임베딩, Anthropic엔 임베딩 API 없어서). `/api/contract/ocr`(자체 FastAPI OCR 서버 릴레이)와 `/api/contract/ocr-haiku` 둘 다 프론트 어디서도 호출 안 하는 죽은 라우트로 확인됨(코드는 안 지움).
- "PAZ 호칭"(팀원 상세페이지 "기본 정보"의 음성명령용 별명 입력 필드, `team_members.nickname`, `lib/pazTools.ts` 음성 인텐트가 소비)도 유일한 진입점(`/paz` 채팅)이 이미 끊겨서 사실상 orphan 상태 — 화면에서 카드 제거(데이터/저장 로직 유지).
- `app/worker/[id]/page.tsx`의 "🤖 AI 봇에게 물어보기"(파잡봇, `/api/pre-meet` 사용 — PAZ와는 별개 기능)도 이번 정리 흐름에서 같이 숨김.

### 7. 팀원 상세페이지 ↔ 목록 화면 네비게이션 일관성 정리
- `employer/team/[id]` 헤더의 프로필사진/닉네임에 🏠 아이콘 신규 — 클릭 시 `/worker/${worker_id}`(파잡 커리어 페이지)로 이동.
- `components/UserProfileBottomSheet.tsx`(아바타 클릭 시 뜨는 차단/메시지 팝업)의 "전체 프로필 보기" 버튼 제거 — 위 🏠 링크와 목적지가 완전히 같아서 중복이었음.
- 규칙 통일: **아바타 클릭 = 차단하기/1:1메시지보내기 팝업**, **행 클릭 = 관리 상세페이지**, **관리 상세페이지 안 🏠아이콘 = 파잡 커리어**. `employer/records`·`employer/team` 두 목록 페이지엔 아바타 팝업 자체가 아예 없었어서(`myteam` 홈에만 있었음) 이번에 동일하게 추가함.

### 8. PAZAB.COM 도메인 → Vercel 연결
- 가비아 DNS에 A(`@`→`76.76.21.21`)/CNAME(`www`→`cname.vercel-dns.com.`) 레코드 추가, Vercel Domains에서 연결 확인 완료. Play Store TWA(Trusted Web Activity) 배포 준비 목적(assetlinks.json이 실제 도메인에서 서빙돼야 함) — TWA/assetlinks.json 작업 자체는 이번엔 안 함, 다음 세션 과제.

---

## DB 마이그레이션 (Supabase SQL Editor 수동 실행 — **전부 실행 완료 확인함**)
1. `supabase/patch_manager_permissions.sql`
2. `supabase/patch_manager_permissions_fix.sql` (재귀버그 수정, 1번 이후 필수)
3. `supabase/patch_manager_attendance_delete.sql`
4. `supabase/patch_manager_no_self_deal.sql`

---

## 검증
- `npx tsc --noEmit` — 매 파일 수정 후 반복 실행, 통과 (기존부터 있던 무관한 에러 6건만 잔존: `app/explore/page.tsx`·`app/job/[id]/page.tsx`의 `logo_url`/타입 에러, 이번 세션 변경과 무관)
- `npm run build` — 세션 끝에 최종 실행, 88개 라우트 전부 정상 컴파일

---

## 미완료 / 다음 작업
- [ ] Play Store 등록 — Google Play 개발자 계정($25) 본인이 직접, TWA(Bubblewrap) 프로젝트 생성 + `assetlinks.json` 작성은 다음 세션.
- [ ] `PazFloatingButton`(2026-08-08부터 이미 비활성), `FloatingChatWidget.tsx`(애초에 아무도 안 씀) — 완전 삭제할지 계속 보류할지 미결정.
- [ ] Vercel Hobby 플랜 — 상업적 이용 시 약관상 Pro 전환 대상. Supabase 무료 플랜은 7일 미사용 시 자동 pause 리스크 있음(사업 운영 단계 진입 시 검토 필요).
- [ ] `docs/PAZAB_HANDBOOK_05_hexaco-defer.md`는 이번 결정으로 무효화 표시만 해두고 재작성은 안 함 — 필요시 새 핸드북으로 대체.
- [ ] (참고) `docs/20260808_2349_PAZAB_DEV_HANDOVER.md`의 미완료 항목(BANK_ENCRYPTION_KEY 환경변수 확인, `.claude/worktrees/profile-display-consistency-9b9ae0` 미병합 커밋 63개, 보안감사 보류항목들)은 이번 세션에서 다루지 않음 — 여전히 유효.

---

> 작성: 2026-08-11 23:38 KST
> 브랜치: main
