# PAZAB v2 — 작업 히스토리

## 2026-07-16

### UI 통일: 엔티티 링크 버튼 & 메뉴 권한 분리

#### EntityLink 컴포넌트 도입 (`components/EntityLink.tsx`)
- 앱 전체에서 "아바타 + 이름 + 액션 →" 형태의 링크 버튼을 단일 컴포넌트로 통일
- variant: `hero` (히어로 이미지 위 dark glass) / `content` (콘텐츠 영역 surface2) / `chip` (카드 내 작은 뱃지)
- 적용 위치:
  - `job/[id]` 히어로 → 매장 홈 (variant: hero, 매장 이미지 아바타)
  - `worker/[id]` 히어로 → 개인 프로필 (variant: hero)
  - `store/[id]` 콘텐츠 → 사장님 프로필 (variant: content)
  - `feed/page` 카드 → 매장홈 chip (variant: chip)

#### 탐색 바텀시트 개선 (`explore/page.tsx`)
- 공고 팝업 아바타: 사장님 개인사진 → 매장 이미지로 변경
- 부제: 사장님 닉네임 → 업종(business_type)으로 변경
- `isOwner` 판별 후 카드 메뉴 분기 (수정/삭제 vs 숨기기/관심없음/신고)

#### ⋯ 메뉴 작성자/타인 분리
- `JobCard` (탐색 카드): `isOwner` prop 추가 → 작성자: 수정/삭제, 타인: 숨기기/관심없음/신고
- `worker/[id]` 상단 ⋯: 작성자 → 수정/삭제, 타인 → 신고/차단
- `job/[id]` 상단 ⋯: 작성자 → 수정/삭제, 타인 → 신고/차단
- 상세 페이지 하단 "수정하기" 버튼 제거 → ⋯ 메뉴로 통합
