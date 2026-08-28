import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { applyPhoneViolationHistory } from "@/lib/phoneViolationHistory";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const PHONE_REGEX = /^01[016789]-\d{3,4}-\d{4}$/;

// 팀원(알바생)의 생년월일/연락처/주소 정정 — 본인이 아니라 사장님이 대신 고침
// users 테이블 UPDATE RLS는 본인 전용(auth.uid() = id)이라 클라이언트에서 직접 못 고침 →
// 서버에서 "요청자가 실제로 이 팀원의 사장님인지"를 직접 검증한 뒤 서비스 롤로 처리
export async function PATCH(req: NextRequest) {
  try {
    const { memberId, birthDate, phone, address } = await req.json();
    if (!memberId) return NextResponse.json({ error: "memberId 필요" }, { status: 400 });

    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { getAll: () => cookieStore.getAll() } }
    );
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "인증 필요" }, { status: 401 });

    if (phone && phone.trim() && !PHONE_REGEX.test(phone.trim())) {
      return NextResponse.json({ error: "연락처를 올바른 휴대폰 번호 형식(010-0000-0000)으로 입력해주세요." }, { status: 400 });
    }

    // 요청자가 이 팀원의 실제 사장님인지 확인 (다른 매장/타인 팀원 정보 수정 차단)
    const { data: tm } = await supabaseAdmin
      .from("team_members")
      .select("id, employer_id, worker_id")
      .eq("id", memberId)
      .single();
    if (!tm || tm.employer_id !== user.id) {
      return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });
    }

    const updates = {
      birth_date: birthDate || null,
      phone: phone?.trim() || null,
      address: address?.trim() || null,
      address_detail: null as string | null,
    };

    const { error: userErr } = await supabaseAdmin.from("users").update(updates).eq("id", tm.worker_id);
    if (userErr) return NextResponse.json({ error: userErr.message }, { status: 500 });

    // 이 번호로 과거(다른 계정) 노쇼/신뢰점수 위반 이력이 있으면 이 팀원 계정에도 승계
    if (updates.phone) {
      await applyPhoneViolationHistory(supabaseAdmin, tm.worker_id, updates.phone).catch(() => {});
    }

    // 서명된 계약서 스냅샷도 같이 정정 — 계약서 조회 화면이 오탈자를 계속 보여주지 않도록
    const { data: contract } = await supabaseAdmin
      .from("contracts")
      .select("id, contract_data")
      .eq("team_member_id", memberId)
      .neq("status", "cancelled")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (contract) {
      const cd = contract.contract_data || {};
      const updatedCd = {
        ...cd,
        workerBirth: updates.birth_date || cd.workerBirth || null,
        workerPhone: updates.phone || cd.workerPhone || null,
        workerAddr: updates.address || cd.workerAddr || null,
        workerAddrDetail: null,
      };
      await supabaseAdmin.from("contracts").update({ contract_data: updatedCd }).eq("id", contract.id);
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("personal-info PATCH error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
