# PAZAB 핸드북 05 — STEP 5: HEXACO 분리 · 5턴 · CTA화
### 가입 동선에서 빼고, 매칭 점수 높이기로 유도
> **구현 순서**: 6번째 (마감재 — 매칭 정밀도 향상)
> **의존**: 탐색/매칭 동선
> **선행 읽기**: `00_blueprint.md`(결정 3)

---

## 1. 목표

### 1.1 문제
현재 HEXACO 10턴 인터뷰가 **가입 동선 한가운데**에 있어 최대 이탈 지점이다. 매칭의 핵심 자산이지만, 가치 체감 전에 가장 무거운 단계를 강요한다.

### 1.2 완료 정의 (DoD)
```
✅ 가입 동선에 HEXACO 없음 (STEP1이 이미 보장 — 여기선 진입점 재설계)
✅ 탐색/매칭 화면의 "매칭 점수 높이기" 배너 CTA로 진입
✅ 10턴 → 5턴 압축 (C·H·A에 턴 집중, 결정3)
✅ 결과 = 6요인 전부 표시 + 공유카드 (바이럴)
```

---

## 2. 화면

### 2.1 진입점 재설계
```
[탐색/매칭 화면 상단 배너]
  ┌────────────────────────────┐
  │ ✨ 매칭 점수 높이기          │
  │ 30초만에 나랑 맞는 가게 찾기 │
  │ [성향 분석 시작]            │
  └────────────────────────────┘

알바생 카피: "30초 만에 나랑 잘 맞는 사장님 찾기"
사장님 카피: "우리 매장에 딱 맞는 알바생 유형 찾기"
```

### 2.2 5턴 인터뷰
```
턴1: 성실성 (책임감·시간약속)  ← 가장 깊게
턴2: 정직성 (노쇼·신뢰)        ← 깊게
턴3: 원만성 (협업·갈등)
턴4: 외향성+감정성 (묶어서 가볍게)
턴5: 개방성 + 종합 마무리
   ↓
[결과 카드] 6요인 레이더 + 유형명 + 강점/주의 + [공유하기]
```

---

## 3. 데이터 흐름

```
배너 [성향 분석 시작] → /interview (진입점만 변경, 가입과 분리)
  → Claude API 5턴 대화 (프롬프트: C·H·A 신호 집중 추출)
  → 6요인 점수 산출 (C·H·A 정밀 / E·X·O 거친 추정)
  → users.worker_result(or employer_result) JSON 저장
  → hexaco_data 폴백 체인에 반영 (profiles → users.result.hexaco)
  → 결과카드 → 공유 (SNS 바이럴 루프)
  → 매칭 재계산 (기존 /api/match)
```

---

## 4. DB 변경

```sql
-- 기존 구조 활용. 추가 컬럼 최소.
-- HEXACO 완료 여부 + 턴 버전 추적
ALTER TABLE users ADD COLUMN IF NOT EXISTS hexaco_done boolean DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS hexaco_version text DEFAULT '5turn';
-- 결과는 기존 worker_result / employer_result JSON 재사용
-- hexaco_data 폴백: profiles.hexaco_data → users.result.hexaco → DEFAULT{3,3,3,3,3,3}
```

---

## 5. 코드 설계

```
수정:
  app/interview/page.tsx       — 10턴 → 5턴, C·H·A 집중 프롬프트
  app/explore/page.tsx         — "매칭 점수 높이기" 배너 추가
  app/employer/dashboard/page.tsx — 사장님용 배너 (STEP2 연계)
  app/result/page.tsx          — 6요인 결과카드 (기존 유지)
  lib/hexacoPrompt.ts (신규)    — 5턴 프롬프트 + 요인별 가중 추출
```

```typescript
// lib/hexacoPrompt.ts — 턴별 집중 요인
export const TURN_FOCUS = [
  { turn: 1, factors: ["conscientiousness"], depth: "deep" },
  { turn: 2, factors: ["honesty"], depth: "deep" },
  { turn: 3, factors: ["agreeableness"], depth: "normal" },
  { turn: 4, factors: ["extraversion", "emotionality"], depth: "light" },
  { turn: 5, factors: ["openness"], depth: "light" }, // + 종합
];
// 키: 소문자 풀스트링 (honesty, conscientiousness...) — 프로젝트 규약 준수
```

> 규약: HEXACO 키는 소문자 풀스트링. Big5 금지. AiGate 경유(createPazClient).

---

## 6. 연결관계

```
STEP 5 ──improves──> 매칭 점수 정밀도
   ├─→ STEP 1: 가입 동선 밖으로 분리 = STEP1 설계의 완성
   ├─→ STEP 2: 사장님 대시보드에도 배너 (HR 맥락에서 자연 유도)
   ├─→ STEP 3: 정직성(H) 정밀화 → 대타 노쇼 예측 강화
   └─→ 기존 /api/match: hexaco_data 폴백 체인 그대로, 정밀도만 향상
```

---

## 7. 검증

```
A: 가입 플로우에 HEXACO 안 나옴 (STEP1 동선 확인)
B: 탐색 배너 [성향분석] → 5턴 완료 → 결과카드 6요인 표시
C: C·H·A 점수가 E·X·O보다 응답 기반 분산 큼 (정밀 측정 확인)
D: 결과 후 /api/match 재계산 → 매칭점수 변동 확인
E: 공유카드 SNS 공유 동작
```

```powershell
git add app/interview/page.tsx app/explore/page.tsx app/employer/dashboard/page.tsx lib/hexacoPrompt.ts && git commit -m "feat: HEXACO 분리·5턴 압축·매칭점수 높이기 CTA화 (C·H·A 집중)" && git push
```

---

*PAZAB Handbook 05 — STEP 5 HEXACO 분리·CTA화 | 2026.06.29*
