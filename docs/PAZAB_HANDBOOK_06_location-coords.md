# PAZAB 핸드북 06 — STEP 6: 좌표 수집 전략
### 동네좌표 필수 + 정밀 GPS는 대타 순간만
> **구현 순서**: 4번째 (대타 매칭 인프라)
> **의존**: STEP 1(가입 3필드에 위치 포함)
> **선행 읽기**: `00_blueprint.md`(결정 7)

---

## 1. 목표

### 1.1 문제
대타·지역매칭은 좌표가 생명이라 **안 받으면 안 된다.** 하지만 GPS 강제 팝업은 피로도 최악(대타에서 이미 제거한 이력 있음). 둘을 화해시킨다.

### 1.2 완료 정의 (DoD)
```
✅ 모든 가입자가 주소검색만으로 읍면동 중심좌표 보유 (권한 팝업 0)
✅ 대타 SOS 등 "지금 여기" 순간에만 정밀 GPS "내 위치로" 버튼
✅ 읍면동 좌표만으로 지역 가중치 3단계(읍면동/구군/시도) 전부 작동
```

---

## 2. 화면

```
[필수 — 가입/셋업 3필드의 위치]
  [📍 동네 검색_________]  ← 주소 자동완성 (Kakao Local)
  → 선택 시 읍면동 중심좌표 자동 저장 (팝업 없음)

[선택 — 대타 피드 위치배지 (기존 구현)]
  📍 신창면 기준  🔍 변경
  → 바텀시트: [📍 내 위치로(GPS)] [🏪 매장 위치] [🔍 주소 검색]
     · "내 위치로" 누를 때만 GPS 권한 요청
```

---

## 3. 데이터 흐름

```
[가입 시점]
  주소문자열 → Kakao Local API → { lat, lng, sido, sigungu, eupmyeondong }
  → worker_profiles / employer_profiles 의 lat/lng + region 저장
  (STEP1 resolveAddress() 재사용)

[대타 시점]
  기준좌표 우선순위: 가게좌표(getDbBase) → 저장된 동네좌표 → GPS(버튼 시)
  → nearby_workers RPC (STEP3 4.4) 거리 박스 필터 → 앱 정밀거리
```

---

## 4. DB 변경

```sql
-- 좌표 컬럼은 STEP1 4.2에서 이미 추가됨 (lat/lng).
-- 여기선 region 3단계 파싱 보강 + 인덱스
CREATE INDEX IF NOT EXISTS idx_worker_lat_lng  ON worker_profiles(lat, lng);
CREATE INDEX IF NOT EXISTS idx_employer_lat_lng ON employer_profiles(lat, lng);

-- region 문자열 → 3단계 일관성 (기존 더미: '충남 아산시 신창면')
-- 파싱 규칙은 앱레벨 getRegionMatchLevel (explore에 이미 존재)
```

---

## 5. 코드 설계

```
수정:
  lib/onboarding.ts (STEP1)    — resolveAddress() 좌표+3단계 반환 (공용)
  app/onboarding/page.tsx      — 주소검색 → 좌표저장
  app/employer/setup/page.tsx  — 동일 (STEP2)
  app/daeta/page.tsx           — 기준좌표 우선순위 로직 (기존 getDbBase 보강)
  lib/geo.ts (신규)            — haversine 거리 + region 파싱 유틸
```

```typescript
// lib/geo.ts
export function haversine(a: {lat:number;lng:number}, b: {lat:number;lng:number}): number {
  const R = 6371, dLat = rad(b.lat-a.lat), dLng = rad(b.lng-a.lng);
  const x = Math.sin(dLat/2)**2 + Math.cos(rad(a.lat))*Math.cos(rad(b.lat))*Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1-x)); // km
}
const rad = (d:number) => d*Math.PI/180;

export type RegionLevel = "same-dong"|"same-gu"|"same-sido"|"other";
export function getRegionMatchLevel(a: string, b: string): RegionLevel { /* 3단계 파싱 */ }
```

---

## 6. 연결관계

```
STEP 6 ──infra──> 좌표/거리 → 대타·지역매칭의 토대
   ├─→ STEP 1: 가입 3필드 위치가 좌표 확보 지점
   ├─→ STEP 2: 가게좌표가 대타 기준점(getDbBase)
   ├─→ STEP 3: nearby_workers RPC + haversine로 2티어 피드 거리정렬
   └─→ 기존 /api/match: 지역 가중치 3단계 (읍면동+12/구군+4/타시도-15) 그대로
```

---

## 7. 검증

```
A: "신창면" 주소검색 → lat/lng 저장, region='충남 아산시 신창면'
B: 가입 시 GPS 권한 팝업 안 뜸
C: 대타 "내 위치로" 눌렀을 때만 GPS 요청
D: 읍면동 좌표만으로 매칭 지역가중치 3단계 작동 (분포 65~95 확인)
E: nearby_workers 박스필터 → 반경 내 알바생만 피드
```

```powershell
git add lib/geo.ts lib/onboarding.ts app/onboarding/page.tsx app/employer/setup/page.tsx app/daeta/page.tsx && git commit -m "feat: 좌표 수집 전략 - 동네좌표 필수(주소검색)/GPS는 대타만/거리정렬 인프라" && git push
```

---

*PAZAB Handbook 06 — STEP 6 좌표 수집 전략 | 2026.06.29*
