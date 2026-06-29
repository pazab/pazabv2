# 📘 PAZAB 개발 핸드북 — 完本 (전권 통합)
> 2026-06-29 | 블루프린트 + 개발순서 + STEP1~6 세부 기술서
> 개별 권 파일도 함께 제공됩니다.

# PAZAB 개발 핸드북 (The PAZAB Handbook)
### 完本 — 블루프린트부터 세부 구현 기술서까지 한 권으로
> **버전**: 1.0
> **작성일**: 2026-06-29 KST
> **상태**: 출시 전 (pre-launch)
> **구성**: 이 핸드북은 여러 권(파일)으로 나뉘며, 본 파일은 **00권 = 지도(블루프린트) + 개발 순서**다.

---

## 📚 이 핸드북의 전체 구조

| 권 | 파일 | 내용 | 성격 |
|:--:|------|------|------|
| **00** | `PAZAB_HANDBOOK_00_blueprint.md` | 블루프린트 + 결정확정 + 개발순서 | 지도 |
| 01 | `PAZAB_HANDBOOK_01_onboarding-core.md` | STEP 1 — 가입/온보딩 골격 (역할지연·3필드·즉시진입) | 세부 기술서 |
| 02 | `PAZAB_HANDBOOK_02_employer-hr-first.md` | STEP 2 — 사장님 HR-First 진입 | 세부 기술서 |
| 03 | `PAZAB_HANDBOOK_03_daeta-wedge.md` | STEP 3 — 대타 딥링크·1탭·2티어 풀 | 세부 기술서 |
| 04 | `PAZAB_HANDBOOK_04_invite-supply.md` | STEP 4 — 알바생 초대 공급 경로 | 세부 기술서 |
| 05 | `PAZAB_HANDBOOK_05_hexaco-defer.md` | STEP 5 — HEXACO 분리·5턴·CTA화 | 세부 기술서 |
| 06 | `PAZAB_HANDBOOK_06_location-coords.md` | STEP 6 — 좌표 수집 전략(동네좌표+GPS) | 세부 기술서 |

> 각 세부 기술서는 **목표 → 화면 → 데이터 흐름 → DB 변경 → 코드 설계 → 연결관계 → 검증** 7단 구조로 작성된다.
> 본 00권을 먼저 읽고, 01부터 순서대로 구현한다.

---

# PART 0 — 블루프린트 (결정 확정본)

## 0.1 한눈에 보는 파잡

```
파잡(PAZAB) = AI 성향분석 기반 알바 매칭 + HR 자동화 + 긴급 대타 플랫폼

URL: https://pazab.vercel.app
스택: Next.js 16 (App Router) + TypeScript + Supabase + Claude API + Vercel
AI 프록시: PAZ AiGate v1.2.0 (FastAPI, Railway)

3개의 기둥:
  ① 매칭      — HEXACO 성향 + 조건으로 사장님↔알바생 연결
  ② HR 자동화 — 채용→계약→근태→급여 원스톱 (PAZ AI 비서)
  ③ 대타      — GPS 기반 긴급 인력 즉시 호출 (지역 노동 공유)

비즈니스 맥락:
  → 개발자 본인이 신창면 카페/식당 운영 = 0번 레퍼런스 (확정)
  → 핵심 문제: 농촌/교외 교통 부재 → "지원자 자체가 없는" 시장
  → 본질: "매칭 UX 개선"이 아니라 "공급(supply)을 어떻게 만드냐"
```

## 0.2 진짜 제약과 핵심 전략

> **출시 전 1순위 문제 = 콜드스타트(빈 마켓플레이스). 가입 마찰은 2순위.**
> 따라서 온보딩 설계는 liquidity 전략에 종속된다.

**zero-network 단독 가치 (빈 시장에서도 작동):**

| 대상 | 단독 가치 | 마켓플레이스 필요? |
|------|-----------|:--:|
| 알바생 | HEXACO 성향분석 + 공유카드 | ❌ |
| 사장님 | HR 자동화 (근태/급여/계약) | ❌ |

**공급이 emergent하게 발생하는 핵심 루프:**
```
사장님이 HR 도구로 기존 알바 관리
  → 알바들이 "검증된 채로" 등록
  → 이게 곧 대타 풀
  → 인근 매장이 검증 인력 공유/재호출
  → 지역 노동 공유 네트워크 자연 발생
```

> ⚠️ 기존 기능(공고탐색·구직자탐색·매칭·러브콜·채팅)은 **하나도 안 버린다.**
> 가입 직후 첫 화면(진입 동선)과 유입 메시지만 재배치한다.

## 0.3 진입점 3분리 (TO-BE 요약)

| 진입점 | 첫 화면 | zero-network 가치 | 공급 확보 |
|--------|---------|-------------------|-----------|
| A 사장님 | 근태/급여(HR) | HR 자동화 | 본인이 직원 등록 = 공급 생성 |
| B 알바생 | 성향카드/초대수락 | 성향분석 재미 | 사장님 초대로 편입 |
| C 대타 | 근처 긴급공고 | 속도+신뢰 | A가 만든 풀을 소비 |

세 진입점 모두 **탐색·매칭·러브콜·채팅 공용 엔진** 위에서 돈다.

---

## 0.4 ✅ 확정된 결정 (이전 열린 질문 → 결론)

이전 블루프린트의 §12 열린 질문에 대한 **최종 결정**. 이 결정들이 PART 1 이후 모든 세부 기술서의 전제다.

### 결정 1 — 타깃 지역 / 0번 레퍼런스
```
✅ 출시 초기 타깃: 신창면 일대로 좁힘 (liquidity 집중)
✅ 0번 레퍼런스: 개발자 본인 매장 (카페/식당)
   → 본인 매장의 실제 알바를 첫 검증 풀로 사용
```

### 결정 2 — 역할 선택 (제거 vs 유지)
```
✅ 입구에서 제거하되 "지연(defer)" — 완전 제거 아님

가입 직후: user_type = null (역할 안 물어봄)
첫 행동으로 잠정 추론:
  · 대타 SOS / 가게 관리 → employer 잠정
  · 성향카드 / 구직 탐색 → worker 잠정
첫 가치 행동 직후 1회 마이크로 컨펌:
  "사장님으로 시작할게요. 맞아요?" [네] [알바생인데요]
→ user_type 확정. both 전환은 설정에서 언제든.

이유: both 실재 + DB가 user_type에 강하게 의존 → null 장기 방치 시 분기 터짐.
      "물어보는 시점을 입구→첫 가치 후"로 미루는 것이지 영영 안 묻는 게 아님.
```

### 결정 3 — HEXACO 5턴 압축
```
✅ 6요인 전부 측정·표시. 단 턴 배분은 고신호 요인(C·H·A)에 몰아줌.

매칭 영향도 순위:
  성실성(C) -24점 (압도적) > 정직성(H) 노쇼예측 > 원만성(A) +8 > E·X·O(영향 적음)

5턴 배분:
  턴1: 성실성 (책임감·시간약속) — 가장 깊게
  턴2: 정직성 (노쇼·신뢰) — 깊게
  턴3: 원만성 (협업·갈등)
  턴4: 외향성+감정성 (묶어서 가볍게)
  턴5: 개방성 + 종합 마무리

표시: 결과 카드엔 6요인 전부 노출 (재미·바이럴). 측정 정밀도만 차등.
```

### 결정 4 — 대타 공급 범위
```
✅ 2-Tier 풀. 둘 다 받되 뱃지로 명확히 구분.

[Tier 1] 검증 인력 ✅ 초록
  · 누군가의 팀원이었음 / 근태이력 있음 / 계좌인증 완료
  · 피드 상단 우선, 매칭점수 +보너스
[Tier 2] 신규 인력 🔵 파랑
  · 콜드 가입, 이력 없음
  · 하단 노출, "첫 대타" 표시

한번 일하면 Tier1 승격 → 검증 풀이 자가 성장.
```

### 결정 5 — 계좌 실명인증 비대칭
```
✅ 사장님 필수 / 알바생은 정산 직전 1회

사장님: 대타 공고 등록·SOS 전 필수 (돈 보내는 주체)
알바생: 가입·지원 시 면제 → SOS 수락되어 정산 대상 된 순간 1회 인증
        그 전엔 절대 안 물어봄 (progressive 원칙 준수)
```

### 결정 6 — 카카오 로그인
```
✅ 이미 구현 완료 (정정)
→ 대타 딥링크 + 카톡 1탭은 "대기"가 아니라 "지금 가능" 작업
→ 우선순위 상승
```

