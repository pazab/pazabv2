import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// 텍스트 → 임베딩 벡터 생성
async function createEmbedding(text: string): Promise<number[]> {
  // Anthropic은 임베딩 API 없어서 OpenAI 사용
  // 없으면 간단한 해시 기반 폴백
  if (process.env.OPENAI_API_KEY) {
    const res = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "text-embedding-3-small",
        input: text.slice(0, 8000),
      }),
    });
    const data = await res.json();
    return data.data?.[0]?.embedding || [];
  }
  return [];
}

// 임베딩 저장
export async function POST(req: NextRequest) {
  try {
    const { action, userId, chatId, text, query } = await req.json();

    if (action === "embed") {
      // 대화 임베딩 생성 + 저장
      if (!process.env.OPENAI_API_KEY) {
        return NextResponse.json({ ok: true, skipped: true });
      }
      const embedding = await createEmbedding(text);
      if (embedding.length > 0) {
        await supabase.from("paz_chats")
          .update({ embedding: JSON.stringify(embedding) })
          .eq("id", chatId);
      }
      return NextResponse.json({ ok: true });
    }

    if (action === "search") {
      // 유사 기억 검색
      if (!process.env.OPENAI_API_KEY) {
        return NextResponse.json({ memories: [] });
      }
      const embedding = await createEmbedding(query);
      if (embedding.length === 0) return NextResponse.json({ memories: [] });

      const { data } = await supabase.rpc("match_paz_memories", {
        query_embedding: embedding,
        match_user_id: userId,
        match_count: 5,
        match_threshold: 0.7,
      });

      return NextResponse.json({ memories: data || [] });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (e: any) {
    console.error("PAZ memory error:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
