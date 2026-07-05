# PAZAB v2 Plan

_최종 업데이트: 2026-07-06_

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

---

## 다음 작업 후보

- [ ] `biz_address` 컬럼 DB에서 drop (코드에서 제거 완료, 컬럼은 유예)
- [ ] 계약서 수정 버튼 `contract/view`에서 제거 (사장님 혼란 방지 — team/[id]에만 유지)
- [ ] contracts 테이블 `match_id` 컬럼 정리 (코드에서 참조하지만 컬럼 없음 — 제거 또는 추가)
- [ ] 소급 등록 후 급여 명세서 자동 생성 연동
- [ ] 알바생 구직 프로필 작성 시 `users` 기본 정보 초기값 자동 채움