### 결정 7 — 위치 좌표 수집
```
✅ 전원 수집하되 "정밀도 단계"로 (강제 GPS 팝업 금지)

필수: 동네 단위 좌표
  → 가입 3필드의 "위치"에서 주소 자동완성 → 읍면동 중심좌표 저장
  → 권한 팝업 없이 텍스트 검색만으로 확보. 매칭엔 충분.
선택: 정밀 GPS
  → 대타 SOS 등 "지금 여기" 순간에만 "내 위치로" 버튼으로 요청

읍면동 중심좌표만 있어도 지역 가중치 3단계 전부 작동.
```

---

# PART 1 — 개발 진행 순서 (마스터 시퀀스)

## 1.1 순서 결정 원칙

```
의존성 순서로 쌓는다:
  · 뒤 작업이 앞 작업의 산출물을 필요로 하면 앞에 배치
  · 공급(supply)을 만드는 작업을 수요(demand) 작업보다 앞에
  · 위험·불확실 작업을 앞으로 당겨 빨리 검증
```

## 1.2 확정 순서

```
STEP 1  온보딩 골격          → 모든 진입점의 공통 기반 (역할지연·3필드·즉시진입)
   │      (의존: 없음. 모든 것의 토대)
   ▼
STEP 2  사장님 HR-First       → 공급 생성의 출발점 (본인 매장 0번 + 직원 등록)
   │      (의존: STEP1 온보딩 골격)
   ▼
STEP 4  알바생 초대 공급       → 사장님이 만든 직원을 검증 풀로 편입
   │      (의존: STEP2 — 사장님이 있어야 초대 가능)
   ▼
STEP 6  좌표 수집 전략         → 대타가 돌기 위한 위치 인프라
   │      (의존: STEP1 — 가입 3필드에 위치 포함)
   ▼
STEP 3  대타 wedge            → 위 공급+좌표를 소비하는 창끝
   │      (의존: STEP2·4·6 — 풀과 좌표가 있어야 대타가 의미)
   ▼
STEP 5  HEXACO 분리·CTA화      → 매칭 정밀도 향상 (마감재, 맨 뒤)
          (의존: 탐색/매칭 동선 — 마지막에 얹음)
```

> **주의**: 챕터 번호(01~06)는 주제별 고정 번호이고, **구현 순서**는 위 시퀀스를 따른다.
> 즉 구현은 `01 → 02 → 04 → 06 → 03 → 05` 순서.

## 1.3 순서 한 줄 요약 + 산출물

| 순서 | STEP | 한 줄 | 끝나면 생기는 것 |
|:--:|:--:|------|------------------|
| 1 | STEP 1 | 가입을 가볍게 + 역할 지연 + 즉시 진입 | 마찰 없는 공통 입구 |
| 2 | STEP 2 | 사장님 HR-First (본인 매장 0번) | 첫 검증 인력 풀 씨앗 |
| 3 | STEP 4 | 사장님이 직원 초대 → 풀 편입 | 두꺼워지는 공급 풀 |
| 4 | STEP 6 | 동네좌표 필수 + GPS는 대타만 | 위치 매칭 인프라 |
| 5 | STEP 3 | 대타 딥링크·1탭·2티어 | 돌아가는 긴급 매칭 |
| 6 | STEP 5 | HEXACO 분리·5턴·CTA | 매칭 정밀도 마감 |

## 1.4 각 STEP의 "완료 정의" (Definition of Done)

```
STEP 1: 신규 유저가 역할 선택 없이 3필드만으로 가입→첫 화면 진입.
        첫 가치 행동 후 user_type 1탭 확정. 이탈 지점 0.

STEP 2: 사장님이 공고 없이 "가게 관리"로 진입, 직원1명 등록,
        근태/급여 화면 즉시 사용. 펑크 시 "대타 구하기" 노출.

STEP 4: 사장님이 카톡 링크로 직원 초대 → 직원 1탭 수락 →
        team_members 편입 → 대타 Tier1 후보로 등록.

STEP 6: 모든 가입자가 주소검색만으로 읍면동 좌표 보유.
        대타 SOS 시에만 정밀 GPS 요청. 강제 팝업 0.

STEP 3: 카톡 공유 딥링크 → 해당 공고 직행 → 1탭 로그인 →
        2티어 피드(검증✅/신규🔵) → SOS → 정산직전 계좌인증.

STEP 5: 가입 동선에 HEXACO 없음. 탐색/매칭의 "점수 높이기" 배너로 진입,
        5턴 완료, 6요인 결과카드 공유. C·H·A 정밀 측정.
```

---

## 다음 작업

이 00권(블루프린트+순서)을 확정하면, **구현 순서대로 세부 기술서를 한 챕터씩** 작성한다.
첫 세부 기술서는 **01권 = STEP 1 온보딩 골격**.

각 세부 기술서에 들어갈 7단 구조:
```
1. 목표 (이 STEP이 푸는 문제 + 완료정의)
2. 화면 (UI 흐름, 와이어 수준 기술)
3. 데이터 흐름 (유저 행동 → 어떤 함수 → 어떤 테이블)
4. DB 변경 (ALTER/신규 테이블/컬럼, SQL)
5. 코드 설계 (어떤 파일, 어떤 함수, 부분수정 단위)
6. 연결관계 (다른 STEP·기존 기능과의 접점)
7. 검증 (테스트 시나리오, 빌드 체크)
```

---

*PAZAB Handbook 00 — Blueprint | 2026.06.29 | "말하면 된다. PAZ가 한다."*


<div style="page-break-after:always"></div>

---

# PAZAB 핸드북 01 — STEP 1: 온보딩 골격
### 역할 지연 · 3필드 가입 · 즉시 진입
> **구현 순서**: 1번째 (모든 진입점의 공통 토대)
> **의존**: 없음
> **선행 읽기**: `PAZAB_HANDBOOK_00_blueprint.md` (특히 결정 2, 7)

---

## 1. 목표

### 1.1 이 STEP이 푸는 문제
현재 가입은 `회원가입 → 역할선택 → 무거운 프로필 → HEXACO 10턴 → (빈)탐색` 순서로, 가치 체감 전에 4개 허들을 쌓는다. STEP 1은 이 입구를 **3필드 + 역할 지연 + 즉시 진입**으로 재설계해 **모든 진입점이 공유할 마찰 없는 공통 토대**를 만든다.

### 1.2 완료 정의 (DoD)
```
✅ 신규 유저가 역할 선택 없이 3필드만으로 가입 → 첫 화면 진입
✅ 첫 가치 행동 후 user_type을 1탭으로 확정
✅ 가입 동선 내 이탈 지점 0 (HEXACO·대량 프로필 모두 동선 밖)
```

### 1.3 설계 철학 (결정 2·7 적용)
```
역할: 입구에서 안 물어봄 → user_type=null로 시작 → 행동으로 잠정추론 → 첫 가치 후 1탭 컨펌
위치: 주소 자동완성으로 읍면동 좌표만 확보 (GPS 강제 없음)
정보: 가치 체감 전엔 최소만 (progressive)
```

---

## 2. 화면 (UI 흐름)

### 2.1 전체 플로우
```
[랜딩]
  "내 주변 알바, 30초면 시작"
  [카카오로 시작]  [구글로 시작]
     │
     ▼
[온보딩 1/1] — 단일 화면, 3필드 (스크롤 없이 한 눈)
  ┌─────────────────────────────┐
  │  어디서 시작할까요?           │
  │  [📍 동네 검색____________]   │  ← 주소 자동완성 (Kakao Local)
  │   최근: 신창면 · 음봉면        │
  │                             │
  │  관심 분야 (최대 3개)         │
  │  [카페][한식][편의점][...]     │  ← 업종 칩 멀티선택
  │                             │
  │  가능한 때                   │
  │  [평일][주말][아무때나]        │  ← 가벼운 칩
  │                             │
  │         [시작하기]           │
  └─────────────────────────────┘
     │
     ▼
[홈/탐색 즉시 진입]  ← 빈 화면 금지. 동네 기반 추천 즉시 노출
     │
     ▼  (첫 가치 행동: 카드탭 / SOS / 성향카드 등)
[마이크로 컨펌 바텀시트]
  "사장님으로 시작할게요. 맞아요?"
  [네, 사장님이에요]  [알바 구하는 중이에요]
     │
     ▼
user_type 확정 → 해당 진입점으로 분기
```

