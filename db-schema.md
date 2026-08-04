# PAZAB v2 — DB 스키마 실측 기록
> 2026-07-09 Supabase information_schema 직접 조회 기준 | clrjxxkgceluvzvrkvyl  
> 2026-07-09 API 코드 컬럼 오류 수정 (users.name, employer_profiles.wage/work_days/work_hours 없음 확인)

---

## 목차
1. [테이블 목록](#1-테이블-목록)
2. [테이블별 실제 컬럼](#2-테이블별-실제-컬럼)
3. [중복/레거시 필드 현황](#3-중복레거시-필드-현황)
4. [SOURCE OF TRUTH 정의](#4-source-of-truth-정의)
5. [남은 정리 대상](#5-남은-정리-대상)

---

## 1. 테이블 목록

| 테이블 | 상태 | 비고 |
|--------|------|------|
| attendance | ✅ 사용 중 | clock_in/out DROP 완료, check_in/out SOT |
| attendance_logs | ✅ 사용 중 | 감사 로그 |
| bot_chat_logs | ✅ 사용 중 | AI 상담 로그 |
| chats | ✅ 사용 중 | 실제 채팅 테이블 |
| contracts | ✅ 사용 중 | |
| daeta_postings | ✅ 사용 중 | 긴급 대타 공고. `status`: 'pending'\|'matched'(매칭 확정, 수정·재취소 불가)\|'expired'(응답 없이 근무시작시각 경과, 조회 시점에 자동 처리)\|'completed'\|'cancelled' |
| employer_profiles | ✅ 사용 중 | 공고 레거시 컬럼 DROP 완료 |
| invite_codes | ✅ 사용 중 | |
| job_categories | ✅ 사용 중 | 마스터 테이블 |
| job_credentials | ✅ 사용 중 | 마스터 테이블 |
| jobs | ✅ 사용 중 | |
| matches | ✅ 사용 중 | |
| min_wages | ✅ 사용 중 | 최저임금 연도별 |
| notifications | ✅ 사용 중 | |
| paz_chats | ✅ 신규 생성 | PAZ AI 채팅 히스토리 |
| paz_memory | ✅ 사용 중 | PAZ AI 사용자 메모리 |
| payslips | ✅ 사용 중 | 중복 컬럼 DROP 완료 |
| push_subscriptions | ✅ 사용 중 | VAPID |
| ai_usage_logs | ✅ 신규 생성 | AI 호출 비용 추적 |
| interviews | ✅ 신규 생성 | 사전미팅/인터뷰 기록 |
| trust_score_logs | ✅ 신규 생성 | 신뢰도 변동 이력 |
| sudoku_ratings | ✅ 사용 중 | |
| sudoku_records | ✅ 사용 중 | |
| tax_rates | ✅ 사용 중 | 세율 |
| team_members | ✅ 사용 중 | |
| team_member_documents | ⏳ 스키마만 작성 (2026-07-24) | 서류함(등본/보건증/통장사본) — `supabase/patch_team_documents.sql`, 미실행. UI/API 미구현 |
| user_badges | ✅ 사용 중 | |
| users | ✅ 사용 중 | name 컬럼 DROP 완료 |
| worker_profiles | ✅ 사용 중 | trust_score/grade DROP 완료 |
| worker_career_entries | ✅ 신규 생성 (2026-08-04) | 파잡 밖 경력 직접입력 (사용자 SQL 에디터 실행), SELECT 공개/CUD 본인전용 |
| ~~chatrooms~~ | 🗑️ DROP 완료 | messages와 쌍, 레거시 |
| ~~messages~~ | 🗑️ DROP 완료 | chatrooms 쌍, 레거시 |
| ~~job_postings~~ | 🗑️ DROP 완료 | jobs로 대체 |

---

## 2. 테이블별 실제 컬럼

### attendance
| 컬럼 | 타입 | Null | 기본값 | 비고 |
|------|------|------|--------|------|
| id | uuid | NO | gen_random_uuid() | |
| team_member_id | uuid | NO | | |
| employer_id | uuid | NO | | |
| worker_id | uuid | YES | | |
| work_date | date | NO | | |
| status | text | YES | 'absent' | |
| memo | text | YES | | |
| actual_hours | float8 | YES | 0 | |
| check_in | timestamptz | YES | | ✅ SOT |
| check_out | timestamptz | YES | | ✅ SOT |
| created_at | timestamptz | NO | now() | |

> ~~clock_in / clock_out~~ — DROP 완료 (check_in/check_out SOT)

---

### employer_profiles
| 컬럼 | 타입 | Null | 기본값 | 비고 |
|------|------|------|--------|------|
| id | uuid | NO | gen_random_uuid() | |
| user_id | uuid | YES | | |
| business_name | text | YES | | |
| business_type | text | YES | | |
| description | text | YES | | |
| region | text | YES | | ✅ 도로명 주소 SOT |
| sido/sigungu/eupmyeondong | text | YES | | 지역 필터용 |
| address | text | YES | | ✅ region과 동일 (신규 저장 기준) |
| address_detail | text | YES | | ✅ 세부주소 SOT |
| lat/lng | float8 | YES | | |
| hr_only | boolean | YES | true | |
| is_active | boolean | YES | true | |
| is_deleted | boolean | NO | false | |
| created_at/updated_at | timestamptz | NO | now() | |
| geo_radius_meters | integer | YES | 200 | |
| biz_reg_number/ceo_name/biz_tel | text | YES | | 사업자 정보 |
| image_url | text | YES | | ✅ 대표 이미지 (business_image_url DROP 완료) |
| image_urls | text[] | YES | '{}' | |
| video_url | text | YES | | |
| category_id | uuid | YES | | |
| category_ids | uuid[] | YES | '{}' | |
| custom_category | text | YES | | |
| view_count/like_count | integer | YES | 0 | |
| employer_type | text | YES | | |
| bot_knowledge | text | YES | | |
| bot_interview_done | boolean | YES | false | |
| bot_last_checked_at | timestamptz | YES | | |
| is_5_or_more_employees | boolean | YES | true | ✅ 상시근로자 5인 이상 여부 — 연장/야간 가산수당(근로기준법 제56조) 적용 대상 판정용. 미설정(null)은 안전하게 5인 이상으로 간주 |

> 공고 레거시 컬럼 DROP 완료: `job_status`, `job_type`, `wage`, `wage_negotiable`, `work_days`, `days_negotiable`, `work_hours`, `work_start_hour`, `work_end_hour`, `work_start_date`, `work_end_date`, `expires_at`, `is_urgent`, `is_long_term`, `meal_provided`, `parking`, `staff_count`, `tags`, `required_credentials`, `hexaco_data`, `bio5_data`, `analyzed_mbti`, `tagline`, `best_matches`, `worst_matches`, `caution`, `employer_bot_knowledge`

> ⚠️ **`wage`, `work_days`, `work_hours` 컬럼 없음** — jobs 테이블 분리 이후 DROP 완료. API SELECT 시 이 컬럼 참조 금지.

---

### jobs
| 컬럼 | 타입 | Null | 기본값 | 비고 |
|------|------|------|--------|------|
| id | uuid | NO | gen_random_uuid() | |
| employer_profile_id | uuid | NO | | |
| user_id | uuid | NO | | |
| wage/wage_negotiable | integer/bool | YES | | ✅ |
| work_days/days_negotiable | text/bool | YES | | ✅ |
| work_hours | text | YES | | ✅ |
| work_start_hour/work_end_hour | integer | YES | | |
| work_start_date/work_end_date | date | YES | | |
| job_type | text | YES | 'parttime' | |
| staff_count | integer | YES | 1 | |
| tags | text[] | YES | | |
| required_credentials | jsonb | YES | | |
| category_id/category_ids | uuid/uuid[] | YES | | |
| custom_category | text | YES | | |
| meal_provided/parking/is_urgent | boolean | YES | false | |
| tagline | text | YES | | |
| employer_type | text | YES | | |
| best_matches/worst_matches | text[] | YES | | |
| caution | text | YES | | |
| analyzed_mbti | text | YES | | |
| bio5_data/hexaco_data | jsonb | YES | | 🔴 users 중복 |
| bot_knowledge | text | YES | | |
| bot_interview_done | boolean | YES | false | |
| is_active | boolean | YES | false | |
| expires_at | timestamptz | YES | | |
| created_at/updated_at | timestamptz | YES | now() | |
| like_count/view_count | integer | YES | 0 | |

---

### matches
| 컬럼 | 타입 | Null | 기본값 | 비고 |
|------|------|------|--------|------|
| id | uuid | NO | gen_random_uuid() | |
| employer_id | uuid | NO | | |
| worker_id | uuid | NO | | |
| ~~job_posting_id~~ | uuid | YES | | 🗑️ DROP 예정 (레거시) |
| daeta_posting_id | uuid | YES | | 대타 공고 연결 |
| ~~worker_tier~~ | uuid | YES | | 🗑️ DROP 예정 (레거시) |
| job_id | uuid | YES | | ✅ jobs.id FK |
| match_score | integer | YES | 0 | |
| progress_status | text | YES | 'pending' | ✅ SOT (status DROP 완료) |
| matched_at | timestamptz | YES | now() | |
| interview_at | timestamptz | YES | | |
| interview_memo | text | YES | | |
| employer_left/worker_left | boolean | YES | false | |
| hire_confirmed_by_employer/worker | boolean | YES | false | |
| initiated_by | uuid | YES | | |
| created_at/updated_at | timestamptz | NO | now() | |

> ⚠️ `employer_profile_id` 컬럼 없음  
> ~~status~~ 레거시 — DROP 완료 (progress_status SOT)
> ~~job_posting_id, worker_tier~~ — DROP 예정 (참조 코드 없음)

---

### team_members
| 컬럼 | 타입 | Null | 기본값 | 비고 |
|------|------|------|--------|------|
| id | uuid | NO | gen_random_uuid() | |
| employer_id | uuid | NO | | |
| worker_id | uuid | YES | | NULL = 초대 미수락 |
| employer_profile_id | uuid | YES | | 소속 매장 |
| match_id | uuid | YES | | |
| nickname | text | YES | | 팀 내 별명 |
| role_desc | text | YES | | 직책 설명 |
| member_role | text | YES | 'staff' | 'staff'\|'manager' |
| status | text | YES | 'active' | 'active'\|'inactive'\|'left' |
| contract_status | text | YES | 'none' | 'none'\|'pending'\|'active' |
| invite_status | text | YES | 'none' | 'none'\|'invited'\|'joined' |
| invited_at | timestamptz | YES | | |
| hire_date | date | YES | | ✅ DATE 타입 |
| wage | integer | YES | | |
| work_days | text | YES | | |
| work_hours | text | YES | | |
| geo_checkin | boolean | YES | true | |
| docs_submitted | jsonb | YES | '{}' | |
| payslip_auto_issue | boolean | YES | false | |
| payslip_auto_issue_offset | integer | YES | 0 | |
| payslip_payday_fallback | integer | YES | 10 | |
| created_at/updated_at | timestamptz | NO | now() | |

> ⚠️ `hired_at` 없음 — `hire_date`(DATE) 사용  
> ⚠️ `user_id` 없음 — `worker_id` / `employer_id` 직접 사용

---

### users
| 컬럼 | 타입 | Null | 기본값 | 비고 |
|------|------|------|--------|------|
| id | uuid | NO | | auth.users PK |
| email | text | YES | | |
| nickname | text | YES | | ✅ 표시용 이름 SOT |
| nickname_lower | text | YES | | 검색 인덱스 (선택 사항) |
| real_name | text | YES | | ✅ 법적 이름 (계약서) |
| avatar_url | text | YES | | ✅ 프로필 이미지 |
| phone | text | YES | | |
| user_type | text | YES | | ✅ 'employer'\|'worker'\|'both' SOT |
| ~~role_inferred~~ | text | YES | | 🗑️ DROP 예정 (레거시) |
| onboarded | boolean | YES | false | |
| ~~onboarding_data~~ | jsonb | YES | | 🗑️ DROP 예정 (레거시) |
| bank_verified | boolean | YES | false | |
| bank_verified_at | timestamptz | YES | | |
| hexaco_done | boolean | YES | false | |
| hexaco_version | text | YES | '5turn' | |
| worker_result | jsonb | YES | | ✅ HEXACO 분석 결과 SOT |
| employer_result | jsonb | YES | | ✅ |
| trust_score | integer | YES | 50 | ✅ SOT |
| grade | text | YES | 'bronze' | ✅ SOT |
| daeta_cancel_suspended_until | timestamptz | YES | | ✅ 확정된 대타 취소 페널티 — 이 시각까지 대타 등록(사장님)/지원(알바생) 제한 |
| is_active | boolean | YES | true | |
| profile_completed | boolean | YES | false | |
| ~~push_token~~ | text | YES | | 🗑️ DROP 예정 (레거시) |
| ~~kakao_id~~ | text | YES | | 🗑️ DROP 예정 (레거시) |
| region | text | YES | | |
| address | text | YES | | |
| address_detail | text | YES | | |
| birth_date | date | YES | | |
| employer_bot_knowledge | text | YES | | |
| created_at/updated_at | timestamptz | NO | now() | |

> ~~name~~ 컬럼 DROP 완료 → `nickname` SOT  
> ~~profile_image_url~~ 컬럼 DROP 완료 → `avatar_url` SOT  
> ~~role_inferred, onboarding_data, push_token, kakao_id~~ — DROP 예정 (참조 코드 없음)  
> ⚠️ `role` 없음 — `user_type` 사용

---

### worker_profiles
| 컬럼 | 타입 | Null | 기본값 | 비고 |
|------|------|------|--------|------|
| id | uuid | NO | gen_random_uuid() | |
| user_id | uuid | YES | | |
| birth_year | integer | YES | | |
| gender | text | YES | | |
| bio | text | YES | | |
| image_url | text | YES | | ✅ 대표 이미지 (profile_image_url DROP 완료) |
| image_urls | text[] | YES | '{}' | |
| video_url | text | YES | | |
| job_categories | text[] | YES | '{}' | |
| desired_type | text | YES | | |
| worker_type | text | YES | | |
| available_days | text[] | YES | '{}' | |
| available_hours | text | YES | | |
| available_now | boolean | YES | false | |
| desired_wage | integer | YES | | |
| region | text | YES | | |
| sido/sigungu/eupmyeondong | text | YES | | |
| lat/lng | float8 | YES | | |
| address | text | YES | | |
| desired_region | text | YES | | 🔴 region과 중복 |
| is_verified | boolean | YES | false | |
| verified_reason | text | YES | | |
| bio5_data | jsonb | YES | | |
| analyzed_mbti | text | YES | | |
| best_matches/worst_matches | text[] | YES | '{}' | |
| experience | text | YES | | |
| experience_months | integer | YES | 0 | |
| is_active/is_public | boolean | YES | true | |
| tagline | text | YES | | |
| view_count/like_count/work_count | integer | YES | 0 | |
| created_at/updated_at | timestamptz | NO | now() | |

> ~~trust_score / grade~~ DROP 완료 → `users.trust_score / grade` SOT  
> ~~name~~ DROP 완료 → `users.nickname` SOT  
> ~~profile_image_url / hexaco_data~~ DROP 완료 → `users.worker_result.hexaco` SOT

---

### contracts
| 컬럼 | 타입 | Null | 기본값 |
|------|------|------|--------|
| id | uuid | NO | gen_random_uuid() |
| employer_id/worker_id | uuid | NO | |
| team_member_id/match_id | uuid | YES | |
| contract_type | text | YES | 'parttime' |
| start_date/end_date | date | YES | |
| wage | integer | YES | |
| wage_type | text | YES | 'hourly' | ✅ 'hourly'\|'daily'\|'monthly' |
| work_hours/work_days | text | YES | |
| duties | text | YES | |
| workplace_address | text | YES | |
| employer_signed/worker_signed | boolean | YES | false |
| employer_signed_at/worker_signed_at | timestamptz | YES | |
| pdf_url | text | YES | |
| status | text | YES | 'draft' | ✅ 'draft'\|'pending'\|'active'\|'cancelled'\|'superseded' |
| contract_data | jsonb | YES | | ✅ 모든 위자드 입력값 SOT |
| created_at | timestamptz | NO | now() |

> ✅ `contract_data.wageType`: 'hour'\|'day'\|'month' (위자드 내부값)  
> ✅ `contracts.wage_type`: 'hourly'\|'daily'\|'monthly' (DB 저장값, 변환 후 저장)  
> ⚠️ 공식 양식 PDF 생성 시 `docs/standard_contract_form.pdf` 필요 (고용노동부 공식 다중페이지 PDF)

---

### payslips
| 컬럼 | 타입 | Null | 기본값 | 비고 |
|------|------|------|--------|------|
| id | uuid | NO | gen_random_uuid() | |
| employer_id | uuid | NO | | |
| worker_id/team_member_id/match_id | uuid | YES | | |
| pay_period_start/end | date | YES | | |
| year/month | integer | YES | | |
| wage | integer | YES | | ✅ SOT |
| total_hours | numeric | YES | | |
| work_days | integer | YES | | |
| overtime_hours | numeric | YES | | |
| base_pay/overtime_pay | integer | YES | | |
| weekly_holiday_pay | integer | YES | 0 | ✅ 주휴수당(근로기준법 제55조), 계약서 wageIncludesWeeklyPay 선언 시 0 |
| total_pay | integer | YES | | ✅ SOT (base_pay + overtime_pay + weekly_holiday_pay) |
| deductions | integer | YES | 0 | |
| income_tax/local_tax | integer | YES | 0 | |
| health_insurance/employment_insurance/national_pension | integer | YES | 0 | |
| total_deductions | integer | YES | 0 | |
| net_pay | integer | YES | | ✅ SOT |
| attendance_data | jsonb | YES | | |
| status | text | YES | 'issued' | |
| memo/correction_reason | text | YES | | |
| issued_at/confirmed_at/created_at | timestamptz | NO/YES | now() | |

> ~~base_wage / total_amount / net_amount~~ DROP 완료 → `wage / total_pay / net_pay` SOT

---

### invite_codes
| 컬럼 | 타입 | 비고 |
|------|------|------|
| id | uuid | |
| code | text | |
| employer_id | uuid | |
| employer_profile_id | uuid | |
| team_member_id | uuid | |
| role | text | 'worker' |
| biz_name | text | |
| wage/work_days/work_hours | integer/text | 초대 시 조건 미리 설정 |
| used_at/expires_at/created_at | timestamptz | |
| created_by | uuid | |

---

### 신규 생성 테이블
| 테이블 | 주요 컬럼 |
|--------|----------|
| paz_chats | user_id, role, content, created_at |
| ai_usage_logs | user_id, model, input_tokens, output_tokens, cost_usd, endpoint, created_at |
| interviews | match_id, employer_id, worker_id, type, transcript, result, created_at |
| trust_score_logs | user_id, delta, reason, before_score, after_score, ref_id, created_at |
| worker_career_entries | worker_id, company_name, role_desc, start_date, end_date, is_current, description, created_at, updated_at |

---

### 기타 테이블 (간략)
| 테이블 | 주요 컬럼 |
|--------|----------|
| chats | match_id, sender_id, receiver_id, message, message_type, is_read |
| notifications | user_id, type, title, body, data, is_read |
| paz_memory | user_id, memory_type, content |
| min_wages | year, hourly_wage, note |
| tax_rates | year, health_insurance_rate, employment_insurance_rate, national_pension_rate, industrial_accident_rate |
| push_subscriptions | user_id, subscription(jsonb) |
| user_badges | user_id, badge_key |
| job_categories | name, parent_id, sort_order |
| job_credentials | category_name, duty_name, name, is_mandatory_by_law |
| sudoku_ratings | user_id, rating |
| sudoku_records | user_id, difficulty, time_seconds, solved, rating_delta |
| bot_chat_logs | employer_profile_id, worker_profile_id, question, answer, bot_uncertain |
| attendance_logs | team_member_id, attendance_id, action, actor_id, before_data, after_data |

---

## 3. 중복/레거시 필드 현황 (모두 해결됨)

> [!NOTE]
> 2026-07-08 마이그레이션을 통해 중복 이미지 컬럼, matches.status 레거시 컬럼, worker_profiles.hexaco_data 레거시 컬럼이 모두 완전하게 DROP 및 정리 완료되었습니다.

---

## 4. SOURCE OF TRUTH 정의

| 데이터 | SOT | 설명 |
|--------|-----|------|
| 공고 조건 (wage/work_days/work_hours) | **jobs** | employer_profiles 레거시 DROP 완료 |
| 팀원별 근무조건 | **team_members** | 계약 후 contracts에서 덮어씀 |
| 계약 내용 (PDF 기준) | **contracts.contract_data** | |
| 근로자 개인정보 (계약서용) | **users** | real_name / birth_date / phone / address / address_detail — 계약서 저장 시 역sync |
| 계약 임금 타입 | **contracts.wage_type** | 'hourly'\|'daily'\|'monthly' (contract_data.wageType에서 변환) |
| 사용자 성향/HEXACO | **users.worker_result / employer_result** | worker_profiles.hexaco_data 레거시 (DROP 완료) |
| 신뢰도/등급 | **users.trust_score / grade** | worker_profiles DROP 완료 |
| 이름 (표시) | **users.nickname** | users.name DROP 완료 |
| 이름 (법적/계약서) | **users.real_name** | |
| 역할 | **users.user_type** | 'employer'\|'worker'\|'both' |
| 매장 도로명 주소 | **employer_profiles.region** | |
| 매장 세부주소 | **employer_profiles.address_detail** | |
| 출근 기록 | **attendance.check_in / check_out** | clock_* DROP 완료 |
| 세율 | **tax_rates** | 연도별 |
| 최저임금 | **min_wages** | year, hourly_wage |
| 채팅 | **chats** | chatrooms/messages DROP 완료 |
| PAZ AI 채팅 히스토리 | **paz_chats** | |
| AI 호출 비용 | **ai_usage_logs** | |
| 신뢰도 변동 이력 | **trust_score_logs** | |
| 인터뷰/사전미팅 | **interviews** | |
| 매칭 진행상태 | **matches.progress_status** | matches.status 레거시 (DROP 완료) |

---

## 5. 남은 정리 대상

### 🟡 중기 (코드 미참조 유령 필드 DROP 필요)
- [ ] `matches` 테이블 레거시 필드 DROP
  - `job_posting_id` (jobs.id가 FK인 job_id로 단일화 완료)
  - `worker_tier` (grade/trust_score로 단일화 완료)
- [ ] `users` 테이블 레거시 필드 DROP
  - `push_token` (`push_subscriptions`에서 별도로 관리)
  - `kakao_id` (로그인 토큰 기반 소셜 정보 미사용)
  - `role_inferred` (users.user_type 기반 처리)
  - `onboarding_data` (users.onboarded 여부만 확인)

### ✅ 완료된 정리
- [x] `matches.status` DROP (progress_status SOT로 완전 교체 완료)
- [x] `worker_profiles.hexaco_data` DROP (users.worker_result.hexaco SOT로 완전 교체 완료)
- [x] 이미지 중복 컬럼 정리 (profile_image_url / business_image_url DROP 완료)
- [x] `attendance.clock_in / clock_out` DROP
- [x] `worker_profiles.trust_score / grade` DROP
- [x] `worker_profiles.name` DROP
- [x] `employer_profiles.employer_bot_knowledge` DROP
- [x] `employer_profiles` 공고 레거시 컬럼 26개 DROP
- [x] `payslips.base_wage / total_amount / net_amount` DROP
- [x] `users.name` → `nickname` 마이그레이션 후 DROP
- [x] `chatrooms`, `messages`, `job_postings` 테이블 DROP
- [x] `paz_chats`, `ai_usage_logs`, `interviews`, `trust_score_logs` 테이블 생성
- [x] 코드 참조 정합: `users.role` → `user_type`, `team_members.hired_at` → `hire_date`
- [x] `matches.employer_profile_id` 코드 참조 제거
- [x] `lib/supabase.ts` TypeScript strict 정합 (Proxy → 직접 export)
- [x] codebase 전체 `tsc --noEmit` 0 errors
- [x] `worker_profiles.hexaco_data`와 관련된 코드 내 fallback 체인(match/route.ts, worker/[id]/page.tsx, api/lovecall/route.ts) 최종 정리 완료
