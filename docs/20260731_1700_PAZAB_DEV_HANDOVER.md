# PAZAB Dev Handover — 2026-07-31

## 오늘 작업 요약

### 1. 근태(출퇴근) 전면 개편

- **출근 10분 전부터만 셀프 체크인 활성화** (`app/myteam/page.tsx` `CheckInButton`) — 크론 "10분 전 알림" 타이밍과 정렬. 단, **오늘이 실제 근무 요일일 때만** 시간대 제한 적용 (`isScheduledToday` 게이트 추가) — 안 그러면 비근무일에 저장된 시:분값만으로 잘못 판정되는 버그가 있었음
- 결근 자동처리/정상처리된 경우 상태 메시지가 실제 처리 결과(정상 출근/지각/결근)를 구분해서 보여주도록 수정 — 예전엔 처리됐어도 항상 "사장님께 확인 요청" 문구만 뜸
- **사장님 근태 수정 화면** (`app/employer/team/[id]/page.tsx`)
  - 퇴근시간 입력을 고정 30분 단위 드롭다운 → 자유 `<input type="time">`로 교체 (늦은 출근 시 선택 가능한 옵션이 없어서 저장 못 하던 버그)
  - **자정 넘는 퇴근 지원** (`crossesMidnight` 처리, `addDaysToDateStr` 헬퍼 추가)
  - **"🔒 지금 시각으로 바로 마감 처리" 원클릭 버튼** 추가 — 근무 끝난 뒤 알바생 재확인 없이 사장님이 바로 종료 처리
  - `saveAttendance` 시그니처에 `overrideEnd?` 파라미터 추가하면서, 기존 `onClick={saveAttendance}` 두 곳이 클릭 이벤트 객체를 그대로 인자로 넘기던 잠재 버그도 같이 수정 (`onClick={() => saveAttendance()}`)
- **알림 원탭 액션 버튼** — `public/sw.js` + `lib/notify.ts` + `app/api/cron/checkin/route.ts` + 신규 `app/api/attendance/quick-action/route.ts`
  - 크론이 보내는 출근 관련 알림(10분 전/정시/5분지각/자동결근)에 "✅ 지금 출근" 액션 버튼 추가 — 앱 안 열고 알림에서 바로 처리
  - **퇴근 시간 알림 신규 추가** — 체크인은 됐는데 체크아웃 안 한 사람에게 근무 종료 예정 시각 근처에 "🔴 지금 퇴근" 알림 발송 (기존엔 출근 관련 알림만 있었음)
  - `quick-action` API는 GPS 대신 세션 쿠키 기반 본인확인(`worker_id === auth.uid()`)으로 처리

### 2. 퇴사 처리 게이트 버그

- `app/myteam/page.tsx` 퇴사 확인 모달의 "퇴사 처리 확정" 버튼이 **명세서 발행 여부와 무관하게** `hasWorkedThisMonth` 하나만으로 영구히 비활성화되던 버그 수정 — 명세서를 발행해도 절대 못 뚫는 구조였음. `hasPayslipThisMonth` 체크 추가
- 명세서 발행 이후 추가 근무가 반영 안 된 채로 퇴사 처리하면 급여 누락될 수 있는 케이스 감지 → 경고 배너 + "명세서 재발행하러 가기" 버튼 추가

### 3. 임금명세서(급여명세서→용어 통일) 표준 서식 + PDF

- **`components/PayslipOfficialForm.tsx` 신규** — 근로기준법 시행령 제27조의2 기준 임금명세서 표준 서식 (지급/공제 항목별 계산방법 명시)
- `app/payslip/page.tsx`에 화면인쇄 / PDF 저장 버튼 + 인쇄 미리보기 모달 연동 (계약서 PDF와 동일한 `window.print()` 패턴)
- **"급여명세서" → "임금명세서" 용어 전체 통일** (앱 UI, 알림, 채팅 메시지, PAZ 음성명령 예시 등 15개 파일) — 법정 정식 명칭에 맞춤, URL 라우트(`/payslip`)는 안 건드림
- 초과근무(연장수당)는 **사장님이 명시적으로 승인해야만** 급여에 포함되도록 변경 (기본값 미승인) — 시간외 부풀리기 방지
- 일별 근무 내역 리스트도 최근 1건 + 더보기(스크롤) 패턴으로 통일
- both 계정에서 `isEmployer`/`isWorker` 판정이 `userType`만 보고 있어서, 알바생이 자기 명세서 열어도 사장님 발행 화면이 뜨던 버그 수정 (`member.employer_id`/`worker_id` 기준으로 판정)

