import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
});

// =============================================
// 알바생 12가지 유형
// =============================================
const WORKER_TYPES = [
  { type: "돌격대장형", emoji: "⚡", tagline: "일단 뛰어들고 보는 행동파", traits: ["즉시 실행력", "빠른 적응", "추진력"], good: "에너지 넘치는 환경", bad: "느리고 반복적인 환경" },
  { type: "완벽주의형", emoji: "🎯", tagline: "실수 없이 완성도 높게", traits: ["꼼꼼함", "책임감", "정확성"], good: "세심함이 필요한 환경", bad: "대충 해도 되는 환경" },
  { type: "팀플레이어형", emoji: "🤝", tagline: "함께할 때 빛나는 타입", traits: ["협동", "소통", "배려"], good: "팀워크 중시 환경", bad: "혼자 하는 업무" },
  { type: "올라운더형", emoji: "🌟", tagline: "어디서든 잘 적응하는 만능형", traits: ["다재다능", "높은 적응력", "유연성"], good: "다양한 업무 환경", bad: "단순 반복 환경" },
  { type: "열정폭발형", emoji: "🔥", tagline: "에너지로 분위기를 바꾸는 타입", traits: ["높은 에너지", "긍정적 분위기", "열정"], good: "활기찬 환경", bad: "조용하고 정적인 환경" },
  { type: "성장추구형", emoji: "📚", tagline: "배우면서 성장하는 스타일", traits: ["학습 의지", "성장 지향", "흡수력"], good: "배울 게 많은 환경", bad: "정체된 환경" },
  { type: "유연적응형", emoji: "🎭", tagline: "변화에 강하고 유연한 타입", traits: ["유연성", "변화 적응", "즉흥성"], good: "변화가 많은 환경", bad: "딱딱한 규칙 환경" },
  { type: "장인기질형", emoji: "💎", tagline: "한 우물 파는 전문성 타입", traits: ["집중력", "전문성", "꾸준함"], good: "한 분야 깊이 파는 환경", bad: "여러 일 동시에 하는 환경" },
  { type: "안정추구형", emoji: "🌿", tagline: "꾸준하고 믿음직한 타입", traits: ["안정성", "신뢰감", "일관성"], good: "규칙적이고 안정적인 환경", bad: "급변하는 환경" },
  { type: "독립형", emoji: "🦅", tagline: "혼자서도 척척 해내는 타입", traits: ["자립심", "집중력", "자기관리"], good: "자율적인 환경", bad: "간섭이 많은 환경" },
  { type: "소통달인형", emoji: "💬", tagline: "말로 분위기를 살리는 타입", traits: ["소통력", "친화력", "손님 응대"], good: "사람 많은 환경", bad: "혼자 하는 업무" },
  { type: "균형잡기형", emoji: "⚖️", tagline: "워라밸 지키며 꾸준히 하는 타입", traits: ["균형감", "자기조절", "지속성"], good: "워라밸 좋은 환경", bad: "과도한 초과근무 환경" },
];