### 2.2 역할 잠정추론 → 컨펌 트리거 규칙
```
행동 신호 → 잠정 user_type:
  · "가게 관리" / "대타 구하기(사장)" / 공고 등록 시도  → employer 잠정
  · "성향카드" / 구직 탐색 / 공고에 러브콜            → worker 잠정

컨펌 시점: 첫 "가치 행동" 직후 단 1회.
  · 잠정값을 기본 선택(굵게)으로 → 1탭이면 끝
  · 반대 선택 시 즉시 전환
  · both는 이 단계에서 안 물음 (설정에서 나중에)
```

---

## 3. 데이터 흐름

### 3.1 가입~진입 시퀀스
```
유저: [카카오로 시작]
  → Supabase Auth (kakao provider)
  → onAuthStateChange: users row 존재? 없으면 INSERT (user_type=null)
  → 온보딩 미완료 플래그 확인 (onboarded=false)
  → /onboarding 라우팅

유저: 3필드 입력 → [시작하기]
  → 주소문자열 → Kakao Local API → {lat, lng, sido, sigungu, eupmyeondong}
  → upsert: worker_profiles & employer_profiles 공통 좌표 컬럼에 저장
     (역할 미정이므로 양쪽 프로필 stub을 좌표/업종/요일만으로 생성하거나,
      onboarding_data JSONB 임시 보관 후 역할 확정 시 정식 프로필로 승격)
  → users.onboarded = true
  → /home (탐색) 진입

유저: 첫 가치 행동
  → 행동 핸들러가 inferRole() 호출 → 잠정 user_type
  → 컨펌 바텀시트 → 확정값 users.user_type UPDATE
  → onboarding_data → 정식 프로필(worker_profiles or employer_profiles) 승격
```

### 3.2 임시 보관 vs 양쪽 stub — 선택
```
권장: onboarding_data(JSONB) 임시 보관 방식
  · 역할 미정 상태에서 양쪽 프로필 빈 row 만드는 것보다 깔끔
  · 역할 확정 순간 한쪽 프로필로 승격, 나머지는 안 만듦
  · both 전환 시 그때 반대편 프로필 생성
```

---

## 4. DB 변경

### 4.1 users 테이블 — 온보딩 상태 컬럼
```sql
-- 온보딩 완료 플래그 + 임시 데이터 보관
ALTER TABLE users ADD COLUMN IF NOT EXISTS onboarded boolean DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS onboarding_data jsonb DEFAULT NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS role_inferred text DEFAULT NULL; -- 'employer'|'worker' 잠정값 로깅(분석용)

-- user_type은 기존 컬럼 유지. 단 신규 가입 시 NULL 허용 확인:
-- (기존 NOT NULL 제약이면 제거)
ALTER TABLE users ALTER COLUMN user_type DROP NOT NULL;
```

### 4.2 공통 좌표 컬럼 (양쪽 프로필) — STEP 6과 공유
```sql
-- 읍면동 중심좌표 저장 (강제 GPS 없이 주소검색으로 확보)
ALTER TABLE worker_profiles  ADD COLUMN IF NOT EXISTS lat double precision DEFAULT NULL;
ALTER TABLE worker_profiles  ADD COLUMN IF NOT EXISTS lng double precision DEFAULT NULL;
ALTER TABLE employer_profiles ADD COLUMN IF NOT EXISTS lat double precision DEFAULT NULL;
ALTER TABLE employer_profiles ADD COLUMN IF NOT EXISTS lng double precision DEFAULT NULL;
-- region 3단계는 기존 컬럼 활용 (sido/sigungu/eupmyeondong은 region 문자열 파싱)
```

### 4.3 onboarding_data JSONB 구조 (애플리케이션 약속)
```json
{
  "region": "충남 아산시 신창면",
  "lat": 36.78, "lng": 126.95,
  "industries": ["카페", "편의점"],
  "availability": "weekday",
  "created_at": "2026-06-29T..."
}
```

---

## 5. 코드 설계

### 5.1 신규/수정 파일 목록
```
신규:
  app/onboarding/page.tsx          — 3필드 단일 온보딩 화면
  lib/onboarding.ts                — inferRole(), promoteProfile(), 좌표파싱
  components/RoleConfirmSheet.tsx  — 마이크로 컨펌 바텀시트

수정:
  app/login/page.tsx 또는 auth 콜백 — 가입 후 onboarded 분기 라우팅
  app/page.tsx (홈/탐색)            — 첫 가치 행동 핸들러에 inferRole+컨펌 연결
  middleware.ts (있으면)            — onboarded=false → /onboarding 가드
```

### 5.2 lib/onboarding.ts — 핵심 함수 시그니처
```typescript
// 'use server' 또는 클라이언트 유틸로 분리 설계
export type InferSignal =
  | "manage_store" | "post_job" | "daeta_sos_employer"   // → employer
  | "personality_card" | "browse_jobs" | "lovecall_worker"; // → worker

export function inferRole(signal: InferSignal): "employer" | "worker" {
  const employerSignals = ["manage_store", "post_job", "daeta_sos_employer"];
  return employerSignals.includes(signal) ? "employer" : "worker";
}

// 주소 문자열 → 좌표 + region 3단계
export async function resolveAddress(query: string): Promise<{
  lat: number; lng: number; region: string;
  sido: string; sigungu: string; eupmyeondong: string;
}> { /* Kakao Local API */ }

// onboarding_data → 정식 프로필 승격
export async function promoteProfile(
  supabase: SupabaseClient,
  userId: string,
  role: "employer" | "worker"
): Promise<void> {
  // 1. users.onboarding_data 읽기
  // 2. role에 맞는 프로필 테이블에 upsert (좌표/업종/요일)
  // 3. users.user_type = role UPDATE
}
```

### 5.3 컨펌 바텀시트 패턴 (결정 2)
```typescript
// components/RoleConfirmSheet.tsx
// 잠정값을 기본 선택으로 굵게 → 1탭 확정
<RoleConfirmSheet
  inferred="employer"
  onConfirm={(role) => promoteProfile(supabase, userId, role)}
/>
// 카피: "사장님으로 시작할게요. 맞아요?"
//       [네, 사장님이에요](primary)  [알바 구하는 중이에요](ghost)
```

> 규칙 준수: `<form>` 금지 → onClick/onChange만. ToastModal로 피드백.

---

## 6. 연결관계

```
STEP 1 ──provides──> 공통 입구 + user_type 지연확정 + 좌표 stub
   │
   ├─→ STEP 2(사장님 HR-First): employer 확정 시 promoteProfile→employer_profiles
   ├─→ STEP 3(대타): daeta_sos_employer 신호가 inferRole의 입력
   ├─→ STEP 4(초대): 초대 수락도 온보딩의 변형 (직원은 worker 확정 + team 편입)
   ├─→ STEP 5(HEXACO): 가입 동선에서 완전 제거 = STEP1이 보장
   └─→ STEP 6(좌표): 4.2 좌표 컬럼을 STEP1 가입 시점에 채움
```

### 6.1 기존 기능 영향 (양쪽 동시 처리 원칙)
```
영향: signup/login 라우팅, explore 첫 진입, 프로필 생성 로직
주의: 기존 user_type NOT NULL 의존 코드 전수 점검
      → null 가드 추가 (user_type ?? 'guest' 분기)
```

---

## 7. 검증

### 7.1 테스트 시나리오
```
시나리오 A (사장님 추론):
  카카오 가입 → 3필드 → 홈 → "가게 관리" 탭
  → 컨펌 "사장님으로?" [네] → user_type=employer → employer_profiles 생성 확인

시나리오 B (알바생 추론):
  구글 가입 → 3필드 → 홈 → "성향카드" 탭
  → 컨펌 [알바 구하는 중] → user_type=worker → worker_profiles 생성 확인

시나리오 C (재진입):
  온보딩 완료 유저 재로그인 → /onboarding 안 거치고 바로 홈

시나리오 D (좌표):
  3필드에서 "신창면" 검색 → lat/lng 저장 확인 → 매칭 지역가중치 작동
```

### 7.2 빌드/타입 체크
```powershell
npx tsc --noEmit
npm run build
```

### 7.3 Git
```powershell
git add app/onboarding/ lib/onboarding.ts components/RoleConfirmSheet.tsx app/page.tsx app/login/page.tsx && git commit -m "feat: 온보딩 골격 - 3필드 가입 + 역할 지연 확정 + 좌표 stub" && git push
```

