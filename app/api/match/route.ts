import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// 시급 조건 충족 여부 — true(충족)/false(미달)/null(비교 불가, 어느 한쪽 값 없음)
function calcWageOk(emp: Record<string, unknown>, wrk: Record<string, unknown>): boolean | null {
  const empWage = Number(emp.wage || 0);
  const wrkWage = Number(wrk.desired_wage || 0);
  if (empWage <= 0 || wrkWage <= 0) return null;
  return empWage >= wrkWage;
}

// 겹치는 근무요일 수
function calcDaysOverlap(emp: Record<string, unknown>, wrk: Record<string, unknown>): number {
  const empDays = String(emp.work_days || "");
  const wrkDays = String(wrk.work_days || wrk.available_days || "");
  if (!empDays || !wrkDays || empDays === "협의") return 0;
  const wrkDaySet = wrkDays.split(/[,\s+]+/).filter(Boolean);
  return empDays.split(/[,\s+]+/).filter(d => d && wrkDaySet.includes(d)).length;
}

function calcPopularityScore(item: Record<string, unknown>): number {
  const likes = Number(item.like_count || 0);
  const views = Number(item.view_count || 0);
  return Math.round(Math.min(12, likes * 1.2) + Math.min(8, views * 0.04));
}

function calcTrustScore(trustScore: number): number {
  return Math.round(Math.min(10, (trustScore / 100) * 10));
}

function calcRegionScore(myRegion: string, targetRegion: string): number {
  if (!myRegion || !targetRegion) return 5;
  const myParts = myRegion.split(/\s+/);
  const tParts = targetRegion.split(/\s+/);
  if (myParts[0] === tParts[0]) {
    if (myParts[1] && tParts[1] && myParts[1] === tParts[1]) {
      if (myParts[2] && tParts[2] && myParts[2] === tParts[2]) return 10;
      return 8;
    }
    return 5;
  }
  return 0;
}

// 긴급/단기 공고 시간 가중치 (오늘/내일이면 추천 목록 상위에도 올라오게)
function calcUrgencyBonus(item: Record<string, unknown>): number {
  const jobType = String(item.job_type || "regular");
  if (jobType === "urgent") {
    const startDate = item.work_start_date ? new Date(String(item.work_start_date)) : null;
    if (startDate) {
      const diffDays = Math.ceil((startDate.getTime() - Date.now()) / 86400000);
      if (diffDays === 0) return 8; // 오늘
      if (diffDays === 1) return 5; // 내일
      return 3; // 3일 이내
    }
    return 3;
  }
  if (jobType === "short") return 1;
  return 0;
}

// 목록 정렬 전용 내부 랭크 — 사용자에게 노출되는 "점수"가 아니라 서버 정렬 순서만 결정함.
// 지역일치/시급충족/요일겹침/신뢰도/인기도/긴급도를 각각 독립 신호로 반영하되 하나의 숫자로 뭉쳐서 보여주지 않음.
function calcRank(regionBonus: number, trustBonus: number, popScore: number, urgencyBonus: number, wageOk: boolean | null, daysOverlap: number): number {
  return regionBonus * 3 + trustBonus * 5 + popScore * 2 + urgencyBonus * 4 + (wageOk === true ? 15 : wageOk === false ? -10 : 0) + daysOverlap * 3;
}

