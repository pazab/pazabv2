# PAZAB 개발 인수인계 문서
**작성일:** 2026-06-30  
**작성시간:** 13:04  
**브랜치:** `main`  
**작업 범위:** myteam/mypage UI 전면 개편 + DateWheelPicker 신규 구현

---

## 1. 이번 세션 완료 작업 전체 목록

### 1-1. 색상 체계 통일 (핑크↔보라 역할 정의)
- **알바생(worker) = 핑크 dominant** → `linear-gradient(135deg, #ec4899 60%, #7c3aed)`
- **사장님(employer) = 보라 dominant** → `linear-gradient(135deg, #7c3aed 60%, #ec4899)`
- 60% stop 값이 핵심: 앞 색이 대부분을 차지해 구분 명확히 됨
- 적용 파일: `app/myteam/page.tsx`, `app/mypage/page.tsx`

### 1-2. DateWheelPicker 신규 구현 (`components/DateWheelPicker.tsx`)
- native `<input type="date">` 대체 → Android 스타일 3컬럼 휠 (년/월/일)
- `TimeWheelPicker`와 동일한 Pointer Capture API + requestAnimationFrame 모멘텀 방식
- 연도 범위: 2015 ~ 현재 연도
- 월: 01~12 (padStart 2자리), 일: 해당 월 최대일 자동 계산
- Props: `value: string` (YYYY-MM-DD), `onChange`, `onClose`, `onConfirm`
- 바텀 시트 + 블러 딤 배경, 취소/확인 헤더 버튼
- `onConfirm` 시에만 Supabase 저장 (onChange는 UI 프리뷰만)
- 사용 위치: `WorkerMemberScroll` 컴포넌트 내 입사일 수정

### 1-3. myteam 페이지 전면 개편 (`app/myteam/page.tsx`)

#### 핵심 버그 수정: PAZAB 팀원 0명 문제
- **원인**: `loadTeam()` 쿼리에 `match_id` 컬럼을 select했으나 `team_members` 테이블에 해당 컬럼 없음
- PostgREST 동작: 존재하지 않는 컬럼 select 시 쿼리 전체가 null 반환 (빈 배열 아님)
- `if (!data) return` 조건에 걸려 setMembers 호출 안 됨 → 항상 0명 표시
- **수정**: select에서 `match_id` 제거, contracts/matches/employer_profiles 연쇄 조회 제거
- enriched 매핑 단순화: `m.wage`, `m.work_days`, `m.work_hours` 직접 사용 (team_members에 저장된 값)

#### 상태(State) 추가
```typescript
const [myStore, setMyStore] = useState<any>(null);   // 사장님 본인 매장 정보
const [teamOpen, setTeamOpen] = useState(false);     // 내 팀 섹션 접힘/펼침
const [workOpen, setWorkOpen] = useState(false);     // 내 소속 섹션 접힘/펼침
```

#### loadTeam() 변경사항
```typescript
// 1. 내 매장 정보 추가 fetch
const { data: storeData } = await supabase.from("employer_profiles")
  .select("id, business_name, business_type, region, wage, work_days, work_hours, is_active")
  .eq("user_id", uid).eq("is_deleted", false)
  .order("created_at", { ascending: false }).limit(1).maybeSingle();
setMyStore(storeData || null);

// 2. select에서 match_id 제거 (핵심 버그 수정)
.select(`id, worker_id, employer_id, hire_date, status, wage, work_days, work_hours, member_role,
  users!team_members_worker_id_fkey (nickname, avatar_url, worker_result, email, trust_score)`)

// 3. 팀원 있으면 자동 펼침
if (enriched.length > 0) setTeamOpen(true);
```

#### loadMyWork() 변경사항
```typescript
// 소속 있으면 자동 펼침
if (mapped.length > 0) setWorkOpen(true);
```

#### 내 소속 섹션 토글 UI
```jsx
<button onClick={() => setWorkOpen(v => !v)}
  style={{ width:"100%", background:"none", border:"none", padding:"4px 0 12px", cursor:"pointer",
    display:"flex", alignItems:"center", justifyContent:"space-between" }}>
  <div style={{ display:"flex", alignItems:"center", gap:10 }}>
    <p style={{ fontSize:16, fontWeight:800, color:"var(--text)", margin:0 }}>내 소속</p>
    {current.length > 0 && <span style={{ fontSize:12, background:"rgba(236,72,153,0.15)", color:"#f9a8d4",
      borderRadius:20, padding:"2px 10px", fontWeight:700 }}>{current.length}곳</span>}
    {current.length === 0 && <span style={{ fontSize:12, color:"var(--text-muted)", opacity:0.6 }}>없음</span>}
  </div>
  <span style={{ color:"var(--text-muted)", fontSize:22, lineHeight:1, transition:"transform 0.2s",
    transform: workOpen ? "rotate(180deg)" : "none" }}>⌄</span>
</button>
{workOpen && (/* 내용 */)}
```