---

## 부록 A — 이 STEP의 의사결정 체크리스트
```
□ onboarding_data 임시보관 방식 vs 양쪽 stub → 권장: 임시보관
□ 컨펌 바텀시트 카피 최종 확정
□ Kakao Local API 키 환경변수 확인 (대타에서 이미 사용 중인지)
□ user_type NULL 허용으로 인한 기존 분기 영향 전수 점검 리스트 작성
```

---

*PAZAB Handbook 01 — STEP 1 온보딩 골격 | 2026.06.29*


<div style="page-break-after:always"></div>

---

# PAZAB 핸드북 02 — STEP 2: 사장님 HR-First 진입 ⭐
### "공고 올리러"가 아니라 "우리 가게 관리하러"
> **구현 순서**: 2번째 (공급 생성의 출발점 — 책 전체의 심장)
> **의존**: STEP 1 (온보딩 골격)
> **선행 읽기**: `00_blueprint.md`(결정 1·2·5), `01_onboarding-core.md`
> **중요도**: ⭐⭐⭐ 최상. 이 STEP이 콜드스타트를 깨는 엔진이다.

---

## 1. 목표

### 1.1 이 STEP이 푸는 문제
파잡의 진짜 제약은 가입 마찰이 아니라 **빈 마켓플레이스(콜드스타트)**다. 사장님을 "공고 올리는 사람"으로 받으면, 공고를 올린 직후 **빈 구직자 리스트**를 마주하고 첫인상이 타버린다.

STEP 2는 사장님의 진입 목적을 **"공고"에서 "우리 가게 관리(HR)"로 전환**한다. HR 자동화는 마켓플레이스가 비어 있어도 그 자체로 가치(zero-network value)가 있다. 그리고 사장님이 자기 직원을 등록하는 행위가 곧 **검증된 공급 풀의 씨앗**이 된다.

```
사장님이 HR로 직원 관리
  → 직원이 "검증된 채로" 시스템 편입
  → 이게 대타 풀 (STEP 3가 소비)
  → 인근 매장이 검증 인력 재호출
  → 지역 노동 공유 네트워크 발생
```

### 1.2 완료 정의 (DoD)
```
✅ 사장님이 공고 없이 "가게 관리"로 진입
✅ 직원 1명 등록 (별명만으로 시작 가능)
✅ 근태/급여 화면 즉시 사용 (마켓플레이스 미접촉)
✅ 직원이 펑크났을 때 "대타 구하기" 버튼이 자연스럽게 노출
✅ 등록된 직원이 대타 Tier1(검증) 후보로 자동 등록
```

### 1.3 0번 레퍼런스 (결정 1)
```
개발자 본인 매장(신창면 카페/식당)을 0번 사장님으로 셋업.
본인 매장의 실제 알바 2~3명을 첫 검증 인력으로 등록 →
출시 시점에 대타 풀이 "0이 아닌 상태"로 시작.
이것이 신창면 일대 liquidity의 시드(seed).
```

---

## 2. 화면 (UI 흐름)

### 2.1 진입 동선 전환 (AS-IS → TO-BE)
```
[AS-IS]
가입 → 역할(사장님) → 공고 등록(무거움) → 빈 구직자 리스트 😞

[TO-BE]
가입(STEP1 3필드) → 홈 → "우리 가게 관리 시작" 탭
  → (employer 잠정추론 + 컨펌)
  → 가게 셋업 3필드 → 근태/급여 대시보드 즉시 😊
  → [펑크 발생] → "대타 구하기" → STEP3 진입
```

### 2.2 가게 셋업 화면 (HR 진입용, 공고 아님)
```
[가게 셋업 1/1] — 단일 화면
  ┌──────────────────────────────┐
  │  우리 가게 알바 관리 시작        │
  │                              │
  │  ① 어떤 가게예요?              │
  │     [카페/음료 ▾]             │  ← 업종 (job_categories)
  │                              │
  │  ② 어디예요?                  │
  │     [📍 주소 검색_________]    │  ← 자동완성 → 좌표 (STEP1 재사용)
  │     ※ 온보딩서 받았으면 prefill │
  │                              │
  │  ③ 같이 일하는 알바 (선택)      │
  │     [+ 알바 추가]             │  ← 별명만 입력해도 OK
  │     · 재훈이                  │
  │     · 수진                   │
  │                              │
  │         [관리 시작하기]        │
  └──────────────────────────────┘
     │
     ▼
[HR 대시보드] ← 즉시 효용. 빈 피드 아님.
```

### 2.3 HR 대시보드 (사장님 홈)
```
┌──────────────────────────────────┐
│  파스쿠찌 신창점          [PAZ 🎙]  │
│                                  │
│  오늘 근태                        │
│  · 재훈이  ✅ 출근 09:02           │
│  · 수진    ⏳ 미출근               │
│                                  │
│  [출퇴근 관리] [급여] [계약서]      │
│                                  │
│  ⚠️ 수진이 오늘 못 나온대요?        │
│     [🚀 대타 구하기]  ← STEP3 트리거 │
│                                  │
│  ─────────────────────           │
│  사람 더 필요하세요?               │
│  [공고 올리기] [구직자 둘러보기]    │  ← 마켓은 여기, 강요 아님
└──────────────────────────────────┘
```

### 2.4 직원 등록 — 점진적 (별명 → 정식)
```
[최소] 별명만:  "재훈이"  → team_members row (worker_id=null, nickname 보유)
[승격] 초대 시:  STEP4에서 카톡 초대 → 실제 user 연결 → worker_id 채움 → Tier1 후보
```

---

## 3. 데이터 흐름

### 3.1 가게 셋업 시퀀스
```
유저(employer 잠정) → [관리 시작하기]
  → promoteProfile(supabase, userId, "employer")   // STEP1 함수 재사용
  → employer_profiles upsert:
       business_type, region, address, lat, lng
       (is_active=true, job_status는 'open' 강제 안 함 — 공고 아님)
  → 직원 별명들 → team_members 다건 INSERT:
       { employer_id, worker_id: null, nickname, status:'active' }
  → /employer/dashboard 진입
```

### 3.2 펑크 → 대타 트리거
```
사장님: 대시보드에서 "수진 오늘 못나옴" → [대타 구하기]
  → 해당 team_member의 근무조건(요일/시간/시급) prefill
  → daeta_postings INSERT 모달 (DaetaRegisterModal, postingId=null=신규)
  → 계좌 실명인증 체크 (결정5: 사장님 필수)
       · 미인증 → 인증 모달 먼저
       · 인증완료 → SOS 가능
  → STEP3 대타 피드로 이동
```

### 3.3 직원 = 공급 풀 편입 흐름
```
team_members에 등록된 직원 중 worker_id IS NOT NULL (초대수락 완료)
  → 대타 매칭 후보 풀에 포함
  → Tier 판정 (결정4):
       근태이력 OR 계좌인증 OR 팀이력 있음 → Tier1 ✅
       없음 → Tier2 🔵
```

---

## 4. DB 변경

### 4.1 team_members — 별명 단독 등록 허용
```sql
-- worker_id 없이 별명만으로 임시 직원 등록 허용
ALTER TABLE team_members ALTER COLUMN worker_id DROP NOT NULL;

-- 초대 상태 추적
ALTER TABLE team_members ADD COLUMN IF NOT EXISTS invite_status text DEFAULT 'none';
  -- 'none'(별명만) | 'invited'(초대보냄) | 'joined'(수락완료)
ALTER TABLE team_members ADD COLUMN IF NOT EXISTS invited_at timestamptz DEFAULT NULL;
```

### 4.2 대타 Tier 판정용 — 검증 신호 집계
```sql
-- worker_profiles에 검증 캐시 컬럼 (매번 조인 대신 캐싱)
ALTER TABLE worker_profiles ADD COLUMN IF NOT EXISTS is_verified boolean DEFAULT false;
ALTER TABLE worker_profiles ADD COLUMN IF NOT EXISTS verified_reason text DEFAULT NULL;
  -- 'team_history' | 'attendance' | 'bank_verified'

-- 트리거 또는 앱레벨에서 갱신:
--   team_members.invite_status='joined' 되면 is_verified=true, reason='team_history'
--   attendance row 생기면 reason 보강
--   계좌인증 완료 시 reason='bank_verified'
```

