# PAZAB 개발 인수인계 문서
**작성일:** 2026-07-01  
**작성시간:** 19:39  
**브랜치:** `main`  
**작업 범위:** 근로계약서 UI 개선 + 온보딩 단순화 + 주소 수집 정책 정립

---

## 1. 이번 세션 완료 작업 전체 목록

### 1-1. 근로계약서 종류 표시 순서 변경 (`app/contract/page.tsx`)
- **변경 전:** 단시간 → 무기계약 → 기간제 → 연소근로자
- **변경 후:** 무기계약 → 기간제 → 연소근로자 → 단시간 (표준 근로계약서 순서)
- 기본 선택값도 `parttime` → `standard_unlimited`(무기계약)으로 변경

---

### 1-2. 근로계약서 — 업장 자동 선택 & 사업체 정보 자동 채움

#### 문제
- 계약서 작성 진입 시 사업체 정보를 매번 수동 입력해야 했음
- 사장님이 여러 업장을 운영할 수 없었음 (`employer_profiles.user_id UNIQUE` 제약)

#### 변경 내용 (`app/contract/page.tsx`)
- `myEps` state: 현재 로그인 사장님의 전체 업장 목록 로드
- `selEp` state: 선택된 업장
- `loadInit()` 함수: 진입 시 업장 목록 자동 조회 → 첫 번째 업장 자동 선택
- `applyEpToForm()` 함수: 선택된 업장의 `business_name`, `ceo_name`, `biz_reg_number`, `biz_address`, `biz_tel` → 폼 자동 채움
- `buildFullAddr()` 함수: `biz_address` → `address` → `sido+sigungu+eupmyeondong` → `region` 순으로 전체 주소 조합
- **계약서 종류 선택 화면 상단**에 업장 선택 버튼(알약형) 추가 + 선택된 업장 정보 미리보기 카드
- **사업체 탭 내부**에도 업장 선택 버튼 — 폼 작성 중 업장 전환 가능
- 계약서 저장 시 `employer_profiles.address`, `biz_address`, `ceo_name`, `biz_reg_number`, `biz_tel` 동기화 업데이트

#### DB 마이그레이션 필요 (`supabase/patch_employer_multi_biz.sql`)
```sql
-- 반드시 Supabase 대시보드에서 실행 필요
-- employer_profiles.user_id UNIQUE 제약 제거 → 1사장 N업장 지원
-- biz_reg_number, ceo_name, biz_address, biz_tel 컬럼 없으면 추가
```

#### 쿼리 안전성
- 확장 컬럼(`biz_reg_number` 등) 없을 경우 기본 컬럼만으로 폴백 재시도
- `address_detail` 등 없는 컬럼 선택 시 전체 쿼리 실패하던 버그 해결

---

### 1-3. 주소 수집 정책 정립 (결정 사항)

#### 확정된 정책
| 저장 | 표시 |
|------|------|
| `address` = 도로명 전체 (신규) | 계약서 → `address` 전체 표시 |
| `region` = 시도+구군+읍면동 (기존 유지) | 공고/지도 → `region` |
| `lat`, `lng` = 좌표 (기존 유지) | 알바생 프로필 → `eupmyeondong`만 |

#### 등록 페이지 수정 (`app/employer/register/page.tsx`)
- form state에 `fullAddress` 필드 추가
- **Daum 우편번호 검색** 완료 시 `fullAddress` 저장 → DB `address` 컬럼에 기록
- **카카오 키워드 검색** 매장 선택 시 `fullAddress` 저장 + `gugun`(구군) 누락 버그 수정
  - 기존: `parts[0]`(sido)만 저장, `parts[1]`(gugun) 누락
  - 수정: `parts[1]`도 `gugun`으로 저장
- 저장 payload에 `address: form.fullAddress || sido+gugun+addressDetail 조합` 추가
- 기존 프로필 로드 시 `fullAddress: profile.address || profile.region` 복원

#### 기존 데이터 처리
- 기존 업장(`region`="매곡리"만 있는 경우): 등록 페이지에서 주소 재검색 후 저장하면 `address` 컬럼 업데이트됨
- 계약서 작성 시 주소 입력 후 저장하면 `biz_address`와 `address` 동시 업데이트

---

### 1-4. 온보딩 전면 단순화 (`app/onboarding/page.tsx`)

#### 변경 전
- 동네 검색 (Kakao Local)
- 관심 분야 칩 (최대 3개)
- 가능한 때 (평일/주말/상관없음)
- [시작하기] 버튼

#### 변경 후 — 버튼 2개만
```
👋 어떻게 시작할까요?

[🏪 사장님이에요]   → user_type=employer 저장 → 홈
[👷 알바 찾아요]    → user_type=worker 저장 → 홈
```
- 주소/업종/시간 입력 제거
- 사장님 선택 시 `employer_profiles` 빈 row 자동 생성 (`is_active=false`)
- 소셜 로그인 1번 + 역할 선택 1번으로 온보딩 완료

#### 근거
- 주소는 온보딩에서 받을 필요 없음 — GPS 또는 탐색 화면에서 필요 시 설정
- 역할 선택은 첫 화면 포커스를 위해 유지 (2버튼이면 허들 아님)
- 알바생: 온보딩 후 내소속(빈 상태) → "공고 탐색하기" 자연 유도
- 사장님: 온보딩 후 내팀(빈 상태) → "매장 등록하기" 자연 유도

---

### 1-5. 내팀 페이지 빈 상태 개선 (`app/myteam/page.tsx`)

#### 사장님 — 매장 없을 때
```
🏪
아직 매장이 없어요
매장을 등록하면 팀원을 초대하고 근태·급여를 관리할 수 있어요
[매장 등록하기 →]   → /employer/register
```

