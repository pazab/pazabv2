# PAZAB Dev Handover — 2026-07-27

## 오늘 작업 요약

### 1. BottomNav 5탭 구조 개편 (`components/BottomNav.tsx`)

**변경 전 (4탭):** `[홈] [대타⚡중앙] [채팅] [MY]`  
**변경 후 (5탭):** `[피드] [대타] [홈🏠 중앙] [채팅] [MY]`

- 피드(`/feed`) 탭 신규 추가 (ti-news 아이콘)
- 홈(`/myteam`)이 중앙 포인트 탭으로 변경 — 44×44 원형 버튼, 보라 그라디언트, 활성 시 글로우 shadow
- 대타(isDaeta) 구분자 로직 분리 (`isDaeta` prop vs `center` prop)
- 대타 아이콘 색상 투명도 버그 수정 (`#fb923c99` → `#fb923c`)

### 2. 마이팀 — 오늘 근무 현황 & 출근 승인 기능 (`app/myteam/page.tsx`)

- **오늘 출근 예정자 패널** 신규 추가
  - 오늘 요일 기준 근무 예정 팀원 자동 필터링
  - 출근 상태별 배지: ⏳미출근 / ✅근무중 / ⏰근무중(지각) / 🔴퇴근완료 / ❌결근
  - 사장님이 "출근 승인" 버튼 직접 클릭 → `attendance` upsert + 푸시알림 발송
  - 푸시알림 내용: `사장님이 오늘 출근을 승인했습니다. 퇴근 시 앱에서 퇴근 버튼을 눌러주세요!`

### 3. 팀원 상세 — 근태 기록 편집 UX 개선 (`app/employer/team/[id]/page.tsx`)

- 퇴근시간 셀렉트 placeholder: `"종료"` → `"퇴근시간 미입력 (알바생 직접 퇴근)"`
- 시작 시간 placeholder: `"시작"` → `"시작 시간"`
- 상태 선택 시 오늘 날짜가 아닌 경우 퇴근시간 자동 초기화 로직 추가 (`attDate !== todayStr` 조건)

### 4. Cron 체크인 API 소폭 수정 (`app/api/cron/checkin/route.ts`)

- 기존 로직 마이너 수정 (9줄 변경)

---

## 파일 변경 목록

| 파일 | 변경 규모 |
|------|---------|
| `app/myteam/page.tsx` | +426 / -46 (대규모) |
| `app/employer/team/[id]/page.tsx` | +66 / -4 |
| `components/BottomNav.tsx` | +49 / -5 |
| `app/api/cron/checkin/route.ts` | +9 / -1 |

---

## 미완료 / 다음 작업

- [ ] 오늘 근무 현황 패널 — 팀원이 직접 출근 체크인 시 실시간 반영 확인 (supabase realtime 연동 여부)
- [ ] 5탭 피드 탭 — `/feed` 페이지 신규 콘텐츠 큐레이션 or 기존 피드 재활용 검토
- [ ] BottomNav 중앙 홈 버튼 — 탭 전환 애니메이션 추가 검토

---

> 작성: 2026-07-27 22:42 KST  
> 브랜치: main
