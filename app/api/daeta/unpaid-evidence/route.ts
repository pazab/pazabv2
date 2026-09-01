import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

const getServiceClient = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

// 알바생이 대타 근무 임금체불 진정(노동청)에 쓸 증빙 자료를 한 번에 모아준다.
// 파잡은 근로계약 당사자가 아니라 임금 지급 의무는 없지만, 이미 갖고 있는
// 근태/정산/계약서 기록을 진정서 첨부용으로 정리해주는 것까지는 책임 범위 밖 도움.
export async function GET(req: NextRequest) {
  try {
    const matchId = req.nextUrl.searchParams.get("matchId");
    if (!matchId) return NextResponse.json({ error: "matchId 필요" }, { status: 400 });

    const cookieStore = await cookies();
    const authClient = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { getAll: () => cookieStore.getAll() } }
    );
    const { data: { user } } = await authClient.auth.getUser();
    if (!user) return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });

    const sb = getServiceClient();
    const { data: match } = await sb
      .from("matches")
      .select("id, employer_id, worker_id, daeta_posting_id, employer_profile_id, progress_status, checked_in_at, checked_out_at, created_at")
      .eq("id", matchId)
      .maybeSingle();

    if (!match || !match.daeta_posting_id) {
      return NextResponse.json({ error: "대타 매칭을 찾을 수 없어요." }, { status: 404 });
    }
    if (user.id !== match.worker_id) {
      return NextResponse.json({ error: "본인의 근무 기록만 조회할 수 있어요." }, { status: 403 });
    }

    const [
      { data: posting },
      { data: employerProfile },
      { data: employerUser },
      { data: workerUser },
      { data: payslips },
      { data: contract },
      { data: dailyAttendance },
      { data: unpaidReport },
    ] = await Promise.all([
      sb.from("daeta_postings")
        .select("id, business_name, business_type, region, wage, work_hours, work_date, work_date_end, break_minutes, duty")
        .eq("id", match.daeta_posting_id).maybeSingle(),
      match.employer_profile_id
        ? sb.from("employer_profiles")
            .select("business_name, biz_reg_number, ceo_name, biz_tel, address, address_detail")
            .eq("id", match.employer_profile_id).maybeSingle()
        : Promise.resolve({ data: null }),
      sb.from("users").select("real_name, nickname, phone").eq("id", match.employer_id).maybeSingle(),
      sb.from("users").select("real_name, nickname, phone").eq("id", match.worker_id).maybeSingle(),
      sb.from("payslips")
        .select("id, wage, total_hours, overtime_hours, base_pay, overtime_pay, total_pay, income_tax, local_tax, total_deductions, net_pay, status, issued_at, memo, correction_reason")
        .eq("match_id", matchId).order("issued_at", { ascending: true }),
      sb.from("contracts")
        .select("id, status, start_date, end_date, employer_signed, worker_signed, created_at")
        .eq("match_id", matchId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
      sb.from("daeta_daily_attendance")
        .select("work_date, checked_in_at, checked_out_at")
        .eq("match_id", matchId).order("work_date", { ascending: true }),
      sb.from("trust_score_logs")
        .select("created_at, reason")
        .eq("ref_id", matchId).ilike("reason", "%임금 미지급%")
        .order("created_at", { ascending: false }).limit(1).maybeSingle(),
    ]);

    if (!posting) return NextResponse.json({ error: "대타 공고를 찾을 수 없어요." }, { status: 404 });

    const totalUnpaid = (payslips || []).reduce((sum, p) => sum + (p.net_pay || 0), 0);

    return NextResponse.json({
      match: {
        id: match.id,
        progressStatus: match.progress_status,
        checkedInAt: match.checked_in_at,
        checkedOutAt: match.checked_out_at,
        createdAt: match.created_at,
      },
      posting,
      employer: {
        businessName: employerProfile?.business_name || posting.business_name || "-",
        bizRegNumber: employerProfile?.biz_reg_number || null,
        ceoName: employerProfile?.ceo_name || employerUser?.real_name || null,
        bizTel: employerProfile?.biz_tel || null,
        address: [employerProfile?.address, employerProfile?.address_detail].filter(Boolean).join(" ") || posting.region || "-",
        contactName: employerUser?.real_name || employerUser?.nickname || "-",
        contactPhone: employerUser?.phone || null,
      },
      worker: {
        name: workerUser?.real_name || workerUser?.nickname || "-",
        phone: workerUser?.phone || null,
      },
      payslips: payslips || [],
      totalUnpaid,
      contract: contract || null,
      dailyAttendance: dailyAttendance || [],
      unpaidReport: unpaidReport || null,
      generatedAt: new Date().toISOString(),
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
