# PLAN.md
> 최종 업데이트: 2026-07-04 (2차) | PAZAB v2 (`C:\pazabv2`, Supabase: clrjxxkgceluvzvrkvyl)

## 구현 완료

**인증**
- createBrowserClient(@supabase/ssr) 전환, 서버사이드 OAuth Route Handler(/api/auth/login, /api/auth/callback) 적용 → 모바일 PKCE 루프 해결
- proxy.ts(구 middleware.ts) PUBLIC_PATHS 정리

**온보딩**
- 3필드/역할지연 설계 폐기 → 2버튼(사장님/알바생) 즉시 진입으로 확정

**사장님 다중업장**
- employer_profiles UNIQUE 제약 제거 + biz_reg_number/ceo_name/biz_address/biz_tel 컬럼 추가 (patch_employer_multi_biz.sql 실행 완료)
- 계약서 업장 자동선택 + 정보 자동채움 (app/contract/page.tsx)
- 주소정책 확정: address(도로명 전체, 계약서용) / region(3단계, 공개UI용) / lat,lng
- users 테이블 닉네임 unique index (대소문자 무시) 적용 완료 (patch_nickname_unique.sql)

**초대(공급 확보)**
- 닉네임 검색 기반 직접초대로 전환(app/invite/page.tsx), 매니저 역할(team_members.member_role) 추가
- 초대수락(app/i/[code]) → team_members 연결 + worker_profiles 자동승격

**근태**
- GPS 200m 반경 출근 제한(Haversine), 지각/정시 판정
- attendance RLS 재작성 완료 (worker_id/employer_id 직접 비교)
- 5분 주기 크론(app/api/cron/checkin) — 출근10분전/정시/5분지각/20분결근자동처리 알림, cron-job.org 외부연동

**UI**
- myteam/mypage 탭 제거 → 단일스크롤+아코디언, 색상체계 통일(알바=핑크dominant/사장=보라dominant)
- 네비 5탭 확정: 탐색·대타SOS·[근태(중앙)]·채팅·MY
- TimeWheelPicker/DateWheelPicker 신규(네이티브 input 대체)
- 알림시스템(lib/notify.ts, NotificationBell, /notifications)

**UI/색상 시인성 전면 개선 (2026-07-02 3차)**
- globals.css에 라이트/다크 통합 CSS 변수 추가: `--success-text`, `--purple-text`, `--pink-text`, `--card-inner`, `--card-inner-border`, `--progress-track`, `--chip-*-bg/border` 등 (라이트=진한색, 다크=파스텔 유지)
- mypage 전체: `#86efac`(연초록)·`#c4b5fd`(연보라)·`#f9a8d4`(연핑크) → var() 교체로 흰배경 시인성 확보
- 종합 신뢰도 게이지 배경 `rgba(255,255,255,0.02)` → `var(--surface2)`, progress track → `var(--progress-track)`
- 사장님 공고 카드 배경 `rgba(0,0,0,0.2)` → `var(--surface2)`, border → `var(--border)`
- 봇설정·수정·공고등록 등 버튼 색상 전부 var() 통일
- "내 프로필 카드 미리보기" 버튼 제거 (미완성 기능, state도 정리)

**빈 매장/공고 노출 버그 수정 (2026-07-02 3차)**
- 온보딩에서 사장님 선택 시 빈 employer_profiles row 자동 INSERT하던 로직 제거 (app/onboarding/page.tsx)
- myteam loadTeam 쿼리에 `.not("business_name", "is", null)` 필터 추가 → 불완전 매장 카드 노출 방지
- mypage fetchJobs 및 미리보기용 eps 쿼리에 동일 필터 추가 → "설정안된거 1개" 노출 방지

**탐색 페이지 당근 스타일 FAB (2026-07-02 3차)**
- 공고 탭: `[+ 새 공고]` (보라) → `/employer/register`
- 구직자 탭: `[+ 새 구직]` (핑크) → `/worker/profile?edit=true&new=true`
- scrollY > 80 → 원형(+) 으로 수축, scrollY ≤ 80 → 필 모양 텍스트 노출 (max-width 트랜지션)
- 위치: `bottom: 92px` (BottomNav 위, PAZ 기본위치 아래)

