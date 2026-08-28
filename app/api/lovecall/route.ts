import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createNotification } from "@/lib/notify";
import { getWorkerTier } from "@/lib/daetaTier";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// 러브콜 보내기 (POST)
export async function POST(req: NextRequest) {
  try {
    const { employerId, workerId, message, senderType, employerProfileId, jobId, daetaPostingId } = await req.json();

    if (!employerId || !workerId) {
      return NextResponse.json({ error: "필수 정보 없음", success: false }, { status: 400 });
    }

    // 차단 관계면 지원/채용제안 자체를 막는다 — UserProfileBottomSheet.tsx가 "차단 시 이 사용자의
    // 대타 공고 지원이 제한됩니다"라고 안내하는데 실제로는 어디도 이걸 체크하지 않아서 장식이었음.
    // 어느 쪽이 차단했든(사장님이 알바생을, 알바생이 사장님을) 새 매칭 자체를 막는다.
    const { data: blockRow } = await supabase
      .from("user_blocks")
      .select("id")
      .or(`and(blocker_id.eq.${employerId},blocked_id.eq.${workerId}),and(blocker_id.eq.${workerId},blocked_id.eq.${employerId})`)
      .maybeSingle();
    if (blockRow) {
      return NextResponse.json({ error: "차단된 상대와는 지원/채용제안을 주고받을 수 없어요.", success: false }, { status: 403 });
    }

    // 대타 지원은 홈 목록(components/daeta/DaetaSosHome.tsx load())이 stage/allow_new와 무관하게
    // 열려있는 공고를 전부 보여주기 때문에, "신규(Tier2) 알바생에겐 노출 안 함(allow_new=false)"으로
    // 등록한 공고도 신규 계정이 목록에서 찾아 지원 자체는 할 수 있었던 구멍 — 알림 발송 단계
    // (lib/daetaEscalation.ts notifyNearby)에서만 Tier로 걸러졌지, 실제 지원 접수는 안 막혀있었다.
    // 사장님이 직접 특정 알바생에게 보내는 1:1 SOS(senderType==="employer")는 신규든 아니든
    // 사장님이 골라서 보내는 거라 이 게이트 대상이 아님 — 알바생이 스스로 지원할 때만 막는다.
    if (daetaPostingId && senderType === "worker") {
      const { data: posting } = await supabase
        .from("daeta_postings").select("escalation_stage, allow_new").eq("id", daetaPostingId).maybeSingle();
      // stage 3(신규 opt-in)/4(전체공개)에 도달하기 전엔 Tier1(검증)만 지원 가능
      if (posting && (posting.escalation_stage || 1) < 3) {
        const tier = await getWorkerTier(supabase, workerId);
        if (tier === "tier2") {
          return NextResponse.json({
            error: "아직은 검증된 알바생에게만 열려있는 대타예요. 조금 더 기다리면 신규 알바생에게도 열려요.",
            success: false,
          }, { status: 403 });
        }
      }
    }

    // 대타(SOS) 지원은 team_members가 매장 구분 없이 사장님 단위라, 다른 매장 소속 팀원도
    // 명시적으로 team-first 알림 대상이자 지원 대상임 (lib/daetaEscalation.ts notifyTeam 참고).
    // 정규 채용(jobId/employerProfileId)에서만 "이미 소속된 팀원" 차단을 적용한다.
    if (!daetaPostingId) {
      // 현재 활성 팀원 관계인지 체크 (퇴직 후 재입사 허용)
      const { data: activeTeam } = await supabase
        .from("team_members")
        .select("id")
        .eq("employer_id", employerId)
        .eq("worker_id", workerId)
        .eq("status", "active")
        .maybeSingle();

      if (activeTeam) {
        return NextResponse.json({ error: "이미 소속된 팀원이에요", success: false }, { status: 409 });
      }
    }

    // 진행 중인 매칭이 있는지 체크 (pending/accepted/interviewing만).
    // jobId/daetaPostingId가 있으면 같은 공고에 대해서만 중복 체크 — 다른 공고/다른 대타 건은 별개로 지원 가능해야 함.
    let dupQuery = supabase
      .from("matches")
      .select("id, progress_status")
      .eq("employer_id", employerId)
      .eq("worker_id", workerId)
      .in("progress_status", ["pending", "accepted", "interviewing"]);
    if (daetaPostingId) {
      dupQuery = dupQuery.eq("daeta_posting_id", daetaPostingId);
    } else if (jobId) {
      dupQuery = dupQuery.eq("job_id", jobId);
    }
    const { data: existing } = await dupQuery.maybeSingle();

    if (existing) {
      return NextResponse.json({ error: "이미 진행 중인 지원/채용 제안이 있어요", status: existing.progress_status, success: false }, { status: 409 });
    }

    const { data, error } = await supabase
      .from("matches")
      .insert({
        employer_id: employerId,
        worker_id: workerId,
        progress_status: "pending",
        match_score: null, // 컬럼 DEFAULT가 0이라 명시적으로 null을 넣어야 함 — 매칭점수 개념 자체를 폐기했으므로 항상 null
        employer_interest: senderType === "employer",
        worker_interest: senderType === "worker",
        initiated_by: senderType === "employer" ? employerId : workerId,
        employer_profile_id: employerProfileId || null,
        job_id: jobId || null,
        daeta_posting_id: daetaPostingId || null,
        message: message || "",
        expired_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      })
      .select()
      .single();

    if (error) throw error;

    try {
      const { data: workerUser } = await supabase.from("users").select("nickname, real_name").eq("id", workerId).maybeSingle();
      const workerName = workerUser?.nickname || workerUser?.real_name || "알바생";

      let businessName = "매장";
      if (employerProfileId) {
        const { data: ep } = await supabase.from("employer_profiles").select("business_name").eq("id", employerProfileId).maybeSingle();
        if (ep?.business_name) businessName = ep.business_name;
      } else if (jobId) {
        const { data: jobRow } = await supabase
          .from("jobs")
          .select("employer_profiles(business_name)")
          .eq("id", jobId)
          .maybeSingle();
        if (jobRow?.employer_profiles && (jobRow.employer_profiles as any).business_name) {
          businessName = (jobRow.employer_profiles as any).business_name;
        }
      } else if (daetaPostingId) {
        const { data: dp } = await supabase.from("daeta_postings").select("business_name").eq("id", daetaPostingId).maybeSingle();
        if (dp?.business_name) businessName = dp.business_name;
      }

      if (senderType === "worker") {
        // Insert system message for worker applying
        await supabase.from("chats").insert({
          match_id: data.id,
          sender_id: workerId,
          receiver_id: employerId,
          message: `📤 ${workerName}님이 ${businessName} 매장에 지원했습니다. 사장님의 수락을 기다려주세요.`,
          message_type: "system",
          is_read: false,
        });

        // 대타 지원은 프로필 페이지가 아니라 지원자 목록(수락/거절 버튼이 실제로 있는 화면)으로 보냄 —
        // /worker/[id] 페이지는 대타 매칭을 아예 제외하고 정규 채용 매칭만 다뤄서(daeta_posting_id is null),
        // 예전엔 알림을 눌러도 그 지원을 수락할 방법이 없는 막다른 길이었음.
        await createNotification({
          userId: employerId,
          type: "lovecall",
          title: `📥 새 지원서 도착 (${businessName})`,
          body: `💡 ${workerName}님이 매장에 지원했습니다. 지금 확인해보세요!`,
          url: daetaPostingId ? `/daeta?applicants=${daetaPostingId}` : `/worker/${workerId}`,
          data: { matchId: data.id }
        });
        await createNotification({
          userId: workerId,
          type: "lovecall",
          title: `📤 지원 완료 (${businessName})`,
          body: `✨ ${businessName} 매장에 지원이 완료되었습니다. 사장님의 답변을 기다려주세요.`,
          url: `/mypage/applications?tab=worker`,
          data: { matchId: data.id }
        });
      } else {
        // Insert system message for employer proposing
        await supabase.from("chats").insert({
          match_id: data.id,
          sender_id: employerId,
          receiver_id: workerId,
          message: `💌 ${businessName} 사장님이 ${workerName}님에게 채용 제안을 보냈습니다.`,
          message_type: "system",
          is_read: false,
        });

        const targetUrl = employerProfileId ? `/store/${employerProfileId}` : jobId ? `/job/${jobId}` : `/mypage`;
        await createNotification({
          userId: workerId,
          type: "lovecall",
          title: `📥 채용 제안 도착 (${businessName})`,
          body: `💌 ${businessName} 사장님이 채용 제안을 보냈습니다!`,
          url: targetUrl,
          data: { matchId: data.id }
        });
        await createNotification({
          userId: employerId,
          type: "lovecall",
          title: `📤 채용 제안 완료 (${workerName}님)`,
          body: `✨ ${workerName}님에게 채용 제안을 정상적으로 보냈습니다.`,
          url: `/mypage/applications?tab=employer`,
          data: { matchId: data.id }
        });
      }
    } catch (err) {
      console.error("[lovecall notify error]", err);
    }

    return NextResponse.json({ data, success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message, success: false }, { status: 500 });
  }
}