export async function POST(req: NextRequest) {
  try {
    const { userId, userType } = await req.json() as { userId: string; userType: "worker" | "employer" };

    let myRegion = "";
    let myProfile: Record<string, unknown> = {};

    if (userType === "worker") {
      const { data: wps } = await supabaseAdmin.from("worker_profiles").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(1);
      const wp = wps?.[0] || null;
      myRegion = String(wp?.desired_region || "");
      myProfile = wp || {};

      const regionParts = myRegion.split(/\s+/);
      const sido = regionParts[0] || "";
      const gugun = regionParts[1] || "";

      // jobs 테이블 + employer_profiles 조인으로 공고 조회
      const { data: allJobsRaw } = await supabaseAdmin
        .from("jobs")
        .select(`*, employer_profiles!inner(id, business_name, business_type, region, address, image_url, image_urls, video_url, is_deleted, lat, lng), users!jobs_user_id_fkey(trust_score, avatar_url, real_name, nickname)`)
        .eq("is_active", true)
        .eq("job_status", "active")
        .neq("job_type", "urgent")
        .neq("user_id", userId)
        .gte("expires_at", new Date().toISOString())
        .limit(500);

      // employer_profiles 정보 flatten + 삭제 매장 제외 + 지역 분류
      const allJobs = (allJobsRaw || [])
        .filter((j: any) => !j.employer_profiles?.is_deleted)
        .map((j: any) => ({ ...j.employer_profiles, ...j, id: j.id, employer_profile_id: j.employer_profiles?.id || j.employer_profile_id, users: j.users }));

      const localJobs = allJobs.filter((j: any) => gugun ? (j.region || "").includes(gugun) : sido ? (j.region || "").includes(sido) : true);
      const otherJobs = allJobs.filter((j: any) => gugun ? !(j.region || "").includes(gugun) : sido ? !(j.region || "").includes(sido) : false);

      const jobs = [...localJobs, ...otherJobs];

      const ranked = (jobs || []).map((job: Record<string, unknown>) => {
        const empUser = job.users as Record<string, unknown> | null;
        const trustScore = Number(empUser?.trust_score ?? 50);

        const wageOk = calcWageOk(job, myProfile);
        const daysOverlap = calcDaysOverlap(job, myProfile);
        const popScore = calcPopularityScore(job);
        const trustBonus = calcTrustScore(trustScore);
        const regionBonus = calcRegionScore(myRegion, String(job.region || ""));
        const urgencyBonus = calcUrgencyBonus(job);

        const rank = calcRank(regionBonus, trustBonus, popScore, urgencyBonus, wageOk, daysOverlap);

        return {
          rank,
          item: {
            ...job,
            id: job.id || job.user_id,
            employer_avatar: empUser?.avatar_url,
            employer_name: empUser?.nickname || empUser?.real_name,
            trust_score: trustScore,
            wage_ok: wageOk,
            days_overlap: daysOverlap,
            is_liked: false,
          },
        };
      });

      ranked.sort((a, b) => b.rank - a.rank);
      return NextResponse.json({ success: true, results: ranked.map(r => r.item) });

    } else {
      const { data: latestJobs } = await supabaseAdmin.from("jobs")
        .select("*, employer_profiles!inner(region)")
        .eq("user_id", userId).order("created_at", { ascending: false }).limit(1);
      const latestJob = latestJobs?.[0] || null;
      const { data: wps } = await supabaseAdmin.from("worker_profiles").select("desired_region").eq("user_id", userId).order("created_at", { ascending: false }).limit(1);
      const wp = wps?.[0] || null;
      myRegion = String(latestJob?.employer_profiles?.region || wp?.desired_region || "");
      myProfile = latestJob ? { ...latestJob.employer_profiles, ...latestJob } : {};

      const regionParts = myRegion.split(/\s+/);
      const sido = regionParts[0] || "";
      const gugun = regionParts[1] || "";

      let localWorkers: any[] = [];
      if (gugun) {
        const { data } = await supabaseAdmin
          .from("worker_profiles")
          .select(`*, users!worker_profiles_user_id_fkey(trust_score, avatar_url, real_name, nickname)`)
          .eq("is_active", true)
          .neq("user_id", userId)
          .ilike("desired_region", `%${gugun}%`)
          .limit(300);
        localWorkers = data || [];
      } else if (sido) {
        const { data } = await supabaseAdmin
          .from("worker_profiles")
          .select(`*, users!worker_profiles_user_id_fkey(trust_score, avatar_url, real_name, nickname)`)
          .eq("is_active", true)
          .neq("user_id", userId)
          .ilike("desired_region", `%${sido}%`)
          .limit(300);
        localWorkers = data || [];
      }

      let otherQuery = supabaseAdmin
        .from("worker_profiles")
        .select(`*, users!worker_profiles_user_id_fkey(trust_score, avatar_url, real_name, nickname)`)
        .eq("is_active", true)
        .neq("user_id", userId);

      if (gugun) {
        otherQuery = otherQuery.not("desired_region", "ilike", `%${gugun}%`);
      } else if (sido) {
        otherQuery = otherQuery.not("desired_region", "ilike", `%${sido}%`);
      }
      const { data: oWorkers } = await otherQuery.limit(200);
      const otherWorkers = oWorkers || [];

      const workers = [...localWorkers, ...otherWorkers];

      const ranked = (workers || [])
        .filter((w: Record<string, unknown>) => w.is_public !== false && (!w.job_status || w.job_status === "active" || w.job_status === "open"))
        .map((worker: Record<string, unknown>) => {
          const wrkUser = worker.users as Record<string, unknown> | null;
          const trustScore = Number(wrkUser?.trust_score ?? 50);

          const wageOk = calcWageOk(myProfile, worker);
          const daysOverlap = calcDaysOverlap(myProfile, worker);
          const popScore = calcPopularityScore(worker);
          const trustBonus = calcTrustScore(trustScore);
          const regionBonus = calcRegionScore(myRegion, String(worker.desired_region || worker.region || ""));

          const rank = calcRank(regionBonus, trustBonus, popScore, 0, wageOk, daysOverlap);

          return {
            rank,
            item: {
              ...worker,
              id: worker.user_id,
              worker_avatar: wrkUser?.avatar_url,
              worker_name: wrkUser?.nickname || wrkUser?.real_name,
              trust_score: trustScore,
              wage_ok: wageOk,
              days_overlap: daysOverlap,
              is_liked: false,
            },
          };
        });

      ranked.sort((a, b) => b.rank - a.rank);
      return NextResponse.json({ success: true, results: ranked.map(r => r.item) });
    }

  } catch (err) {
    console.error("[match]", err);
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}