**내팀 다중 매장 UI (2026-07-02 2차)**
- 로그인 후 첫 페이지 라우팅: employer→/myteam, worker→/explore
- StoreRegisterModal (components/StoreRegisterModal.tsx): 매장 등록/수정 팝업, Kakao 상호명 검색(업종/주소 자동입력), Daum 우편번호, 미디어 업로드(사진10/영상1), 직접입력 토글
- Supabase Storage 버킷명 avatars→media 전체 교체 (employer/register, mypage, worker/profile)
- Samsung Pass 스타일 롤로덱스 카드 UI (app/myteam/page.tsx): 비활성 매장은 헤더 한 줄(52px)만 절대위치로 쌓이고, 탭 누르면 맨 아래로 내려와 전체 펼침
- 매장 삭제 버튼(✕) + 확인 팝업 구현
- patch_missing_columns.sql: employer_profiles/users/worker_profiles/team_members/attendance 누락 컬럼 전체 추가, attendance_logs/notifications/tax_rates/push_subscriptions 테이블 신규 생성

**근로계약서 UX 개선 (2026-07-02)**
- 탭 방식 → 5단계 스텝 위자드로 전환 (사업체→근로자→근무→임금→보험·서명)
- 진행바 + 완료 스텝 ✓ 표시, 스텝 아이콘 직접 클릭 이동 가능
- 모바일 최적화: 날짜(type=date), 시간(type=time) 네이티브 피커 적용
- 담당업무 preset 버튼 6종(홀서빙/주방/카운터/청소/배달/재고) + 직접입력
- 지급일 버튼 선택(5/10/15/20/25/말일), 임금 구분/지급방법 큰 버튼화
- 보험 4종(고용/산재/연금/건강) 아이콘 카드 터치 방식
- 근로자 주소 검색 후 세부주소(동·호수·층) 입력란 자동 노출
- workerAddrDetail 필드 추가, 저장 시 전체주소 합산 저장

**급여/세금 (설계만 완료, 코드 미착수)**
- 일용근로소득세 공식 확정: (일급-15만)×6%×45%, 지방세 10%, 소액부징수 <1천원
- 4대보험 판정기준 확정, tax_rates 테이블(연도별 INSERT-only) 설계 확정

## 발생했던 이슈 (해결됨, 재발 방지용 기록)

| 이슈 | 원인 | 해결 |
|---|---|---|
| 새 계정(hellopazab) 내팀에 "업종미정" 빈 카드 노출 | onboarding에서 사장님 선택 시 business_name 없는 빈 employer_profiles row INSERT | onboarding 자동 INSERT 제거 + 쿼리에 `.not("business_name","is",null)` 필터 |
| 마이페이지 "설정안된거 1개" 공고 노출 | 위와 동일한 빈 row가 fetchJobs에도 노출됨 | fetchJobs 쿼리 동일 필터 추가 |
| 라이트모드 텍스트 시인성 불량 | `#86efac`·`#c4b5fd`·`#f9a8d4` 등 다크모드 전용 파스텔 색을 하드코딩 | globals.css에 `--success-text` 등 라이트/다크 분기 CSS 변수 추가 후 전체 교체 |

| 이슈 | 원인 | 해결 |
|---|---|---|
| 모바일 로그인 무한루프 | localStorage 기반 세션+PKCE verifier, 인앱브라우저 전환시 유실 | 서버사이드 OAuth 이전, 쿠키 저장 |
| attendance INSERT 실패 | RLS가 team_members.user_id 참조(없는 컬럼) | worker_id/employer_id 직접비교로 재작성 |
| myteam 팀원 0명 표시 | select에 없는 컬럼(match_id) 포함 → PostgREST 전체 null 반환 | select에서 제거 |
| /invite 사장님 UI 접근불가 | user_type=='employer' 하드게이트 | 의도기반 탭 전환(viewMode)으로 변경 |
| employer_profiles 미생성 | 온보딩이 onboarding_data JSONB에만 저장, 테이블 insert 누락 | 온보딩 완료시 자동 INSERT 추가 |
| 로그인 재진입시 signOut 유발 루프 | login 페이지 마운트시 signOut() 호출 | 해당 호출 제거 |
| Claude Code 워크트리 오작동 | 세션이 worktree 컨텍스트에서 시작 → 메인 프로젝트가 아닌 워크트리에 파일 편집 | .claude/settings.json에 bgIsolation:none 설정 |
| 매장 삭제 RLS 차단 | employer_profiles DELETE 정책 미생성 | `CREATE POLICY employer_profiles_delete FOR DELETE USING (auth.uid() = user_id)` 실행 |
| Supabase Storage 업로드 실패 | 코드가 "avatars" 버킷 참조, v2 프로젝트엔 "media" 버킷만 존재 | 전체 코드에서 "avatars"→"media" 교체, media 버킷 RLS 정책 추가 |
| employer_profiles 컬럼 없음 오류 | v2_schema.sql이 최소 구성이라 코드에서 참조하는 컬럼 대부분 누락 | patch_missing_columns.sql 작성 및 실행 |

