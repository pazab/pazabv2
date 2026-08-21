# PAZAB Dev Handover — 2026-08-22

## 오늘 작업 요약

세션은 "가입 직후 화면에 explore 잔재가 남아있다"는 제보로 시작해서, 대화 중 발견된 문제들을 하나씩 따라가다 보니 최종적으로 **대타 SOS 지원 플로우 정리**와 **이력서 페이지 전면 개편**까지 이어졌음.

### 1. 가입/온보딩 explore 잔재 제거
- `app/onboarding/page.tsx`, `app/mode-select/page.tsx`, `app/auth/consent/page.tsx`, `app/auth/callback/page.tsx`, `app/api/auth/login/route.ts`, `app/api/auth/callback/route.ts` — 로그인 체인 전체가 신규가입 후 `/explore`로 보내던 걸 `/myteam`(사장님·알바생 통합 홈)으로 통일. 사장님 쪽(`onboarding`)은 이미 고쳐져 있었는데 알바생만 빠져 있던 비대칭이 원인이었음.
- `app/personality/page.tsx`, `app/result/page.tsx` — 헤더 PAZAB 로고 클릭(홈으로) 버튼도 같은 잔재였음. "공고 탐색" CTA는 explore가 여전히 정식 기능이라 그대로 둠.
- `app/myteam/page.tsx` — "소속 매장이 없어요 → 공고 탐색"(`/explore`)을 "⚡ 대타 찾아보기"(`/daeta`)로 변경. "매장 운영하세요?" 교차유도 카드(알바 단일 계정 대상)는 사용자 판단으로 완전 제거.

### 2. 대타 SOS "내 동네 설정" 지도화
- `components/daeta/SetNeighborhoodSheet.tsx` — 텍스트 검색만 되던 걸 카카오맵 핀 드래그 방식으로 개편. 새 정적 페이지 `public/map-picker.html`이 iframe으로 지도를 띄우고 드래그 종료 시 좌표를 역지오코딩해서 부모 창에 postMessage.
  - **버그 1**: `proxy.ts`의 `PUBLIC_PATHS`에 등록을 빼먹어서 iframe이 로그인/랜딩으로 리다이렉트되던 문제 → 등록 완료.
  - **버그 2**: 역지오코딩이 도로명주소 기준이라 "리" 단위가 빠지던 문제(검색 선택은 지번주소라 정상, 드래그만 깨짐) → 지번주소(`address`) 기준으로 파싱 통일.
- `components/daeta/DaetaSosHome.tsx` — 동네 미설정/알림 꺼짐 상태일 때만 뜨는 시작 안내 배너 추가("📍 동네 설정하기" / "🔔 대타 알림 켜기" 버튼).
- **FK 자가치유**: `worker_profiles`/`users` 관련 upsert가 `"violates foreign key constraint worker_profiles_user_id_fkey"`로 실패하는 계정 발견 — `public.users` 행이 없는 레거시 계정 문제. `lib/onboarding.ts`에 `ensureUserRow()` 추가해서 해당 upsert들 직전에 자가치유하도록 함.

### 3. 대타 근무조건 — 휴게시간·최소근무시간
- 근로기준법 54조(4시간↑30분, 8시간↑1시간 휴게, 초단기도 예외 없음) 준수용으로 `DaetaRegisterModal.tsx`에 휴게시간 입력 추가(근무시간 바뀔 때 법정 최소 자동 제안, 미달 시 등록 차단). `lib/utils.ts`에 `calcLegalBreakMinutes()` 추가.
- `app/api/daeta/complete/route.ts`, `components/daeta/DaetaHistoryView.tsx` — 정산 시 실제/예정 근무시간에서 휴게시간을 차감하도록 계산 로직 통일.
- 최소 근무시간 1시간 미만 등록 차단 추가(법정 의무는 아니고 어뷰징 방지용 정책값).
- **DB**: `supabase/patch_daeta_break_minutes.sql`(`daeta_postings.break_minutes` 컬럼) — **실행 완료**.

### 4. 대타 지원/요청 플로우 정리
- **지원 vs 받은 요청 구분**: `appliedMatchIds`를 `initiated_by` 기준으로 갈라서, 사장님이 알바생에게 직접 보낸 1:1 SOS 요청이 "지원 완료"로 잘못 표시되던 걸 "📥 나에게 직접 요청함" + 수락/거절로 분리(`DaetaSosHome.tsx`).
- 지원 취소 버튼을 카드에 인라인으로 추가(`cancelApplication`), 지원한 공고는 각 섹션(긴급/일반) 안에서 상단 정렬.
- **시간 겹침 자동감지**: 확정된 근무와 시간이 겹치는 다른 대기중 지원/요청을 발견하면 취소를 정중히 유도하는 팝업(강제 아님) — 취소 시 자동 생성된 정중한 사유가 상대 사장님 알림에 실림. `/api/lovecall` PATCH cancel에 `reason` 파라미터 추가, 양방향(알바생↔사장님) 대칭 적용.
- 취소/거절 알림 기본 문구에 "다른 지원자를/좋은 곳을 찾아보세요!" 류 안내 추가(5곳).
- **필수 자격요건 사전 확인**: 지원하기 클릭 시 공고의 법정 필수 자격(예: 보건증)이 내 이력에 없으면 경고 후 확인받고 진행하도록 함 — 기존 카드덱(구 화면)에만 있던 필터링 로직이 현재 메인 화면엔 빠져있던 걸 발견해서 추가.
- `app/mypage/applications/page.tsx`, `app/api/lovecall/route.ts` — 대타 관련 보낸 지원/받은 요청은 이제 대타 홈 카드에서 바로 처리되니 이 목록에서 제외(일반 채용 지원/제안은 유지). "지원 완료" 알림 링크가 `/mypage`로만 가던 것도 실제 현황 화면으로 수정.

