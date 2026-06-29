# 📘 PAZAB v2 — 전체 기술 스펙 및 개발 로드맵 계획서 (Master Spec & Dev Plan)
> **작성일자**: 2026-06-29 KST  
> **버전**: 2.0 (상용화 대비 고도화 사양)  
> **프로젝트 범위**: Next.js 16 (App Router) + Supabase SSR + Claude AI 프록시 + 실시간 매칭/HR 시스템

---

## 1. 서비스 비전 및 비즈니스 설계

### 1.1 서비스 미션
파잡(PAZAB)은 단순한 조건(시급, 요일 등) 검색 매칭 방식을 탈피하여, **AI 성향 인터뷰(HEXACO & MBTI 기반)를 통한 사장님↔알바생 간의 인간적 궁합(Chemistry) 매칭** 및 **출퇴근·계약·급여 자동화(HR SaaS)**를 제공하는 통합 인력 솔루션입니다.

### 1.2 핵심 전략: "공급(Supply) 중심의 콜드스타트 타파"
* **기존 마켓플레이스의 문제**: 구인 구직 플랫폼은 양사 유저가 가득 차야 가치가 생기는 "콜드스타트" 문제가 극심합니다. 특히 교외/농촌 지역(충남 아산시 신창면 등)은 대중교통 불편으로 유입되는 알바생 풀 자체가 절대적으로 부족합니다.
* **파잡의 해결책 (HR-First)**: 사장님이 **기존 매장 직원들(별명직원)을 관리하기 위한 목적(근태/급여 명세서 자동 생성 등)으로 플랫폼을 단독 사용(SaaS)**하도록 유도합니다. 
  - 사장님이 초대하여 가입한 기존 직원은 플랫폼에 **검증된 인력 공급 풀(Tier1)**로 즉시 누적됩니다.
  - 사장님들은 가입된 검증된 로컬 인력을 공유하고, 긴급 상황 시 **대타 호출(SOS)**을 통해 신속하게 매칭합니다.

---

## 2. 시스템 아키텍처 및 기술 명세

### 2.1 아키텍처 다이어그램
```
┌────────────────────────────────────────────────────────┐
│                   Next.js 16 Client                    │
│  (createBrowserClient / AuthGuard / BottomNav / PAZ)   │
└───────────────┬────────────────────────┬───────────────┘
                │                        │
       [HTTPS REST/RPC]          [Supabase Realtime]
                │                        │
                ▼                        ▼
┌──────────────────────────────┐ ┌───────────────────────┐
│     Next.js API Routes       │ │     Supabase DB       │
│  (api/interview, analyze)   │ │  (PostgreSQL Engine)  │
└───────────────┬──────────────┘ └──────────────┬────────┘
                │                                │
        [HTTP / Stream]                  [GoTrue Auth]
                │                                │
                ▼                                ▼
┌──────────────────────────────┐ ┌───────────────────────┐
│         PAZ AiGate           │ │   Google/Kakao OAuth  │
│      (FastAPI on Railway)    │ │   (Providers Portal)  │
└──────────────────────────────┘ └───────────────────────┘
```

### 2.2 핵심 스택 명세
* **Authentication**: `@supabase/ssr` 기반 쿠키 기반 인증 동기화. 미들웨어(`middleware.ts`)가 라우팅 가드를 수행합니다.
* **Realtime Sync**: Supabase PostgreSQL replication을 기반으로 `matches`, `chats`, `attendance` 테이블의 변경사항을 클라이언트에 WebSocket으로 즉시 발행합니다.
* **AI API Pipeline**:
  - **인터뷰 (Streaming)**: `/api/interview`를 통해 유저 답변이 입력되면 FastAPI AiGate 프록시를 통해 Claude API에 전송되고, 스트리밍 문자열(`text/event-stream`) 형태로 챗 화면에 출력됩니다.
  - **분석 (Batch JSON)**: 인터뷰 10턴 완료 시 `/api/analyze`를 호출하여 비동기식 성향 분석을 요청하고, 유저 성향 데이터를 정형화된 JSON 객체로 반환받아 DB에 일괄 동기화합니다.

