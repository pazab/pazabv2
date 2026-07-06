# PAZAB v2 Plan

_최종 업데이트: 2026-07-07 (2)_

---

## 완료된 작업

### 2026-07-06 — 계약서 플로우 + 주소 정리 + 알바 뷰 개선

#### 근태 일괄 등록 → 소급 등록으로 개편
- ⚡ 일괄 등록 버튼 근태 탭에서 제거
- 계약서 카드에 "소급 등록" 버튼 추가 (서명 완료 계약서만)
- `AttendanceBatchModal` — 월 단위 → 계약 기간 전체(start_date~end_date) 소급 처리로 확장
- 계약 개시일 입력 안내 문구 추가 (재계약 시 갱신 날짜 기준 작성 안내)

#### 계약서 파라미터 버그 수정
- `contract/view` — `?id=` 파라미터 누락으로 엉뚱한 계약서 로드되던 문제 수정 (`sp.get("id") || sp.get("contractId")`)
- `team/[id]` 보기 버튼 → `?contractId=`로 통일

#### 주소 체계 통합 (`employer_profiles`)
- `biz_address` 컬럼 코드에서 제거 → `address` + `address_detail` 단일 체계로 통합
- `contract/page.tsx` initF — `bizAddr: ep.address`, `bizAddrDetail: ep.address_detail` 로 불러오기
- 저장 시 `address`/`address_detail` 각각 업데이트 (`biz_address` 업데이트 제거)
- `ContractOfficialForm` — `bizAddr` + `bizAddrDetail` 합산 표시
- `users` 테이블 `address_detail` 컬럼 추가 (SQL 실행 완료)
- 근로자 주소는 `contract_data` 스냅샷만 사용 — `users.address` 업데이트 제거 (RLS 이슈)

#### 계약서 UX 개선
- `window.confirm` → 재계약서 발행 커스텀 바텀시트 모달로 교체
- 계약서 수정 버튼(`contract/view`) — `mode=update` 누락 수정
- 저장 후 팀원 상세 페이지(`/employer/team/{memberId}`)로 자동 이동
- 발행/수정 시 알바생에게 push 알림 전송
- 동의 완료 후 `/myteam`으로 자동 이동
- `worker_signed_at` 컬럼명 오타 수정 (`signed_at` → `worker_signed_at`)

#### 알바생 뷰 개선
- `BottomNav` 근태 탭 — `user_type === "worker"` 시 `/worker/mywork`로 분기
- `/worker/mywork` — `team_member_id` 기반 계약서 조회로 수정 (기존 `match_id` 기반 → 직등록 직원도 조회)
- `/myteam` 알바 뷰(`WorkerMemberScroll`) — 계약서 섹션 추가 (현재 계약만 표시, 서명대기 시 "서명하기" 버튼 강조)
- `alert` → `showToast` 교체 (mywork 페이지)

### 2026-07-07 — 잔여 TODO 일괄 처리

#### contracts 테이블 match_id 컬럼 추가 (DB migration)
- `ALTER TABLE contracts ADD COLUMN IF NOT EXISTS match_id UUID REFERENCES matches(id) ON DELETE SET NULL` 실행
- 코드에서 contracts를 match_id로 조회/삽입하는 모든 경로가 이제 정상 작동

#### employer_profiles.biz_address 컬럼 drop (DB migration)
- `ALTER TABLE employer_profiles DROP COLUMN IF EXISTS biz_address` 실행
- 코드는 이미 address/address_detail 단일 체계로 정리된 상태

#### contract/view 수정 버튼 제거
- 사장님이 계약서 뷰 페이지에서 수정 버튼을 눌러 혼란 야기 방지
- team/[id] 페이지에만 수정 진입점 유지

#### 소급 등록 후 급여 명세서 자동 생성 연동
- `AttendanceBatchModal` 성공 시 결과 화면으로 전환 (`doneCount` state)
- 계약 기간 내 월별 "급여 명세서 발행하기" 버튼 목록 표시 → 클릭 시 `/payslip?tmId=&year=&month=` 이동
- `payslip/page.tsx` — URL `year`/`month` 파라미터를 초기값으로 세팅

#### 알바생 구직 프로필 신규 작성 시 users 기본 정보 자동 채움
- `region` (기존) + `bio` + `profile_image` 자동 채움
- `worker/profile/page.tsx` isNew 분기 확장

### 2026-07-07 — 마이팀·채팅·계약서 상태 동기화 + 1:1 DM

#### myteam 빈 상태 UI 경량화
- 소속/팀 없을 때 큰 이모지+설명 블록 → 한 줄 인라인 카드로 교체
- 버튼 색상 보라색 그라데이션으로 통일 (myteam, mywork 모두)

#### 계약서 서명 → team_members.contract_status 동기화 버그 수정
- `contract/view` `handleAgree` 가 직접 DB 업데이트하여 `team_members` 미반영 문제
- `/api/contract` PATCH 경유로 변경 → 서명 시 `team_members.contract_status = "active"` 동기 업데이트
- 기존 데이터 SQL 일괄 동기화: 양쪽 서명 완료된 contracts 기준 team_members active 업데이트

#### 1:1 DM (직접 등록 팀원 포함)
- `UserProfileBottomSheet` 1:1 메시지 버튼 수정
- `/api/dm` 신규 엔드포인트 — service role로 기존 match 탐색 또는 DM match 생성
- match `worker_left/employer_left` 리셋 → 양쪽 채팅 목록 재노출
- `/api/chat` GET 전체 → `supabaseAdmin` 교체 (서버사이드 anon RLS 우회 문제 해결)
- `sendMessage` 낙관적 업데이트 추가 → 전송 즉시 sender 화면에 표시
- 중복 방지: realtime이 먼저 도착한 경우 temp 메시지만 제거
- RLS 정책 SQL + `REPLICA IDENTITY FULL` + publication 등록으로 실시간 수신 정상화

---

## 다음 작업 후보

- [ ] 채팅창 UX/UI 개선 (현재 매칭 기반 구조에서 DM 포함 일반 메신저 수준으로)