#### 사장님 — 매장 있지만 팀원 없을 때
```
👥
아직 팀원이 없어요
초대 코드로 직원을 팀에 합류시켜보세요
[📨 팀원 초대하기]   → InviteBottomSheet 열기
```

---

### 1-6. 초대 모달 안내 문구 강화 (`components/InviteBottomSheet.tsx`)

#### 추가된 내용
- **💡 안내 배너**: "초대하려는 직원이 파잡에 먼저 가입되어 있어야 해요 / 가입 시 설정한 닉네임으로 검색할 수 있어요"
- **검색 결과 없을 때**: 단순 에러 텍스트 → "직원이 아직 파잡에 가입하지 않았을 수 있어요. 가입 후 다시 검색해주세요." 안내 박스로 개선

---

## 2. 현재 파일 상태 (수정된 파일 목록)

| 파일 | 변경 내용 |
|------|---------|
| `app/contract/page.tsx` | 업장 자동 선택, 주소 자동채움, 계약서 종류 순서, 저장 시 address 동기화 |
| `app/employer/register/page.tsx` | fullAddress 필드 추가, Daum/카카오 주소 전체 저장, gugun 누락 버그 수정 |
| `app/onboarding/page.tsx` | 3필드 → 2버튼으로 전면 교체 |
| `app/myteam/page.tsx` | 매장 없을 때 CTA, 팀원 없을 때 CTA 개선 |
| `components/InviteBottomSheet.tsx` | 가입 안내 배너, 검색 실패 안내 박스 추가 |
| `supabase/patch_employer_multi_biz.sql` | 신규 — DB 마이그레이션 SQL |

---

## 3. DB 변경 필요 사항 (미실행)

### 3-1. `supabase/patch_employer_multi_biz.sql` 실행 필요
```sql
-- employer_profiles.user_id UNIQUE 제약 제거
-- idx_employer_profiles_user_id 인덱스 추가
-- biz_reg_number, ceo_name, biz_address, biz_tel 컬럼 추가 (없으면)
```
→ **Supabase 대시보드 → SQL Editor에서 직접 실행**

### 3-2. employer_profiles.address 컬럼 확인
- 기존 `address` 컬럼이 DB에 있는지 확인 (스키마 파일엔 있으나 실제 DB는 별도 확인 필요)
- 없으면 `ALTER TABLE employer_profiles ADD COLUMN IF NOT EXISTS address text;`

---

## 4. 미완성 / 다음 세션에서 할 일

### 4-1. 기존 업장 주소 데이터 보완
- 파스쿠찌 탕정역점 등 기존 등록 업장의 `address` 컬럼이 비어있음
- 해결: 업장 등록 페이지에서 주소 재검색 후 저장 OR Supabase에서 직접 입력
- `buildFullAddr()` 우선순위: `biz_address` → `address` → `sido+sigungu+eupmyeondong` → `region`

### 4-2. 온보딩 이후 흐름 점검
- 새 가입자가 온보딩 2버튼 → 홈 → 내팀/내소속 진입 시 빈 상태 CTA 동작 확인
- 사장님 → 내팀 → "매장 등록하기" → `/employer/register` 흐름 테스트 필요

### 4-3. 근로계약서 matchId 없이 직접 작성 (미구현)
- 현재 matchId 없으면 `selMatch`가 null → 저장 시 `buildPayload()`에서 크래시
- 팀원 직접 지정 후 계약서 작성하는 흐름 설계 필요
- `team_member_id` 기반으로 전환하는 것이 더 깔끔할 수 있음 (이전 handover 참조)

### 4-4. 업장 관리 페이지 (미구현)
- 현재 업장 수정은 `/employer/register?edit=true&jobId=...` 로만 접근 가능
- 공고 등록과 분리된 "업장 정보만 관리"하는 전용 페이지 필요
- 여러 업장 등록/삭제/수정 UI

### 4-5. GPS 기반 위치 설정 (미구현)
- 온보딩에서 주소 입력 제거 → 탐색 화면에서 GPS 또는 지역 검색으로 대체
- 탐색 화면 상단에 "📍 지역 설정" 칩 추가 필요

---

## 5. 아키텍처 결정 사항 (이번 세션)

### 5-1. 역할 선택 유지 결정
- 논의: 역할 선택 없이 행동으로 추론 vs 처음에 2버튼으로 선택
- **결정: 2버튼 선택 유지** — 첫 화면 포커스 명확, 허들 낮음
- 근거: 탭 4개 모두 빈 상태보다 역할에 맞는 1개 펼쳐진 상태가 UX 우월

### 5-2. 주소 수집 타이밍 정책
- **온보딩**: 주소 안 받음 (허들 제거)
- **알바생 주소**: 계약서 작성 시 등본지 주소 수집
- **사장님 주소**: 업장 등록 시 도로명 전체 수집 (`address` 컬럼)
- **표시 정책**: 공개 UI는 `eupmyeondong`/`region`만, 계약서는 `address` 전체

---

## 6. 현재 알려진 이슈

| 이슈 | 상태 | 비고 |
|------|------|------|
| 기존 업장 `address` 컬럼 비어있음 | 데이터 수동 보완 필요 | Supabase 직접 수정 or 등록 페이지 재저장 |
| `patch_employer_multi_biz.sql` 미실행 | DB 적용 필요 | 1사장 N업장 다중 지원 |
| 계약서 matchId 없을 때 저장 불가 | 미구현 | team_member_id 기반 재설계 필요 |
| `employer_profiles` UNIQUE 제약 | DB 마이그레이션 전까지 다중 업장 불가 | 위 SQL 실행으로 해결 |

---

*PAZAB Dev Handover | 2026-07-01 19:39*