// =============================================
// 사장님 12가지 유형
// =============================================
const EMPLOYER_TYPES = [
  { type: "원칙주의형", emoji: "📋", tagline: "규칙과 기준이 명확해요", traits: ["규칙 준수", "시간 엄수", "매뉴얼 중심"], good: "꼼꼼하고 책임감 있는 알바생", bad: "즉흥적인 알바생" },
  { type: "가족같은형", emoji: "🤗", tagline: "따뜻하고 편안한 분위기", traits: ["화목한 분위기", "소통 중시", "배려하는 환경"], good: "정 많고 사교적인 알바생", bad: "거리감 있는 알바생" },
  { type: "성과중심형", emoji: "🚀", tagline: "잘하면 인정받는 환경", traits: ["성과 보상", "능력 우선", "경쟁적 환경"], good: "목표 지향적인 알바생", bad: "느긋하게 일하는 알바생" },
  { type: "시스템형", emoji: "🧩", tagline: "체계적으로 운영돼요", traits: ["체계적 운영", "역할 분담", "프로세스 중심"], good: "빠르게 배우는 알바생", bad: "자유분방한 알바생" },
  { type: "멘토형", emoji: "🌱", tagline: "가르쳐주고 성장시켜줘요", traits: ["성장 지원", "피드백 제공", "육성 중시"], good: "배우려는 의지가 강한 알바생", bad: "이미 다 안다는 알바생" },
  { type: "자율신뢰형", emoji: "🎯", tagline: "믿고 맡기는 스타일", traits: ["자율적인 환경", "간섭 최소화", "결과로 평가"], good: "스스로 알아서 하는 알바생", bad: "세세한 지시가 필요한 알바생" },
  { type: "응원단장형", emoji: "👔", tagline: "항상 긍정적이고 응원해줘요", traits: ["긍정적 분위기", "칭찬 많음", "활기찬 환경"], good: "에너지 넘치는 알바생", bad: "소극적인 알바생" },
  { type: "꼼꼼체크형", emoji: "🔍", tagline: "꼼꼼하게 확인하는 스타일", traits: ["세세한 확인", "품질 중시", "꼼꼼한 관리"], good: "정확하고 실수 없는 알바생", bad: "대충 하는 알바생" },
  { type: "파트너형", emoji: "🤝", tagline: "수평적으로 함께하는 스타일", traits: ["수평적 관계", "자유로운 소통", "편안한 분위기"], good: "유머 있고 사교적인 알바생", bad: "딱딱하고 형식적인 알바생" },
  { type: "창의적형", emoji: "💡", tagline: "새로운 시도를 즐기는 스타일", traits: ["창의적 도전", "변화 추구", "아이디어 중시"], good: "창의적이고 도전적인 알바생", bad: "변화를 싫어하는 알바생" },
  { type: "스피드형", emoji: "🏃", tagline: "빠른 템포로 운영해요", traits: ["빠른 처리", "효율 중시", "스피드 우선"], good: "눈치 빠르고 빠른 알바생", bad: "느리고 신중한 알바생" },
  { type: "안정중시형", emoji: "🛡️", tagline: "꾸준하고 안정적인 환경이에요", traits: ["안정적 운영", "낮은 이직률", "편안한 분위기"], good: "장기근무 원하는 알바생", bad: "변화를 즐기는 알바생" },
];

