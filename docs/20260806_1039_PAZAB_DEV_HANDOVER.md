# PAZAB Dev Handover — 2026-08-06

## 오늘 작업 요약

### 1. "법정 필수" 자격증 칩 저대비 색상 수정

- **문제**: 자격증 선택 시 법정 필수(예: 바리스타 보건증) 칩이 분홍 테두리 + 같은 계열 분홍 글자라 강조 의도와 반대로 잘 안 보임.
- `app/worker/[id]/page.tsx`, `app/worker/profile/page.tsx`, `components/daeta/DaetaRegisterModal.tsx` — `--chip-pink-bg`/`--chip-pink-border`/`--pink-text` → `--danger-bg`/`--danger-border`/`--danger`로 교체, 미선택 상태에도 테두리 추가 + 굵게 표시.
- `app/worker/profile/page.tsx`의 칩 스타일 객체에 있던 `border` 중복 키(같은 오브젝트에 두 번 선언) 같이 정리.

### 2. 사진 크롭 "검정화면" 버그 — 실제 원인 규명 + 수정

- **증상**: 크롭 화면(`components/ImageCropModal.tsx`)에서 사진을 골라도 미리보기가 검정 화면으로만 남음. HEIC 변환, 대용량 다운스케일 등 여러 우회 시도가 전부 실패 — 포맷/용량과 무관하게 재현되고 콘솔 에러도 없었음.
- **진단**: 화면에 직접 상태를 찍는 임시 디버그 배지를 넣어 확인한 결과 `naturalWidth/Height`는 정상 값(브라우저는 이미지를 다 디코딩함)인데 React state `imgLoaded`만 계속 `false`로 남아있는 것을 확인.
- **원인**: `data:` URI는 네트워크 왕복이 없어서, 경우에 따라 브라우저가 `<img>`에 `onLoad` 리스너가 붙기도 전에 디코딩을 끝내버림 — 이 경우 `load` 이벤트 자체가 발생하지 않아 영원히 로딩 안 된 상태로 남는 레이스 컨디션. 작은 이미지일수록 더 빨리 디코딩되어 오히려 더 잘 재현됨(다운스케일이 안 먹힌 이유).
- **수정**: `onLoad`를 놓쳤을 가능성에 대비해 `img.complete`를 80ms 간격으로 폴링, 이미 로드가 끝나 있으면 직접 `handleImgLoad()` 호출하도록 보정 로직 추가.
- (참고: 이 진단 과정에서 다운스케일 우회 시도로 만들었던 `lib/imageDownscale.ts`, `lib/prepareImageUpload.ts`는 근본 원인이 아니었던 것으로 판명되어 되돌리고 삭제함 — 최종 코드는 HEIC 변환만 유지.)

### 3. 크롭 화면("사진 구도 조절") 반응형 확대

- 크롭 뷰포트가 고정 280px라 큰 화면에선 여백 낭비, 좁은 화면에선 작아 보이는 문제.
- `vw = Math.min(360, window.innerWidth - 64)`로 화면 폭 기반 계산 + `resize` 리스너로 회전 시 재계산.
- 모달 바깥 여백 16→12px, 안쪽 패딩 24→20px로 줄여 이미지 영역 비중 확대. 크롭 출력 캔버스 해상도는 그대로라 화질 영향 없음.

### 4. 매장 사진이 알바생 프로필 사진으로 전부 뒤바뀌는 버그 (심각)

- **증상**: "파잡 커리어"에서 구직 프로필(알바생 쪽) 사진을 저장했더니, 그 계정이 운영하는 **모든 매장**의 대문 사진이 알바생 사진과 동일하게 바뀜. DB 직접 조회로 확인 — `pazab@kakao.com`(both 계정) 소유 매장 3곳(탕정역점/온양점/아산신정호점)의 `employer_profiles.image_url`이 전부 `worker/...` 경로의 동일 파일로 통일되어 있었음.
- **원인**: `app/worker/profile/page.tsx`의 구직 프로필 저장 로직이
  ```js
  await supabase.from("employer_profiles").update({ image_url: profileData.image_url }).eq("user_id", session.user.id);
  ```
  로 그 유저 소유의 **모든** `employer_profiles` 행을 무조건 같은 사진으로 덮어씀. 매장이 1곳뿐인 1인 사장님을 위한 편의 동기화(2026-07-10 도입, `8d1bf92`)였는데, 매장이 여러 개인 계정에서 각자 고유하게 올려둔 매장 사진을 전부 파괴하는 부작용이 있었음.
