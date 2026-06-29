import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

function calcHexacoScore(a: any, b: any): number {
  if (!a || !b) return 60; // 기본값
  let score = 60;

  // 1. 성실성 차이 (핵심 갈등 요소)
  const conDiff = Math.abs((a.conscientiousness||3) - (b.conscientiousness||3));
  score -= conDiff * 6;

  // 2. 정직성(H) - 노쇼/무단결근 예측 핵심
  const workerHonesty = b.honesty || 3; // b = worker(구직자)
  if (workerHonesty <= 2) score -= 10;
  else if (workerHonesty >= 4) score += 8;

  // 3. 원만성 합산
  const agrSum = (a.agreeableness||3) + (b.agreeableness||3);
  score += (agrSum - 6) * 2;

  // 4. 외향성 조합
  if ((a.extraversion||3) >= 4 && (b.extraversion||3) >= 4) score -= 5;
  else if (Math.abs((a.extraversion||3) - (b.extraversion||3)) >= 2) score += 5;

  // 5. 개방성 유사도
  const openDiff = Math.abs((a.openness||3) - (b.openness||3));
  if (openDiff <= 1) score += 7;
  else if (openDiff >= 3) score -= 4;

  // 6. 보너스/패널티
  if ((a.agreeableness||3) >= 4 && (b.agreeableness||3) >= 4) score += 5;
  if ((b.honesty||3) <= 2 && (b.conscientiousness||3) <= 2) score -= 10;

  return Math.max(0, Math.min(100, Math.round(score)));
}

// GET /api/team-compat?employerUserId=xxx&targetHexaco=xxx
// 사장님 팀원들과 대상자의 궁합 계산
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const employerUserId = searchParams.get("employerUserId");
    const targetUserId = searchParams.get("targetUserId");

    if (!employerUserId || !targetUserId) {
      return NextResponse.json({ error: "필수 파라미터 없음" }, { status: 400 });
    }

    // 사장님 정보
    const { data: employer } = await supabase
      .from("users")
      .select("id, nickname, employer_result")
      .eq("id", employerUserId).single();

    // 대상자 정보
    const { data: target } = await supabase
      .from("users")
      .select("id, nickname, worker_result")
      .eq("id", targetUserId).single();

    if (!employer || !target) {
      return NextResponse.json({ error: "유저 없음" }, { status: 404 });
    }

    // 사장님의 모든 공고에서 hired 팀원 조회
    const { data: employerProfiles } = await supabase
      .from("employer_profiles")
      .select("id")
      .eq("user_id", employerUserId)
      .eq("is_deleted", false);

    const profileIds = employerProfiles?.map(p => p.id) || [];

    let members: any[] = [];
    if (profileIds.length > 0) {
      const { data: matches } = await supabase
        .from("matches")
        .select("worker_id")
        .in("employer_profile_id", profileIds)
        .eq("progress_status", "hired")
        .neq("worker_id", targetUserId); // 대상자 제외

      if (matches?.length) {
        const uniqueWorkerIds = [...new Set(matches.map(m => m.worker_id))];
        const { data: workers } = await supabase
          .from("users")
          .select("id, nickname, worker_result")
          .in("id", uniqueWorkerIds);
        members = workers || [];
      }
    }

    // 궁합 계산
    const targetHexaco = target.worker_result?.hexaco;
    const employerHexaco = employer.employer_result?.hexaco;

    const employerScore = calcHexacoScore(employerHexaco, targetHexaco);

    const memberScores = members.map(m => ({
      id: m.id,
      nickname: m.nickname,
      personalityType: m.worker_result?.personalityType || "미분석",
      analyzedMbti: m.worker_result?.analyzedMbti,
      emoji: m.worker_result?.emoji || "⚡",
      hexaco: m.worker_result?.hexaco,
      score: calcHexacoScore(m.worker_result?.hexaco, targetHexaco),
    }));

    // 전체 대표 점수 (사장님 50% + 팀원 평균 50%)
    const memberAvg = memberScores.length > 0
      ? memberScores.reduce((s, m) => s + m.score, 0) / memberScores.length
      : null;

    const totalScore = memberAvg !== null
      ? Math.round(employerScore * 0.5 + memberAvg * 0.5)
      : employerScore;

    return NextResponse.json({
      success: true,
      employer: {
        id: employer.id,
        nickname: employer.nickname,
        personalityType: employer.employer_result?.personalityType || "미분석",
        analyzedMbti: employer.employer_result?.analyzedMbti,
        emoji: employer.employer_result?.emoji || "🏪",
        score: employerScore,
      },
      members: memberScores,
      totalScore,
      hasTeam: members.length > 0,
    });

  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