// 러브콜 목록 조회 (GET)
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get("userId");
    const userType = searchParams.get("userType");

    if (!userId || !userType) {
      return NextResponse.json({ error: "필수 정보 없음", success: false }, { status: 400 });
    }

    // worker_id + employer_id 둘 다 조회 (양쪽 계정 지원)
    const [workerRes, employerRes] = await Promise.all([
      supabase.from("matches").select("*").eq("worker_id", userId).order("created_at", { ascending: false }),
      supabase.from("matches").select("*").eq("employer_id", userId).order("created_at", { ascending: false }),
    ]);

    const workerMatches = (workerRes.data || []).map(m => ({ ...m, _myRole: "worker" }));
    const employerMatches = (employerRes.data || []).map(m => ({ ...m, _myRole: "employer" }));

    // 중복 제거 및 초대로 생성된 매칭(job_id/daeta_posting_id 없고 interest도 없음)은 러브콜 목록에서 제외
    const all = [...workerMatches, ...employerMatches]
      .filter(m => m.job_id || m.daeta_posting_id || m.employer_interest || m.worker_interest)
      .filter(
        (m, i, arr) => arr.findIndex(x => x.id === m.id) === i
      );

    const enriched = await Promise.all(all.map(async (match) => {
      const myRole = match._myRole;

      // 보낸것/받은것 구분 - initiated_by 컬럼 우선, 없으면 interest 컬럼
      let isSent = false;
      if (match.initiated_by) {
        isSent = match.initiated_by === userId;
      } else {
        // fallback: interest 컬럼
        isSent = myRole === "worker"
          ? match.worker_interest === true
          : match.employer_interest === true;
      }

      if (myRole === "worker") {
        // job_id 있으면 jobs 조회, 없으면 employer_profile_id로 폴백
        let counterpart: any = null;
        if (match.job_id) {
          const { data: j } = await supabase.from("jobs")
            .select("id, wage, work_days, employer_profiles!inner(id, business_name, business_type, region, user_id)")
            .eq("id", match.job_id).maybeSingle();
          if (j) counterpart = { ...j.employer_profiles, wage: j.wage, work_days: j.work_days, job_id: j.id };
        }
        if (!counterpart && match.employer_profile_id) {
          const { data: j } = await supabase.from("jobs")
            .select("id, wage, work_days, employer_profiles!inner(id, business_name, business_type, region, user_id)")
            .eq("employer_profile_id", match.employer_profile_id)
            .order("created_at", { ascending: false }).limit(1).maybeSingle();
          if (j) counterpart = { ...j.employer_profiles, wage: j.wage, work_days: j.work_days, job_id: j.id };
        }
        if (!counterpart) {
          const { data: ep } = await supabase.from("employer_profiles")
            .select("id, business_name, business_type, region, user_id")
            .eq("user_id", match.employer_id).maybeSingle();
          counterpart = ep;
        }
        return { ...match, counterpart, isSent, myRole };
      } else {
        const { data: worker } = await supabase
          .from("worker_profiles")
          .select("id, worker_type, desired_region, desired_wage, work_days, user_id")
          .eq("user_id", match.worker_id)
          .maybeSingle();
        const { data: user } = await supabase
          .from("users").select("nickname").eq("id", match.worker_id).maybeSingle();
        return { ...match, counterpart: { ...worker, name: user?.nickname }, isSent, myRole };
      }
    }));

    const received = enriched.filter(m => !m.isSent);
    const sent = enriched.filter(m => m.isSent);

    return NextResponse.json({ data: [...received, ...sent], success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message, success: false }, { status: 500 });
  }
}

