/**
 * POST /api/daeta/sos — 대타 SOS 발동 (에스컬레이션 1단계 시작)
 * 공고 생성 직후 호출: 팀 내 알림 발송. 팀원이 없으면 즉시 2단계(동네 Tier1)로 점프.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  DaetaPostingRow,
  getSosConfig,
  notifyTeam,
  notifyNearby,
  computeAutoWage,
} from "@/lib/daetaEscalation";

const getServiceClient = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

export async function POST(req: NextRequest) {
  try {
    const { postingId } = await req.json();
    if (!postingId) {
      return NextResponse.json({ error: "postingId 필요", success: false }, { status: 400 });
    }

    const sb = getServiceClient();
    const { data: posting, error } = await sb
      .from("daeta_postings")
      .select("*")
      .eq("id", postingId)
      .single();

    if (error || !posting) {
      return NextResponse.json({ error: "공고를 찾을 수 없어요", success: false }, { status: 404 });
    }
    if (posting.status !== "pending") {
      return NextResponse.json({ error: "이미 종료된 공고예요", success: false }, { status: 409 });
    }

    const cfg = await getSosConfig(sb);
    const p = posting as DaetaPostingRow;

    // 1단계: 팀 내 알림
    const teamNotified = await notifyTeam(sb, p);

    let stage = 1;
    let nearbyNotified = 0;
    let wage = p.wage;

    if (teamNotified === 0) {
      // 팀원이 없으면 기다릴 이유가 없음 — 즉시 동네 Tier1 공개(2단계 자동 할증도 함께 적용)
      stage = 2;
      wage = computeAutoWage(p, stage, cfg);
      nearbyNotified = await notifyNearby(sb, { ...p, wage }, "tier1", cfg.radius_km);
    }

    await sb
      .from("daeta_postings")
      .update({ escalation_stage: stage, stage_updated_at: new Date().toISOString(), wage })
      .eq("id", postingId);

    return NextResponse.json({
      success: true,
      stage,
      teamNotified,
      nearbyNotified,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "SOS 발동 실패";
    return NextResponse.json({ error: message, success: false }, { status: 500 });
  }
}
