import { createClient } from "@supabase/supabase-js";
import { createNotification } from "@/lib/notify";
import { extractMediaStoragePath } from "@/lib/storagePath";

const getServiceClient = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

// 탈퇴 신청 즉시 실행 — 유예기간(7일) 중에도 마켓플레이스 공개 노출은 바로 막아야 한다
// (개인정보가 계속 전체공개로 남는 게 유예기간보다 우선순위 높은 문제라서). PII 자체는
// 아직 지우지 않는다 — 유예기간 중 취소(app/api/withdraw/cancel)하면 되돌릴 수 있어야 하므로.
export async function hideFromMarketplace(userId: string) {
  const supabaseAdmin = getServiceClient();

  await supabaseAdmin.from("worker_profiles")
    .update({ is_active: false, is_public: false })
    .eq("user_id", userId);
  await supabaseAdmin.from("employer_profiles")
    .update({ is_deleted: true })
    .eq("user_id", userId);

  await supabaseAdmin.from("job_postings")
    .update({ status: "closed" })
    .eq("user_id", userId)
    .neq("status", "closed");
  await supabaseAdmin.from("daeta_postings")
    .update({ status: "cancelled" })
    .eq("user_id", userId)
    .eq("status", "pending");
}

// 유예기간 중 취소 — 노출만 되돌린다. 닫힌 공고를 자동으로 재오픈하진 않음(의도치 않게
// 오래된 공고가 갑자기 다시 뜨는 걸 막기 위해) — 필요하면 사용자가 직접 다시 연다.
export async function restoreMarketplaceVisibility(userId: string) {
  const supabaseAdmin = getServiceClient();

  await supabaseAdmin.from("worker_profiles")
    .update({ is_active: true, is_public: true })
    .eq("user_id", userId);
  await supabaseAdmin.from("employer_profiles")
    .update({ is_deleted: false })
    .eq("user_id", userId);
}