#### 내 팀 섹션 토글 UI
- 동일한 패턴, 보라색 뱃지 (`rgba(124,58,237,0.15)`, `#c4b5fd`)
- `팀원 N명` 뱃지 또는 `없음` 텍스트

#### 내 팀 섹션: 사장님 매장 카드 (myStore)
- 내 팀 섹션 상단에 본인 매장 정보 카드 표시
- 그라데이션: `linear-gradient(135deg,#7c3aed 60%,#ec4899)` (보라 dominant)
- 시급/근무요일/근무시간 3열 그리드
- "✏️ 매장 정보 수정" 버튼 → `/employer/register?edit=true&jobId=${myStore.id}&return=myteam`

#### 팀원 아바타 그라데이션 변경
- 기존: `#7c3aed,#ec4899` → 변경: `#f59e0b,#ef4444` (앰버-레드, 팀원 개성 표현)

#### WorkerMemberScroll 카드 헤더 색상
- `linear-gradient(135deg,#ec4899 60%,#7c3aed)` — 핑크 dominant (알바생 관점)

#### 입사일 수정 UI 변경
- 기존: 인라인 `<input type="date">` + 저장/취소 버튼
- 변경: 버튼 클릭 시 `DateWheelPicker` 바텀시트 오픈
```jsx
<button onClick={() => setEditHireDate(true)}>
  {hireDateInput || "미설정"} <span>수정</span>
</button>
{editHireDate && (
  <DateWheelPicker
    value={hireDateInput || new Date().toISOString().split("T")[0]}
    onChange={v => setHireDateInput(v)}
    onClose={() => setEditHireDate(false)}
    onConfirm={async v => {
      setHireDateInput(v);
      await supabase.from("team_members").update({ hire_date: v }).eq("id", m.id);
      setEditHireDate(false);
      onRefresh?.();
    }}
  />
)}
```

### 1-4. mypage 페이지 전면 개편 (`app/mypage/page.tsx`)

#### 탭 제거 → 단일 스크롤 페이지
- 제거: `activeSection` 상태, `sectionParam`, 탭 바 JSX, 탭 기반 useEffect
- 추가: `showWorkerCalls`, `showEmployerCalls` 상태 (러브콜 아코디언)

#### 페이지 구조 (위→아래)
```
1. 프로필 카드 (아바타, 닉네임, user_type 뱃지, 로그아웃)
2. 그리드 타일 (팀·소속, 팀원 초대) ← 섹션 위로 이동
3. 알바생 섹션 (핑크 dominant 헤더)
4. 사장님 섹션 (보라 dominant 헤더)
5. 로그아웃 버튼
```

#### 섹션 헤더 색상
```
알바생: linear-gradient(135deg, #ec4899 60%, #7c3aed)  카드 border: rgba(236,72,153,0.18)
사장님: linear-gradient(135deg, #7c3aed 60%, #ec4899)  카드 border: rgba(124,58,237,0.18)
```

#### 러브콜 아코디언 (섹션 헤더 내 버튼)
- 기본 접힘, 헤더 내 "러브콜" 버튼 클릭 시 토글
- 미읽음/대기중 러브콜 있으면 숫자 뱃지 표시
- `showWorkerCalls` / `showEmployerCalls` 상태로 제어
- 아코디언 내용: 기존 러브콜 목록 (수락/거절 버튼 포함)

#### 버튼 스타일 통일
- 알바생 구직 공고 등록하기: `rgba(236,72,153,0.15)` 핑크 배경
- 사장님 공고 등록하기: `rgba(124,58,237,0.15)` 보라 배경
- 미리보기: `rgba(255,255,255,0.05)` 중립 글래스

---

## 2. 현재 파일 상태

| 파일 | 상태 | 비고 |
|------|------|------|
| `app/myteam/page.tsx` | ✅ 수정됨 | 색상, 토글, 버그수정, DateWheelPicker |
| `app/mypage/page.tsx` | ✅ 수정됨 | 탭 제거, 단일스크롤, 러브콜 아코디언 |
| `components/DateWheelPicker.tsx` | ✅ 신규 생성 | |
| `docs/PAZAB_DEV_HANDOVER_20260630_1500.md` | 🗑 삭제 | 구버전 |
| `docs/PAZAB_DEV_HANDOVER_20260630_1830.md` | 🗑 삭제 | 구버전 |
| `docs/20260630_0207_PAZAB_DEV_HANDOVER.md` | 📄 미추가 | untracked |
| `docs/20260630_0255_PAZAB_DEV_HANDOVER.md` | 📄 미추가 | untracked |