### 4.3 employer_profiles — HR 진입 vs 공고 구분
```sql
-- 가게가 "관리용으로만" 만들어졌는지 vs 공고 발행했는지 구분
-- (기존 job_status 활용: 'open'은 공고발행 상태로만 쓰고,
--  HR전용 진입은 별도 플래그)
ALTER TABLE employer_profiles ADD COLUMN IF NOT EXISTS hr_only boolean DEFAULT true;
  -- 가게 셋업만 한 상태=true. 공고 올리면 false 전환.
```

### 4.4 0번 레퍼런스 시드 SQL (출시 전 1회 실행)
```sql
-- 개발자 본인 매장 = hellopazab 계정 기준
-- 1. 본인 매장 employer_profiles 확인/생성 (신창면 좌표)
UPDATE employer_profiles
  SET region='충남 아산시 신창면', lat=36.78, lng=126.95, hr_only=true
  WHERE user_id='a2295abd-503d-4efe-8485-1315cfd2fcf8';

-- 2. 실제 알바 2~3명 team_members 등록 (초대 수락된 검증 인력으로)
--    → 출시 시점 대타 풀 seed
-- (실제 worker user_id로 채워서 invite_status='joined', is_verified=true)
```

---

## 5. 코드 설계

### 5.1 신규/수정 파일
```
신규:
  app/employer/setup/page.tsx        — 가게 셋업 3필드 (공고 아님)
  app/employer/dashboard/page.tsx    — HR 대시보드 (사장님 홈)
  components/employer/QuickStaffAdd.tsx — 별명만으로 직원 추가
  components/employer/PunchAlert.tsx    — "펑크 → 대타 구하기" 카드
  lib/verification.ts                — Tier 판정 + is_verified 갱신

수정:
  app/page.tsx                        — "우리 가게 관리" 진입 버튼 + employer 추론
  components/daeta/DaetaRegisterModal.tsx — 펑크 prefill 진입 케이스 추가
  app/employer/register/page.tsx      — 공고 등록 시 hr_only=false 전환
```

### 5.2 lib/verification.ts — Tier 판정
```typescript
export type VerifyTier = "verified" | "new";

export function getTier(w: {
  is_verified?: boolean;
  verified_reason?: string | null;
}): VerifyTier {
  return w.is_verified ? "verified" : "new";
}

// 검증 신호 발생 시 호출 (team join / 첫 출근 / 계좌인증)
export async function markVerified(
  supabase: SupabaseClient,
  workerUserId: string,
  reason: "team_history" | "attendance" | "bank_verified"
): Promise<void> {
  await supabase.from("worker_profiles")
    .update({ is_verified: true, verified_reason: reason })
    .eq("user_id", workerUserId);
}
```

### 5.3 별명 직원 추가 (QuickStaffAdd)
```typescript
// worker_id 없이 별명만 → team_members INSERT
async function addStaff(nickname: string) {
  await supabase.from("team_members").insert({
    employer_id: employerId,
    worker_id: null,
    nickname,
    status: "active",
    invite_status: "none",
  });
  // 규칙: <form> 금지, onClick. 성공 시 ToastModal.
}
```

### 5.4 펑크 → 대타 prefill (PunchAlert → DaetaRegisterModal)
```typescript
// team_member 근무조건을 daeta 공고 초기값으로
function openDaetaFromPunch(member: TeamMember) {
  const prefill = {
    wage: member.wage,
    work_hours: member.work_hours,
    work_date: today(),     // 펑크는 보통 당일
    duty: member.role_desc,
  };
  // 계좌인증 가드 (결정5)
  if (!employer.bank_verified) return openBankVerify();
  openDaetaRegister({ postingId: null, prefill });
}
```

---

## 6. 연결관계

```
STEP 2 ──creates──> 사장님 + 검증직원(공급 풀 시드) + 펑크→대타 트리거
   │
   ├─→ STEP 1: promoteProfile("employer") 호출처. 온보딩 좌표 재사용.
   ├─→ STEP 4: 별명직원(invite_status='none') → 카톡 초대 → 'joined' → Tier1
   ├─→ STEP 3: PunchAlert가 대타 진입의 주요 트리거. is_verified가 2티어 정렬 입력.
   ├─→ STEP 6: 가게 좌표(lat/lng)가 대타 매칭 기준점(getDbBase)
   └─→ 기존 HR(근태/급여/계약): 대시보드가 기존 employer/team/[id] 기능 재노출
```

### 6.1 기존 기능 영향 (양쪽 동시 처리)
```
영향:
  · employer/register(공고)는 유지하되, 진입을 "선택"으로 강등
  · 기존 team_members.worker_id NOT NULL 의존 코드 점검 (4.1로 nullable 됨)
    → worker_id null인 별명직원 표시/필터 분기 추가
  · 근태/급여 화면이 worker_id null인 직원을 어떻게 다룰지
    → 별명직원은 "초대 전" 상태로 근태입력 비활성 + "초대하기" CTA
```

---

## 7. 검증

### 7.1 테스트 시나리오
```
A (HR 진입):
  사장님 가입 → "가게 관리" → 셋업3필드 → 대시보드 즉시 진입(빈피드 없음)

B (별명직원):
  대시보드 → 별명 "재훈이" 추가 → team_members worker_id=null row 확인

C (펑크→대타):
  "수진 못나옴" → 대타구하기 → 계좌미인증이면 인증모달 →
  인증 후 daeta_postings prefill 모달 → SOS

D (Tier 시드):
  0번 레퍼런스 SQL 실행 → 본인매장 직원 is_verified=true →
  대타 피드에서 ✅ 검증 뱃지로 상단 노출 확인

E (공고 전환):
  대시보드 → "공고 올리기" → employer_profiles.hr_only=false 전환 확인
```

### 7.2 빌드/Git
```powershell
npx tsc --noEmit
```
```powershell
git add app/employer/setup/ app/employer/dashboard/ components/employer/ lib/verification.ts app/page.tsx && git commit -m "feat: 사장님 HR-First 진입 - 가게셋업/대시보드/별명직원/펑크대타/Tier판정" && git push
```

---

## 부록 A — 0번 레퍼런스 셋업 체크리스트 (출시 전)
```
□ 본인 매장 employer_profiles 신창면 좌표로 셋업
□ 실제 알바 2~3명 동의받고 team_members 등록 (invite_status='joined')
□ 해당 직원 worker_profiles.is_verified=true 셋업
□ 본인 계좌 실명인증 완료 (사장님 필수)
□ 대타 피드에서 본인 직원이 검증 뱃지로 노출되는지 실측
□ 출시 시점 신창면 대타 풀 ≥ 3명 확보 확인
```

## 부록 B — 이 STEP의 의사결정 체크리스트
```
□ HR 대시보드를 사장님 기본 홈으로 할지, 탭으로 둘지
□ 별명직원 근태입력 정책 (초대 전엔 비활성 권장)
□ hr_only 플래그로 "공고 안 올린 가게"를 탐색에서 숨길지 노출할지
   → 권장: 숨김 (구직자 탐색엔 공고발행 가게만)
□ 펑크 케이스 외에 대타 진입점 더 둘지 (예: 대시보드 상시 버튼)
```

---

*PAZAB Handbook 02 — STEP 2 사장님 HR-First | 2026.06.29 | ⭐ 핵심 챕터*


<div style="page-break-after:always"></div>

---

# PAZAB 핸드북 03 — STEP 3: 대타 wedge ⭐
### 출시의 창끝 — 속도 + 신뢰의 긴급 매칭
> **구현 순서**: 5번째 (공급·좌표가 준비된 뒤 소비하는 창끝)
> **의존**: STEP 2(검증 풀), STEP 4(초대 공급), STEP 6(좌표)
> **선행 읽기**: `00_blueprint.md`(결정 4·5·6·7), `02_employer-hr-first.md`
> **중요도**: ⭐⭐⭐ 최상. 파잡 출시의 wedge(쐐기).

---

## 1. 목표

### 1.1 이 STEP이 푸는 문제
대타는 파잡이 시장에 박는 **창끝**이다. 일반 알바 매칭은 "천천히 좋은 사람"이지만, 대타는 **"지금 당장, 믿을 수 있는 사람"**이다. 이 두 가치(속도 + 신뢰)가 대타의 전부이고, 온보딩·UX가 이 둘을 절대 깨면 안 된다.