// =============================================
// 인터뷰 시스템 프롬프트 생성
// =============================================
function getInterviewSystemPrompt(userType: "worker" | "employer"): string {
  if (userType === "worker") {
    return `당신은 파잡(PAZAB)의 알바 성향 분석 전문가 "파잡이"입니다.
한국 알바 시장을 깊이 이해하는 따뜻하고 친근한 상담사입니다.

## 핵심 목표
HEXACO 성격 모델 + 한국 직업가치관 + 실용 조건을 대화를 통해 자연스럽게 파악합니다.

## HEXACO 측정 목표 (대화로 자연스럽게 파악)
- H (정직/겸손성): 약속을 얼마나 지키는지, 불이익 상황에서 어떻게 행동하는지
- E (정서성): 스트레스 상황 대처, 감정 조절 방식
- X (외향성): 손님/동료와의 상호작용 선호
- A (원만성): 갈등 상황 대처, 협력 방식
- C (성실성): 시간 약속, 책임감, 꼼꼼함
- O (개방성): 새로운 업무/환경 적응력

## 한국 직업가치관 파악
- 돈 (시급이 최우선인지)
- 거리 (출퇴근 거리가 얼마나 중요한지)
- 분위기 (직장 분위기/사람이 중요한지)
- 성장 (배움/경력이 중요한지)
- 자율 (자유로운 환경이 중요한지)
- 안정 (장기/규칙적이 중요한지)

## 실용 조건 파악
- 현재 거주 지역, 이동 가능 범위
- 희망 시급 (최저 vs 희망)
- 가능한 요일/시간대
- 장기/단기 여부
- 경력/경험

## 대화 원칙
1. 절대 설문지처럼 질문하지 마세요
2. 이전 답변을 기억하고 연결해서 물어보세요
3. "왜요?", "그때 어떠셨어요?" 같은 꼬리 질문을 하세요
4. 한국 알바 현실에 맞는 구체적 상황을 예시로 드세요
5. 3~4번 주고받은 후 자연스럽게 다음 주제로 넘어가세요
6. 공감과 리액션을 적절히 섞으세요
7. 너무 길지 않게, 1~2문장으로 질문하세요
8. 8~12번 대화 후 분석 준비가 되면, 마지막 답변을 받은 직후 별도 메시지로 "이제 분석해드릴게요! 사장님 이야기 충분히 들었어요 😊" 라고 말하세요
   ⚠️ 질문과 분석 준비 문구를 같은 메시지에 넣지 마세요. 반드시 마지막 답변을 받은 후 단독으로 말하세요.

## 절대 규칙 (반드시 지킬 것)
⚠️ 한 번에 질문은 반드시 1개만 하세요
⚠️ 여러 질문을 한꺼번에 나열하면 절대 안 됩니다
⚠️ "그리고 ~도 궁금한데요?" 식으로 추가 질문 금지
   예시 (틀림): "어디서 일하고 싶으세요? 그리고 시급은 얼마나 생각하세요?"
   예시 (맞음): "어디서 일하고 싶으세요?" → 답변 후 → "시급은 얼마나 생각하세요?"

## 질문 방식 (중요)
- 추상적 질문 금지: "성격이 어떠세요?" "좋아하는 게 뭐예요?"
- 상황 기반 질문 위주: 구체적 상황을 제시하고 반응 파악
  예시 (좋음): "지난 알바에서 가장 힘들었던 순간은요?"
  예시 (좋음): "손님이 갑자기 화를 내면 어떻게 하셨어요?"
  예시 (좋음): "사장님이 갑자기 규칙을 바꾸면 어떻게 해요?"
  예시 (좋음): "팀원이 실수했을 때 어떻게 하셨어요?"`;
  } else {
    return `당신은 파잡(PAZAB)의 사장님 성향 분석 전문가 "파잡이"입니다.
소상공인/자영업자의 현실을 깊이 이해하는 따뜻하고 실용적인 상담사입니다.

## 핵심 목표
HEXACO 성격 모델 + 운영 스타일 + 매장 환경을 대화로 자연스럽게 파악합니다.

## HEXACO 측정 목표
- H (정직/겸손성): 약속 이행, 급여 정확성, 공정한 대우
- E (정서성): 바쁜 상황 스트레스 대처, 감정 조절
- X (외향성): 알바생과의 소통 방식, 적극성
- A (원만성): 갈등 해결 방식, 배려 수준
- C (성실성): 매뉴얼/규칙 중시 여부, 꼼꼼함
- O (개방성): 변화/새로운 시도에 대한 태도

## 운영 스타일 파악
- 소통 방식 (직접 대면 vs 카톡 등)
- 피드백 스타일 (즉각 지적 vs 나중에 말하기)
- 자율성 부여 정도
- 교육/훈련 방식

## 매장 환경 파악
- 업종 및 매장 분위기
- 근무 강도 (바쁜 정도)
- 팀 구성 (혼자/여럿)
- 원하는 알바생 유형

## 대화 원칙
1. 소상공인의 현실적 고충에 공감하며 시작
2. "어떤 알바생이 힘드셨어요?" 같은 경험 기반 질문
3. 구체적 상황을 통해 성향 파악
4. 운영 철학을 자연스럽게 끌어내기
5. 8~12번 대화 후 "이제 분석해드릴게요!" - 반드시 마지막 답변을 받은 후 단독 메시지로
   ⚠️ 질문과 동시에 분석 준비 문구 절대 금지

## 대화 흐름
1. 업종/매장 소개
2. 알바생 구하는 이유/상황
3. 이전 알바생 경험 (좋았던/힘들었던)
4. 운영 스타일 파악
5. 원하는 알바생 상
6. 마무리

## 절대 하지 말 것
- 심리학 용어 언급 금지
- 선택지 제시 금지
- 한꺼번에 여러 질문 금지
⚠️ 한 번에 질문은 반드시 1개만 하세요. 여러 질문 나열 절대 금지.

## 질문 방식 (중요)
- 추상적 질문 금지: "운영 스타일이 어떠세요?" "어떤 사장님이세요?"
- 상황 기반 질문 위주: 구체적 상황을 제시하고 반응 파악
  예시 (좋음): "알바생이 지각했을 때 어떻게 하셨어요?"
  예시 (좋음): "손님 컴플레인이 들어왔을 때 알바생한테 어떻게 하세요?"
  예시 (좋음): "바쁜 시간에 알바생이 실수하면 어떻게 하시나요?"
  예시 (좋음): "지금까지 가장 잘 맞았던 알바생은 어떤 유형이었나요?"`;
  }
}

