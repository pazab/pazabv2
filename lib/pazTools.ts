/**
 * PAZ HR Tool 실행기 (독립 모듈)
 * 
 * 독립성 원칙:
 * - 외부 프레임워크 의존성 없음 (Next.js, React 등)
 * - supabase 클라이언트를 외부에서 주입받음
 * - 어느 프로젝트에도 붙여서 사용 가능
 * - npm 패키지로 배포 가능한 구조
 * 
 * 사용법:
 * import { PAZ_TOOLS, executePazTool } from "./pazTools";
 * const result = await executePazTool("get_attendance_today", { employer_id: "xxx" }, supabase);
 */

// ── Tool 스키마 정의 (LLM에 전달용) ─────────────────────────
// Anthropic SDK 없이도 동작하도록 타입 직접 정의
export interface PazTool {
  name: string;
  description: string;
  input_schema: {
    type: "object";
    properties: Record<string, { type: string; description: string }>;
    required: string[];
  };
}

export const PAZ_TOOLS: PazTool[] = [
  {
    name: "get_attendance_today",
    description: "오늘 팀원들의 출근 현황 조회. 누가 출근/지각/미출근인지 확인.",
    input_schema: {
      type: "object",
      properties: {
        employer_id: { type: "string", description: "사장님 user_id" }
      },
      required: ["employer_id"]
    }
  },
  {
    name: "get_attendance_summary",
    description: "이번달 팀원별 근태 요약. 출근일수, 지각, 결근, 총 근무시간.",
    input_schema: {
      type: "object",
      properties: {
        employer_id: { type: "string", description: "사장님 user_id" }
      },
      required: ["employer_id"]
    }
  },
  {
    name: "get_salary_estimate",
    description: "이번달 예상 급여 계산. 사장님=팀원 전체, 알바생=본인.",
    input_schema: {
      type: "object",
      properties: {
        employer_id: { type: "string", description: "사장님 user_id (선택)" },
        worker_id: { type: "string", description: "알바생 user_id (선택)" }
      },
      required: []
    }
  },
  {
    name: "issue_payslip",
    description: "임금 명세서 발행. 팀원 이름/별명 지정 가능, 없으면 전체 발행.",
    input_schema: {
      type: "object",
      properties: {
        employer_id: { type: "string", description: "사장님 user_id" },
        worker_nickname: { type: "string", description: "발행할 팀원 이름/별명 (없으면 전체)" },
        year: { type: "number", description: "년도 (없으면 현재)" },
        month: { type: "number", description: "월 (없으면 현재)" }
      },
      required: ["employer_id"]
    }
  },
  {
    name: "send_contract_reminder",
    description: "계약서 미서명 팀원에게 채팅 알림 발송.",
    input_schema: {
      type: "object",
      properties: {
        employer_id: { type: "string", description: "사장님 user_id" }
      },
      required: ["employer_id"]
    }
  },
  {
    name: "get_team_members",
    description: "현재 소속 팀원 목록과 기본 정보 조회.",
    input_schema: {
      type: "object",
      properties: {
        employer_id: { type: "string", description: "사장님 user_id" }
      },
      required: ["employer_id"]
    }
  },
  {
    name: "get_my_work_info",
    description: "알바생 본인의 소속 정보, 이번달 근태, 예상 급여 조회.",
    input_schema: {
      type: "object",
      properties: {
        worker_id: { type: "string", description: "알바생 user_id" }
      },
      required: ["worker_id"]
    }
  }
];

// ── Tool 실행 옵션 ────────────────────────────────────────────
export interface PazToolOptions {
  voiceInput?: boolean;   // 음성 입력 여부 (로깅용)
  userId?: string;        // 실행자 ID (로깅용)
}