---

## 3. 데이터베이스 테이블 상세 정의 (DB Schema Spec)

총 11개 주요 테이블의 릴레이션 및 데이터 구조 명세입니다.

### 3.1 users (공통 회원 정보)
* **역할**: 구글/카카오 소셜 가입 계정과 연동되는 핵심 유저 정보.
* **스키마**:
  - `id`: `uuid` (PK, `auth.users.id` 외래키 참조, ON DELETE CASCADE)
  - `email`: `text` (이메일 주소)
  - `name`: `text` (본명)
  - `nickname`: `text` (서비스 내 별명)
  - `profile_image_url`: `text` (프로필 사진 URL)
  - `phone`: `text` (전화번호)
  - `user_type`: `text` (유저 구분: `employer` | `worker` | `both` | `NULL`)
  - `onboarded`: `boolean` (온보딩 완료 여부, 기본 `false`)
  - `onboarding_data`: `jsonb` (동네 좌표, 선호 업종, 근무 선호 시간 저장)
  - `bank_verified`: `boolean` (계좌 점주인증 완료 여부)
  - `trust_score`: `integer` (신뢰점수, 0~100, 기본 `50`)
  - `grade`: `text` (신뢰등급, `bronze` | `silver` | `gold` | `platinum`)
  - `is_active`: `boolean` (활동 플래그, 기본 `true`)

### 3.2 employer_profiles (사장님 매장 정보)
* **역할**: 점포 정보 및 구인 공고 조건, 사장님 성향분석 결과 보관.
* **스키마**:
  - `id`: `uuid` (PK, `gen_random_uuid()`)
  - `user_id`: `uuid` (`users.id` 외래키 참조)
  - `business_name`: `text` (매장명)
  - `business_type`: `text` (업종 분류: 카페, 한식, 편의점 등)
  - `region`: `text` (행정동 주소 - 충남 아산시 신창면)
  - `sido` / `sigungu` / `eupmyeondong`: `text` (행정구역 분할 필드)
  - `lat` / `lng`: `numeric` (매장 GPS 위경도 좌표)
  - `wage`: `integer` (기본 시급 설정)
  - `work_days` / `work_hours`: `text` (근무 요일 및 형태 설명)
  - `parking` / `meal_provided`: `boolean` (편의 복지 정보)
  - `employer_type`: `text` (사장님 성향 유형 - 예: 멘토형, 방임형 등)
  - `hexaco_data`: `jsonb` (HEXACO 성향 상세 수치)
  - `image_urls`: `text[]` (매장 실사 사진 배열)
  - `is_deleted`: `boolean` (소프트 딜리트 플래그)

### 3.3 worker_profiles (알바생 성향 정보)
* **역할**: 알바 구직 조건 및 알바생 성향분석 결과 보관.
* **스키마**:
  - `id`: `uuid` (PK, `gen_random_uuid()`)
  - `user_id`: `uuid` (`users.id` 참조)
  - `desired_type` / `desired_region`: `text` (희망 직종 및 희망 지역)
  - `experience`: `text` (경력 내용 설명)
  - `experience_months`: `integer` (경력 합산 개월수)
  - `worker_type`: `text` (알바생 성향 유형 - 예: 분위기메이커형 등)
  - `hexaco_data`: `jsonb` (HEXACO 성향 상세 수치)
  - `available_now`: `boolean` (즉시 출근 대기 여부)
  - `is_public`: `boolean` (프로필 공개/매칭 허용 플래그)