- **수정**: `.is("image_url", null)` 조건 추가 — 아직 자기 사진이 없는 매장에만 알바생 사진을 대체 채움("fallback"), 이미 매장 고유 사진이 있으면 건드리지 않음.
- **미해결**: 이미 손상된 기존 DB 데이터(위 매장 3곳)는 원래 사진을 복구할 수 없어 별도 정리 필요 — 사용자 확인 대기 중.

### 5. 사진 업로드 ↔ 구직 프로필 작성 분리 여부 (논의만, 구현 안 함)

- 위 4번 버그의 근본 배경: **사진을 바꾸려면 무조건 "구직 프로필 작성" 폼(희망시급·근무가능시간 등 포함)을 거쳐야 함** — 알바를 할 생각이 없는 사장님도 사진만 바꾸려고 억지로 이 폼을 채우는 상황.
- 확인 결과 실은 이미 가벼운 경로(`handleSaveGalleryOnly`, "🖼️ 구직카드 사진" 메뉴)가 있어 지역/직종 없이 사진만 저장 가능 — 다만 이 경로엔 `users.avatar_url` 동기화가 빠져있던 걸 발견해 추가(아래 6-1).
- "사진 업로드 자체를 구직 프로필에서 완전히 분리"하는 큰 구조 변경은 이번엔 착수 안 함 — 가벼운 경로가 이미 있다는 걸 알게 되면서 우선순위가 낮아짐.

### 6. 파잡 커리어(`/worker/[id]`) 정보구조 정리

- **6-1. 사진 단독저장 경로 일관성**: `handleSaveGalleryOnly`에 `users.avatar_url` 동기화 누락 발견 → 추가. 매장 사진 동기화도 5-1과 동일하게 `.is("image_url", null)` 안전장치 적용.
- **6-2. "구직 희망 조건" 섹션 분리**: 희망시급/근무요일/근무시간이 "경력"이라는 이름의 그리드 항목과 섞여 있었음 — 실제 경력 타임라인(파잡 근무이력+직접입력)과 헷갈리는 문제. 섹션 제목을 "📋 구직 희망 조건"으로 바꾸고, 타임라인과 중복·불일치 소지가 있던 "경력"(신입/N개월) 칩은 제거.
- **6-3. 대타 SOS와 무관한 필드 노출 제한**: 대타 매칭(`DaetaWorkerHome.tsx`)은 `available_now`/팀이력만 보고 희망시급 등은 전혀 안 읽는다는 걸 코드로 확인 — 대타만 켜둔 사람에게 무의미한 "협의" placeholder가 보이던 것을, 실제로 값을 입력한 사람에게만 "구직 희망 조건" 섹션이 노출되도록 변경.
- **6-4. 현재 소속 노출 여부**: 사용자가 "현재 어디 소속인지 공개하는 게 맞나" 질문 → STRATEGY.md의 2-Tier 검증 신뢰 신호 전략과 일치한다고 판단, 그대로 유지(이미 `careerHistory`의 `isCurrent`/"재직중" 배지로 구현돼 있었음, 신규 구현 없음).

### 7. 대타 SOS 홈(사장님 화면) UX 개선

- **7-1. 인력 목록 Tier 정렬**: "실시간 대타 인력 목록"이 가입 최신순으로만 나열되고 Tier1(✅검증)/Tier2(🔵신규) 구분이 없던 것을 발견 — `lib/daetaTier.ts`의 `getWorkerTiers` 재사용해 Tier1 우선 정렬 + 후보별 배지 추가. 8명 초과 시 "더보기"로 접어서 목록이 무한정 길어지지 않게 함.
- **7-2. "직접 고르기" 중복 제거**: 카드덱(스와이프) 진입 버튼이 바로 위 "실시간 대타 인력 목록"과 같은 후보를 중복 노출해 혼란만 주던 것을 확인 — 진입 버튼만 제거(코드/`onOpenDeck` prop은 유지, 강등이지 삭제 아님).
- **7-3. "대타 내역" 버튼에 건수 표시**: 클릭 전까지 뭐가 들어있는지 알 수 없던 문제 — `matches` 카운트 쿼리 추가해 `(N건)` 표시.

### 8. 대타 SOS 날짜 입력 — 기간(다일) 지원 재설계