핵심 메커니즘:
```
사장님이 카톡으로 긴급공고 공유
  → 받은 사람이 링크 1탭 → 해당 공고 직행 → 카톡 1탭 로그인
  → 근처 검증 인력 즉시 노출 (2티어)
  → SOS → 정산 직전 계좌인증 → 매칭 성사
```

### 1.2 완료 정의 (DoD)
```
✅ 카톡 공유 딥링크 → 해당 공고로 직행 (앱 탐색 거치지 않음)
✅ 비로그인 상태에서 공고 미리보기 → 카톡 1탭 로그인
✅ 2티어 피드 (검증✅ 상단 / 신규🔵 하단) 정상 정렬
✅ SOS 요청 → 정산 직전 단계에서만 알바생 계좌인증 (그 전엔 0)
✅ 사장님은 SOS/공고 전 계좌인증 필수 (결정5)
✅ GPS 강제 팝업 없음. 가게좌표 우선, 정밀GPS는 "내 위치로" 버튼만 (결정7)
```

### 1.3 이미 구현된 것 (재사용 자산)
```
✅ app/daeta/page.tsx — 매장좌표 우선 로드(getDbBase), 위치배지+바텀시트,
                        스와이프 피드(사진/영상 토글)
✅ DaetaRegisterModal — 공고 등록/수정(postingId)/취소, 계좌 실명인증
✅ DaetaHistoryView — 메모리 병렬조인(이력)
✅ /api/lovecall — SOS POST, 취소 PATCH
✅ 카카오 로그인 (결정6: 구현완료)
→ STEP3는 "신규 구축"보다 "딥링크·1탭·2티어 얹기"가 핵심
```

---

## 2. 화면 (UI 흐름)

### 2.1 딥링크 진입 (비로그인 → 공고 직행)
```
[카톡 메시지]
  "🚨 [파스쿠찌 신창점] 오늘 14시 대타 급구!
   시급 12,000원 · 4시간
   👉 pazab.app/d/AB12CD"
     │ (탭)
     ▼
[공고 미리보기] — 비로그인 OK
  ┌────────────────────────────┐
  │  🚨 오늘 대타 급구           │
  │  파스쿠찌 신창점            │
  │  14:00~18:00 · 시급 12,000  │
  │  📍 신창면 (내 위치서 1.2km) │
  │  필요: 보건증               │
  │                            │
  │  [카카오로 1탭 지원]        │  ← 여기서만 로그인 요구
  └────────────────────────────┘
     │
     ▼ (카톡 1탭 → 가입/로그인 → onboarded 분기)
[대타 피드 or 바로 이 공고에 SOS 수락 화면]
```

### 2.2 2티어 피드 (결정 4)
```
[대타 피드] (사장님이 인력 찾는 화면)
  📍 신창면 기준  🔍 변경         ← 기존 위치배지

  ─ 검증 인력 ─────────────────
  ┌──────────┐ ✅ 검증
  │ [재훈이]  │ 근태이력 · 계좌✓
  │  사진/영상 │ 1.2km
  │ [🚀 SOS] │
  └──────────┘
  ┌──────────┐ ✅ 검증
  │ [수진]    │ 팀이력
  └──────────┘

  ─ 신규 인력 ─────────────────
  ┌──────────┐ 🔵 신규
  │ [지원자A] │ 첫 대타
  │          │ 0.8km
  └──────────┘

정렬: Tier1(검증) 전부 → Tier2(신규). 각 티어 내부는 거리+매칭점수.
```

### 2.3 SOS → 정산 직전 계좌인증 (알바생, 결정5)
```
알바생 관점 (지원/수락):
  공고 수락 → [수락 완료, 정산 대기]
     │ (사장님이 최종 확정 = 돈 보낼 단계)
     ▼
  "정산을 위해 계좌를 한 번만 확인할게요"
  [계좌 실명인증]  ← 여기서 처음 요구. 이전 단계엔 0.
     │
     ▼
  매칭 성사 + worker_profiles.is_verified=true(bank_verified) 승격
  → 다음부터 Tier1
```

---

## 3. 데이터 흐름

### 3.1 딥링크 라우팅
```
pazab.app/d/[shortCode]
  → app/d/[code]/page.tsx (공개 라우트, 미들웨어 인증 가드 예외)
  → daeta_postings 조회 (shortCode → posting_id)
  → 공고 미리보기 렌더 (비로그인 OK)
  → [카카오 1탭] → auth → onboarded 분기(STEP1)
       · 신규 → 온보딩 3필드(단, 이 공고 컨텍스트 유지) → 이 공고로 복귀
       · 기존 → 바로 이 공고 수락 화면
```

### 3.2 2티어 정렬 데이터 흐름
```
대타 피드 로드:
  기준좌표(getDbBase: 가게좌표 우선 / 없으면 GPS)
  → worker_profiles 근처 조회 (lat/lng 거리 계산)
  → 각 worker: getTier() (STEP2 lib/verification.ts)
  → 정렬: tier(verified 먼저) → 거리 → 매칭점수
  → 피드 렌더 (티어별 섹션 구분)
```

### 3.3 SOS 시퀀스 (기존 lovecall 재사용 + 인증 가드)
```
사장님 [🚀 SOS]:
  → 사장님 bank_verified 체크 (결정5, 미인증→인증먼저)
  → /api/lovecall POST { daeta_posting_id, worker_id, match_score }
  → matches row 생성, 알바생에 푸시
  → 버튼 [✅ 요청완료] + [요청취소]
  → 취소 시 /api/lovecall PATCH cancel

알바생 수락 → 사장님 최종확정(정산단계):
  → 알바생 bank_verified 체크 (미인증→정산직전 인증모달)
  → 인증완료 → markVerified(reason='bank_verified') → 매칭성사
```

---

## 4. DB 변경

### 4.1 딥링크 단축코드
```sql
-- daeta_postings에 공유용 단축코드
ALTER TABLE daeta_postings ADD COLUMN IF NOT EXISTS short_code text DEFAULT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_daeta_short_code
  ON daeta_postings(short_code) WHERE short_code IS NOT NULL;
-- 생성: 6자리 base62 (앱레벨), 충돌 시 재생성
```

### 4.2 계좌인증 상태 (양쪽)
```sql
-- 사장님: employer 계정 / 알바생: worker 계정
ALTER TABLE users ADD COLUMN IF NOT EXISTS bank_verified boolean DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS bank_verified_at timestamptz DEFAULT NULL;
-- 계좌 원본은 저장 정책 주의 (PII). 인증 사실(boolean)만 보관 권장.
```

### 4.3 대타 매칭에 티어 기록 (분석/정렬 캐시)
```sql
ALTER TABLE matches ADD COLUMN IF NOT EXISTS worker_tier text DEFAULT NULL;
  -- 'verified' | 'new' — SOS 시점 스냅샷
```

### 4.4 거리 계산 (좌표 기반)
```sql
-- 옵션: PostGIS 없이 앱레벨 Haversine 사용 (현재 구조 유지)
-- 대량이면 RPC로 위경도 박스 1차 필터 후 앱에서 정밀거리
CREATE OR REPLACE FUNCTION nearby_workers(
  p_lat double precision, p_lng double precision, p_radius_km double precision
) RETURNS SETOF worker_profiles AS $$
  SELECT * FROM worker_profiles
  WHERE lat BETWEEN p_lat - (p_radius_km/111.0) AND p_lat + (p_radius_km/111.0)
    AND lng BETWEEN p_lng - (p_radius_km/88.0)  AND p_lng + (p_radius_km/88.0)
    AND is_active = true;
$$ LANGUAGE sql STABLE;
```

---

## 5. 코드 설계

### 5.1 신규/수정 파일
```
신규:
  app/d/[code]/page.tsx              — 딥링크 공개 공고 미리보기
  lib/shortcode.ts                   — base62 단축코드 생성/검증
  lib/daetaShare.ts                  — 카톡 공유 메시지 빌더
  components/daeta/TierBadge.tsx     — ✅검증 / 🔵신규 뱃지
  components/daeta/TierSection.tsx   — 티어별 섹션 래퍼

수정:
  app/daeta/page.tsx                 — 2티어 정렬/섹션 렌더, 공유버튼
  components/daeta/DaetaRegisterModal.tsx — short_code 생성, 공유 CTA
  app/api/lovecall/route.ts          — bank_verified 가드, worker_tier 스냅샷
  middleware.ts                      — /d/* 인증 예외 (공개 라우트)
```

