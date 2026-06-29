import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import { PAZ_TOOLS, executePazTool } from "@/lib/pazTools";
import { createPazClient, selectModel, logAiUsage } from "@/lib/pazAiGate";
import { normalizeVoiceText, isConfirmResponse, isCancelResponse, isActionCommand } from "@/lib/pazVoice";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// 감정 분류 (Haiku - 저렴)
async function classifyEmotion(text: string): Promise<string> {
  try {
    const client = createPazClient("paz_emotion");
    const res = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 10,
      system: "텍스트 감정을 한 단어로만: 긍정/부정/중립/스트레스/기대/불안/만족",
      messages: [{ role: "user", content: text }],
    });
    return res.content[0].type === "text" ? res.content[0].text.trim() : "중립";
  } catch { return "중립"; }
}

export async function POST(req: NextRequest) {
  try {
    console.log("[PAZ] AIGATE_URL:", process.env.AIGATE_URL || "없음 - 직접 호출");
    const { messages, systemPrompt, userId, userType, voiceInput } = await req.json();
    const rawLastMsg = messages.filter((m: any) => m.role === "user").slice(-1)[0]?.content || "";

    // 음성 입력이면 텍스트 정규화
    const lastUserMsg = voiceInput ? normalizeVoiceText(rawLastMsg) : rawLastMsg;

    // 감정 분류 병렬 실행 (비용: Haiku)
    const emotionPromise = classifyEmotion(lastUserMsg);

    // 액션 명령 + userId 있으면 Tools 방식
    const needsTools = isActionCommand(lastUserMsg) && !!userId;

    let reply = "";

    if (needsTools) {
      // ── Claude Tools 방식 (실제 액션 수행) ──
      const client = createPazClient("paz_tools");
      const apiMessages: Anthropic.MessageParam[] = messages.map((m: any) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      }));

      let response = await client.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 1024,
        system: systemPrompt + `\n\n현재 사용자 ID: ${userId}\n사용자 역할: ${userType}`,
        tools: PAZ_TOOLS,
        messages: apiMessages,
      });

      await logAiUsage(supabase, {
        userId,
        feature: "paz_tools_request",
        model: "claude-sonnet-4-6",
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
        voiceInput: voiceInput || false,
      });

      // Tool Use 루프
      while (response.stop_reason === "tool_use") {
        const toolUseBlock = response.content.find(
          (b): b is Anthropic.ToolUseBlock => b.type === "tool_use"
        );
        if (!toolUseBlock) break;

        // userId 자동 주입
        const input = { ...toolUseBlock.input as any };
        if ((userType === "employer" || userType === "both") && !input.employer_id) {
          input.employer_id = userId;
        }
        if ((userType === "worker" || userType === "both") && !input.worker_id) {
          input.worker_id = userId;
        }

        const toolResult = await executePazTool(
          toolUseBlock.name, input, supabase,
          { voiceInput: voiceInput || false }
        );

        const nextMessages: Anthropic.MessageParam[] = [
          ...apiMessages,
          { role: "assistant", content: response.content },
          {
            role: "user",
            content: [{
              type: "tool_result" as const,
              tool_use_id: toolUseBlock.id,
              content: toolResult,
            }]
          }
        ];

        response = await client.messages.create({
          model: "claude-sonnet-4-6",
          max_tokens: 512,
          system: systemPrompt,
          tools: PAZ_TOOLS,
          messages: nextMessages,
        });

        await logAiUsage(supabase, {
          userId,
          feature: `paz_tool_${toolUseBlock.name}`,
          model: "claude-sonnet-4-6",
          inputTokens: response.usage.input_tokens,
          outputTokens: response.usage.output_tokens,
          voiceInput: voiceInput || false,
        });
      }

      const textBlock = response.content.find(
        (b): b is Anthropic.TextBlock => b.type === "text"
      );
      reply = textBlock?.text || "";

    } else {
      // ── 일반 대화 (비용 최적화) ──
      const model = selectModel(lastUserMsg);
      const client = createPazClient("paz_chat");

      const response = await client.messages.create({
        model,
        max_tokens: model.includes("haiku") ? 300 : 500,
        system: systemPrompt,
        messages: messages.map((m: any) => ({ role: m.role, content: m.content })),
      });

      reply = response.content[0].type === "text" ? response.content[0].text : "";

      await logAiUsage(supabase, {
        userId,
        feature: "paz_chat",
        model,
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
        voiceInput: voiceInput || false,
      });
    }

    const emotion = await emotionPromise;
    const jobChangeIntent = ["이직", "그만두", "퇴사", "힘들어", "그만할"]
      .some(k => lastUserMsg.includes(k));

    return NextResponse.json({ reply, emotion, jobChangeIntent });

  } catch (e: any) {
    console.error("PAZ chat error:", e);
    return NextResponse.json(
      { reply: "잠시 오류가 발생했어요 🙏", emotion: "중립", jobChangeIntent: false },
      { status: 500 }
    );
  }
}
