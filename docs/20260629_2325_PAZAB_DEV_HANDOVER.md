# 📘 PAZAB v2 — 통합 개발 인수 및 기술 명세서 (Master Blueprint)
> **작성일시**: 2026-06-29 (월) 23:25 KST  
> **세션 ID**: fa78a5a1-8872-4eed-8516-d076a9a142be  
> **작성자**: Antigravity AI Coding Assistant (Google DeepMind)  
> **프로젝트 위치**: `c:\pazabv2` (작업 워크스페이스) / `c:\pazab` (구 버전 레퍼런스)

---

## 1. 프로젝트 개요 및 아키텍처

파잡(PAZAB)은 **AI 성향분석 기반 양방향 알바 매칭, 근태/급여 자동화(HR SaaS), 그리고 지역 기반 긴급 대타 공유 네트워크**를 결합한 모바일 퍼스트 웹 서비스입니다. 

### 1.1 기술 스택 및 환경 설정
* **Frontend**: Next.js 16.2.6 (App Router, Turbopack), TailwindCSS v4, TypeScript
* **Backend**: Supabase (PostgreSQL + GoTrue Auth + PostgREST + Realtime)
* **AI API**: Claude API (claude-3-5-sonnet / claude-4-5) 및 AI 프록시(PAZ AiGate)
* **환경 변수 (.env.local)**:
  * `NEXT_PUBLIC_SUPABASE_URL`: Supabase 프로젝트 API 도메인 주소
  * `NEXT_PUBLIC_SUPABASE_ANON_KEY`: Supabase 클라이언트 접속용 익명 키
  * `SUPABASE_SERVICE_ROLE_KEY`: 서버사이드 및 배치/어드민 작업용 관리자 키
  * `ANTHROPIC_API_KEY`: 클로드 인터뷰 및 성향 분석 파이프라인 연동 키
  * `NEXT_PUBLIC_KAKAO_MAP_KEY` & `NEXT_PUBLIC_KAKAO_JS_KEY`: 카카오맵 및 Kakao SDK 키 (`e86fd6c4b97c3607fb429d8f75526f41`)
  * `NEXT_PUBLIC_KAKAO_REST_KEY`: 카카오 로컬 주소/동네 검색 API 연동 키 (`02e1711115a492598ea97b18764fc597`)

---

## 2. 데이터베이스 스키마 동기화 (Database Sync)

구 프로젝트의 스키마(`v2_schema.sql`)에 비해 프론트엔드가 참조하는 다수의 테이블과 컬럼들이 유실되어 에러를 발생시키던 문제를 스키마 패치를 통해 해결했습니다.

### 2.1 패치 내용 ([patch_schema.sql](file:///c:/pazabv2/supabase/patch_schema.sql))
* **`users` 테이블 컬럼 추가**:
  - `email` (이메일 주소), `name` (성명), `profile_completed` (온보딩 완료 여부), `trust_score` (신뢰점수, 기본 50), `grade` (신뢰 등급, 기본 'bronze'), `is_active` (활동 여부), `avatar_url` (프로필 사진 URL)
* **`employer_profiles` 테이블 컬럼 추가**:
  - `is_deleted` (소프트 딜리트 플래그), `job_type` (일반/대타 구분), `wage` (급여), `wage_negotiable` (협의 가능 여부), `work_days` (근무 요일), `work_hours` (근무 시간), `expires_at` (공고 만료 시점), `is_urgent` (긴급 여부), `is_long_term` (장기 근속 여부), `meal_provided` (식사 제공 여부), `parking` (주차 가능 여부), `image_urls` (매장 사진 목록), `video_url` (매장 소개 동영상), `employer_type` (성향 유형), `hexaco_data` (성향 상세 점수), `view_count`, `like_count`
* **`worker_profiles` 테이블 컬럼 추가**:
  - `is_public` (공개 여부), `experience` (경력 기술), `experience_months` (경력 개월수), `available_now` (즉시 출근 가능 여부), `grade` (등급), `trust_score` (신뢰점수), `tagline` (한줄 소개), `desired_region` (희망 지역), `desired_type` (희망 직종), `worker_type` (알바생 유형)
* **`matches` 테이블 컬럼 추가**:
  - `progress_status` (매칭 진행도, 기본 'pending'), `interview_at` (면접 일시), `interview_memo` (면접 메모), `employer_left` (사장측 취소 여부), `worker_left` (알바측 취소 여부), `matched_at` (매칭 확정 시간), `initiated_by` (매칭 시작 유저 ID)