### 5.2 lib/shortcode.ts
```typescript
const ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
export function genShortCode(len = 6): string {
  let s = "";
  for (let i = 0; i < len; i++) s += ALPHABET[Math.floor(Math.random()*62)];
  return s;
}
// 공고 등록 시: genShortCode → 중복조회 → 충돌이면 재생성 → daeta_postings.short_code
```

### 5.3 lib/daetaShare.ts (카톡 공유 메시지)
```typescript
export function buildDaetaShareText(p: {
  storeName: string; date: string; time: string;
  wage: number; shortCode: string;
}): string {
  return `🚨 [${p.storeName}] ${p.date} ${p.time} 대타 급구!\n`
       + `시급 ${p.wage.toLocaleString()}원\n`
       + `👉 https://pazab.app/d/${p.shortCode}`;
}
// 카카오 SDK 공유 or 단순 텍스트 공유 둘 다 지원
```

### 5.4 2티어 정렬 (app/daeta/page.tsx)
```typescript
import { getTier } from "@/lib/verification";

const sorted = workers
  .map(w => ({ ...w, tier: getTier(w), dist: haversine(base, w) }))
  .sort((a, b) => {
    if (a.tier !== b.tier) return a.tier === "verified" ? -1 : 1; // 검증 먼저
    if (a.dist !== b.dist) return a.dist - b.dist;                // 가까운 순
    return b.matchScore - a.matchScore;                          // 점수 높은 순
  });

const verified = sorted.filter(w => w.tier === "verified");
const fresh    = sorted.filter(w => w.tier === "new");
// → <TierSection title="검증 인력" badge="✅" items={verified} />
//   <TierSection title="신규 인력" badge="🔵" items={fresh} />
```

### 5.5 계좌인증 가드 (api/lovecall)
```typescript
// SOS POST 진입부
const { data: emp } = await supabaseAdmin
  .from("users").select("bank_verified").eq("id", employer_id).single();
if (!emp?.bank_verified) {
  return Response.json({ error: "BANK_VERIFY_REQUIRED" }, { status: 403 });
}
// 클라이언트는 이 에러코드 받으면 인증모달 오픈
```

---

## 6. 연결관계

```
STEP 3 ──consumes──> 검증풀(STEP2·4) + 좌표(STEP6) → 긴급 매칭 성사
   │
   ├─→ STEP 1: 딥링크 1탭 로그인도 온보딩 분기 통과. 공고 컨텍스트 유지가 관건.
   ├─→ STEP 2: PunchAlert가 SOS 주요 진입. getTier()/markVerified 재사용.
   │           가게좌표가 매칭 기준점.
   ├─→ STEP 4: 초대로 들어온 직원이 Tier1으로 피드 상단.
   ├─→ STEP 6: nearby_workers RPC가 좌표 인프라 위에서 작동.
   └─→ 기존 lovecall/매칭: matches 테이블 공유. worker_tier만 추가.
```

### 6.1 기존 기능 영향 (양쪽 동시 처리)
```
· /api/lovecall: 일반 러브콜과 대타 SOS가 같은 엔드포인트 →
  daeta_posting_id 유무로 분기. bank_verified 가드는 대타에만 적용.