// ── Tool 실행 함수 ────────────────────────────────────────────
export async function executePazTool(
  toolName: string,
  input: Record<string, any>,
  supabase: any,          // Supabase 클라이언트 주입
  options?: PazToolOptions
): Promise<string> {

  // KST 기준 날짜 (독립적으로 계산)
  const kstNow = new Date(new Date().getTime() + 9 * 60 * 60 * 1000);
  const today = kstNow.toISOString().split("T")[0];
  const monthStr = kstNow.toISOString().slice(0, 7);

  try {
    switch (toolName) {

      case "get_attendance_today": {
        const { data: members } = await supabase
          .from("team_members")
          .select("id, nickname, users!team_members_worker_id_fkey(nickname, email)")
          .eq("employer_id", input.employer_id)
          .eq("status", "active");

        if (!members?.length) return "등록된 팀원이 없어요.";

        const { data: att } = await supabase
          .from("attendance")
          .select("team_member_id, status, check_in, check_out")
          .in("team_member_id", members.map((m: any) => m.id))
          .eq("work_date", today);

        const statusMap: Record<string, string> = {
          normal: "✅출근", late: "⏰지각", early_leave: "🔜조퇴",
          absent: "❌결근", off: "📅휴무"
        };

        const checkedIn = (att || []).map((a: any) => {
          const m = members.find((m: any) => m.id === a.team_member_id) as any;
          const name = m?.nickname || m?.users?.nickname || m?.users?.email?.split("@")[0] || "팀원";
          const time = a.check_in
            ? new Date(a.check_in).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })
            : "";
          return `${statusMap[a.status] || a.status} ${name} ${time}`.trim();
        });

        const absent = members
          .filter((m: any) => !(att || []).find((a: any) => a.team_member_id === m.id))
          .map((m: any) => (m as any).nickname || (m as any).users?.nickname || "팀원");

        let result = `📋 오늘(${today}) 출근 현황\n`;
        if (checkedIn.length) result += checkedIn.join("\n") + "\n";
        if (absent.length) result += `⬜ 미출근: ${absent.join(", ")}`;
        return result || "오늘 근태 기록이 없어요.";
      }

      case "get_attendance_summary": {
        const { data: members } = await supabase
          .from("team_members")
          .select("id, worker_id, nickname, users!team_members_worker_id_fkey(nickname)")
          .eq("employer_id", input.employer_id)
          .eq("status", "active");

        if (!members?.length) return "등록된 팀원이 없어요.";

        let result = `📊 이번달(${monthStr}) 근태 요약\n`;
        for (const m of members) {
          const { data: att } = await supabase
            .from("attendance")
            .select("status, actual_hours")
            .eq("team_member_id", m.id)
            .gte("work_date", `${monthStr}-01`);

          const normal = (att || []).filter((a: any) => a.status === "normal").length;
          const late = (att || []).filter((a: any) => a.status === "late").length;
          const absent = (att || []).filter((a: any) => a.status === "absent").length;
          const totalH = (att || []).reduce((s: number, a: any) => s + (parseFloat(a.actual_hours) || 0), 0);
          const name = (m as any).nickname || (m as any).users?.nickname || "팀원";
          result += `- ${name}: 출근 ${normal}일 지각 ${late} 결근 ${absent} (${totalH.toFixed(1)}h)\n`;
        }
        return result;
      }

      case "get_salary_estimate": {
        if (input.employer_id) {
          // 사장님 → 팀원 전체
          const { data: members } = await supabase
            .from("team_members")
            .select("id, wage, worker_id, nickname, users!team_members_worker_id_fkey(nickname)")
            .eq("employer_id", input.employer_id)
            .eq("status", "active");

          if (!members?.length) return "등록된 팀원이 없어요.";

          let result = `💰 이번달(${monthStr}) 팀원별 예상 급여\n`;
          for (const m of members) {
            const { data: att } = await supabase
              .from("attendance")
              .select("actual_hours")
              .eq("worker_id", m.worker_id)
              .gte("work_date", `${monthStr}-01`);
            const totalH = (att || []).reduce((s: number, a: any) => s + (parseFloat(a.actual_hours) || 0), 0);
            const name = (m as any).nickname || (m as any).users?.nickname || "팀원";
            const pay = m.wage ? Math.round(totalH * m.wage) : 0;
            result += `- ${name}: ${totalH.toFixed(1)}h × ${(m.wage || 0).toLocaleString()}원 = ${pay.toLocaleString()}원\n`;
          }
          return result;

        } else if (input.worker_id) {
          // 알바생 → 본인
          const { data: myWork } = await supabase
            .from("team_members")
            .select("wage")
            .eq("worker_id", input.worker_id)
            .eq("status", "active")
            .limit(1)
            .maybeSingle();

          const { data: att } = await supabase
            .from("attendance")
            .select("actual_hours")
            .eq("worker_id", input.worker_id)
            .gte("work_date", `${monthStr}-01`);

          const totalH = (att || []).reduce((s: number, a: any) => s + (parseFloat(a.actual_hours) || 0), 0);
          const wage = (myWork as any)?.wage || 0;
          const pay = wage ? Math.round(totalH * wage) : 0;
          return `💰 이번달(${monthStr}) 예상 급여\n근무: ${totalH.toFixed(1)}시간 × ${wage.toLocaleString()}원 = ${pay.toLocaleString()}원`;
        }

        return "employer_id 또는 worker_id가 필요해요.";
      }

      case "issue_payslip": {
        const { data: members } = await supabase
          .from("team_members")
          .select("id, wage, worker_id, match_id, nickname, users!team_members_worker_id_fkey(nickname, email)")
          .eq("employer_id", input.employer_id)
          .eq("status", "active");

        if (!members?.length) return "등록된 팀원이 없어요.";

        // 특정 팀원 지정 여부
        let targets = members;
        if (input.worker_nickname) {
          targets = members.filter((m: any) =>
            (m.nickname || "").includes(input.worker_nickname) ||
            (m.users?.nickname || "").includes(input.worker_nickname) ||
            (m.users?.email || "").includes(input.worker_nickname)
          );
          if (!targets.length) return `"${input.worker_nickname}"와 일치하는 팀원이 없어요.\n팀원 호칭을 확인해주세요.`;
        }

        const year = input.year || kstNow.getFullYear();
        const month = input.month || (kstNow.getMonth() + 1);
        const lastDay = new Date(year, month, 0).getDate();
        const monthPad = String(month).padStart(2, "0");

        let result = `📄 ${year}년 ${month}월 임금 명세서 발행 결과\n`;

        for (const m of targets) {
          const { data: att } = await supabase
            .from("attendance")
            .select("actual_hours, status")
            .eq("worker_id", m.worker_id)
            .gte("work_date", `${year}-${monthPad}-01`)
            .lte("work_date", `${year}-${monthPad}-${String(lastDay).padStart(2, "0")}`);

          const workDays = (att || []).filter((a: any) => ["normal", "late"].includes(a.status));
          const totalH = (att || []).reduce((s: number, a: any) => s + (parseFloat(a.actual_hours) || 0), 0);
          const wage = (m as any).wage || 0;
          const totalPay = wage ? Math.round(totalH * wage) : 0;

          const { error } = await supabase.from("payslips").upsert({
            employer_id: input.employer_id,
            worker_id: m.worker_id,
            year, month,
            work_days: workDays.length,
            total_hours: totalH,
            base_pay: totalPay,
            total_pay: totalPay,
            wage,
          }, { onConflict: "employer_id,worker_id,year,month" });

          const name = (m as any).nickname || (m as any).users?.nickname || "팀원";

          if (!error) {
            result += `✅ ${name}: ${totalH.toFixed(1)}h → ${totalPay.toLocaleString()}원 발행 완료\n`;
            // 채팅 알림
            if (m.match_id) {
              await supabase.from("chats").insert({
                match_id: m.match_id,
                sender_id: input.employer_id,
                receiver_id: m.worker_id,
                message: `📄 ${year}년 ${month}월 임금 명세서가 발행됐어요!\n총 ${totalH.toFixed(1)}시간 → ${totalPay.toLocaleString()}원\nMY → 팀소속관리 → 급여 탭에서 확인해주세요.`,
                message_type: "system",
                is_read: false,
              });
            }
          } else {
            result += `❌ ${name}: 발행 실패 (${error.message})\n`;
          }
        }
        return result;
      }

      case "send_contract_reminder": {
        const { data: pending } = await supabase
          .from("contracts")
          .select("match_id, worker_id, users!contracts_worker_id_fkey(nickname)")
          .eq("employer_id", input.employer_id)
          .eq("status", "pending");

        if (!pending?.length) return "✅ 미서명 계약서가 없어요! 모든 팀원이 동의했어요.";

        let notified = 0;
        for (const c of pending) {
          if (!c.match_id) continue;
          await supabase.from("chats").insert({
            match_id: c.match_id,
            sender_id: input.employer_id,
            receiver_id: c.worker_id,
            message: "📄 근로계약서 서명이 아직 완료되지 않았어요!\nMY → 팀소속관리 → 계약서 탭에서 확인해주세요.",
            message_type: "system",
            is_read: false,
          });
          notified++;
        }
        const names = pending.map((c: any) => (c as any).users?.nickname || "팀원").join(", ");
        return `📨 ${notified}명에게 계약서 서명 알림 발송 완료!\n(${names})`;
      }

      case "get_team_members": {
        const { data: members } = await supabase
          .from("team_members")
          .select("hire_date, wage, work_days, work_hours, nickname, users!team_members_worker_id_fkey(nickname, email)")
          .eq("employer_id", input.employer_id)
          .eq("status", "active");

        if (!members?.length) return "등록된 팀원이 없어요.";

        let result = `👥 현재 팀원 ${members.length}명\n`;
        members.forEach((m: any) => {
          const name = m.nickname || m.users?.nickname || m.users?.email?.split("@")[0] || "팀원";
          const pazHint = m.nickname ? ` (PAZ호칭: "${m.nickname}")` : "";
          result += `- ${name}${pazHint}: ${m.work_days || "요일미정"} 시급 ${(m.wage || 0).toLocaleString()}원\n`;
        });
        return result;
      }

      case "get_my_work_info": {
        const { data: myWork } = await supabase
          .from("team_members")
          .select("hire_date, wage, work_days, work_hours, users!team_members_employer_id_fkey(nickname)")
          .eq("worker_id", input.worker_id)
          .eq("status", "active")
          .limit(1)
          .maybeSingle();

        if (!myWork) return "현재 소속된 매장이 없어요.";

        const { data: att } = await supabase
          .from("attendance")
          .select("work_date, status, actual_hours")
          .eq("worker_id", input.worker_id)
          .gte("work_date", `${monthStr}-01`)
          .order("work_date");

        const normal = (att || []).filter((a: any) => a.status === "normal").length;
        const late = (att || []).filter((a: any) => a.status === "late").length;
        const totalH = (att || []).reduce((s: number, a: any) => s + (parseFloat(a.actual_hours) || 0), 0);
        const wage = (myWork as any).wage || 0;
        const estPay = wage ? Math.round(totalH * wage) : 0;

        return `📋 내 근무 정보\n사장님: ${(myWork as any).users?.nickname || "사장님"}\n시급: ${wage.toLocaleString()}원\n근무: ${(myWork as any).work_days || "미정"}\n\n이번달(${monthStr})\n출근 ${normal}일 / 지각 ${late}회 / 총 ${totalH.toFixed(1)}시간\n예상 급여: ${estPay.toLocaleString()}원`;
      }

      default:
        return `알 수 없는 도구: ${toolName}`;
    }

  } catch (e: any) {
    console.error(`[PAZ Tool Error] ${toolName}:`, e.message);
    return `오류가 발생했어요: ${e.message}`;
  }
}