* **신규 테이블 생성**:
  - **`chats`**: 실시간 채팅 메시지 보관 테이블 (RLS 설정 및 수발신자 접근 정책 수립)
  - **`user_badges`**: 유저 획득 배지 기록 테이블
  - **`bot_chat_logs`**: 성향 분석 및 상담 과정에서 AI 챗봇이 모호하게 대답한 내용을 기록하고 모니터링하기 위한 테이블

---

## 3. 로그인 및 쿠키 세션 동기화 (Supabase SSR Fix)

### 3.1 무한 로그인 루프 버그
* **원인**: 기존 `lib/supabase.ts`가 웹 표준 `localStorage`에만 세션을 저장하는 레거시 `@supabase/supabase-js`의 `createClient`를 활용하고 있었습니다.
* 이로 인해 클라이언트 컴포넌트에서는 로그인된 것으로 인식하지만, Next.js의 서버사이드 미들웨어(`middleware.ts`)가 브라우저 요청에서 인증 쿠키를 찾지 못해 사용자를 비로그인 상태로 판정, 계속 `/login?redirect=...`로 튕겨내며 무한 루프를 형성했습니다.

### 3.2 개선 조치 ([lib/supabase.ts](file:///c:/pazabv2/lib/supabase.ts#L33-L37))
* 클라이언트 컴포넌트용 기본 싱글턴 인스턴스를 `@supabase/ssr` 패키지의 **`createBrowserClient`**를 사용하도록 변경했습니다.
```typescript
// 변경 전
instance = createClient(url, key, { auth: { autoRefreshToken: true, ... } })

// 변경 후 (인증 쿠키 브라우저 자동 동기화)
instance = createBrowserClient(url, key)
```
이 조치로 클라이언트에서 소셜 로그인을 마치면 브라우저 쿠키에 세션 토큰이 자동으로 구워지며, 미들웨어가 쿠키를 정상 판독하여 보호 경로(`/explore`, `/mypage` 등)의 진입을 안전하게 승인합니다.

---

## 4. 모바일 퍼스트 레이아웃 통일 (Layout Unification)

### 4.1 문제점 (제각각인 화면 넓이)
* `/explore`(탐색)와 `/personality`(성향분석)는 화면 전체에 배경색이 들어가는 구조였으나, `/chat`(채팅)과 `/mypage`(마이페이지)는 최외곽 `<main>` 태그 자체에 `maxWidth: 480`이 설정되어 데스크톱 뷰포트에서 배경이 쪼그라들어 보였습니다.

### 4.2 개선 규격 및 레이아웃 구조 통일
앱의 4대 메인 탭에 **일관된 모바일 감성의 데스크톱 쉘**을 구축하기 위해 아래와 같이 레이아웃을 통일했습니다:
* 최외곽 `<main>` 태그는 화면 폭에 맞춰 배경이 흐르도록 **가로 폭 제한을 제거 (`100%`)** 합니다.
* 본문 콘텐츠와 네비게이션 헤더 및 하단 바의 실질적인 가로 영역은 **`maxWidth: 480` 및 `margin: 0 auto`**의 래퍼로 묶어 완벽하게 중앙 정렬시킵니다.

### 4.3 글로벌 컴포넌트 이식 ([app/layout.tsx](file:///c:/pazabv2/app/layout.tsx#L31-L47))
* **`AuthGuard`**: 전역에서 Supabase 세션 수명주기를 트래킹하고 토스트 알림을 연동합니다.
* **`PazFloatingButton`**: 우측 하단에서 AI 비서 PAZ 상담창을 엽니다.
* **`BottomNav`**: 하단 4대 탭 바를 노출합니다.
* **Tabler Icons 연동**: PostCSS의 빌드 에러를 완벽히 격리하기 위해, `layout.tsx` 내부 `<head>` 영역에 직접 CDN `<link>` 태그를 삽입했습니다.

---

## 5. 경로 마이그레이션 (Route Migration)

구 프로젝트 `c:\pazab\app`에만 존재하고 신규 프로젝트에서 소실되어 404 에러를 유도하던 핵심 비즈니스 로직 페이지들을 마이그레이션하고 컴파일 에러를 수정했습니다.

