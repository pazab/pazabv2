import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { createNotification } from "@/lib/notify";

async function makeSupabase() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
  );
}

// GET /api/notifications — 내 알림 목록
export async function GET(req: NextRequest) {
  const supabase = await makeSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const limit = Number(searchParams.get("limit") ?? 30);
  const onlyUnread = searchParams.get("unread") === "1";

  let query = supabase
    .from("notifications")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (onlyUnread) query = query.eq("is_read", false);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ notifications: data ?? [] });
}

// POST /api/notifications — 알림 발송 (서버에서 상대방에게)
export async function POST(req: NextRequest) {
  const supabase = await makeSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { userId, type, title, body, data } = await req.json();
  if (!userId || !type || !title) return NextResponse.json({ error: "필수값 없음" }, { status: 400 });

  await createNotification({ userId, type, title, body, data, url: data?.url });
  return NextResponse.json({ success: true });
}

// PATCH /api/notifications — 읽음 처리
// body: { id?: string }  — id 없으면 전체 읽음
export async function PATCH(req: NextRequest) {
  const supabase = await makeSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await req.json().catch(() => ({}));

  let query = supabase
    .from("notifications")
    .update({ is_read: true })
    .eq("user_id", user.id);

  if (id) query = query.eq("id", id);

  const { error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
