import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// 매장 관련 질문 카테고리
function classifyQuestion(question: string): string {
  const q = question.toLowerCase();
  if (/시급|급여|월급|임금|돈|페이|주휴|상여/.test(q)) return "급여";
  if (/교육|훈련|배우|처음|신입|경험|온보딩/.test(q)) return "교육";
  if (/식사|밥|먹|점심|저녁|간식|식비/.test(q)) return "식사";
  if (/주차|버스|지하철|교통|거리|위치/.test(q)) return "교통/위치";
  if (/분위기|문화|팀|동료|직원|나이|사람/.test(q)) return "분위기";
  if (/바쁘|피크|러시|혼잡|손님|고객/.test(q)) return "근무강도";
  if (/사장|대표|상주|계세요|자리/.test(q)) return "사장님";
  if (/언제|기간|계약|출근|시작/.test(q)) return "근무일정";
  if (/복장|유니폼|옷|드레스코드/.test(q)) return "복장";
  if (/휴가|쉬|연차|휴일|주휴/.test(q)) return "휴가/휴일";
  return "기타";
}

// 직원 관련 질문 카테고리
function classifyWorkerQuestion(question: string): string {
  const q = question.toLowerCase();
  if (/경력|경험|해봤|일한|했던/.test(q)) return "경력";
  if (/성격|성향|스타일|어떤 사람/.test(q)) return "성격";
  if (/언제|출근|시작|가능|즉시/.test(q)) return "출근가능일";
  if (/요일|시간|스케줄|일정|근무/.test(q)) return "근무일정";
  if (/장기|단기|계속|오래/.test(q)) return "근무기간";
  if (/지각|결근|노쇼|책임|성실/.test(q)) return "신뢰도";
  if (/왜|이유|동기|목적|지원/.test(q)) return "지원동기";
  if (/강점|잘하|자신|특기/.test(q)) return "강점";
  return "기타";
}

