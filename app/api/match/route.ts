import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface HexacoData {
  H: number; E: number; X: number; A: number; C: number; O: number;
}

const DEFAULT_HEXACO: HexacoData = { H: 3, E: 3, X: 3, A: 3, C: 3, O: 3 };

function parseHexaco(raw: unknown): HexacoData {
  if (!raw) return DEFAULT_HEXACO;
  const obj = typeof raw === "string" ? JSON.parse(raw) : raw;
  return {
    H: obj?.H ?? obj?.honesty ?? obj?.hexaco?.H ?? obj?.hexaco?.honesty ?? 3,
    E: obj?.E ?? obj?.emotionality ?? obj?.hexaco?.E ?? obj?.hexaco?.emotionality ?? 3,
    X: obj?.X ?? obj?.extraversion ?? obj?.hexaco?.X ?? obj?.hexaco?.extraversion ?? 3,
    A: obj?.A ?? obj?.agreeableness ?? obj?.hexaco?.A ?? obj?.hexaco?.agreeableness ?? 3,
    C: obj?.C ?? obj?.conscientiousness ?? obj?.hexaco?.C ?? obj?.hexaco?.conscientiousness ?? 3,
    O: obj?.O ?? obj?.openness ?? obj?.hexaco?.O ?? obj?.hexaco?.openness ?? 3,
  };
}

function calcHexacoScore(emp: HexacoData, wrk: HexacoData): number {
  let score = 70;
  const cDiff = Math.abs(emp.C - wrk.C);
  score -= cDiff * 3;
  if (wrk.H <= 1.5) score -= 8;
  else if (wrk.H >= 3.5) score += 6;
  const aSum = emp.A + wrk.A;
  if (aSum >= 7) score += 6;
  else if (aSum >= 5) score += 3;
  const eDiff = Math.abs(emp.E - wrk.E);
  if (eDiff <= 1) score += 4;
  else if (eDiff >= 3) score -= 3;
  const oDiff = Math.abs(emp.O - wrk.O);
  if (oDiff <= 1) score += 3;
  return Math.max(40, Math.min(100, Math.round(score)));
}