---

## 3. 이전 세션에서 이미 완료된 DB 작업 (재실행 불필요)

```sql
-- team_members 컬럼 추가 (완료)
member_role text DEFAULT 'staff'
work_days   text
hire_date   date
-- push_subscriptions 테이블 생성 (완료)
-- patch_manager_role.sql (완료)
-- users_select_public_basic RLS 정책 추가 (완료)
```

---

## 4. SQL 실행 현황 (2026-06-30 완료)

```sql
-- ✅ 1. 닉네임 unique index (완료)
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_nickname_lower ON users (lower(nickname))
  WHERE nickname IS NOT NULL AND nickname != '';

-- ✅ 2. 기존 유저 nickname null인 경우 name으로 채우기 (완료)
UPDATE users SET nickname = name WHERE nickname IS NULL AND name IS NOT NULL;

-- ✅ 3. 초대 수락자 자기 자신 insert RLS (완료)
CREATE POLICY "team_members_self_join" ON team_members FOR INSERT WITH CHECK (
  auth.uid() = worker_id
);
```

---

## 5. 알려진 이슈 / 미완성 항목

| 항목 | 상태 | 비고 |
|------|------|------|
| 닉네임 unique index | ✅ 완료 | 2026-06-30 실행 |
| team_members_self_join RLS | ✅ 완료 | 2026-06-30 실행 |
| 근태 전체보기 `/myteam/attendance` | ❌ 미구현 | 버튼 제거로 임시처리 |
| 웹푸시 실제 발송 | ⚠️ 미테스트 | VAPID 키 설정됨 |
| 사장님 팀원 상세 `/employer/team/[id]` | ❌ 미구현 | 근무조건 수정 페이지 |
| 계약서 플로우 | ❌ 재검토 필요 | match_id 없이 team_member_id 기반으로 |
| 입사일 이전 데이터 | ❌ null | 수동 SQL UPDATE 필요 |

---

## 6. 색상 시스템 정리 (앞으로 일관성 유지)

```
알바생(worker) = 핑크 → linear-gradient(135deg, #ec4899 60%, #7c3aed)
사장님(employer) = 보라 → linear-gradient(135deg, #7c3aed 60%, #ec4899)
팀원 아바타 = linear-gradient(135deg, #f59e0b, #ef4444)  ← 중립, 개인 식별용

CSS 변수:
  --text, --text-muted, --surface, --surface2, --border
  pink accent: #ec4899, #f9a8d4, rgba(236,72,153,0.15)
  purple accent: #7c3aed, #c4b5fd, rgba(124,58,237,0.15)
```

---

## 7. 컴포넌트 구조 참고

### DateWheelPicker
```typescript
// components/DateWheelPicker.tsx
export default function DateWheelPicker({
  value,      // "YYYY-MM-DD" 형식
  onChange,   // (v: string) => void  — 휠 드래그 중 실시간 업데이트
  onClose,    // () => void           — 취소 또는 딤 클릭
  onConfirm,  // (v: string) => void  — 확인 버튼 (여기서 저장 로직 실행)
}: { ... })
```

내부 `Wheel` 컴포넌트는 `TimeWheelPicker`와 동일 패턴. `repeat` prop으로 반복 렌더 개수 제어 (년: 3회, 월/일: 5회).

### WorkerMemberScroll (myteam)
- `m.hire_date`: DB에서 가져온 초기값
- `hireDateInput` state: 로컬 편집값 (확인 전까지 DB 미반영)
- `editHireDate` state: DateWheelPicker 표시 여부

---

## 8. 테스트 계정

| 계정 | email | user_type | 비고 |
|------|-------|-----------|------|
| 사장님(본인) | ftc2sun@gmail.com | employer | 파스쿠찌 탕정역점 |
| aabb | aabbuju@gmail.com | both | 초대 수락 테스트 완료 |

---

## 9. 다음 세션 우선순위

1. ~~**Supabase SQL 3개 실행**~~ ✅ 완료
2. **근태 전체보기 페이지** `/myteam/attendance?memberId=xxx`
3. **사장님 팀원 상세** `/employer/team/[id]` — 근무조건 수정
4. **웹푸시 실제 테스트**
5. **계약서 플로우 재설계** — team_member_id 기반
