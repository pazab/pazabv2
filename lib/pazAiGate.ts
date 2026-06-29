/**
 * PAZ AiGate 클라이언트 (독립 모듈)
 *
 * 독립성 원칙:
 * - 환경변수만 있으면 어느 프로젝트에서나 동작
 * - AIGATE_URL 설정 시 자동으로 프록시 경유
 * - 없으면 직접 Anthropic API 호출 (하위 호환)
 *
 * 사용법:
 * const client = createPazClient("paz_hr");
 * const model = selectModel(text);
 * await logAiUsage(supabase, { ... });
 */

import Anthropic from "@anthropic-ai/sdk";

// ── AiGate 인식 클라이언트 생성 ──────────────────────────────
export function createPazClient(feature?: string): Anthropic {
  const aiGateUrl = process.env.AIGATE_URL;

  if (aiGateUrl) {
    console.log(`[pazAiGate] AiGate 경유: ${aiGateUrl}`);
    return new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY!,
      baseURL: `${aiGateUrl}/v1`,  // SDK 버전에 따라 /v1 명시
      defaultHeaders: {
        "x-aigate-key": process.env.AIGATE_API_KEY || "",
        "x-aigate-tenant": process.env.AIGATE_TENANT || "default",
        "x-aigate-feature": feature || "paz",
      }
    });
  }

  console.log("[pazAiGate] 직접 Anthropic 호출");
  return new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY!,
  });
}

// ── 비용 최적화 모델 선택 ────────────────────────────────────
export function selectModel(
  text: string,
  options?: { forceHaiku?: boolean; forcesonnet?: boolean }
): string {
  if (options?.forceHaiku) return "claude-haiku-4-5-20251001";
  if (options?.forcesonnet) return "claude-sonnet-4-6";

  // 복잡도 판단 → Haiku vs Sonnet
  const isComplex =
    text.length > 80 ||
    ["왜", "어떻게", "조언", "추천", "분석", "고민", "비교", "어떤"].some(k => text.includes(k));

  return isComplex ? "claude-sonnet-4-6" : "claude-haiku-4-5-20251001";
}

// ── 모델별 비용 테이블 (USD per 1M tokens) ───────────────────
const MODEL_COSTS: Record<string, { input: number; output: number }> = {
  "claude-sonnet-4-6":        { input: 3,    output: 15   },
  "claude-haiku-4-5-20251001": { input: 0.25, output: 1.25 },
  "claude-haiku-4-5":          { input: 0.25, output: 1.25 },
  "tool_use":                   { input: 0,    output: 0    },
};

export function estimateCost(model: string, inputTokens: number, outputTokens: number): number {
  const costs = MODEL_COSTS[model] || MODEL_COSTS["claude-sonnet-4-6"];
  return (inputTokens * costs.input + outputTokens * costs.output) / 1_000_000;
}

// ── AI 사용량 로깅 (AiGate 전/후 비교용) ────────────────────
export interface AiUsageLog {
  userId?: string;
  feature: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheHit?: boolean;
  intentMatched?: boolean;
  voiceInput?: boolean;
}

export async function logAiUsage(
  supabase: any,
  params: AiUsageLog
): Promise<void> {
  try {
    await supabase.from("ai_usage_logs").insert({
      user_id: params.userId,
      feature: params.feature,
      model: params.model,
      input_tokens: params.inputTokens,
      output_tokens: params.outputTokens,
      estimated_cost: estimateCost(params.model, params.inputTokens, params.outputTokens),
      cache_hit: params.cacheHit || false,
      intent_matched: params.intentMatched || false,
      voice_input: params.voiceInput || false,
    });
  } catch {
    // 로깅 실패 무시 (메인 기능 방해 금지)
  }
}

// ── 월별 비용 요약 ───────────────────────────────────────────
export interface UsageSummary {
  totalCost: number;
  totalTokens: number;
  totalCalls: number;
  cacheHitRate: number;
  intentMatchRate: number;
  voiceRate: number;
  byFeature: Record<string, { cost: number; calls: number }>;
  estimatedMonthlyCost: number;
}

export async function getUsageSummary(
  supabase: any,
  options?: { userId?: string; monthStr?: string }
): Promise<UsageSummary> {
  const kstNow = new Date(new Date().getTime() + 9 * 60 * 60 * 1000);
  const monthStr = options?.monthStr || kstNow.toISOString().slice(0, 7);

  let query = supabase
    .from("ai_usage_logs")
    .select("*")
    .gte("created_at", `${monthStr}-01`);

  if (options?.userId) query = query.eq("user_id", options.userId);

  const { data: logs } = await query;
  if (!logs?.length) return {
    totalCost: 0, totalTokens: 0, totalCalls: 0,
    cacheHitRate: 0, intentMatchRate: 0, voiceRate: 0,
    byFeature: {}, estimatedMonthlyCost: 0,
  };

  const totalCost = logs.reduce((s: number, l: any) => s + (l.estimated_cost || 0), 0);
  const totalTokens = logs.reduce((s: number, l: any) =>
    s + (l.input_tokens || 0) + (l.output_tokens || 0), 0);
  const cacheHits = logs.filter((l: any) => l.cache_hit).length;
  const intentMatched = logs.filter((l: any) => l.intent_matched).length;
  const voiceCalls = logs.filter((l: any) => l.voice_input).length;

  const byFeature: Record<string, { cost: number; calls: number }> = {};
  logs.forEach((l: any) => {
    if (!byFeature[l.feature]) byFeature[l.feature] = { cost: 0, calls: 0 };
    byFeature[l.feature].cost += l.estimated_cost || 0;
    byFeature[l.feature].calls += 1;
  });

  // 월간 예상 비용 (현재까지 기준으로 한 달 추정)
  const daysPassed = kstNow.getDate();
  const daysInMonth = new Date(kstNow.getFullYear(), kstNow.getMonth() + 1, 0).getDate();
  const estimatedMonthlyCost = (totalCost / daysPassed) * daysInMonth;

  return {
    totalCost: Math.round(totalCost * 10000) / 10000,
    totalTokens,
    totalCalls: logs.length,
    cacheHitRate: Math.round(cacheHits / logs.length * 100),
    intentMatchRate: Math.round(intentMatched / logs.length * 100),
    voiceRate: Math.round(voiceCalls / logs.length * 100),
    byFeature,
    estimatedMonthlyCost: Math.round(estimatedMonthlyCost * 10000) / 10000,
  };
}