### 3.4 matches (사장님-알바생 매칭 관계)
* **역할**: 러브콜 신청 상태 및 매칭 최종 성사 내역 추적.
* **스키마**:
  - `id`: `uuid` (PK)
  - `employer_id` / `worker_id`: `uuid` (참조 유저)
  - `status`: `text` (상태: `pending` | `matched` | `completed` | `cancelled`)
  - `match_score`: `integer` (성향 궁합 점수)
  - `gap_report`: `jsonb` (궁합 매칭 상생/위험 요소 AI 리포트 데이터)
  - `employer_left` / `worker_left`: `boolean` (각 관계자 매칭 포기/삭제 플래그)
  - `matched_at`: `timestamptz` (최종 수락 일시)

### 3.5 chats (실시간 채팅 데이터)
* **역할**: 매칭 성사 또는 대타 조율 과정에서 생성된 1:1 대화 내역.
* **스키마**:
  - `id`: `uuid` (PK)
  - `match_id`: `uuid` (`matches.id` 참조, ON DELETE CASCADE)
  - `sender_id` / `receiver_id`: `uuid` (`users.id` 참조)
  - `message`: `text` (대화 메시지 내용)
  - `message_type`: `text` (유형: `text` | `contract` | `image` 등)
  - `is_read`: `boolean` (읽음 체크)
  - `created_at`: `timestamptz`

### 3.6 team_members (별명직원 및 소속 인력)
* **역할**: 사장님의 점포 소속 직원 명부 및 가입/초대 상태 연결.
* **스키마**:
  - `id`: `uuid` (PK)
  - `employer_id`: `uuid` (`users.id` 참조)
  - `worker_id`: `uuid` (가입 완료 시 `users.id` 바인딩, 미가입 시 `NULL`)
  - `nickname`: `text` (사장님이 부르는 이름 - 재훈이, 수진이 등)
  - `invite_status`: `text` (상태: `none` | `invited` | `joined`)
  - `invited_at`: `timestamptz` (초대장 최초 발송 일시)

---

## 4. 핵심 모듈별 기능 상세 및 구현 가이드

### 4.1 AI 성향 인터뷰 파이프라인 (STEP 5)
* **목표**: 일방적인 설문지가 아닌 인터랙티브 챗봇 대화를 통한 성향 도출.
* **시스템 로직**:
  1. **레벨 1 인터뷰**: 비로그인/로그인 유저 모두에게 오픈. 총 8~10턴의 상황 중심 질문 진행.
  2. **Claude 스트리밍 연동**: 클라이언트의 답변이 전송되면 프롬프트 조율을 거쳐 API 스트리밍 수신.
  3. **HEXACO 분석 및 임시 저장**: 인터뷰 완료 감지 시 자동으로 `/api/analyze`를 백그라운드 구동하여 6개 성향지표(정직-겸손, 정서성, 외향성, 우호성, 성실성, 개방성) 점수 도출 후 `users.onboarding_data` 또는 로컬스토리지에 캐싱.
  4. **프로필 정식 승격 (CTA)**: 로그인/회원가입 완료 시 해당 데이터를 정식 `worker_profiles`/`employer_profiles` 테이블로 이관.

### 4.2 카카오톡 단축코드 초대 루프 (STEP 4)
* **초대 링크 단축 생성**: 사장님이 별명직원 초대 시 고유의 6~8자리 알파벳 난수 코드(예: `PAZ-A7BC`)를 생성하고 `invite_codes`에 기록합니다.
* **다이렉트 공유 메시지**:
  - 모바일 디바이스인 경우 브라우저 내장 `navigator.share` API를 호출하여 네이티브 카카오톡 앱으로 즉시 전송창을 엽니다.
  - PC 환경에서는 템플릿 문구를 자동 생성하여 클립보드에 담아 유저가 직접 수동 전송할 수 있게 도웁니다.
* **1탭 가입 동기화 처리**:
  - 직원이 해당 링크 `${appUrl}/i/PAZ-XXXX`를 누르면 `app/i/[code]/page.tsx` 라우트가 파라미터를 파싱합니다.
  - 직원이 **카카오 1초 회원가입**을 진행하면 `auth.users` 가입과 동시에 `team_members` 및 `worker_profiles`를 묶어 트랜잭션 단위로 업데이트하고, 경력 검증된 `Tier1` 알바생 등급으로 자동 등록합니다.