// 유예기간이 끝난 뒤 실제로 실행되는 탈퇴 확정 — 개인정보(연락처/주소/생년월일/실명/
// 프로필사진/계좌/HEXACO 결과 등)를 익명화하고 재로그인을 차단한다. 근로기준법상 보존
// 의무가 있는 계약서/임금명세서/근태 기록은 상대방(사장님·알바생)의 정산·분쟁 대비
// 기록이기도 해 삭제하지 않고, 사용자 식별 정보만 제거한다(계약서 쪽은 계약 체결
// 시점 성명 스냅샷(contract_data)이 별도로 있어 이 익명화의 영향을 받지 않음).
// 성향분석 원본(HEXACO/bio5)은 지우기 전에 비식별 파생값만 research_snapshots로 옮겨 보존한다.
export async function finalizeWithdrawal(userId: string) {
  const supabaseAdmin = getServiceClient();

  // 0. 성향분석 파생값을 지우기 전에 비식별 연구 데이터로 먼저 떼어낸다 (users와 FK 없음 —
  // 재식별 불가). 원본 대화·자유서술 텍스트는 제외하고 구조화된 결과만 남긴다.
  const { data: userRow } = await supabaseAdmin.from("users")
    .select("created_at").eq("id", userId).maybeSingle();
  const { data: wpRow } = await supabaseAdmin.from("worker_profiles")
    .select("birth_year, sido, sigungu, hexaco_data, bio5_data, analyzed_mbti, work_count, is_verified")
    .eq("user_id", userId).maybeSingle();
  const { data: epRow } = await supabaseAdmin.from("employer_profiles")
    .select("sido, sigungu, bio5_data, analyzed_mbti, business_type")
    .eq("user_id", userId).maybeSingle();

  if (wpRow && (wpRow.hexaco_data || wpRow.bio5_data || wpRow.analyzed_mbti)) {
    await supabaseAdmin.from("research_snapshots").insert({
      role: "worker",
      region_bucket: [wpRow.sido, wpRow.sigungu].filter(Boolean).join(" ") || null,
      age_decade: wpRow.birth_year ? `${Math.floor(wpRow.birth_year / 10) * 10}년대생` : null,
      hexaco_data: wpRow.hexaco_data,
      bio5_data: wpRow.bio5_data,
      analyzed_mbti: wpRow.analyzed_mbti,
      work_count: wpRow.work_count,
      is_verified: wpRow.is_verified,
      account_created_at: userRow?.created_at || null,
    });
  }
  if (epRow && (epRow.bio5_data || epRow.analyzed_mbti)) {
    await supabaseAdmin.from("research_snapshots").insert({
      role: "employer",
      region_bucket: [epRow.sido, epRow.sigungu].filter(Boolean).join(" ") || null,
      bio5_data: epRow.bio5_data,
      analyzed_mbti: epRow.analyzed_mbti,
      business_type: epRow.business_type,
      account_created_at: userRow?.created_at || null,
    });
  }

  // 1. users 개인정보 익명화 (계약서 등 다른 테이블이 FK로 참조하는 id 자체는 보존)
  const { error: userErr } = await supabaseAdmin.from("users").update({
    nickname: "탈퇴한 사용자",
    nickname_lower: null,
    real_name: null,
    avatar_url: null,
    phone: null,
    address: null,
    address_detail: null,
    birth_date: null,
    region: null,
    employer_bot_knowledge: null,
    worker_result: null,
    employer_result: null,
    onboarded: false,
    bank_name: null,
    bank_number_enc: null,
    bank_account_enc: null,
    kakao_id: null,
    onboarding_data: null,
    push_token: null,
    withdrawal_requested_at: null,
  }).eq("id", userId);
  if (userErr) throw userErr;

  // 2. 프로필 비활성화 + 실제 PII 컬럼 제거 (요청 시점에 hideFromMarketplace가 이미
  // is_active/is_deleted는 꺼뒀지만, 실제 값 컬럼은 아직 안 지워져 있음)
  await supabaseAdmin.from("worker_profiles").update({
    is_active: false, is_public: false,
    name: null, birth_year: null, gender: null, bio: null, video_url: null,
    image_url: null, image_urls: [],
    address: null, sido: null, sigungu: null, eupmyeondong: null, region: null,
    lat: null, lng: null,
    hexaco_data: null, bio5_data: null, analyzed_mbti: null, tagline: null,
    best_matches: [], worst_matches: [],
  }).eq("user_id", userId);
  // employer_profiles는 business_name/주소 등이 과거 소속 직원 쪽 계약서에도 참조 맥락으로
  // 남아 D분류(상대방 소유 기록)에 해당해 유지하고, 사장님 개인 식별정보(대표자 실명/연락처)만 제거
  await supabaseAdmin.from("employer_profiles").update({
    is_deleted: true,
    ceo_name: null, biz_tel: null,
    bio5_data: null, analyzed_mbti: null, tagline: null,
    best_matches: [], worst_matches: [], caution: null,
  }).eq("user_id", userId);

  // 3. 공개 노출 중인 공고 비공개 전환 (요청 시점에 이미 한 번 처리됐지만, 유예기간
  // 중 사용자가 새로 재오픈했을 가능성까지 대비해 확정 시점에 다시 한번 닫는다)
  await supabaseAdmin.from("job_postings")
    .update({ status: "closed" })
    .eq("user_id", userId)
    .neq("status", "closed");
  await supabaseAdmin.from("daeta_postings")
    .update({ status: "cancelled" })
    .eq("user_id", userId)
    .eq("status", "pending");

  // 4. 팀 관계 정리 + 상대방 통지 (사장님/알바생 어느 쪽이 탈퇴하든 상대방이 겪는 문제라
  // 항상 같이 처리한다 — 한쪽만 고치면 "이미 탈퇴한 상대와 계속 팀으로 묶여있는" 상태가 남음).
  // 완료된 과거 재직 기록(status='left')은 안 건드리고, 아직 active인 관계만 종료 처리.
  const { data: asEmployerTeam } = await supabaseAdmin.from("team_members")
    .select("id, nickname, worker_id")
    .eq("employer_id", userId).eq("status", "active");
  const { data: asWorkerTeam } = await supabaseAdmin.from("team_members")
    .select("id, nickname, employer_id")
    .eq("worker_id", userId).eq("status", "active");

  if (asEmployerTeam && asEmployerTeam.length > 0) {
    await supabaseAdmin.from("team_members")
      .update({ status: "left" })
      .in("id", asEmployerTeam.map(t => t.id));
    await Promise.all(asEmployerTeam.filter(t => t.worker_id).map(t =>
      createNotification({
        userId: t.worker_id as string,
        type: "system",
        title: "🚪 사장님이 탈퇴해 소속이 종료됐어요",
        body: "함께 등록된 근무 기록과 계약서는 법정 보관기간 동안 그대로 조회할 수 있어요.",
        url: "/myteam",
      }).catch(() => {})
    ));
  }
  if (asWorkerTeam && asWorkerTeam.length > 0) {
    await supabaseAdmin.from("team_members")
      .update({ status: "left" })
      .in("id", asWorkerTeam.map(t => t.id));
    await Promise.all(asWorkerTeam.filter(t => t.employer_id).map(t =>
      createNotification({
        userId: t.employer_id as string,
        type: "system",
        title: `🚪 ${t.nickname || "팀원"}님이 탈퇴해 소속이 종료됐어요`,
        body: "근태·정산 기록은 법정 보관기간 동안 그대로 남아있어요. 필요하면 새 팀원으로 대체 등록해주세요.",
        url: "/employer/records",
      }).catch(() => {})
    ));
  }

  // 아직 상대방의 응답을 기다리던 매칭(대타 수락 대기 등)은 더 진행될 수 없으니 취소 처리
  await supabaseAdmin.from("matches")
    .update({ status: "cancelled" })
    .or(`employer_id.eq.${userId},worker_id.eq.${userId}`)
    .eq("status", "pending");

  // 4.5. 법정보존기한 설정 (근로기준법 등 관련 규정상 최소 3년 — retention_until이 지난
  // 뒤에는 app/api/cron/purge-expired가 하드 삭제한다). 이미 상대방 쪽 탈퇴로 먼저
  // 설정돼있으면 덮어쓰지 않는다 — 더 짧게 당겨질 이유가 없어서.
  const retentionUntil = new Date();
  retentionUntil.setFullYear(retentionUntil.getFullYear() + 3);
  const retentionUntilIso = retentionUntil.toISOString();

  await supabaseAdmin.from("contracts")
    .update({ retention_until: retentionUntilIso })
    .or(`employer_id.eq.${userId},worker_id.eq.${userId}`)
    .is("retention_until", null);
  await supabaseAdmin.from("payslips")
    .update({ retention_until: retentionUntilIso })
    .or(`employer_id.eq.${userId},worker_id.eq.${userId}`)
    .is("retention_until", null);
  await supabaseAdmin.from("attendance")
    .update({ retention_until: retentionUntilIso })
    .or(`employer_id.eq.${userId},worker_id.eq.${userId}`)
    .is("retention_until", null);

  const { data: allTeamRows } = await supabaseAdmin.from("team_members")
    .select("id")
    .or(`employer_id.eq.${userId},worker_id.eq.${userId}`);
  if (allTeamRows && allTeamRows.length > 0) {
    await supabaseAdmin.from("team_member_documents")
      .update({ retention_until: retentionUntilIso })
      .in("team_member_id", allTeamRows.map(t => t.id))
      .is("retention_until", null);
  }

  // 5. 푸시 구독 해지
  await supabaseAdmin.from("push_subscriptions").delete().eq("user_id", userId);

  // 6. 재로그인 차단 (auth 계정 자체는 남기되 로그인 불가 처리 — 계약서 등 참조 무결성 보존)
  await supabaseAdmin.auth.admin.updateUserById(userId, { ban_duration: "876000h" });

  // 7. 본인 전용 데이터 하드삭제 — 상대방이 조회할 권리가 없고(알림함/게임기록/차단목록)
  // 법정 보존 근거도 없는 데이터라 익명화가 아니라 완전 삭제한다. 유예기간(7일) 동안 취소하면
  // 이 단계 자체가 아예 실행되지 않으므로 "취소하면 전부 그대로"가 항상 보장된다.
  // 채팅(messages/chats)·AI 상담 로그(bot_chat_logs)는 반대로 여기서 지우지 않는다 — 상대방이
  // 계속 봐야 하는 대화 기록(D분류)이거나, 발신자 식별정보는 이미 1단계에서 users 익명화로
  // 끊겼기 때문에(조인 결과가 자동으로 "탈퇴한 사용자"로 보임) 원문까지 지울 이유가 없다.
  await supabaseAdmin.from("notifications").delete().eq("user_id", userId);
  await supabaseAdmin.from("paz_memory").delete().eq("user_id", userId);
  await supabaseAdmin.from("sudoku_records").delete().eq("user_id", userId);
  await supabaseAdmin.from("sudoku_ratings").delete().eq("user_id", userId);
  await supabaseAdmin.from("user_blocks").delete().or(`blocker_id.eq.${userId},blocked_id.eq.${userId}`);
  await supabaseAdmin.from("feed_likes").delete().eq("user_id", userId);
  await supabaseAdmin.from("feed_bookmarks").delete().eq("user_id", userId);
  await supabaseAdmin.from("feed_comments").delete().eq("user_id", userId);
  await supabaseAdmin.from("store_follows").delete().eq("user_id", userId);

  // 본인이 쓴 피드 글은 본인 창작물이라 상대방 권리가 없음 — 미디어 원본도 스토리지에서 같이 지운다
  // (DB 행만 지우면 이미지/영상 파일이 고아로 남아 사실상 파기가 아니라 방치가 됨).
  const { data: ownPosts } = await supabaseAdmin.from("feed_posts")
    .select("id, media_urls").eq("user_id", userId);
  if (ownPosts && ownPosts.length > 0) {
    const paths = ownPosts.flatMap(p => (p.media_urls || []).map((u: string) => extractMediaStoragePath(u)))
      .filter((p): p is string => !!p);
    if (paths.length > 0) {
      const { error: storageErr } = await supabaseAdmin.storage.from("media").remove(paths);
      if (storageErr) console.error("[finalizeWithdrawal] feed media remove error:", storageErr);
    }
    await supabaseAdmin.from("feed_posts").delete().eq("user_id", userId);
  }
}
