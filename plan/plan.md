# PLAN.md
> 최종 업데이트: 2026-07-02 (2차) | PAZAB v2 (`C:\pazabv2`, Supabase: clrjxxkgceluvzvrkvyl)

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

## 다음 작업 (우선순위순)

**P0**
- [x] patch_employer_multi_biz.sql 실행 완료 (1사장 N업장 마이그레이션)
- [x] 닉네임 unique index 실행 완료 (patch_nickname_unique.sql)
- [ ] tax_rates 2026 초기값 입력 (건강보험/고용보험 근로자부담률 확정 필요)

**P1**
- [ ] lib/taxRates.ts + calcDailyWorkerTax()/calcInsuranceEligibility() 구현, payslip 발행 로직에 patch
- [ ] app/admin/tax-rates/page.tsx (hellopazab 전용) 구현
- [ ] 계약서 진입점 재설계: matchId 없이도 team_member_id 기반으로 직접 작성 가능하게
- [ ] 근태 전체보기 /myteam/attendance?memberId=xxx 미구현
- [ ] 사장님 팀원상세 /employer/team/[id] 근무조건 수정 기능
- [ ] team_members.employer_profile_id 연결: 초대/계약 시 어느 매장 소속인지 연결 (현재 미연결 상태)
- [ ] 공고등록(employer/register)에서 공고유형(정기/단기/긴급대타) 항목 제거 (매장 등록과 분리됨)

**P2**
- [ ] employer_profiles.geo_radius_meters (GPS 반경 200m 고정 → 사장님 설정 가능하게)
- [ ] 웹푸시 실사용 테스트 미완료
- [ ] 대타 SOS nearby_workers RPC 실연동 점검
- [ ] worker_type(일용/단시간상용) 자동판정 vs 수동선택 미결정
- [ ] HEXACO 5턴 압축 CTA화 (탐색화면 배너 진입) 미착수
- [ ] 딥링크(/d/[code]) 카톡공유 SOS 미착수

**보류/전략만 확정**
- 대타 2-Tier(검증✅/신규🔵) 풀 로직: worker_profiles.is_verified 캐시 설계는 됐으나 코드 미구현