**구현 완료 (2026-07-03)**

**라이트모드·UX 버그 수정**
- globals.css `--nav-bg` / `--nav-border` / `--search-bg` / `--search-border` CSS 변수 추가 (라이트=흰배경, 다크=기존 유지)
- 탐색 헤더·검색창 배경 하드코딩 → var() 교체
- 탐색 FAB user_type 체크: 알바생이 공고탭 FAB 누르면 구직 프로필로, 사장님이 구직탭 FAB 누르면 공고 등록으로

**employer_profiles is_deleted null-safe 전체 수정**
- myteam / mypage / invite / contract 페이지 `.eq("is_deleted", false)` → `.or("is_deleted.is.null,is_deleted.eq.false")` 전환
- 원인: patch_missing_columns.sql로 추가된 컬럼 기존 row의 기본값이 null이라 필터에서 걸러짐

**매장 삭제 안전장치 + 팀원 퇴사처리**
- 매장 삭제 하드 DELETE → soft delete (`is_deleted:true, is_active:false`)
- 팀원 있으면 삭제 모달에 명단 표시 + "퇴사처리 후 삭제" 원클릭
- 팀원 카드에 개별 "퇴사" 버튼 추가 (status='left')

**직원 서류 보관함 신규 (app/employer/records)**
- 전·현직 팀원 전체 목록 (재직/퇴사 필터)
- 개인별: 근무조건·계약서 목록(서명상태)·월별 근태기록
- 법정 보존기간 표시 (3년/5년) + 만료일 색상 경고
- 내팀 하단 "📂 직원 서류 보관함" 진입 버튼

**계약서 위자드 개선**
- 담당업무 다중선택 (쉼표 join 저장), 프리셋 2종 추가 (음료 제조·포장마감)
- 근무요일 선택 시 주휴일 자동 추천 (첫 번째 쉬는 날)
- 주휴일 라벨 → "주휴일 (유급 휴무일 · 하루치 추가 지급)"
- 주휴일 버튼: 근무일 흐리게·쉬는날 보라색 강조
- 보험 카드 미선택 시 `color:"#fff"` → `var(--text)` (라이트모드 대응)
- 연장근로·야간근로·주휴수당 자동계산 패널 (임금 스텝)
  - 주 연장 12h 초과 시 빨간 경고 (근로기준법 제53조)
  - 최저임금 미달 시 경고 + 벌칙 안내
- 스텝4 첨부서류 확인 체크리스트: 보건증·신분증·통장사본·친권자동의서

**최저임금 동적 관리 (lib/minWage.ts)**
- 연도별 최저시급 테이블 (2024~2026)
- 근무 시작일 기준 적용, 계약서 전체 하드코딩 제거
- tax_rates DB 구현 후 마이그레이션 예정

## 다음 작업 (우선순위순)

**P0**
- [x] tax_rates 2026 초기값 입력 (건강보험 3.545%, 고용보험 0.9%, 국민연금 4.5%)
- [x] job_credentials 테이블 생성 + 시드 데이터 INSERT
- [x] min_wages 테이블 생성 + 2024~2026 초기값
- [x] 탐색 FAB `userType === "both"` 케이스 — 코드 확인 결과 이미 탭 기준 올바르게 처리됨