// =============================================
// 분석 시스템 프롬프트
// =============================================
function getAnalysisSystemPrompt(userType: "worker" | "employer"): string {
  const typeList = userType === "worker" ? WORKER_TYPES : EMPLOYER_TYPES;
  const typeNames = typeList.map(t => `"${t.type}"`).join(", ");

  return `당신은 파잡(PAZAB)의 수석 직업심리 분석가입니다.
HEXACO 성격 모델, 한국 직업가치관, 실용 조건을 통합 분석합니다.

## PAZAB Score 계산 기준
- 성격 특성 (HEXACO 기반): 40%
- 직업 가치관: 30%  
- 실용 조건: 30%

## HEXACO 분석 기준
H (정직/겸손성): 노쇼/약속 이행 가능성 예측 핵심
E (정서성): 스트레스 상황 대처
X (외향성): 대인관계/소통
A (원만성): 갈등 해결/협력
C (성실성): 성실도/책임감
O (개방성): 적응력/유연성

⚠️ 중요: personalityType은 반드시 아래 목록 중 하나만 선택하세요:
${typeNames}

## 핵심 철학
- 단점을 직접 말하지 않는다
- 모든 특성은 "이 사람에게 맞는 환경"으로 표현
- "나쁜 게 아니라 안 맞는 것"

⚠️ 필수 규칙:
- bestMatches는 반드시 서로 다른 유형 2개 (배열 길이 = 2)
- worstMatches는 반드시 서로 다른 유형 2개 (배열 길이 = 2)
- bestMatches와 worstMatches에 같은 유형 중복 금지
- 모든 유형명은 위 목록에서만 선택

반드시 아래 JSON 형식으로만 응답하세요:
{
  "personalityType": "위 목록 중 하나",
  "emoji": "해당 유형 이모지",
  "tagline": "한 줄 설명 (대화 내용 기반으로 개인화)",
  "analyzedMbti": "MBTI 4글자",
  "mbtiConfidence": 숫자(0-100),
  "mbtiMatch": true또는false,
  "mbtiComment": "긍정적 MBTI 코멘트",
  "hexaco": {
    "honesty": 숫자(1-5),
    "emotionality": 숫자(1-5),
    "extraversion": 숫자(1-5),
    "agreeableness": 숫자(1-5),
    "conscientiousness": 숫자(1-5),
    "openness": 숫자(1-5)
  },
  "big5": {
    "conscientiousness": 숫자(1-5),
    "extraversion": 숫자(1-5),
    "agreeableness": 숫자(1-5),
    "openness": 숫자(1-5),
    "neuroticism": 숫자(1-5)
  },
  "workValues": {
    "money": 숫자(1-5),
    "distance": 숫자(1-5),
    "atmosphere": 숫자(1-5),
    "growth": 숫자(1-5),
    "autonomy": 숫자(1-5),
    "stability": 숫자(1-5)
  },
  "managementValues": {
    "performance": 숫자(1-5),
    "relationship": 숫자(1-5),
    "stability": 숫자(1-5),
    "growth": 숫자(1-5),
    "autonomy": 숫자(1-5),
    "system": 숫자(1-5)
  },
  "practicalConditions": {
    "region": "파악된 희망 지역",
    "minWage": 숫자(시급),
    "preferredDays": "파악된 선호 요일",
    "workStyle": "장기/단기/무관"
  },
  "strengths": ["강점1", "강점2", "강점3"],
  "bestMatches": [
    { "type": "1순위 찰떡 유형 (목록에서 선택)", "reason": "이 유형과 함께하면 최고의 시너지가 나는 구체적 이유 한 문장" },
    { "type": "2순위 찰떡 유형 (목록에서 선택, 1순위와 달라야 함)", "reason": "이 유형도 잘 맞는 구체적 이유 한 문장" }
  ],
  "worstMatches": [
    { "type": "1순위 주의 유형 (목록에서 선택)", "reason": "서로 다른 점이 있지만 배울 수 있는 긍정적 관점의 한 문장" },
    { "type": "2순위 주의 유형 (목록에서 선택, 1순위와 달라야 함)", "reason": "조율이 필요하지만 성장 기회가 되는 긍정적 관점의 한 문장" }
  ],
  "recommendedJobs": ["직종1", "직종2", "직종3"],
  "recommendedWorkerTypes": ["잘 맞는 알바 유형1", "유형2", "유형3"],
  "caution": "맞는 환경 제안 (부정적이지 않게)",
  "honestyRisk": "낮음/보통/높음",
  "noShowRisk": "낮음/보통/높음"
}`;
}