### 4.3 GPS/주소 기반 실시간 대타 SOS 시스템 (STEP 3 & 6)
* **실시간 위치 기준점 설정**: 
  - 점주의 경우 매번 GPS 권한 동의를 유도하지 않고 점포 좌표를 디폴트 값으로 불러와 매칭에 즉각 투입합니다.
  - 알바생 또는 미등록 유저는 실시간 GPS 수신을 받거나, 카카오 로컬 행정동 검색을 통해 좌표를 변환하여 매칭 필드를 필터링합니다.
* **대타 매칭 피드**: 
  - `latitude` 및 `longitude` 거리 계산 수식을 PostGREST RPC 쿼리(`nearby_workers`)로 전달하여 반경 5km~15km 이내의 즉시 구직 활동 중인 인력을 나열합니다.
  - 성향 궁합 점수 및 대타 이력 평점을 기준으로 가중치를 두어 매칭 카드를 정렬시킵니다.

---

## 5. 단계별 마일스톤 개발 계획 (Roadmap)

```
┌─────────────────────────────────────────────────────────────────┐
│  Phase 1: 인프라 동기화 (완료)                                   │
│  - DB 스키마 패치, Supabase SSR 연동, 레이아웃/아이콘 테마 정립   │
└────────────────────────────────┬────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────┐
│  Phase 2: 매칭 핵심 비즈니스 이식 (진행 중 - P0)                 │
│  - /mode-select, /chat, /employer, /worker 폴더 복구 검증       │
└────────────────────────────────┬────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────┐
│  Phase 3: 실시간 알림 및 대타 SOS 고도화 (P1)                   │
│  - Web Push API 연동, 실시간 러브콜 수발신 소켓 결합            │
└────────────────────────────────┬────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────┐
│  Phase 4: AI 매니저 PAZ 및 근태/정산 고도화 (P2)                 │
│  - GPS 반경 출퇴근 자동 처리, 시급/주휴 수당 계산, PDF 계약서   │
└─────────────────────────────────────────────────────────────────┘
```

### 5.1 세부 일정 및 액션 아이템

#### **Phase 2 (Immediate - P0)**
* **카카오 및 구글 소셜 로그인 전수 검증**:
  - 로컬 환경(`localhost:3000`) 및 실서버 리디렉션 캐시 문제 최소화를 위한 `auth/callback` 흐름 실시간 모니터링.
* **개발자용 0번 시드 적용**:
  - `supabase/seed_test_data.sql`을 실제 로컬 DB 또는 Supabase Remote DB에 적용하여 충남 아산시 신창면 카페 매장을 시뮬레이션하고 매칭 알고리즘을 실시간 튜닝.

#### **Phase 3 (Next - P1)**
* **Web Push 기반 대타 SOS 알림**:
  - 알바생이 앱을 켜두지 않아도 사장님이 `[대타 SOS 요청]` 버튼을 누르는 순간 브라우저 푸시 채널을 활용해 진동/알림 형태로 즉시 구직 알림이 오도록 연동합니다.
  - `chats` 채널에 Realtime 리스너를 결합해 사장님과 알바생 간의 채팅 답장이 오면 뱃지 알림이 즉시 갱신되도록 작업합니다.

#### **Phase 4 (Future - P2)**
* **HR 자동화 및 PDF 전자계약서**:
  - `contracts` 테이블의 데이터를 읽어와 브라우저 내에서 표준근로계약서 양식 템플릿으로 구조화한 뒤, 캔버스 기반 수기 서명을 취합해 `html2canvas` 및 `jspdf`로 암호화된 PDF 문서를 자동 생성하고 Supabase Storage에 백업 보관합니다.