**P1**
- [x] lib/taxRates.ts — calcDailyWorkerTax(), calcInsuranceEligibility(), calcInsuranceDeduction()
- [x] lib/minWage.ts — DB 연동(fetchMinWage) + 동기 폴백 유지
- [x] app/admin/tax-rates/page.tsx — hellopazab 전용, 세율+최저임금 CRUD
- [x] 계약서 진입점 재설계 — memberId 파라미터, contracts 전체 team_member_id 기반 전환
- [x] team_members.employer_profile_id 연결 — 초대 수락(/i/[code]) 시 invite_codes.employer_profile_id 반영
- [x] 근태 전체보기 — /employer/team/[id] 월별 필터 + DB 재조회 (viewYear/viewMonth 기반)
- [x] 매장 등록 ↔ 공고 등록 분리: StoreRegisterModal is_active:false, 내팀 "📢 공고올리기" 버튼, employer/register storeId 파라미터
- [x] 매장 삭제 안전장치 — openDeleteModal DB 직접 조회(employer_id 기반), 팀원 있으면 삭제 버튼 숨김
- [x] mypage 공고 마감 — is_deleted 제거, is_active:false만
- [x] 사장님 팀원상세 /employer/team/[id] 근무조건 수정 기능
- [x] employer_profiles(매장) ↔ jobs(공고) 완전 분리 아키텍처 — jobs 테이블 신규, match/lovecall/mypage/myteam/contract/job/[id]/paz-register 전체 반영, DB: db/patch_jobs_table.sql
- [x] job_categories 테이블 생성 — 10개 대분류·46개 소분류 (음식점/카페/편의점/패스트푸드/마트/물류창고/생산제조/건설노무/의료복지/기타), 알바몬·알바천국 대비 3개 추가
- [x] job_credentials 직업별 필수서류 DB 내재화 — category_name+duty_name+name+is_mandatory_by_law 구조
- [x] 팀원 상세(/employer/team/[id]) 기능 다수 추가:
  - 근무 예정일 달력 시각화 (work_days 파싱 → 배경색+예정 뱃지)
  - "N일 중 M일 출근" 통계 표시
  - 계약서 없을 때 필요성 안내 카드 + 급여명세 발행 잠금
  - 📂 서류 현황 아코디언 — job_credentials 기반 동적 서류목록, 제출여부 DB 즉시저장 (team_members.docs_submitted JSONB)
  - 보건증 필요여부 business_type → job_credentials DB 조회, 미성년자 친권자동의서 자동 노출
- [x] 계약서 위자드 추가 개선:
  - 출퇴근 시간 → 1일/1주 소정시간 자동계산 + 휴게없음 체크박스
  - 계좌이체 선택 시 계좌번호 입력 (선택)
  - 담당업무 preset → job_categories DB 소분류 동적 로드
  - 서류 섹션 "미제출이어도 계약서 작성 가능" 안내 추가
- [ ] 직원 서류 보관함에 payslip 섹션 추가 (급여 구현 후)
- [x] team_members.docs_submitted 컬럼 추가 SQL 실행 완료
- [x] job_categories RLS SELECT 정책 추가 (미설정으로 구직 희망직종 안 뜨던 버그 수정)
- [x] 마감된 공고 재표시 버그 수정 — 마감하기 → job_status:'closed', fetchJobs에서 closed 제외
- [x] users 허브화 (공통 데이터 단일 입력):
  - DB: users 테이블에 region/address/birth_date 컬럼 추가
  - settings 페이지: 이름/연락처/생년월일/거주지역 한 곳에서 수정
  - worker/profile 신규 등록 시 users.region → 희망지역 자동채움
  - employer/register 신규 매장 등록 시 users.region → 지역 자동채움
  - lib/regions.ts 신규: REGIONS 상수 공용화 (employer/register, worker/profile 중복 제거)

**P2**
- [ ] HEXACO 5턴 압축 CTA화 — explore 배너 진입으로 설계 확정, /interview 라우트 미구현 (/personality 페이지는 있으나 /interview 없어 404)
- [ ] employer_profiles.geo_radius_meters (GPS 반경 200m 고정 → 사장님 설정 가능하게)
- [ ] 웹푸시 실사용 테스트 미완료
- [ ] 대타 SOS nearby_workers RPC 실연동 점검
- [ ] worker_type(일용/단시간상용) 자동판정 vs 수동선택 미결정
- [ ] 딥링크(/d/[code]) 카톡공유 SOS 미착수
- [ ] worker_profile에 외부 경력 입력 기능 (이전 직장)

**보류/전략만 확정**
- 대타 2-Tier(검증✅/신규🔵) 풀 로직: worker_profiles.is_verified 캐시 설계는 됐으나 코드 미구현
- 급여 자동이체: 토스페이먼츠 API 연동 필요 (사업자 계약 선행)
- 주민번호/통장사본 DB 저장: 암호화 설계 후 P3으로