### 5. 마이페이지 정리
- "내 프로필" → "내 이력서" 라벨 변경.
- "내 구직 활동" 섹션(지원현황 배너 + 직종/희망임금/지역/구직중토글/삭제 카드) 전체 삭제 — 안 쓰는 `WorkerProfileStatus` 컴포넌트도 같이 제거. 워커 숏컷 그리드의 빈 6번째 칸을 "📋 지원 현황"(`/mypage/applications?tab=worker`)으로 채움.

### 6. 이력서 페이지 전면 개편 (가장 큰 작업)
- **`/worker/profile` 재구성**: "구직 희망조건"(희망지역·희망시급·근무가능요일·선호근무시간·근무기간·즉시근무가능 토글·알바경력 개월수 입력)을 전부 제거 — 지금 대타 중심 흐름에서 아무 데도 안 읽히는 옛 잡보드 모델 잔재였음(지역 지오코딩 로직까지 포함, "내 동네 설정"과 중복이었음).
  - **신규**: 👤 개인정보(실명/연락처/주소) 입력 추가 — `app/contract/page.tsx`가 이미 갖고 있던 `users` SOT + 계약서 저장 시 역sync 흐름을 그대로 재사용(새 구조 안 만듦). 이력서에서 미리 채워두면 계약서 작성 때 자동으로 불러와지고, 계약서에서 고치면 다시 이력서에 반영됨 — 확인 결과 phone/address까지 포함해 완전 대칭.
  - 유지: 프로필 사진, 주요 업무/직종(`desired_type` 필드명 유지 — 대타 카드 배지가 읽으므로), 보유 자격증·실무기술, 자기소개, 이력서 공개 토글.
- **`/worker/[id]`**: 옛 "📋 구직 희망 조건" 표시 블록(희망시급/근무요일/근무시간) 제거. 개인정보(실명/연락처/주소)는 본인에게만 노출(다른 사람껀 여전히 계약서 시점에만 공개). 경력 저장/삭제할 때마다 검증된 파잡 이력+직접입력 경력 합계를 `worker_profiles.experience_months`에 캐시 동기화(대타 카드 "경력 N개월" 배지가 안 깨지도록).
- **편집 UX 개편**: `components/worker/ResumeEditForm.tsx`, `components/worker/GalleryEditForm.tsx`로 폼 로직 분리 — `/worker/profile` 페이지와 `/worker/[id]`의 팝업이 같은 컴포넌트를 공유. 이제 이력서 페이지에서 "이력서 수정"/사진 연필 아이콘을 눌러도 페이지 이동 없이 바텀시트 팝업으로 끝남(저장하면 그 자리에서 갱신). `/worker/[id]`의 "⋯" 메뉴는 본인=삭제하기만, 남이 보면 신고/차단만 남도록 정리.
- 스키마는 이번엔 컬럼 DROP 안 함 — `desired_wage`/`desired_region` 등을 explore/job 등 다른 화면이 아직 읽고 있어서 입력 UI만 빼고 컬럼은 유지.

---

## DB 마이그레이션
- [x] `supabase/patch_daeta_break_minutes.sql` — **실행 완료(2026-08-22, 사용자 확인)**.

## 검증
- `npx tsc --noEmit` — 매 변경 후 반복 실행, 전부 통과(기존부터 있던 무관 에러 3건만 잔존: `app/explore/page.tsx`, `app/job/[id]/page.tsx`, `.next/types/validator.ts`의 team-compat 모듈 에러).
- 브라우저 실기동 테스트는 안 함(사용자 방침에 따라 dev 서버/preview 직접 실행 안 함) — 특히 이력서 팝업 전환, 지도 핀 선택 UI는 실제 화면에서 직접 확인 필요.

---

## 미완료 / 다음 작업
- [ ] `desired_wage`/`desired_region`/`work_days`/`work_hours`/`available_now`(worker_profiles 중복분)/`experience_months`(수동입력분) 컬럼 — 입력 UI는 다 뺐지만 explore/job/[id] 등이 아직 읽고 있어서 컬럼 자체는 유지 중. 그 화면들도 정리되면 그때 DROP 검토.
- [ ] 계약서 PDF 생성 Python 서브프로세스 → Node 네이티브(pdf-lib) 재구현 — 이전 세션부터 계속 이월 중, 이번에도 미착수.
- [ ] 시간 겹침 자동취소 팝업이 "같은 세션 내 1회"만 억제하는 구조라, 페이지 새로고침하면 다시 뜰 수 있음 — 필요하면 서버 측 dismiss 기록으로 승격 검토.

---

> 작성: 2026-08-22 02:03 KST
> 브랜치: main