export async function POST(req: NextRequest) {
  try {
    const { messages, userType, selfMbti, mode, forceFinish } = await req.json();

    // 인터뷰 모드: 대화 진행
    if (mode === "interview") {
      // 10턴 강제 마무리
      if (forceFinish) {
        return NextResponse.json({
          message: "",
          isReady: true,
          success: true,
        });
      }

      const systemPrompt = getInterviewSystemPrompt(userType);
      
      const response = await anthropic.messages.create({
        model: "claude-sonnet-4-5",
        max_tokens: 300,
        system: systemPrompt,
        messages: messages.map((m: any) => ({
          role: m.role,
          content: m.content,
        })),
      });

      const text = response.content[0].type === "text" ? response.content[0].text : "";
      const isReady = text.includes("이제 분석해드릴게요") || text.includes("분석 준비") || messages.length >= 24;

      return NextResponse.json({ 
        message: text, 
        isReady,
        success: true 
      });
    }

    // 분석 모드: 최종 결과 생성
    if (mode === "analyze") {
      const systemPrompt = getAnalysisSystemPrompt(userType);
      
      const conversationText = messages
        .map((m: any) => `${m.role === "user" ? "사용자" : "파잡이"}: ${m.content}`)
        .join("\n");

      const response = await anthropic.messages.create({
        model: "claude-sonnet-4-5",
        max_tokens: 2000,
        system: systemPrompt,
        messages: [{
          role: "user",
          content: `다음 대화를 분석해서 PAZAB Score와 성향 결과를 JSON으로 반환해주세요.
본인이 말한 MBTI: ${selfMbti || "모름"}

대화 내용:
${conversationText}`
        }],
      });

      const content = response.content[0].type === "text" ? response.content[0].text : "";
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error("JSON 파싱 실패");

      const result = JSON.parse(jsonMatch[0]);
      console.log("=== ANALYZE RESULT ===");
      console.log("bestMatches:", JSON.stringify(result.bestMatches));
      console.log("worstMatches:", JSON.stringify(result.worstMatches));
      console.log("======================");

      if (selfMbti && selfMbti !== "모름") {
        result.mbtiMatch = selfMbti.toUpperCase() === result.analyzedMbti?.toUpperCase();
      }

      return NextResponse.json({ result, success: true });
    }

    return NextResponse.json({ error: "mode 필요", success: false }, { status: 400 });

  } catch (error: any) {
    console.error("Analyze API Error:", error);
    return NextResponse.json({ error: error.message, success: false }, { status: 500 });
  }
}
