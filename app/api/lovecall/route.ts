import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// 러브콜 보내기 (POST)
export async function POST(req: NextRequest) {
  try {
    const { employerId, workerId, matchScore, message, senderType, employerProfileId, jobId, daetaPostingId } = await req.json();

    if (!employerId || !workerId) {
      return NextResponse.json({ error: "필수 정보 없음", success: false }, { status: 400 });
    }

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

    // 진행 중인 매칭이 있는지 체크 (pending/accepted/interviewing만)
    const { data: existing } = await supabase
      .from("matches")
      .select("id, progress_status")
      .eq("employer_id", employerId)
      .eq("worker_id", workerId)
      .in("progress_status", ["pending", "accepted", "interviewing"])
      .maybeSingle();

    if (existing) {
      return NextResponse.json({ error: "이미 진행 중인 지원/채용 제안이 있어요", status: existing.progress_status, success: false }, { status: 409 });
    }

    const { data, error } = await supabase
      .from("matches")
      .insert({
        employer_id: employerId,
        worker_id: workerId,
        progress_status: "pending",
        match_score: matchScore || 0,
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

    // 중복 제거 및 초대로 생성된 매칭(job_id와 daeta_posting_id 둘 다 null)은 러브콜 목록에서 제외
    const all = [...workerMatches, ...employerMatches]
      .filter(m => m.job_id || m.daeta_posting_id)
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
    const { matchId, action, interviewAt, interviewMemo, userId: actionUserId } = await req.json();

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
          .select("worker_id, employer_id, employer_profile_id, job_id, daeta_posting_id").eq("id", matchId).single();
        if (acceptMatchData) {
          // 대타 자동 근로계약서 백그라운드 체결
          if (acceptMatchData.daeta_posting_id) {
            const { data: daetaPosting } = await supabase
              .from("daeta_postings")
              .select("*")
              .eq("id", acceptMatchData.daeta_posting_id)
              .maybeSingle();

            if (daetaPosting) {
              const { data: employer } = await supabase.from("users").select("real_name, nickname, phone").eq("id", acceptMatchData.employer_id).maybeSingle();
              const { data: worker } = await supabase.from("users").select("real_name, nickname, phone, address, birth_date").eq("id", acceptMatchData.worker_id).maybeSingle();
              
              const workDate = daetaPosting.work_date || new Date().toISOString().split("T")[0];
              const formattedDate = workDate.replace(/-/g, ". ");
              const getDayEng = (dayIdx: number) => ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][dayIdx] || "Mon";
              const dayEng = getDayEng(new Date(workDate).getDay());
              
              const parseTimes = (daetaPosting.work_hours || "12:00 ~ 18:00").split("~");
              const startStr = parseTimes[0]?.trim() || "12:00";
              const endStr = parseTimes[1]?.trim() || "18:00";

              const days = ["일", "월", "화", "수", "목", "금", "토"];
              const dayKo = days[new Date(workDate).getDay()] || "월";

              const contractData = {
                contractType: "parttime",
                biz: daetaPosting.business_name || "",
                bizRegNo: "123-45-67890",
                ceo: employer?.real_name || employer?.nickname || "사장님",
                ceoPhone: employer?.phone || "",
                bizAddr: daetaPosting.region || "",
                workPlace: daetaPosting.region || "",
                jobDesc: `${daetaPosting.business_type || "기타"} 대타 근무`,
                worker: worker?.real_name || worker?.nickname || "알바생",
                workerBirth: worker?.birth_date?.replace(/-/g, ". ") || "2000. 01. 01",
                workerPhone: worker?.phone || "",
                workerAddr: worker?.address || "서울시내",
                startDate: formattedDate,
                endDate: formattedDate,
                workDaysMode: "check",
                [`workDays${dayEng}`]: true,
                [`workStart${dayEng}`]: startStr,
                [`workEnd${dayEng}`]: endStr,
                [`breakTime${dayEng}`]: "30",
                wage: String(daetaPosting.wage),
                wageType: "hour",
                payDay: "당일 지급",
                payMethod: "계좌이체",
                contractDate: formattedDate,
              };

              await supabase.from("contracts").insert({
                employer_id: acceptMatchData.employer_id,
                worker_id: acceptMatchData.worker_id,
                match_id: matchId,
                start_date: workDate,
                end_date: workDate,
                wage: daetaPosting.wage,
                work_days: dayKo,
                work_hours: daetaPosting.work_hours,
                contract_data: contractData,
                status: "signed",
                employer_signed: true,
                worker_signed: true,
                signed_at: new Date().toISOString(),
              });
            }
          }

          // 이전 매칭 있었는지 확인
          const { data: prevMatches } = await supabase.from("matches")
            .select("id").eq("employer_id", acceptMatchData.employer_id)
            .eq("worker_id", acceptMatchData.worker_id)
            .neq("id", matchId);
          
          if (prevMatches?.length) {
            // 이전 매칭 있으면 새 매칭 시작 시스템 메시지
            await supabase.from("chats").insert({
              match_id: matchId,
              sender_id: acceptMatchData.employer_id,
              receiver_id: acceptMatchData.worker_id,
              message: "🎉 새 매칭이 시작됐어요! 이전 대화에 이어서 진행해요 😊",
              message_type: "system",
              is_read: false,
            });
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
        }
        break;
      case "reject":
        updateData.progress_status = "rejected";
        break;
      case "cancel":
        updateData.progress_status = "cancelled";
        const { data: cancelMatchData } = await supabase
          .from("matches")
          .select("worker_id, employer_id, employer_profile_id, job_id")
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
