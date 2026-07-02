@AGENTS.md

# CLAUDE.md

프로젝트 경로: `C:\pazabv2` (v2, 현재 작업 대상. `C:\pazab`는 v1 레퍼런스, 혼동 금지)
Supabase 프로젝트: `clrjxxkgceluvzvrkvyl.supabase.co` (v1과 다름)

## 기술 스택

```
Next.js 16.2.6 (App Router, Turbopack) + TypeScript strict + TailwindCSS v4
Supabase (PostgreSQL + GoTrue Auth + PostgREST + Realtime)
Claude API via PAZ AiGate 프록시
Kakao Map/Local/JS SDK
Web Push (VAPID) / Web Speech API (STT+TTS)
Vercel 배포, 5분 주기 크론은 cron-job.org(외부) 사용
```

## 빌드/테스트 명령어

```powershell
cd C:\pazabv2
npm run dev
npx tsc --noEmit   # 별도 테스트 슈트 없음 — 이게 검증 게이트, 커밋 전 필수
npm run build
```

## 절대 규칙
- 워크트리 자체를 안 쓰도록 설정
- 설명은 필요 없고 코드 블록 전체를 작성해서 파일에 적용해
- TypeScript strict, `any` 금지
- `<form>` 태그 금지 → onClick/onChange
- Big5 금지 → HEXACO만
- PII 원본 저장 금지 (계좌 등은 `bank_verified: boolean`만 저장, 복원 맵은 메모리에만)
- upsert는 `.onConflict().ignore()` 금지 → `onConflict` 직접 지정
- Realtime 테이블은 `REPLICA IDENTITY FULL` 필수
- 세율/금액 등 매년 바뀌는 숫자 하드코딩 금지 → DB(`tax_rates` 등) 조회
- 사장님/알바생 양쪽 영향 로직은 항상 동시 수정
- `alert`/`confirm` 금지 → ToastModal/바텀시트
- Supabase 클라이언트는 `@supabase/ssr`의 `createBrowserClient`만 사용 (레거시 `createClient` 금지)
- OAuth는 클라이언트에서 `signInWithOAuth`/`exchangeCodeForSession` 직접 호출 금지 → 서버 Route Handler(`/api/auth/login`, `/api/auth/callback`) 경유
- 로그인 페이지 마운트 시 `supabase.auth.signOut()` 호출 금지
- 서버 컴포넌트 auth 체크는 `getSession()` (`getUser()` 금지)
- `team_members`에는 `user_id` 컬럼 없음 — RLS/쿼리는 `worker_id`/`employer_id` 직접 사용
- 신규 공개 라우트는 `proxy.ts`의 `PUBLIC_PATHS`에 등록 필수 (middleware.ts 아님, Next 16 규격)
- `.select()`에 없는 컬럼 넣지 말 것 (PostgREST가 에러 없이 전체 null 반환함)


## 전략 원칙 (콜드스타트 대응 — 신규 기능 설계 시 판단 기준)

파잡의 1순위 문제는 가입 마찰이 아니라 **빈 마켓플레이스**. 아래 원칙은 온보딩 UI가 바뀌어도 유효한 상위 전략:

- **사장님 HR-First**: 사장님 진입 목적을 "공고"가 아니라 "우리 가게 관리"로. HR 자동화는 마켓플레이스가 비어도 그 자체로 가치(zero-network value) 있음. 사장님이 직원 등록하는 행위 자체가 검증된 공급 풀의 씨앗.
- **2-Tier 대타 풀**: Tier1(✅검증 — 팀이력/근태이력/계좌인증 있음) 상단 우선 노출, Tier2(🔵신규) 하단. 한번 일하면 Tier1 승격.
- **계좌인증 비대칭**: 사장님은 대타 등록/SOS 전 필수(돈 보내는 주체), 알바생은 정산 대상 확정 순간 1회만 (그 전엔 절대 안 물어봄).
- **초대 공급 경로**: 콜드 획득보다 "이미 일하는 사람"을 카톡 초대로 편입 → 마찰 최소, 즉시 검증 상태.
- **HEXACO는 매칭 정밀도용 CTA**: 가입 동선 밖, 탐색/매칭 화면의 "점수 높이기" 배너로 진입. 성실성(C)·정직성(H)·원만성(A)이 매칭에 가장 크게 기여(성실성 최대 -24점, 정직성=노쇼예측) → 신규 인터뷰 설계 시 이 3요인에 턴 배분 집중.

## UX/제품 원칙
- 색상 조합 선택시 항상 다크모드 또한 고려할 것
- **모바일 우선**: 모든 화면은 핸드폰 단독 사용 기준. 데스크톱은 부차적.
- **음성 제어 우선**: 신규 기능 추가 시 "음성 명령으로 실행 가능한가?"를 먼저 검토, 가능하면 PAZ Tools/인텐트 등록.
- **원스톱 자동화(토스 스타일)**: 여러 단계 대신 한 번의 액션으로 종료. confirm은 발행/발송/삭제 등 되돌리기 힘든 액션에만, 그 외엔 즉시 처리 후 토스트.
- **정보 수집은 progressive**: 가치 체감 전엔 최소한만 물어봄 (온보딩 단순화, 주소는 필요 시점에만 등 전부 이 원칙의 적용 사례).

## 토큰/비용 관리

- 단순 조회 → Haiku, 복잡 추론/액션 → Sonnet 자동 분기 (`selectModel()`)
- AI 호출은 `lib/pazAiGate.ts`의 `createPazClient()` 경유
- **컨텍스트 사용량 95% 도달 시 무조건 알림** → 이후 신규 확장 대신 현재 작업 마무리·커밋 전환


## 테스트 계정 (v2, clrjxxkgceluvzvrkvyl 기준)

```
ftc2sun@gmail.com    — employer, 파스쿠찌 탕정역점
aabbuju@gmail.com    — both, 초대 수락 테스트 완료
pazab@kakao.com      — both, 탕정면 매곡리
hellopazab@gmail.com — admin, /admin/tax-rates 및 /admin/ai-stats 전용 권한