· 딥링크 미들웨어 예외: /d/* 공개. 단 SOS/수락 액션은 로그인 필수.
· DaetaRegisterModal: 등록 성공 시 short_code 생성 + 공유 CTA 추가.
```

---

## 7. 검증

### 7.1 테스트 시나리오
```
A (딥링크 비로그인):
  시크릿창에서 pazab.app/d/{code} → 공고 미리보기 보임(로그인 전) →
  [카카오 1탭] → 가입 → 이 공고로 복귀

B (2티어 정렬):
  검증직원 + 신규지원자 섞인 상태 → 피드에서 ✅가 🔵보다 항상 위 →
  같은 티어 내 가까운 순 정렬 확인

C (사장님 계좌 가드):
  미인증 사장님 SOS → 403 BANK_VERIFY_REQUIRED → 인증모달 → 인증후 SOS 성공

D (알바생 정산직전 인증):
  알바생 가입~지원~수락까지 계좌 0회 요구 →
  사장님 최종확정(정산) 단계에서만 인증모달 → 인증후 is_verified 승격

E (GPS 비강제):
  대타 진입 시 GPS 팝업 안 뜸(가게좌표 우선) →
  "내 위치로" 눌렀을 때만 권한 요청
```

### 7.2 빌드/Git
```powershell
npx tsc --noEmit
```
```powershell
git add app/d/ lib/shortcode.ts lib/daetaShare.ts components/daeta/ app/daeta/page.tsx app/api/lovecall/route.ts middleware.ts && git commit -m "feat: 대타 wedge - 딥링크/카톡1탭/2티어풀/정산직전 계좌인증" && git push
```

---

## 부록 A — 딥링크 인프라 체크리스트
```
□ pazab.app/d/* 라우트가 미들웨어 인증에서 예외 처리됐는지
□ 카카오 공유 SDK 키 / 또는 텍스트공유 폴백
□ short_code 충돌 재생성 로직
□ 딥링크로 들어온 비로그인 유저의 공고 컨텍스트 유지(로그인 후 복귀)
□ 만료된 공고 딥링크 → "마감된 공고" 안내 화면
```

## 부록 B — 의사결정 체크리스트
```
□ 계좌 원본 저장 여부 → 권장: 인증사실(boolean)만, 원본 비저장(PII)
□ 거리 계산: 앱레벨 Haversine vs PostGIS → 초기엔 앱레벨 충분
□ 2티어를 사장님에게만 보일지, 알바생 관점에도 적용할지
□ 딥링크 미리보기에 어디까지 노출(매장명 공개 vs 익명)
```

---

*PAZAB Handbook 03 — STEP 3 대타 wedge | 2026.06.29 | ⭐ 핵심 챕터*


<div style="page-break-after:always"></div>

---

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


<div style="page-break-after:always"></div>

---

# PAZAB 핸드북 05 — STEP 5: HEXACO 분리 · 5턴 · CTA화
### 가입 동선에서 빼고, 매칭 점수 높이기로 유도
> **구현 순서**: 6번째 (마감재 — 매칭 정밀도 향상)
> **의존**: 탐색/매칭 동선
> **선행 읽기**: `00_blueprint.md`(결정 3)

---

## 1. 목표

### 1.1 문제
현재 HEXACO 10턴 인터뷰가 **가입 동선 한가운데**에 있어 최대 이탈 지점이다. 매칭의 핵심 자산이지만, 가치 체감 전에 가장 무거운 단계를 강요한다.

### 1.2 완료 정의 (DoD)
```
✅ 가입 동선에 HEXACO 없음 (STEP1이 이미 보장 — 여기선 진입점 재설계)
✅ 탐색/매칭 화면의 "매칭 점수 높이기" 배너 CTA로 진입
✅ 10턴 → 5턴 압축 (C·H·A에 턴 집중, 결정3)
✅ 결과 = 6요인 전부 표시 + 공유카드 (바이럴)
```

---

## 2. 화면

### 2.1 진입점 재설계
```
[탐색/매칭 화면 상단 배너]
  ┌────────────────────────────┐
  │ ✨ 매칭 점수 높이기          │
  │ 30초만에 나랑 맞는 가게 찾기 │
  │ [성향 분석 시작]            │
  └────────────────────────────┘

알바생 카피: "30초 만에 나랑 잘 맞는 사장님 찾기"
사장님 카피: "우리 매장에 딱 맞는 알바생 유형 찾기"
```

### 2.2 5턴 인터뷰
```
턴1: 성실성 (책임감·시간약속)  ← 가장 깊게
턴2: 정직성 (노쇼·신뢰)        ← 깊게
턴3: 원만성 (협업·갈등)
턴4: 외향성+감정성 (묶어서 가볍게)
턴5: 개방성 + 종합 마무리
   ↓
[결과 카드] 6요인 레이더 + 유형명 + 강점/주의 + [공유하기]
```

---

## 3. 데이터 흐름

```
배너 [성향 분석 시작] → /interview (진입점만 변경, 가입과 분리)
  → Claude API 5턴 대화 (프롬프트: C·H·A 신호 집중 추출)
  → 6요인 점수 산출 (C·H·A 정밀 / E·X·O 거친 추정)
  → users.worker_result(or employer_result) JSON 저장
  → hexaco_data 폴백 체인에 반영 (profiles → users.result.hexaco)
  → 결과카드 → 공유 (SNS 바이럴 루프)
  → 매칭 재계산 (기존 /api/match)
```

---

## 4. DB 변경

```sql
-- 기존 구조 활용. 추가 컬럼 최소.
-- HEXACO 완료 여부 + 턴 버전 추적
ALTER TABLE users ADD COLUMN IF NOT EXISTS hexaco_done boolean DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS hexaco_version text DEFAULT '5turn';
-- 결과는 기존 worker_result / employer_result JSON 재사용
-- hexaco_data 폴백: profiles.hexaco_data → users.result.hexaco → DEFAULT{3,3,3,3,3,3}
```

---

## 5. 코드 설계

```
수정:
  app/interview/page.tsx       — 10턴 → 5턴, C·H·A 집중 프롬프트
  app/explore/page.tsx         — "매칭 점수 높이기" 배너 추가
  app/employer/dashboard/page.tsx — 사장님용 배너 (STEP2 연계)
  app/result/page.tsx          — 6요인 결과카드 (기존 유지)
  lib/hexacoPrompt.ts (신규)    — 5턴 프롬프트 + 요인별 가중 추출
```

```typescript
// lib/hexacoPrompt.ts — 턴별 집중 요인
export const TURN_FOCUS = [
  { turn: 1, factors: ["conscientiousness"], depth: "deep" },
  { turn: 2, factors: ["honesty"], depth: "deep" },
  { turn: 3, factors: ["agreeableness"], depth: "normal" },
  { turn: 4, factors: ["extraversion", "emotionality"], depth: "light" },
  { turn: 5, factors: ["openness"], depth: "light" }, // + 종합
];
// 키: 소문자 풀스트링 (honesty, conscientiousness...) — 프로젝트 규약 준수
```

> 규약: HEXACO 키는 소문자 풀스트링. Big5 금지. AiGate 경유(createPazClient).

---

## 6. 연결관계

```
STEP 5 ──improves──> 매칭 점수 정밀도
   ├─→ STEP 1: 가입 동선 밖으로 분리 = STEP1 설계의 완성
   ├─→ STEP 2: 사장님 대시보드에도 배너 (HR 맥락에서 자연 유도)
   ├─→ STEP 3: 정직성(H) 정밀화 → 대타 노쇼 예측 강화
   └─→ 기존 /api/match: hexaco_data 폴백 체인 그대로, 정밀도만 향상
```

---

## 7. 검증

```
A: 가입 플로우에 HEXACO 안 나옴 (STEP1 동선 확인)
B: 탐색 배너 [성향분석] → 5턴 완료 → 결과카드 6요인 표시
C: C·H·A 점수가 E·X·O보다 응답 기반 분산 큼 (정밀 측정 확인)
D: 결과 후 /api/match 재계산 → 매칭점수 변동 확인
E: 공유카드 SNS 공유 동작
```

```powershell
git add app/interview/page.tsx app/explore/page.tsx app/employer/dashboard/page.tsx lib/hexacoPrompt.ts && git commit -m "feat: HEXACO 분리·5턴 압축·매칭점수 높이기 CTA화 (C·H·A 집중)" && git push
```

---

*PAZAB Handbook 05 — STEP 5 HEXACO 분리·CTA화 | 2026.06.29*


<div style="page-break-after:always"></div>

---

# PAZAB 핸드북 06 — STEP 6: 좌표 수집 전략
### 동네좌표 필수 + 정밀 GPS는 대타 순간만
> **구현 순서**: 4번째 (대타 매칭 인프라)
> **의존**: STEP 1(가입 3필드에 위치 포함)
> **선행 읽기**: `00_blueprint.md`(결정 7)

---

## 1. 목표

### 1.1 문제
대타·지역매칭은 좌표가 생명이라 **안 받으면 안 된다.** 하지만 GPS 강제 팝업은 피로도 최악(대타에서 이미 제거한 이력 있음). 둘을 화해시킨다.

### 1.2 완료 정의 (DoD)
```
✅ 모든 가입자가 주소검색만으로 읍면동 중심좌표 보유 (권한 팝업 0)
✅ 대타 SOS 등 "지금 여기" 순간에만 정밀 GPS "내 위치로" 버튼
✅ 읍면동 좌표만으로 지역 가중치 3단계(읍면동/구군/시도) 전부 작동
```

---

## 2. 화면

```
[필수 — 가입/셋업 3필드의 위치]
  [📍 동네 검색_________]  ← 주소 자동완성 (Kakao Local)
  → 선택 시 읍면동 중심좌표 자동 저장 (팝업 없음)

[선택 — 대타 피드 위치배지 (기존 구현)]
  📍 신창면 기준  🔍 변경
  → 바텀시트: [📍 내 위치로(GPS)] [🏪 매장 위치] [🔍 주소 검색]
     · "내 위치로" 누를 때만 GPS 권한 요청
```

---

## 3. 데이터 흐름

```
[가입 시점]
  주소문자열 → Kakao Local API → { lat, lng, sido, sigungu, eupmyeondong }
  → worker_profiles / employer_profiles 의 lat/lng + region 저장
  (STEP1 resolveAddress() 재사용)

[대타 시점]
  기준좌표 우선순위: 가게좌표(getDbBase) → 저장된 동네좌표 → GPS(버튼 시)
  → nearby_workers RPC (STEP3 4.4) 거리 박스 필터 → 앱 정밀거리
```

---

## 4. DB 변경

```sql
-- 좌표 컬럼은 STEP1 4.2에서 이미 추가됨 (lat/lng).
-- 여기선 region 3단계 파싱 보강 + 인덱스
CREATE INDEX IF NOT EXISTS idx_worker_lat_lng  ON worker_profiles(lat, lng);
CREATE INDEX IF NOT EXISTS idx_employer_lat_lng ON employer_profiles(lat, lng);

-- region 문자열 → 3단계 일관성 (기존 더미: '충남 아산시 신창면')
-- 파싱 규칙은 앱레벨 getRegionMatchLevel (explore에 이미 존재)
```

---

## 5. 코드 설계

```
수정:
  lib/onboarding.ts (STEP1)    — resolveAddress() 좌표+3단계 반환 (공용)
  app/onboarding/page.tsx      — 주소검색 → 좌표저장
  app/employer/setup/page.tsx  — 동일 (STEP2)
  app/daeta/page.tsx           — 기준좌표 우선순위 로직 (기존 getDbBase 보강)
  lib/geo.ts (신규)            — haversine 거리 + region 파싱 유틸
```

```typescript
// lib/geo.ts
export function haversine(a: {lat:number;lng:number}, b: {lat:number;lng:number}): number {
  const R = 6371, dLat = rad(b.lat-a.lat), dLng = rad(b.lng-a.lng);
  const x = Math.sin(dLat/2)**2 + Math.cos(rad(a.lat))*Math.cos(rad(b.lat))*Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1-x)); // km
}
const rad = (d:number) => d*Math.PI/180;

export type RegionLevel = "same-dong"|"same-gu"|"same-sido"|"other";
export function getRegionMatchLevel(a: string, b: string): RegionLevel { /* 3단계 파싱 */ }
```

---

## 6. 연결관계

```
STEP 6 ──infra──> 좌표/거리 → 대타·지역매칭의 토대
   ├─→ STEP 1: 가입 3필드 위치가 좌표 확보 지점
   ├─→ STEP 2: 가게좌표가 대타 기준점(getDbBase)
   ├─→ STEP 3: nearby_workers RPC + haversine로 2티어 피드 거리정렬
   └─→ 기존 /api/match: 지역 가중치 3단계 (읍면동+12/구군+4/타시도-15) 그대로
```

---

## 7. 검증

```
A: "신창면" 주소검색 → lat/lng 저장, region='충남 아산시 신창면'
B: 가입 시 GPS 권한 팝업 안 뜸
C: 대타 "내 위치로" 눌렀을 때만 GPS 요청
D: 읍면동 좌표만으로 매칭 지역가중치 3단계 작동 (분포 65~95 확인)
E: nearby_workers 박스필터 → 반경 내 알바생만 피드
```

```powershell
git add lib/geo.ts lib/onboarding.ts app/onboarding/page.tsx app/employer/setup/page.tsx app/daeta/page.tsx && git commit -m "feat: 좌표 수집 전략 - 동네좌표 필수(주소검색)/GPS는 대타만/거리정렬 인프라" && git push
```

---

*PAZAB Handbook 06 — STEP 6 좌표 수집 전략 | 2026.06.29*