function calcConditionScore(emp: Record<string, unknown>, wrk: Record<string, unknown>): number {
  let score = 0;
  const empRegion = String(emp.region || "");
  const wrkRegion = String(wrk.desired_region || wrk.region || "");
  if (empRegion && wrkRegion) {
    const empParts = empRegion.split(/\s+/);
    const wrkParts = wrkRegion.split(/\s+/);
    if (empParts[0] && wrkParts[0] && empParts[0] === wrkParts[0]) {
      score += 10;
      if (empParts[1] && wrkParts[1] && empParts[1] === wrkParts[1]) score += 10;
    }
  }
  const empWage = Number(emp.wage || 0);
  const wrkWage = Number(wrk.desired_wage || 0);
  if (empWage > 0 && wrkWage > 0) {
    if (empWage >= wrkWage) score += 12;
    else if (empWage >= wrkWage * 0.9) score += 6;
  } else if (empWage > 0 || wrkWage > 0) {
    score += 6;
  }
  const empDays = String(emp.work_days || "");
  const wrkDays = String(wrk.work_days || wrk.available_days || "");
  if (empDays && wrkDays && empDays !== "협의") {
    const overlap = empDays.split(/[,\s+]+/).filter(d => wrkDays.split(/[,\s+]+/).includes(d));
    score += Math.min(8, overlap.length * 2);
  }
  return Math.min(40, score);
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

// 긴급/단기 공고 시간 가중치 (오늘/내일이면 추천순 상위에도 올라오게)
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

export async function POST(req: NextRequest) {
  try {
    const { userId, userType } = await req.json() as { userId: string; userType: "worker" | "employer" };

    const { data: myUser } = await supabaseAdmin.from("users").select("worker_result, employer_result, trust_score").eq("id", userId).single();

    let myHexaco = DEFAULT_HEXACO;
    let myRegion = "";
    let myProfile: Record<string, unknown> = {};
    let myLikes: string[] = [];

    const { data: likesData } = await supabaseAdmin.from("job_likes").select("target_id").eq("user_id", userId).eq("target_type", userType === "worker" ? "employer" : "worker");
    myLikes = (likesData || []).map((l: { target_id: string }) => l.target_id);

    if (userType === "worker") {
      const { data: wps } = await supabaseAdmin.from("worker_profiles").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(1);
      const wp = wps?.[0] || null;
      if (wp?.hexaco_data) myHexaco = parseHexaco(wp.hexaco_data);
      else if (myUser?.worker_result) myHexaco = parseHexaco(myUser.worker_result);
      myRegion = String(wp?.desired_region || "");
      myProfile = wp || {};

      const regionParts = myRegion.split(/\s+/);
      const sido = regionParts[0] || "";
      const gugun = regionParts[1] || "";

      let localJobs: any[] = [];
      if (gugun) {
        const { data } = await supabaseAdmin
          .from("employer_profiles")
          .select(`*, users!employer_profiles_user_id_fkey(trust_score, avatar_url, name, nickname)`)
          .eq("is_active", true)
          .eq("is_deleted", false)
          .neq("job_type", "urgent")
          .neq("user_id", userId)
          .gte("expires_at", new Date().toISOString())
          .ilike("region", `%${gugun}%`)
          .limit(300);
        localJobs = data || [];
      } else if (sido) {
        const { data } = await supabaseAdmin
          .from("employer_profiles")
          .select(`*, users!employer_profiles_user_id_fkey(trust_score, avatar_url, name, nickname)`)
          .eq("is_active", true)
          .eq("is_deleted", false)
          .neq("job_type", "urgent")
          .neq("user_id", userId)
          .gte("expires_at", new Date().toISOString())
          .ilike("region", `%${sido}%`)
          .limit(300);
        localJobs = data || [];
      }

      let otherQuery = supabaseAdmin
        .from("employer_profiles")
        .select(`*, users!employer_profiles_user_id_fkey(trust_score, avatar_url, name, nickname)`)
        .eq("is_active", true)
        .eq("is_deleted", false)
        .neq("job_type", "urgent")
        .neq("user_id", userId)
        .gte("expires_at", new Date().toISOString());

      if (gugun) {
        otherQuery = otherQuery.not("region", "ilike", `%${gugun}%`);
      } else if (sido) {
        otherQuery = otherQuery.not("region", "ilike", `%${sido}%`);
      }
      const { data: oJobs } = await otherQuery.limit(200);
      const otherJobs = oJobs || [];

      const jobs = [...localJobs, ...otherJobs];

      const results = (jobs || []).map((job: Record<string, unknown>) => {
        const empHexaco = job.hexaco_data ? parseHexaco(job.hexaco_data) : (myUser?.employer_result ? parseHexaco(myUser.employer_result) : DEFAULT_HEXACO);
        const empUser = job.users as Record<string, unknown> | null;
        const trustScore = Number(empUser?.trust_score ?? 50);

        const hexacoScore = calcHexacoScore(empHexaco, myHexaco);
        const condScore = calcConditionScore(job, myProfile);
        const popScore = calcPopularityScore(job);
        const trustBonus = calcTrustScore(trustScore);
        const regionBonus = calcRegionScore(myRegion, String(job.region || ""));
        const urgencyBonus = calcUrgencyBonus(job);

        const regionWeight = regionBonus >= 10 ? 12 : regionBonus >= 7 ? 4 : -15;

        const finalScore = Math.round(
          70 +
          (hexacoScore - 70) * 0.40 +
          condScore * 0.40 +
          popScore * 0.20 +
          trustBonus * 0.50 +
          regionWeight +
          urgencyBonus
        );
        // 기대 분포: 같은 구/군 75~95 / 같은 시도 60~80 / 다른 지역 40~65

        const idHash = String(job.id || "").split("").reduce((acc: number, c: string) => acc + c.charCodeAt(0), 0);
        const noise = ((idHash % 20) - 10);
        const finalScoreWithNoise = Math.max(40, Math.min(99, finalScore + noise));

        return {
          ...job,
          id: job.id || job.user_id,
          employer_avatar: empUser?.avatar_url,
          employer_name: empUser?.nickname || empUser?.name,
          trust_score: trustScore,
          match_score: finalScoreWithNoise,
          is_liked: myLikes.includes(String(job.id)),
          hexaco_score: hexacoScore,
          condition_score: condScore,
          popularity_score: popScore,
        };
      });

      results.sort((a, b) => b.match_score - a.match_score);
      return NextResponse.json({ success: true, results });

    } else {
      const { data: eps } = await supabaseAdmin.from("employer_profiles").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(1);
      const ep = eps?.[0] || null;
      const { data: wps } = await supabaseAdmin.from("worker_profiles").select("desired_region").eq("user_id", userId).order("created_at", { ascending: false }).limit(1);
      const wp = wps?.[0] || null;
      if (ep?.hexaco_data) myHexaco = parseHexaco(ep.hexaco_data);
      else if (myUser?.employer_result) myHexaco = parseHexaco(myUser.employer_result);
      myRegion = String(ep?.region || wp?.desired_region || "");
      myProfile = ep || {};

      const regionParts = myRegion.split(/\s+/);
      const sido = regionParts[0] || "";
      const gugun = regionParts[1] || "";

      let localWorkers: any[] = [];
      if (gugun) {
        const { data } = await supabaseAdmin
          .from("worker_profiles")
          .select(`*, users!worker_profiles_user_id_fkey(trust_score, avatar_url, name, nickname)`)
          .eq("is_active", true)
          .neq("user_id", userId)
          .ilike("desired_region", `%${gugun}%`)
          .limit(300);
        localWorkers = data || [];
      } else if (sido) {
        const { data } = await supabaseAdmin
          .from("worker_profiles")
          .select(`*, users!worker_profiles_user_id_fkey(trust_score, avatar_url, name, nickname)`)
          .eq("is_active", true)
          .neq("user_id", userId)
          .ilike("desired_region", `%${sido}%`)
          .limit(300);
        localWorkers = data || [];
      }

      let otherQuery = supabaseAdmin
        .from("worker_profiles")
        .select(`*, users!worker_profiles_user_id_fkey(trust_score, avatar_url, name, nickname)`)
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

      const results = (workers || [])
        .filter((w: Record<string, unknown>) => w.is_public !== false && (!w.job_status || w.job_status === "active" || w.job_status === "open"))
        .map((worker: Record<string, unknown>) => {
          const wrkHexaco = worker.hexaco_data ? parseHexaco(worker.hexaco_data) : DEFAULT_HEXACO;
          const wrkUser = worker.users as Record<string, unknown> | null;
          const trustScore = Number(wrkUser?.trust_score ?? 50);

          const hexacoScore = calcHexacoScore(myHexaco, wrkHexaco);
          const condScore = calcConditionScore(myProfile, worker);
          const popScore = calcPopularityScore(worker);
          const trustBonus = calcTrustScore(trustScore);
          const regionBonus = calcRegionScore(myRegion, String(worker.desired_region || worker.region || ""));
          const regionWeight = regionBonus >= 10 ? 12 : regionBonus >= 7 ? 4 : -15;

          const finalScore = Math.round(
            70 +
            (hexacoScore - 70) * 0.40 +
            condScore * 0.40 +
            popScore * 0.20 +
            trustBonus * 0.50 +
            regionWeight
          );
          // 기대 분포: 같은 구/군 75~95 / 같은 시도 60~80 / 다른 지역 40~65

          const idHashW = String(worker.user_id || "").split("").reduce((acc: number, c: string) => acc + c.charCodeAt(0), 0);
          const noiseW = ((idHashW % 20) - 10);
          const finalScoreWithNoise = Math.max(40, Math.min(99, finalScore + noiseW));

          return {
            ...worker,
            id: worker.user_id,
            worker_avatar: wrkUser?.avatar_url,
            worker_name: wrkUser?.nickname || wrkUser?.name,
            trust_score: trustScore,
            match_score: finalScoreWithNoise,
            is_liked: myLikes.includes(String(worker.user_id)),
          };
        });

      results.sort((a, b) => b.match_score - a.match_score);
      return NextResponse.json({ success: true, results });
    }

  } catch (err) {
    console.error("[match]", err);
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}
