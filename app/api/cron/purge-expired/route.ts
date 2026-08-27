/**
 * GET /api/cron/purge-expired — 법정보존기한이 지난 탈퇴회원 기록 하드 삭제 (매일 1회, cron-job.org)
 *
 * app/api/withdraw/route.ts가 탈퇴 시점에 contracts/payslips/attendance/team_member_documents의
 * retention_until을 "탈퇴일 + 3년"으로 설정해두는데, 지금까지는 그 이후에 실제로 지우는 절차가
 * 없어서 법정 보존기간이 지나도 사실상 영구 보존 상태였다. retention_until이 null인 행(아직
 * 양쪽 다 활동 중이라 보존 목적이 안 끝난 관계)은 절대 건드리지 않는다.
 */
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { extractMediaStoragePath } from "@/lib/storagePath";

const getServiceClient = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

export async function GET(req: Request) {
  if (process.env.NODE_ENV === "production") {
    const auth = req.headers.get("authorization") || "";
    const cronSecret = process.env.CRON_SECRET || "";
    if (!cronSecret || auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const sb = getServiceClient();
  const nowIso = new Date().toISOString();
  const results: Record<string, number> = {};

  // 등본/보건증/통장사본 스캔 파일은 DB 행뿐 아니라 스토리지 원본도 같이 지운다 — 신분증급
  // 민감정보라 파일이 남아있으면 파기가 아니라 방치가 되기 때문.
  const { data: expiredDocs } = await sb
    .from("team_member_documents")
    .select("id, file_url")
    .not("retention_until", "is", null)
    .lt("retention_until", nowIso);

  if (expiredDocs && expiredDocs.length > 0) {
    const paths = expiredDocs.map(d => extractMediaStoragePath(d.file_url)).filter((p): p is string => !!p);
    if (paths.length > 0) {
      const { error: storageErr } = await sb.storage.from("media").remove(paths);
      if (storageErr) console.error("[purge-expired] storage remove error:", storageErr);
    }
    const { error: docsErr } = await sb.from("team_member_documents")
      .delete().in("id", expiredDocs.map(d => d.id));
    if (docsErr) console.error("[purge-expired] team_member_documents delete error:", docsErr);
    results.team_member_documents = expiredDocs.length;
  } else {
    results.team_member_documents = 0;
  }

  for (const table of ["contracts", "payslips", "attendance"] as const) {
    const { count, error } = await sb.from(table)
      .delete({ count: "exact" })
      .not("retention_until", "is", null)
      .lt("retention_until", nowIso);
    if (error) {
      console.error(`[purge-expired] ${table} delete error:`, error);
      results[table] = -1;
    } else {
      results[table] = count || 0;
    }
  }

  return NextResponse.json({ message: "purge complete", purged: results });
}
