/**
 * GET /api/cron/doc-expiry — 팀원 서류(보건증) 만료 임박/만료 알림 (매일 1회, cron-job.org)
 * team_member_documents.expires_at은 health_certificate에만 쓰임(patch_team_documents.sql 주석 참고).
 * 지금까지는 사장님이 팀원 상세 페이지를 직접 열어야만 "만료 D-N" 배지가 보였고 능동 알림이 전혀 없었음.
 */
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createNotification } from "@/lib/notify";

const getServiceClient = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

interface DocRow {
  id: string;
  team_member_id: string;
  expires_at: string;
}

interface TeamMemberRow {
  id: string;
  employer_id: string;
  worker_id: string | null;
  nickname: string | null;
  status: string;
}

// diffDays가 이 값 중 하나와 정확히 일치할 때만 알림 — 매일 조금씩 줄어드는 값이라 임계값에서 하루만 걸림(중복 방지용 별도 컬럼 없이 매일 1회 크론이면 충분)
const PRE_EXPIRY_THRESHOLDS = [30, 7];

function shouldNotify(diffDays: number): boolean {
  if (diffDays > 0) return PRE_EXPIRY_THRESHOLDS.includes(diffDays);
  return diffDays % 30 === 0; // 0(만료당일), -30, -60... 갱신 전까지 30일마다 재알림
}

export async function GET(req: Request) {
  if (process.env.NODE_ENV === "production") {
    const auth = req.headers.get("authorization") || "";
    const cronSecret = process.env.CRON_SECRET || "";
    if (!cronSecret || auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const sb = getServiceClient();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const { data: docsRaw, error: docsErr } = await sb
    .from("team_member_documents")
    .select("id, team_member_id, expires_at")
    .eq("doc_type", "health_certificate")
    .not("expires_at", "is", null);

  if (docsErr) {
    return NextResponse.json({ error: docsErr.message }, { status: 500 });
  }
  const docs = (docsRaw || []) as DocRow[];
  if (docs.length === 0) {
    return NextResponse.json({ message: "no health certificates on file", notified: 0 });
  }

  const teamMemberIds = Array.from(new Set(docs.map(d => d.team_member_id)));
  const { data: membersRaw } = await sb
    .from("team_members")
    .select("id, employer_id, worker_id, nickname, status")
    .in("id", teamMemberIds)
    .eq("status", "active");
  const members = (membersRaw || []) as TeamMemberRow[];
  const memberById = new Map(members.map(m => [m.id, m]));

  const notified: { docId: string; diffDays: number }[] = [];

  await Promise.all(docs.map(async (doc) => {
    const member = memberById.get(doc.team_member_id);
    if (!member) return; // 퇴사/비활성 팀원은 알릴 필요 없음

    const exp = new Date(doc.expires_at);
    exp.setHours(0, 0, 0, 0);
    const diffDays = Math.round((exp.getTime() - today.getTime()) / 86400000);
    if (!shouldNotify(diffDays)) return;

    const name = member.nickname || "팀원";
    const isExpired = diffDays <= 0;
    const dLabel = isExpired ? `${Math.abs(diffDays)}일 지남` : `D-${diffDays}`;

    await createNotification({
      userId: member.employer_id,
      type: "doc_expiry",
      title: isExpired ? "🚨 보건증이 만료됐어요" : "⚠️ 보건증 만료가 다가와요",
      body: `${name}님 보건증 ${isExpired ? "만료 " + dLabel : dLabel + " 남음"} — 갱신본을 받아서 다시 등록해 주세요.`,
      url: `/employer/team/${doc.team_member_id}`,
      data: { teamMemberId: doc.team_member_id, docId: doc.id },
    });

    if (member.worker_id) {
      await createNotification({
        userId: member.worker_id,
        type: "doc_expiry",
        title: isExpired ? "🚨 보건증이 만료됐어요" : "⚠️ 보건증 만료가 다가와요",
        body: `보건증 ${isExpired ? "만료 " + dLabel : dLabel + " 남음"} — 보건소에서 갱신하고 사장님께 새 사본을 전달해 주세요.`,
        url: "/mypage",
        data: { teamMemberId: doc.team_member_id, docId: doc.id },
      });
    }

    notified.push({ docId: doc.id, diffDays });
  }));

  return NextResponse.json({ checked: docs.length, notified: notified.length, details: notified });
}
