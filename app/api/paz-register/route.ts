import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// 음성 공고 등록 마법사 상태 관리
export async function POST(req: NextRequest) {
  try {
    const { userId, step, collected, userInput } = await req.json();

    // step: "start" | "business_type" | "wage" | "work_days" | "region" | "confirm" | "register"

    if (step === "register") {
      // 최종 등록
      const { data: userData } = await supabase
        .from("users").select("employer_result, employer_bot_knowledge").eq("id", userId).single();

      const MIN_WAGE = 10030;
      const wage = parseInt(collected.wage) || MIN_WAGE;

      const profileData = {
        user_id: userId,
        business_name: collected.business_name || "우리 매장",
        business_type: collected.business_type,
        region: collected.region,
        wage: wage < MIN_WAGE ? MIN_WAGE : wage,
        wage_negotiable: false,
        work_days: collected.work_days,
        days_negotiable: false,
        work_hours: collected.work_hours || "협의",
        is_active: true,
        tags: [],
        staff_count: 1,
        meal_provided: false,
        parking: false,
        employer_type: userData?.employer_result?.personalityType || null,
        bio5_data: userData?.employer_result?.big5 || null,
        hexaco_data: userData?.employer_result?.hexaco || null,
        bot_knowledge: userData?.employer_bot_knowledge || null,
      };

      // 매장 찾거나 생성
      const { data: existingStore } = await supabase.from("employer_profiles")
        .select("id").eq("user_id", userId).eq("is_deleted", false)
        .order("created_at", { ascending: false }).limit(1).maybeSingle();

      let storeId: string;
      if (existingStore?.id) {
        storeId = existingStore.id;
        await supabase.from("employer_profiles").update({
          business_name: profileData.business_name,
          business_type: profileData.business_type,
          region: profileData.region,
        }).eq("id", storeId);
      } else {
        const { data: newStore, error: storeError } = await supabase.from("employer_profiles").insert({
          user_id: userId,
          business_name: profileData.business_name,
          business_type: profileData.business_type,
          region: profileData.region,
        }).select("id").single();
        if (storeError || !newStore) throw storeError || new Error("store insert failed");
        storeId = newStore.id;
      }

      // 공고 데이터 jobs 테이블에 insert
      const jobData = {
        employer_profile_id: storeId,
        user_id: userId,
        wage: profileData.wage,
        wage_negotiable: false,
        work_days: profileData.work_days,
        days_negotiable: false,
        work_hours: profileData.work_hours,
        is_active: true,
        tags: [],
        staff_count: 1,
        meal_provided: false,
        parking: false,
        employer_type: profileData.employer_type,
        hexaco_data: profileData.hexaco_data,
        bot_knowledge: profileData.bot_knowledge,
        job_status: "active",
      };
      const { error: jobError } = await supabase.from("jobs").insert(jobData);
      if (jobError) throw jobError;

      return NextResponse.json({ success: true, message: "공고가 등록됐어요! 🎉" });
    }

    // 단계별 다음 질문 생성
    const stepPrompts: Record<string, string> = {
      start: "사용자가 공고 등록을 요청했어요. 어떤 직종인지 물어보세요. (1문장으로 짧게)",
      business_type: `사용자가 "${userInput}"라고 했어요. 시급을 물어보세요. 최저시급(10,030원)도 언급해주세요. (1문장)`,
      wage: `사용자가 "${userInput}"라고 했어요. 근무 요일을 물어보세요. (1문장)`,
      work_days: `사용자가 "${userInput}"라고 했어요. 근무 위치(지역)를 물어보세요. (1문장)`,
      region: `사용자가 "${userInput}"라고 했어요. 수집된 정보를 요약하고 등록할지 물어보세요:
직종: ${collected.business_type}
시급: ${collected.wage}원
요일: ${collected.work_days}
위치: ${collected.region}
(짧게 확인 요청)`,
    };

    // 입력값 파싱
    let parsedValue = userInput;
    if (step === "wage") {
      // 숫자만 추출
      const nums = userInput.replace(/,/g, "").match(/\d+/g);
      parsedValue = nums ? nums[0] : "10030";
    }

    const res = await anthropic.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 100,
      system: "파잡 AI 에이전트 PAZ. 공고 등록 마법사. 짧고 친근하게.",
      messages: [{ role: "user", content: stepPrompts[step] || "다음 단계를 안내해주세요." }],
    });

    const reply = res.content[0].type === "text" ? res.content[0].text : "";

    // 다음 스텝 계산
    const nextSteps: Record<string, string> = {
      start: "business_type",
      business_type: "wage",
      wage: "work_days",
      work_days: "region",
      region: "confirm",
    };

    // 수집 데이터 업데이트
    const fieldMap: Record<string, string> = {
      business_type: "business_type",
      wage: "wage",
      work_days: "work_days",
      region: "region",
    };

    const newCollected = { ...collected };
    if (fieldMap[step]) newCollected[fieldMap[step]] = parsedValue;

    return NextResponse.json({
      reply,
      nextStep: nextSteps[step] || "confirm",
      collected: newCollected,
    });

  } catch (e: any) {
    console.error("PAZ register error:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