### 4. 초대 시스템 — 멀티매장 버그 2건 + RLS 버그 1건

- **초대 발송 시 중복 체크가 `employer_id`만 보고 `employer_profile_id`(매장)는 안 봐서**, 같은 사장님의 다른 매장으로 재초대가 막히던 버그 수정 (`components/InviteBottomSheet.tsx`, `app/invite/page.tsx`)
- **초대 수락 시에도 동일한 버그** — 매장 구분 없이 기존 `team_members` 레코드를 그대로 덮어써서, 다른 매장 초대를 수락하면 기존 매장 소속 데이터가 통째로 사라지던 심각한 버그 수정 (`app/i/[code]/page.tsx`, `employer_profile_id` 스코프 추가)
- **`invite_codes` RLS(`invite_codes_update_employer`)가 사장님만 UPDATE 허용해서**, 알바생이 수락해도 `used_at`이 계속 null로 남던 버그 → 신규 `app/api/invite/accept` 서버 라우트(서비스 롤)로 처리
- 수락 완료 후 `router.replace` → `window.location.href` 풀리로드로 변경 (클라이언트 캐시 때문에 "받은 초대장" 배너가 안 사라지던 문제)
- **홈에 "받은 초대장" 배너 신규** (`app/myteam/page.tsx`) — 알림만으로는 놓치기 쉬워서 상시 노출, `notifications` + `invite_codes` 교차 조회로 구현(스키마 변경 없음)

### 5. 데이터 복구 (SQL, 수동 실행 필요 — 실행 완료 확인됨)

- `supabase/fix_hyorisu_teammember_override.sql` — 위 초대 오버라이드 버그로 탕정역점 소속 데이터가 사라진 "효리수" 복구 (활성 계약서에 남아있던 원본값 기준: 월급 180만원/월~금/8시간)
- `supabase/fix_stale_invite_codes.sql` — RLS 버그로 `used_at`이 안 찍혀 배너에 계속 뜨던 과거 테스트 초대 4건 정리

### 6. 그 외 UX 개선

- 알바생/사장님 계약확인·명세서확인 등 "확인/조치 필요" 상태 배지 전반 — 배경 불투명도·테두리·아이콘 추가해서 더 눈에 띄게
- 알바생 "내 직장"에도 사장님 "우리 매장"과 동일한 ⚠️ 상태 배너 + 3칸 통계(재직매장/계약확인/명세서확인) 추가, 클릭 시 해당 매장 펼치고 스크롤 이동
- "이전 근무 이력" 섹션 펼치기/접기로 변경 (기본 접힘 — 현재 재직 정보와 헷갈리지 않게)
- 입사일 필드 — 알바생 본인 수정 제거, 사장님 전용으로 일원화 (근속기간 기반 계산에 쓰이는 공식 기록이라 자가수정 리스크 있음)
- "동네 대타로 바로 벌기" 버튼 서브텍스트 문구 수정

### 7. (추가) 알바생 "내 직장" UI 사장님 "우리 매장"과 통일 + 월별 요약 넘기기 + 출근 예정/미출근 오탐 수정

