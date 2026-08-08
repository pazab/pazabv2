import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { encryptBank, decryptBank } from "@/lib/bankCryptoServer";

// 계좌번호 암/복호화 전용 엔드포인트. 키(BANK_ENCRYPTION_KEY)는 서버에만 존재하므로,
// 계약서 화면(클라이언트 컴포넌트)이 DB에 쓰기/읽기 직전 이 라우트를 거쳐 변환한다.
export async function POST(req: NextRequest) {
  try {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { getAll: () => cookieStore.getAll() } }
    );
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });

    const { action, values } = await req.json();
    if ((action !== "encrypt" && action !== "decrypt") || !Array.isArray(values)) {
      return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
    }

    const fn = action === "encrypt" ? encryptBank : decryptBank;
    const result = values.map((v: string) => fn(v));

    return NextResponse.json({ success: true, values: result });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "처리 중 오류" }, { status: 500 });
  }
}