### 5.1 마이그레이션된 페이지 목록
* **`app/mode-select`**: 가입 후 역할 지연 확정 시, 알바생/사장님 선택 분기 화면 (`page.tsx`).
  - [app/auth/callback/page.tsx](file:///c:/pazabv2/app/auth/callback/page.tsx#L111)의 콜백 리다이렉트 지점을 기존 `/explore`에서 `/mode-select`로 복구 완료.
* **`app/chat`**: 실시간 채팅 대화방 리스트 및 PAZ 상담 내역 카드 통합 화면.
* **`app/chat/[id]`**: Realtime 채널을 활성화하여 사장님과 알바생이 1:1 대화 및 계약 연동을 조작하는 대화방 화면.
* **`app/employer`**: 사장님의 신규 공고 등록 양식(`/employer/register`), 점포 관리(`/employer/team`), 성향 인터뷰(`/employer/interview`, `/employer/questions`) 폴더 마이그레이션 완료.
* **`app/worker`**: 알바생 프로필 조건 등록(`/worker/profile`), 근태 조회(`/worker/mywork`) 폴더 마이그레이션 완료.
* **`app/job`**: 구인공고 상세 정보 및 지원 페이지.
* **`app/pre-meet`**: 매칭 전 사장님과 알바생 간의 초기 매칭 로그 및 AI 리포트.
* **`app/admin`**: AI 호출 통계 및 신뢰 등급 관리 백오피스.

---

## 6. 카카오톡 초대 공급 시스템 (Kakao Invite System)

콜드 알바 유저 유입 한계를 극복하기 위해, **이미 사장님 밑에서 일하는 검증된 알바생(별명직원)을 카카오톡 링크로 즉시 영입**하는 핵심 성장 루프입니다.

### 6.1 동작 구조
```
[사장님] 마이페이지 또는 대시보드 → [초대 코드 생성] 
  → invite_codes 테이블에 신규 코드 INSERT (팀원 ID 매핑)
  → [초대 메시지 복사] 클릭 시 lib/inviteShare.ts 호출
  → 모바일: Web Share API 동작하여 카톡 다이렉트 전송창 활성화
  → 데스크톱: 아래와 같은 복사 템플릿 완성 및 클립보드 복사
     "OO님, OO 매장 알바 관리 초대 🙌 👉 https://pazab.app/i/CODE"
```

### 6.2 1탭 팀 편입 처리 ([app/i/[code]/page.tsx](file:///c:/pazabv2/app/i/[code]/page.tsx))
초대 메시지 링크(`${appUrl}/i/${code}`)를 받은 알바생의 동작 흐름:
1. 초대 수락 페이지 진입 시, 해당 단축 코드 조회 및 유효성 검사.
2. **카카오톡 1탭 로그인** 진행.
3. 로그인 성공 시, `public.users`에 회원 레코드 동기화.
4. 해당 `users.id`를 기존 사장님이 등록해 둔 `team_members.worker_id`에 바인딩하고, 초대 수락 상태(`invite_status = 'joined'`)로 전환.
5. 알바생 프로필(`worker_profiles`)을 자동 생성하고, 이력을 검증된 안전 인력(`is_verified = true, verified_reason = 'team_history'`)으로 즉시 승격 처리.
6. 완료 후 알바생 전용 근태/급여 화면(`myteam`)으로 자동 전환.

---

## 7. 향후 로드맵 및 운영 가이드 (P0~P2)

### P0 (즉시 대응 및 안정화)
* **카카오 로그인 콜백 최종 검증**: 구글 및 카카오 개발자 콘솔 리디렉션 URI 목록에 `https://clrjxxkgceluvzvrkvyl.supabase.co/auth/v1/callback` 등록 유지 상태 확인.
* **Supabase RLS 규칙 보완**: 실제 상용 가입 시 RLS 차단 에러를 예방하기 위해 `users`, `worker_profiles`, `employer_profiles`에 `INSERT WITH CHECK (true)` 정책이 SQL Editor를 통해 적용되었는지 재검토.

### P1 (매칭 고도화)
* **대타 SOS 푸시 알림**: 대타 호출(`/api/lovecall`) 발생 시 실시간 푸시가 웹 브라우저(`web-push` 라이브러리)를 통해 알바생 모바일에 알림음과 함께 즉시 도달하도록 백그라운드 서비스 워커(Service Worker)를 구성합니다.

### P2 (전자 계약 및 정산)
* **근태 및 명세서 연동**: GPS 체크인/체크아웃 기반 근무시간 집계 데이터를 급여 계산 함수(`lib/trustScore.ts`)에 바인딩하여 자동으로 PDF 급여 명세서를 월별로 자동 퍼블리싱하는 시스템을 점검합니다.