- **월별 요약 넘기기** (`WorkerMemberScroll`) — "이번달 요약(근무일/총시간/예상급여)" 카드에 `‹`/`›` 화살표 추가해서 이전 달 조회 가능. 화살표가 너무 안 보인다는 피드백으로 32px 원형 보라색 버튼으로 재조정. 기존엔 쿼리에 월말 상한이 없어서 과거 달 조회 시 이후 달 데이터까지 합산될 뻔한 버그도 같이 수정(`.lte("work_date", monthEnd)` 추가)
- **"내 직장" 매장 카드 → 사장님 "우리 매장"과 동일한 Samsung Pass 스타일 스택카드로 전환** — 매장 2개 이상이면 비활성 매장은 얇은 바로 겹쳐쌓이고 선택된 매장만 전체 카드로 펼침, 매장별 고유 그라데이션 8색 고정 할당(`WorkerMemberScroll`에 `accentGradient` prop 신규), 세션에 마지막 선택 매장 저장(`myteam_activeWorkStoreId`)
  - 계약확인/명세서확인 클릭 시 점프하는 기존 로직도 "해당 매장을 활성 카드로 전환"까지 같이 하도록 `jumpToWorkStore` 헬퍼로 통합
- **카드 헤더는 색상 배지 정보만, 요일별 근무 시간표는 사장님 화면과 완전히 동일한 패턴으로 교체** — 요일 칩(월~일) 선택 + 08~24시 가로축 위에 근무시간대 막대 표시. 급여 정보도 헤더 밖 중립 배경으로 분리
- **"오늘 근무자 현황" 카드 + "1초 안심 상태 대시보드" 배너 — 출근 10분 전인데 "미출근"으로 오탐 표시되던 버그 수정** — 두 곳 다 `parseShiftRange` + 10분 버퍼로 게이트 추가. 출근 예정 시각 10분 전까지는 "🕐 출근 예정"(중립)으로 표시하고 "출근 승인" 버튼도 숨김. 그 전엔 예정 시각과 무관하게 항상 "⏳ 미출근" + 승인 버튼이 떠 있어서, 사장님이 실수로 예정 시각보다 훨씬 이르게 승인하면 근무시간이 부풀려질 수 있던 문제(알바생 셀프 체크인 쪽엔 이미 있던 보호장치가 사장님 승인 경로엔 없었음)

---

## 파일 변경 목록

| 파일 | 변경 규모 |
|------|---------|
| `app/myteam/page.tsx` | +683 / -이하 포함 (최대 변경, 2회차 스택카드+시간표+오탐수정 포함) |
| `app/payslip/page.tsx` | +255 |
| `app/employer/team/[id]/page.tsx` | +125 |
| `app/api/cron/checkin/route.ts` | +71 |
| `app/i/[code]/page.tsx` | +31 |
| `public/sw.js` | +42 |
| `components/PayslipOfficialForm.tsx` | 신규 |
| `app/api/attendance/quick-action/route.ts` | 신규 |
| `app/api/invite/accept/route.ts` | 신규 |
| `app/invite/page.tsx`, `components/InviteBottomSheet.tsx` | 매장 스코프 수정 |
| `lib/notify.ts`, `lib/pazTools.ts`, `lib/pazVoice.ts`, `lib/trustScore.ts` | 용어 통일 + actions 지원 |
| 그 외 (`app/mypage`, `app/page.tsx`, `app/payslip/list`, `app/worker/mywork`, `app/employer/records`, `components/daeta/DaetaHistoryView.tsx`) | 용어 통일 |

**총합**: 20 files changed, 801 insertions(+), 236 deletions(-) (1차 커밋) + `app/myteam/page.tsx` 243 insertions(+), 72 deletions(-) (2차)

---

## 미완료 / 다음 작업

- [ ] iOS Safari 웹푸시 액션 버튼 실기기 확인 (지원 버전 들쭉날쭉 — 폴백은 본문 클릭 시 기존 동작 유지해둠)
- [ ] `invite_codes` RLS 정책 자체를 정식으로 손볼지 검토 (지금은 `used_at` 갱신만 서버 라우트 우회, 근본적으로는 "초대 대상자" 컬럼이 없어서 발생하는 구조적 이슈)
- [ ] 임금명세서 초과근무 미승인 시 실제 급여 지급 흐름(계좌이체 등)과 어떻게 연결할지 후속 검토
- [ ] 서비스워커(`sw.js`) 변경사항은 브라우저가 캐시하므로 실기기 테스트 시 새로고침/SW 업데이트 확인 필요

---

> 작성: 2026-07-31 17:00 KST (최종 갱신 17:40 KST)
> 브랜치: main