- **문제 인지**: 대타가 필요한 날짜가 하루로 고정돼 있어 "이틀 연속 커버" 요청을 못 담았음.
- **1차 시도(폐기)**: 날짜를 여러 개 골라 공고를 날짜별로 여러 건 생성하는 방식을 구현했다가, "같은 사람이 이틀 다 하고 싶으면 공고 2건에 따로 지원해야 하고 중간 날짜를 남이 채갈 수 있다"는 지적을 받고 폐기.
- **최종 구조**: `daeta_postings.work_date_end` 컬럼 추가(**`supabase/patch_daeta_date_range.sql`, 사용자가 SQL 에디터에서 직접 실행 완료**) — NULL이면 기존과 동일 하루, 값이 있으면 `work_date`~`work_date_end` 전체를 공고 1건이 커버해서 지원/수락도 기간 전체 단위로 한 번에 이뤄짐.
  - 등록 폼(`DaetaRegisterModal.tsx`): "하루만 진행" 체크박스(기본 체크) + 체크 해제 시 "종료일" 입력. 날짜를 하나씩 추가하는 칩 UI로 먼저 만들었다가 "낯설다"는 피드백으로 익숙한 시작일~종료일 방식으로 재작업.
  - 정산(`app/api/daeta/complete`): `wage × hours`에 `daetaDayCount(work_date, work_date_end)`를 곱해 기간 전체 급여 계산.
  - 자동 근로계약서(`app/api/lovecall` 수락 시): 기간에 걸친 요일마다 `workDays{Day}`/`workStart`/`workEnd`/`breakTime` 필드를 채우고 `start_date`~`end_date`를 전체 기간으로 저장(예전엔 하루치만 반영됐음).
  - 표시: `lib/utils.ts`에 `formatDaetaDateRange`/`daetaDayCount` 공용 헬퍼 추가, `DaetaSosHome`/`DaetaWorkerHome`/`DaetaHistoryView`/`DaetaPreviewClient`(비로그인 공유 미리보기)/`daetaEscalation`(알림 문구)에 반영.
- **의도적으로 미지원**: 요일마다 근무시간이 다른 경우 — "체크박스로 일별 시간 입력"도 검토했으나, 대타 SOS의 "원버튼" 단순함 원칙과 로스터링 툴급 UI 복잡도가 안 맞아 반려. 시간이 다르면 지금처럼 하루씩 따로 등록.

---

## 파일 변경 목록

| 파일 | 비고 |
|------|------|
| `components/ImageCropModal.tsx` | 검정화면 근본 원인 수정(img.complete 폴링) + 반응형 뷰포트 |
| `app/worker/profile/page.tsx` | 칩 색상 + 매장/구직카드 사진 덮어쓰기 버그 수정 |
| `app/worker/[id]/page.tsx` | 칩 색상 + 구직 희망조건 섹션 분리·조건부 노출 |
| `components/daeta/DaetaRegisterModal.tsx` | 칩 색상 + 날짜 범위(work_date_end) 입력 UI 전면 재작업 |
| `components/daeta/DaetaSosHome.tsx` | 인력목록 Tier정렬+더보기, 직접고르기 제거, 대타내역 건수, 날짜범위 표시 |
| `components/daeta/DaetaWorkerHome.tsx` | 날짜범위 표시 반영 |
| `components/daeta/DaetaHistoryView.tsx` | 날짜범위 표시 반영 |
| `app/daeta/page.tsx` | SOS 발동 호출부 정리 |
| `app/api/daeta/complete/route.ts` | 정산 계산에 일수 반영 |
| `app/api/lovecall/route.ts` | 자동 계약서에 기간 전체 요일/일자 반영 |
| `app/d/[code]/DaetaPreviewClient.tsx` | 비로그인 공유 미리보기 날짜범위 표시 |
| `lib/utils.ts` | `formatDaetaDateRange`/`daetaDayCount` 신규 |
| `lib/daetaEscalation.ts` | 알림 문구에 날짜범위 반영 |
| `db-schema.md` | `daeta_postings.work_date_end` 추가 |
| `supabase/patch_daeta_date_range.sql` | 신규 — **실행 완료** |

---

## 미완료 / 다음 작업

- [x] 손상된 매장 사진 데이터(`pazab@kakao.com` 매장 3곳) — 사용자가 수동으로 직접 정리 완료, 추가 조치 불필요.
- [ ] 사진 업로드를 구직 프로필 작성 폼에서 완전히 분리하는 구조 개선 — 이번엔 보류(5번 참고), 필요성 재대두되면 진행.
- [ ] (참고) `docs/20260804_0227_PAZAB_DEV_HANDOVER.md`의 미완료 항목(대타 Tier1 노쇼 반영, cron-job.org 실동작 확인, 카카오맵 위치 미리보기, mypage 레이아웃 확인)은 이번 세션에서도 다루지 않음 — 여전히 유효.

---

> 작성: 2026-08-06 10:39 KST, 갱신: 2026-08-06 13:59 KST
> 브랜치: main