// 수락/거절/취소/진행단계 (PATCH)
export async function PATCH(req: NextRequest) {
  try {
    const { matchId, action, interviewAt, interviewMemo, userId: actionUserId, reason } = await req.json();

    if (!matchId || !action) {
      return NextResponse.json({ error: "필수 정보 없음", success: false }, { status: 400 });
    }

    const updateData: any = {};

    switch (action) {
      case "accept":
        updateData.progress_status = "accepted";
        updateData.matched_at = new Date().toISOString();
        // 수락 시 건당 공고 매칭중으로 변경
        const { data: acceptMatchData } = await supabase.from("matches")
          .select("worker_id, employer_id, employer_profile_id, job_id, daeta_posting_id, initiated_by").eq("id", matchId).single();
        if (acceptMatchData) {
          // 대타 자동 근로계약서 백그라운드 체결
          if (acceptMatchData.daeta_posting_id) {
            const { data: daetaPosting } = await supabase
              .from("daeta_postings")
              .select("*")
              .eq("id", acceptMatchData.daeta_posting_id)
              .maybeSingle();

            if (daetaPosting) {
              // 대타는 수락 즉시 계약이 자동 체결되고 노쇼 시 신뢰점수 위반 이력이 쌓이는데, 휴대폰
              // 번호가 아예 없으면 탈퇴 후 다른 이메일로 재가입해 이력을 세탁할 수 있다(휴대폰 기준
              // 위반 이력 승계, lib/phoneViolationHistory.ts) — 정규 채용은 계약서 서명 시점에 번호가
              // 강제되지만(app/chat/[id]/page.tsx) 대타는 그 단계 자체가 없어서 여기서 먼저 막는다.
              // 원자적 claim보다 먼저 확인해야 막혔을 때 daeta_postings/matches 상태가 안 꼬인다.
              const { data: workerPhoneCheck } = await supabase.from("users")
                .select("phone").eq("id", acceptMatchData.worker_id).maybeSingle();
              if (!workerPhoneCheck?.phone) {
                // 사장님이 지원자를 수락하는 경로/알바생이 직접 SOS 요청을 수락하는 경로 둘 다
                // 이 accept를 타므로, 누가 봐도 이해되게 3인칭으로 안내한다.
                return NextResponse.json({
                  error: "휴대폰 번호가 등록되지 않은 알바생이라 대타를 확정할 수 없어요. 이력서에서 번호를 등록하면 바로 확정할 수 있어요.",
                  success: false, code: "PHONE_REQUIRED",
                }, { status: 400 });
              }

              // 동시 수락 가드 — 사장님이 두 지원자를 거의 동시에(다른 탭·더블탭) 수락하면 이 체크
              // 없이는 계약서가 두 건 다 체결될 수 있었음. daeta_postings.status가 아직 pending일
              // 때만 matched로 원자적으로 전환하고, 이미 다른 요청이 먼저 가져갔으면 이 수락은 무효 처리.
              // (에스컬레이션 단계 전진 로직엔 이미 동일한 가드가 있었는데 accept 경로에만 빠져있었음)
              const { data: claimResult } = await supabase
                .from("daeta_postings")
                .update({ status: "matched" })
                .eq("id", daetaPosting.id)
                .eq("status", "pending")
                .select("id");
              if (!claimResult || claimResult.length === 0) {
                await supabase.from("matches")
                  .update({ progress_status: "rejected", message: "다른 지원자로 이미 확정됨" })
                  .eq("id", matchId);
                return NextResponse.json({ error: "이미 다른 지원자로 확정된 공고예요.", success: false }, { status: 409 });
              }

              const { data: employer } = await supabase.from("users").select("real_name, nickname, phone").eq("id", acceptMatchData.employer_id).maybeSingle();
              const { data: worker } = await supabase.from("users").select("real_name, nickname, phone, address, birth_date, bank_name, bank_number_enc, bank_account_enc").eq("id", acceptMatchData.worker_id).maybeSingle();
              // 대타는 계약이 사람이 앉아서 작성하는 게 아니라 수락 순간 자동 발행되는 거라
              // 계좌번호를 물어볼 화면 자체가 없었음 — 이전에 정규 계약을 맺으며 users에 저장해둔
              // 계좌정보(SOT, 이미 암호화돼있음)가 있으면 암호문 그대로 계약 스냅샷에 복사하고,
              // 없으면(대타가 처음인 사람) 계속 공란으로 둔다. 복호화해서 다시 넣으면 정규
              // 계약서(app/contract/page.tsx)와 저장 형식이 달라져서 여기서 그대로 재사용한다.
              // 실제 사업자 정보 — 예전엔 사업자등록번호가 "123-45-67890" 더미값으로 하드코딩돼서
              // 법적 문서인 근로계약서가 실제 매장 정보 없이 자동 체결되고 있었음
              let employerProfile: { biz_reg_number: string | null; ceo_name: string | null; biz_tel: string | null } | null = null;
              if (daetaPosting.employer_profile_id) {
                const { data: ep } = await supabase.from("employer_profiles")
                  .select("biz_reg_number, ceo_name, biz_tel")
                  .eq("id", daetaPosting.employer_profile_id).maybeSingle();
                employerProfile = ep;
              }

              const workDate = daetaPosting.work_date || new Date().toISOString().split("T")[0];
              const workDateEnd = daetaPosting.work_date_end || workDate;
              const formattedDate = workDate.replace(/-/g, ". ");
              const formattedEndDate = workDateEnd.replace(/-/g, ". ");
              const getDayEng = (dayIdx: number) => ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][dayIdx] || "Mon";

              const parseTimes = (daetaPosting.work_hours || "12:00 ~ 18:00").split("~");
              const startStr = parseTimes[0]?.trim() || "12:00";
              const endStr = parseTimes[1]?.trim() || "18:00";

              const days = ["일", "월", "화", "수", "목", "금", "토"];

              // 시작일~종료일(work_date_end) 전체를 한 공고로 등록한 경우(같은 시간대) —
              // 계약서에 그 기간에 걸친 요일 전부를 근무요일로 체크하고 동일한 시간을 채움
              const dayFields: Record<string, string | boolean> = {};
              const workDaysKo: string[] = [];
              const cur = new Date(`${workDate}T00:00:00`);
              const last = new Date(`${workDateEnd}T00:00:00`);
              while (cur <= last) {
                const dayEngLoop = getDayEng(cur.getDay());
                dayFields[`workDays${dayEngLoop}`] = true;
                dayFields[`workStart${dayEngLoop}`] = startStr;
                dayFields[`workEnd${dayEngLoop}`] = endStr;
                dayFields[`breakTime${dayEngLoop}`] = "30";
                const dayKoLoop = days[cur.getDay()];
                if (dayKoLoop && !workDaysKo.includes(dayKoLoop)) workDaysKo.push(dayKoLoop);
                cur.setDate(cur.getDate() + 1);
              }
              const dayKo = workDaysKo.join(",") || "월";

              const contractData = {
                contractType: "parttime",
                biz: daetaPosting.business_name || "",
                bizRegNo: employerProfile?.biz_reg_number || "",
                ceo: employerProfile?.ceo_name || employer?.real_name || employer?.nickname || "사장님",
                ceoPhone: employerProfile?.biz_tel || employer?.phone || "",
                bizAddr: daetaPosting.region || "",
                workPlace: daetaPosting.region || "",
                jobDesc: `${daetaPosting.business_type || "기타"} 대타 근무`,
                worker: worker?.real_name || worker?.nickname || "알바생",
                // 생년월일/주소를 가짜값("2000. 01. 01"/"서울시내")으로 채우면 안 됨 — 법적 문서인
                // 근로계약서에 허위 정보가 그대로 들어가고, 특히 미성년자라도 계약서상 성인으로
                // 영구히 남는 문제가 있었음. 비워두면 app/chat/[id]/page.tsx의 서명 화면이 알아서
                // 입력창(생년월일은 만 18세 미만 감지 포함)을 띄워 실제 값을 받는다.
                workerBirth: worker?.birth_date?.replace(/-/g, ". ") || "",
                workerPhone: worker?.phone || "",
                workerAddr: worker?.address || "",
                startDate: formattedDate,
                endDate: formattedEndDate,
                workDaysMode: "check",
                ...dayFields,
                wage: String(daetaPosting.wage),
                wageType: "hour",
                payDay: "당일 지급",
                payMethod: "계좌이체",
                // users에 저장된 계좌정보 SOT를 계약 체결 시점 스냅샷으로 복사 — 정규 계약서
                // (app/contract/page.tsx)와 동일한 필드명(bankName/bankNumber/bankAccount)을 씀
                bankName: worker?.bank_name || "",
                bankNumber: worker?.bank_number_enc || "",
                bankAccount: worker?.bank_account_enc || "",
                contractDate: formattedDate,
              };

              // 알바생 서명은 자동으로 처리하지 않음 — 예전엔 여기서 바로 worker_signed:true로
              // 확정해버려서, 실제로는 알바생이 한 번도 본 적 없는 계약서가 "서명 완료"로 남고
              // (개인정보 정확성을 확인할 기회 자체가 없었음), 생년월일이 비어있으면 위에서 가짜값을
              // 채워넣던 탓에 미성년자 감지(app/chat/[id]/page.tsx 서명 화면)도 항상 우회됐음.
              // 정규 계약(app/contract/page.tsx)과 동일하게 employer_signed만 true로 두고
              // worker_signed는 알바생이 채팅에서 실제로 계약서를 열어 확인/서명해야 true가 되게 함.
              await supabase.from("contracts").insert({
                employer_id: acceptMatchData.employer_id,
                worker_id: acceptMatchData.worker_id,
                match_id: matchId,
                start_date: workDate,
                end_date: workDateEnd,
                wage: daetaPosting.wage,
                work_days: dayKo,
                work_hours: daetaPosting.work_hours,
                contract_data: contractData,
                status: "pending",
                employer_signed: true,
                worker_signed: false,
              });

              // 채팅방에도 확정 사실을 남겨둠 — 채팅 상단 "대타 확정" 배너는 항상 같은 문구라
              // 나중에 스크롤해서 언제 확정됐는지 되짚어볼 기록이 따로 없었음
              await supabase.from("chats").insert({
                match_id: matchId,
                sender_id: acceptMatchData.employer_id,
                receiver_id: acceptMatchData.worker_id,
                // "근로계약서가 발행" 문구는 채팅 화면(app/chat/[id]/page.tsx)이 메시지 본문을 그대로
                // 매칭해서 그 아래에 [📄 계약서 확인하기] 버튼을 붙이는 트리거 — 정규 계약(app/contract/page.tsx)과
                // 동일 문구를 써야 그 버튼이 뜬다. 다르게 쓰면 알바생이 계약서를 열 방법 자체가 없어짐.
                message: `✅ 대타가 확정됐어요! 근로계약서가 발행됐어요. 채팅방에서 확인 후 서명해주세요.\n근무일: ${formattedDate}${formattedDate !== formattedEndDate ? ` ~ ${formattedEndDate}` : ""} · ${daetaPosting.work_hours}\n근무 당일 잊지 말고 출근/퇴근 처리해주세요.`,
                message_type: "system",
                is_read: false,
              });

              // (daeta_postings.status는 위 동시 수락 가드에서 이미 matched로 전환됨)

              // 같은 공고에 지원했던 다른 알바생들 — 예전엔 그대로 방치돼서 본인이 떨어진 줄도
              // 모른 채 pending으로 계속 남아있었음. 전부 정리 + "다른 분으로 확정됐어요" 안내.
              const { data: otherApplicants } = await supabase
                .from("matches")
                .select("id, worker_id")
                .eq("daeta_posting_id", acceptMatchData.daeta_posting_id)
                .eq("progress_status", "pending")
                .neq("id", matchId);

              if (otherApplicants?.length) {
                await supabase.from("matches")
                  .update({ progress_status: "rejected", message: "다른 지원자로 확정됨" })
                  .in("id", otherApplicants.map(m => m.id));

                await Promise.all(otherApplicants.map(m => createNotification({
                  userId: m.worker_id,
                  type: "daeta",
                  title: "😢 다른 분으로 확정됐어요",
                  body: `${daetaPosting.business_name} 대타는 다른 지원자로 확정됐어요. 다른 대타를 찾아보세요!`,
                  url: "/daeta",
                  data: { daetaPostingId: acceptMatchData.daeta_posting_id },
                })));
              }
            }
          }



          // 알바생: 해당 공고만 matched (active 상태인 것 중 최신 1개)
          const { data: workerProfiles } = await supabase.from("worker_profiles")
            .select("id").eq("user_id", acceptMatchData.worker_id)
            .eq("job_status", "active").order("created_at", { ascending: false }).limit(1);
          if (workerProfiles?.length) {
            await supabase.from("worker_profiles").update({ job_status: "matched" }).eq("id", workerProfiles[0].id);
          }
          // 사장님: job_id 또는 employer_profile_id 기준으로 jobs 업데이트
          if (acceptMatchData.job_id) {
            await supabase.from("jobs").update({ job_status: "matched" }).eq("id", acceptMatchData.job_id);
          } else if (acceptMatchData.employer_profile_id) {
            const { data: latestJob } = await supabase.from("jobs").select("id")
              .eq("employer_profile_id", acceptMatchData.employer_profile_id)
              .order("created_at", { ascending: false }).limit(1).maybeSingle();
            if (latestJob?.id) await supabase.from("jobs").update({ job_status: "matched" }).eq("id", latestJob.id);
          }

          // 수락 알림 발송 — action=accept는 두 방향에서 다 호출됨:
          // (1) 알바생이 지원(daeta 지원 포함) → 사장님이 수락 → 알바생에게 알려야 함
          // (2) 사장님이 채용 제안 → 알바생이 수락 → 사장님에게 알려야 함
          // 예전엔 항상 (2)로 가정하고 사장님에게만 보냈었음 — (1)에서 정작 수락된
          // 알바생 본인은 아무 알림도 못 받는 버그였음.
          try {
            const { data: workerUser } = await supabase.from("users").select("nickname, real_name").eq("id", acceptMatchData.worker_id).maybeSingle();
            const workerName = workerUser?.nickname || workerUser?.real_name || "알바생";
            let businessName = "매장";
            if (acceptMatchData.employer_profile_id) {
              const { data: ep } = await supabase.from("employer_profiles").select("business_name").eq("id", acceptMatchData.employer_profile_id).maybeSingle();
              if (ep?.business_name) businessName = ep.business_name;
            } else if (acceptMatchData.daeta_posting_id) {
              const { data: dp } = await supabase.from("daeta_postings").select("business_name").eq("id", acceptMatchData.daeta_posting_id).maybeSingle();
              if (dp?.business_name) businessName = dp.business_name;
            }

            const workerInitiated = acceptMatchData.initiated_by === acceptMatchData.worker_id;
            if (workerInitiated) {
              await createNotification({
                userId: acceptMatchData.worker_id,
                type: "lovecall",
                title: `🎉 지원 수락! (${businessName})`,
                body: `✨ ${businessName}에서 지원을 수락했어요! 지금 채팅을 시작해보세요.`,
                url: `/chat/${matchId}`,
                data: { matchId }
              });
            } else {
              await createNotification({
                userId: acceptMatchData.employer_id,
                type: "lovecall",
                title: `🎉 채용 제안 수락! (${businessName})`,
                body: `✨ ${workerName}님이 채용 제안을 수락했어요! 지금 채팅을 시작해보세요.`,
                url: `/chat/${matchId}`,
                data: { matchId }
              });
            }
          } catch (err) {
            console.error("[accept notify error]", err);
          }
        }
        break;
      case "reject":
        updateData.progress_status = "rejected";
        {
          const { data: rejectMatchData } = await supabase
            .from("matches")
            .select("worker_id, employer_id, employer_profile_id, daeta_posting_id, initiated_by")
            .eq("id", matchId).single();
          // 대타 지원 거절만 message를 남김 — 대타 이력 화면(DaetaHistoryView)이 이 필드를 읽어서
          // "경합 낙방"과 "사장님이 거절"을 구분해 보여주기 때문(일반 채용 매칭은 이 화면에서 안 씀)
          if (rejectMatchData?.daeta_posting_id) {
            updateData.message = "사장님이 지원을 거절함";
          }
          if (rejectMatchData) {
            try {
              let businessName = "매장";
              if (rejectMatchData.employer_profile_id) {
                const { data: ep } = await supabase.from("employer_profiles").select("business_name").eq("id", rejectMatchData.employer_profile_id).maybeSingle();
                if (ep?.business_name) businessName = ep.business_name;
              } else if (rejectMatchData.daeta_posting_id) {
                const { data: dp } = await supabase.from("daeta_postings").select("business_name").eq("id", rejectMatchData.daeta_posting_id).maybeSingle();
                if (dp?.business_name) businessName = dp.business_name;
              }
              const { data: workerUser } = await supabase.from("users").select("nickname, real_name").eq("id", rejectMatchData.worker_id).maybeSingle();
              const workerName = workerUser?.nickname || workerUser?.real_name || "알바생";

              const workerInitiated = rejectMatchData.initiated_by === rejectMatchData.worker_id;

              if (workerInitiated) {
                // 알바생이 지원 → 사장님이 거절 → 알바생에게 알림
                await createNotification({
                  userId: rejectMatchData.worker_id,
                  type: "lovecall",
                  title: `😔 지원 거절 (${businessName})`,
                  body: `${businessName}에서 지원을 거절했어요. 다른 곳도 둘러보세요!`,
                  url: `/mypage`,
                  data: { matchId }
                });
              } else {
                // 사장님이 채용 제안 → 알바생이 거절 → 사장님에게 알림
                await createNotification({
                  userId: rejectMatchData.employer_id,
                  type: "lovecall",
                  title: `😔 채용 제안 거절 (${businessName})`,
                  body: `${workerName}님이 채용 제안을 거절했어요. 다른 분을 찾아보세요!`,
                  url: `/mypage`,
                  data: { matchId }
                });
              }
            } catch (err) {
              console.error("[reject notify error]", err);
            }
          }
        }
        break;
      case "cancel":
        updateData.progress_status = "cancelled";
        // 겹치는 다른 근무가 확정돼서 정중히 취소하는 경우 등 — 사유를 남겨두면 상대방 알림에도
        // 그대로 실려서 "왜 취소했는지" 알 수 있음(대타 이력 화면도 이 message 필드를 그대로 읽음)
        if (reason) updateData.message = String(reason).slice(0, 300);
        const { data: cancelMatchData } = await supabase
          .from("matches")
          .select("worker_id, employer_id, employer_profile_id, job_id, daeta_posting_id, initiated_by")
          .eq("id", matchId).single();
        if (cancelMatchData) {
          await supabase.from("worker_profiles")
            .update({ job_status: "active", is_active: true })
            .eq("user_id", cancelMatchData.worker_id);
          if (cancelMatchData.job_id) {
            await supabase.from("jobs").update({ job_status: "active", is_active: true }).eq("id", cancelMatchData.job_id);
          } else if (cancelMatchData.employer_profile_id) {
            const { data: latestJob } = await supabase.from("jobs").select("id")
              .eq("employer_profile_id", cancelMatchData.employer_profile_id)
              .order("created_at", { ascending: false }).limit(1).maybeSingle();
            if (latestJob?.id) await supabase.from("jobs").update({ job_status: "active", is_active: true }).eq("id", latestJob.id);
          }

          // Send cancellation notifications
          try {
            const { data: workerUser } = await supabase.from("users").select("nickname, real_name").eq("id", cancelMatchData.worker_id).maybeSingle();
            const workerName = workerUser?.nickname || workerUser?.real_name || "알바생";

            let businessName = "매장";
            if (cancelMatchData.employer_profile_id) {
              const { data: ep } = await supabase.from("employer_profiles").select("business_name").eq("id", cancelMatchData.employer_profile_id).maybeSingle();
              if (ep?.business_name) businessName = ep.business_name;
            } else if (cancelMatchData.daeta_posting_id) {
              const { data: dp } = await supabase.from("daeta_postings").select("business_name").eq("id", cancelMatchData.daeta_posting_id).maybeSingle();
              if (dp?.business_name) businessName = dp.business_name;
            }

            const isWorkerCancelling = cancelMatchData.initiated_by === cancelMatchData.worker_id;

            if (isWorkerCancelling) {
              await createNotification({
                userId: cancelMatchData.employer_id,
                type: "lovecall",
                title: `🚫 지원 취소 (${businessName})`,
                body: reason ? `💡 ${workerName}님이 지원을 취소했습니다. "${reason}"` : `💡 ${workerName}님이 지원을 취소했어요. 다른 지원자를 찾아보세요!`,
                url: `/mypage`,
                data: { matchId }
              });
            } else {
              await createNotification({
                userId: cancelMatchData.worker_id,
                type: "lovecall",
                title: `🚫 채용 제안 취소 (${businessName})`,
                body: reason ? `💌 ${businessName} 사장님이 채용 제안을 취소했습니다. "${reason}"` : `💌 ${businessName} 사장님이 채용 제안을 취소했어요. 다른 좋은 곳도 찾아보세요!`,
                url: `/mypage`,
                data: { matchId }
              });
            }
          } catch (err) {
            console.error("[cancel notify error]", err);
          }
        }
        break;
      case "hire_reject":
        updateData.progress_status = "failed";
        updateData.hire_confirmed_by_employer = false;
        
        const { data: hireRejectMatch } = await supabase.from("matches")
          .select("worker_id, employer_id, employer_profile_id, job_id")
          .eq("id", matchId).single();
          
        if (hireRejectMatch) {
          await supabase.from("worker_profiles")
            .update({ job_status: "active", is_active: true })
            .eq("user_id", hireRejectMatch.worker_id);
            
          if (hireRejectMatch.job_id) {
            await supabase.from("jobs").update({ job_status: "active", is_active: true }).eq("id", hireRejectMatch.job_id);
          } else if (hireRejectMatch.employer_profile_id) {
            const { data: latestJob } = await supabase.from("jobs").select("id")
              .eq("employer_profile_id", hireRejectMatch.employer_profile_id)
              .order("created_at", { ascending: false }).limit(1).maybeSingle();
            if (latestJob?.id) await supabase.from("jobs").update({ job_status: "active", is_active: true }).eq("id", latestJob.id);
          }

          // Send rejection notification to employer
          try {
            const { data: workerUser } = await supabase.from("users").select("nickname, real_name").eq("id", hireRejectMatch.worker_id).maybeSingle();
            const workerName = workerUser?.nickname || workerUser?.real_name || "알바생";

            let businessName = "매장";
            if (hireRejectMatch.employer_profile_id) {
              const { data: ep } = await supabase.from("employer_profiles").select("business_name").eq("id", hireRejectMatch.employer_profile_id).maybeSingle();
              if (ep?.business_name) businessName = ep.business_name;
            }

            await createNotification({
              userId: hireRejectMatch.employer_id,
              type: "lovecall",
              title: `💔 채용 거절 (${businessName})`,
              body: `💡 ${workerName}님이 채용 제안을 거절했어요. 다른 분을 찾아보세요!`,
              url: `/mypage`,
              data: { matchId }
            });
          } catch (err) {
            console.error("[hire_reject notify error]", err);
          }
        }
        break;
      case "leave": {
        // 채팅방 나가기 - 본인 기준 숨김 (matches는 유지, 채팅 히스토리만 삭제)
        const leavingUserId = actionUserId;
        const { data: leaveMatch, error: leaveMatchErr } = await supabase.from("matches").select("worker_id, employer_id, progress_status").eq("id", matchId).single();
        if (leaveMatchErr) console.error("leave: match 조회 실패", leaveMatchErr);
        if (leaveMatch) {
          const isWorkerLeaving = leaveMatch.worker_id === leavingUserId;
          const leaveField = isWorkerLeaving ? "worker_left" : "employer_left";
          const { error: leaveErr } = await supabase.from("matches").update({
            [leaveField]: true,
          }).eq("id", matchId);
          if (leaveErr) console.error(`leave: ${leaveField} 업데이트 실패`, leaveErr);
          // 채팅 내용 삭제 (본인 기준)
          if (leavingUserId) {
            await supabase.from("chats").delete().eq("match_id", matchId).eq("sender_id", leavingUserId);
          }
        }
        return NextResponse.json({ success: true });
      }
      case "interview":
        updateData.progress_status = "interviewing";
        updateData.interview_at = interviewAt || null;
        updateData.interview_memo = interviewMemo || null;
        break;
      case "hire":
        updateData.progress_status = "hired";
        const { data: hireMatchData } = await supabase
          .from("matches")
          .select("worker_id, employer_id, employer_profile_id, job_id")
          .eq("id", matchId).single();

        // trust_score + 뱃지 연동
        if (hireMatchData) {
          const adminSb = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!
          );

          // 알바생 +10점
          const { data: wUser } = await adminSb.from("users")
            .select("trust_score").eq("id", hireMatchData.worker_id).single();
          const wScore = Math.min(100, (wUser?.trust_score || 50) + 10);
          await adminSb.from("users").update({ trust_score: wScore }).eq("id", hireMatchData.worker_id);
          await adminSb.from("trust_score_logs").insert({
            user_id: hireMatchData.worker_id, delta: 10, reason: "채용 확정", category: "activity"
          });

          // 사장님 +10점
          const { data: eUser } = await adminSb.from("users")
            .select("trust_score").eq("id", hireMatchData.employer_id).single();
          const eScore = Math.min(100, (eUser?.trust_score || 50) + 10);
          await adminSb.from("users").update({ trust_score: eScore }).eq("id", hireMatchData.employer_id);
          await adminSb.from("trust_score_logs").insert({
            user_id: hireMatchData.employer_id, delta: 10, reason: "채용 확정(사장님)", category: "activity"
          });

          // 알바생 뱃지
          const { data: wContracts } = await adminSb.from("matches")
            .select("id").eq("worker_id", hireMatchData.worker_id).eq("progress_status", "hired");
          if ((wContracts?.length || 0) >= 5) {
            await adminSb.from("user_badges").upsert(
              { user_id: hireMatchData.worker_id, badge_key: "contract" },
              { onConflict: "user_id,badge_key", ignoreDuplicates: true });
          }
          if ((wContracts?.length || 0) >= 2) {
            const { data: absents } = await adminSb.from("attendance")
              .select("id").eq("worker_id", hireMatchData.worker_id).eq("status", "absent");
            if ((absents?.length || 0) === 0) {
              await adminSb.from("user_badges").upsert(
                { user_id: hireMatchData.worker_id, badge_key: "promise" },
                { onConflict: "user_id,badge_key", ignoreDuplicates: true });
            }
          }

          // 사장님 뱃지
          const { data: eHired } = await adminSb.from("matches")
            .select("id").eq("employer_id", hireMatchData.employer_id).eq("progress_status", "hired");
          if ((eHired?.length || 0) >= 3) {
            await adminSb.from("user_badges").upsert(
              { user_id: hireMatchData.employer_id, badge_key: "boss_promise" },
              { onConflict: "user_id,badge_key", ignoreDuplicates: true });
          }
          if ((eHired?.length || 0) >= 5) {
            await adminSb.from("user_badges").upsert(
              { user_id: hireMatchData.employer_id, badge_key: "boss_veteran" },
              { onConflict: "user_id,badge_key", ignoreDuplicates: true });
          }

          // 단골사장: 같은 알바생을 재고용(과거에 이 매장에서 일하다 나간 이력이 있는 알바생을 다시 채용)
          const { data: pastTeam } = await adminSb.from("team_members")
            .select("id").eq("employer_id", hireMatchData.employer_id).eq("worker_id", hireMatchData.worker_id)
            .eq("status", "left").limit(1);
          if ((pastTeam?.length || 0) > 0) {
            await adminSb.from("user_badges").upsert(
              { user_id: hireMatchData.employer_id, badge_key: "boss_rehire" },
              { onConflict: "user_id,badge_key", ignoreDuplicates: true });
          }
        }
        if (hireMatchData) {
          // 알바생 구직 완료
          await supabase.from("worker_profiles")
            .update({ job_status: "completed", is_active: false })
            .eq("user_id", hireMatchData.worker_id);
          // 사장님 공고 완료
          if (hireMatchData.job_id) {
            await supabase.from("jobs").update({ job_status: "completed", is_active: false }).eq("id", hireMatchData.job_id);
          } else if (hireMatchData.employer_profile_id) {
            const { data: latestJob } = await supabase.from("jobs").select("id")
              .eq("employer_profile_id", hireMatchData.employer_profile_id)
              .order("created_at", { ascending: false }).limit(1).maybeSingle();
            if (latestJob?.id) await supabase.from("jobs").update({ job_status: "completed", is_active: false }).eq("id", latestJob.id);
          }

          // 같은 공고의 나머지 매칭들 failed 처리
          const matchFilter = hireMatchData.job_id
            ? `job_id.eq.${hireMatchData.job_id}`
            : hireMatchData.employer_profile_id
              ? `employer_profile_id.eq.${hireMatchData.employer_profile_id}`
              : null;
          if (matchFilter) {
            const { data: otherMatches } = await supabase
              .from("matches")
              .select("id, worker_id")
              .or(matchFilter)
              .neq("id", matchId)
              .in("progress_status", ["accepted", "interviewing"]);

            if (otherMatches?.length) {
              // 나머지 매칭 failed 처리
              await supabase.from("matches")
                .update({ progress_status: "failed" })
                .in("id", otherMatches.map(m => m.id));

              // 각 채팅에 시스템 메시지
              for (const om of otherMatches) {
                await supabase.from("chats").insert({
                  match_id: om.id,
                  sender_id: hireMatchData.employer_id,
                  receiver_id: om.worker_id,
                  message: "아쉽지만 채용이 완료됐어요. 또 다른 좋은 인연을 기다려 보아요 😊",
                  message_type: "system",
                  is_read: false,
                });
              }
            }
          }
        }
        break;
      case "fail":
        updateData.progress_status = "failed";
        break;
    }

    const { data, error } = await supabase
      .from("matches")
      .update(updateData)
      .eq("id", matchId)
      .select()
      .single();

    if (error) throw error;

    // 익명 통계 저장 (hire/cancel/fail 시)
    if (["hire", "cancel", "fail"].includes(action)) {
      try {
        const { data: m } = await supabase.from("matches")
          .select("worker_id, employer_id, employer_profile_id, match_score")
          .eq("id", matchId).single();
        if (m) {
          const [wp, ep] = await Promise.all([
            supabase.from("worker_profiles").select("worker_type, desired_region, users!worker_profiles_user_id_fkey(worker_result)")
              .eq("user_id", m.worker_id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
            supabase.from("employer_profiles").select("employer_type, business_type, region")
              .eq("id", m.employer_profile_id).maybeSingle(),
          ]);
          await supabase.from("match_analytics").insert({
            worker_type: wp.data?.worker_type || null,
            employer_type: ep.data?.employer_type || null,
            match_score: m.match_score || null,
            business_type: ep.data?.business_type || null,
            region_sido: (ep.data?.region || "").split(" ")[0] || null,
            outcome: action === "hire" ? "hired" : action === "cancel" ? "cancelled" : "failed",
            worker_hexaco: (wp.data?.users as any)?.worker_result?.hexaco || null,
            employer_hexaco: null,
          });
        }
      } catch {} // 통계 저장 실패해도 메인 로직에 영향 없음
    }

    return NextResponse.json({ data, success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message, success: false }, { status: 500 });
  }
}

// 완전 삭제 (DELETE)
export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const matchId = searchParams.get("matchId");
    if (!matchId) return NextResponse.json({ error: "matchId 필요", success: false }, { status: 400 });

    const { error } = await supabase.from("matches").delete().eq("id", matchId);
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message, success: false }, { status: 500 });
  }
}