export async function POST(req: NextRequest) {
  try {
    const { messages, botType, botProfile, action, matchId, userId } = await req.json();

    // 요약 생성 + 채팅방 전송
    if (action === "summarize") {
      const summaryPrompt = botType === "employer"
        ? `다음은 알바 지원자가 "${botProfile?.business_name || "매장"}" 사장님 봇과 나눈 사전미팅 대화예요.
대화 내용을 분석해서 아래 형식으로 요약해주세요.

대화:
${messages.filter((m: any) => m.role !== "system").map((m: any) => `${m.role === "user" ? "지원자" : "봇"}: ${m.content}`).join("\n")}

요약 형식 (이모지 포함, 3~5줄):
- 지원자가 궁금해한 것들
- 매장에 대한 인상/관심사
- 특이사항 (있으면)

중립적이고 긍정적인 톤으로, "지원자가 ~을 궁금해했어요" 형식으로 작성`
        : `다음은 사장님이 알바 지원자 봇과 나눈 사전미팅 대화예요.
대화 내용을 분석해서 아래 형식으로 요약해주세요.

대화:
${messages.filter((m: any) => m.role !== "system").map((m: any) => `${m.role === "user" ? "사장님" : "봇"}: ${m.content}`).join("\n")}

요약 형식 (이모지 포함, 3~5줄):
- 사장님이 궁금해한 것들
- 지원자에 대한 관심사
- 특이사항 (있으면)

중립적이고 긍정적인 톤으로, "사장님이 ~을 궁금해했어요" 형식으로 작성`;

      const summaryRes = await anthropic.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 300,
        messages: [{ role: "user", content: summaryPrompt }],
      });

      const summary = summaryRes.content[0].type === "text" ? summaryRes.content[0].text : "";
      const header = botType === "employer"
        ? "🤖 AI 사전미팅 요약 (지원자 → 매장봇)"
        : "🤖 AI 사전미팅 요약 (사장님 → 지원자봇)";
      const fullMsg = `${header}\n${"─".repeat(20)}\n${summary}`;

      // 채팅방에 시스템 메시지 저장
      if (matchId) {
        const { data: match } = await supabase.from("matches").select("worker_id, employer_id").eq("id", matchId).single();
        if (match) {
          await supabase.from("chats").insert({
            match_id: matchId,
            sender_id: userId,
            receiver_id: userId === match.worker_id ? match.employer_id : match.worker_id,
            message: fullMsg,
            message_type: "system",
            is_read: false,
          });
        }
      }

      return NextResponse.json({ summary: fullMsg, success: true });
    }

    // 일반 채팅 응답
    let systemPrompt = "";

    if (botType === "employer") {
      const p = botProfile || {};
      const bk = p.bot_knowledge;

      // users.employer_bot_knowledge도 가져오기 (공통 지식)
      let userBk = null;
      if (p.user_id) {
        const { data: ud } = await supabase
          .from("users").select("employer_bot_knowledge").eq("id", p.user_id).single();
        userBk = ud?.employer_bot_knowledge;
      }
      // 공고별 지식 우선, 없으면 users 공통 지식 사용
      const mergedBk = bk || userBk;

      systemPrompt = `당신은 "${p.business_name || "매장"}" 사장님의 AI 대리인 "파잡봇"입니다.
알바 지원자가 우리 매장에 대해 궁금한 것들을 물어보고 있어요. 사장님을 대신해서 친근하고 따뜻하게 답변해주세요.

## 매장 기본 정보
- 매장명: ${p.business_name || "미입력"}
- 업종: ${p.business_type || "미입력"}
- 위치: ${p.region || "미입력"}
- 시급: ${p.wage ? Number(p.wage).toLocaleString() + "원" : "협의 가능"}
- 근무시간: ${p.work_hours || "협의 가능"}
- 근무요일: ${p.work_days || "협의 가능"}
- 사장님 스타일: ${p.employer_type || "미분석"}
${p.tagline ? `- 한마디: "${p.tagline}"` : ""}

${mergedBk ? `## 매장 심층 정보 (사장님 인터뷰 기반)
- 주요 업무: ${mergedBk.mainTasks?.join(", ") || ""}
- 매장 분위기: ${mergedBk.atmosphere || ""}
- 바쁜 시간대: ${mergedBk.busyHours || ""}
- 교육 방식: ${mergedBk.training || ""}
- 식사 제공: ${mergedBk.meal || ""}
- 사장님 상주: ${mergedBk.ownerPresence || ""}
- 복지: ${mergedBk.benefits?.join(", ") || ""}
- 팀 규모: ${mergedBk.teamSize || ""}
- 잘 맞는 알바생: ${mergedBk.goodFit || ""}
- 특이사항: ${mergedBk.specialNotes || ""}` : "## 참고\n아직 상세 매장 정보가 없어요. 기본 정보를 바탕으로 답변하고, 모르는 건 솔직하게 말해요."}

## 답변 원칙
1. 2~3문장으로 간결하게
2. 모르는 건 "사장님께 직접 확인해드릴게요 😊"
3. 매장의 좋은 점을 자연스럽게 어필 (과장 금지)
4. 이모지 1~2개로 친근하게
5. **절대 금지**: "지원하시겠어요?", "러브콜 보내보세요" 등 지원/러브콜 유도 발언
6. **절대 금지**: "~괜찮으실까요?", "~어떠세요?" 같은 되묻기
7. 정보 제공에만 집중, 의사결정은 사용자에게 맡기기`;

    } else {
      const p = botProfile || {};
      systemPrompt = `당신은 알바 지원자 "${p.nickname || p.name || "지원자"}"의 AI 대리인 "파잡봇"입니다.
사장님이 이 지원자에 대해 궁금한 것들을 물어보고 있어요. 지원자를 대신해서 성실하고 긍정적으로 답변해주세요.

## 지원자 정보
- 이름: ${p.nickname || p.name || "미입력"}
- 성향 유형: ${p.worker_type || "미분석"}
${p.result?.tagline ? `- 한마디: "${p.result.tagline}"` : ""}
- 강점: ${p.result?.strengths?.join(", ") || "미분석"}
- 희망 업종: ${p.desired_type || "무관"}
- 희망 지역: ${p.region || "미입력"}
- 희망 시급: ${p.desired_wage ? p.desired_wage.toLocaleString() + "원" : "협의 가능"}
- 경력: ${p.career || "없음"}
- 자기소개: ${p.bio || "직접 물어봐주세요!"}

## 답변 원칙
1. 2~3문장으로 간결하게
2. 모르는 건 "지원자에게 직접 여쭤봐야 할 것 같아요 😊"
3. 지원자의 강점을 자연스럽게 어필 (과장 금지)
4. 이모지 1~2개로 친근하게
5. **절대 금지**: "채용하시겠어요?", "러브콜 보내보세요" 등 채용/러브콜 유도 발언
6. **절대 금지**: "~어떠세요?", "~괜찮으실까요?" 같은 되묻기
7. 정보 제공에만 집중, 의사결정은 사용자에게 맡기기`;
    }

    const response = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 400,
      system: systemPrompt,
      messages: messages.map((m: any) => ({ role: m.role, content: m.content })),
    });

    const text = response.content[0].type === "text" ? response.content[0].text : "";

    // 봇 대화 로그 저장
    if (botType === "employer" && botProfile?.id) {
      try {
        const lastUserMsg = messages[messages.length - 1]?.content || "";
        const category = classifyQuestion(lastUserMsg);
        const uncertain = /직접 확인|모르|알 수 없|정확하지|파악이 안|확인이 필요/.test(text);
        await supabase.from("bot_chat_logs").insert({
          employer_profile_id: botProfile.id,
          business_type: botProfile.business_type || null,
          question: lastUserMsg,
          answer: text,
          category,
          user_id: userId || null,
          bot_uncertain: uncertain,
        });
      } catch {}
    }

    if (botType === "worker" && botProfile?.id) {
      try {
        const lastUserMsg = messages[messages.length - 1]?.content || "";
        const category = classifyWorkerQuestion(lastUserMsg);
        await supabase.from("bot_chat_logs").insert({
          worker_profile_id: botProfile.id,
          question: lastUserMsg,
          answer: text,
          category,
          user_id: userId || null,
        });
      } catch {}
    }

    if (botType === "worker" && botProfile?.id) {
      try {
        const lastUserMsg = messages[messages.length - 1]?.content || "";
        const category = classifyWorkerQuestion(lastUserMsg);
        await supabase.from("bot_chat_logs").insert({
          worker_profile_id: botProfile.id,
          question: lastUserMsg,
          answer: text,
          category,
          user_id: userId || null,
        });
      } catch {}
    }

    return NextResponse.json({ message: text, success: true });

  } catch (error: any) {
    console.error("Pre-meet API Error:", error);
    return NextResponse.json({ error: error.message, success: false }, { status: 500 });
  }
}
