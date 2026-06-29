"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

export default function SignupPage() {
  const router = useRouter();
  const [userType, setUserType] = useState<"employer" | "worker" | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // 구글 로그인
  const handleGoogleLogin = async (type: "employer" | "worker") => {
    setLoading(true);
    setError("");

    try {
      // 유저 타입을 localStorage에 저장 (로그인 후 사용)
      localStorage.setItem("pending_user_type", type);

      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
        },
      });

      if (error) throw error;
    } catch (err: any) {
      setError("구글 로그인 중 오류가 발생했어요");
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#0A0A0A] text-white flex items-center justify-center px-4">
      {/* 배경 효과 */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-[-20%] left-[-10%] w-[400px] h-[400px] rounded-full bg-[#FF6B35] opacity-10 blur-[100px]" />
      </div>

      <div className="relative z-10 w-full max-w-md">
        {/* 로고 */}
        <div className="text-center mb-10">
          <span className="text-3xl font-black tracking-tighter text-[#FF6B35]">
            PAZAB
          </span>
          <p className="text-white/40 text-sm mt-1">알바의 모든 것, 파잡</p>
        </div>

        {/* 유형 선택 안 했을 때 */}
        {!userType ? (
          <div>
            <h2 className="text-2xl font-black text-center mb-2">
              어떻게 시작할까요?
            </h2>
            <p className="text-white/40 text-center text-sm mb-8">
              선택에 따라 맞춤 설정이 달라져요
            </p>

            <div className="grid grid-cols-2 gap-4">
              {/* 사장님 */}
              <button
                onClick={() => setUserType("employer")}
                className="group bg-white/5 border border-white/10 rounded-2xl p-6 text-left hover:border-[#FF6B35]/50 hover:bg-[#FF6B35]/5 transition-all"
              >
                <div className="text-4xl mb-4">👔</div>
                <div className="font-bold text-lg mb-1">사장님</div>
                <div className="text-white/40 text-sm">
                  알바생을 구하고 있어요
                </div>
                <div className="mt-4 text-[#FF6B35] text-sm font-medium group-hover:translate-x-1 transition-transform">
                  시작하기 →
                </div>
              </button>

              {/* 알바생 */}
              <button
                onClick={() => setUserType("worker")}
                className="group bg-white/5 border border-white/10 rounded-2xl p-6 text-left hover:border-[#FF6B35]/50 hover:bg-[#FF6B35]/5 transition-all"
              >
                <div className="text-4xl mb-4">⚡</div>
                <div className="font-bold text-lg mb-1">알바생</div>
                <div className="text-white/40 text-sm">
                  알바 자리를 찾고 있어요
                </div>
                <div className="mt-4 text-[#FF6B35] text-sm font-medium group-hover:translate-x-1 transition-transform">
                  시작하기 →
                </div>
              </button>
            </div>
          </div>
        ) : (
          <div>
            <button
              onClick={() => setUserType(null)}
              className="text-white/40 text-sm mb-6 hover:text-white transition-colors"
            >
              ← 뒤로
            </button>

            <h2 className="text-2xl font-black mb-2">
              {userType === "employer" ? "👔 사장님" : "⚡ 알바생"}으로
              시작하기
            </h2>
            <p className="text-white/40 text-sm mb-8">
              구글 계정으로 간편하게 시작하세요
            </p>

            {/* 구글 로그인 버튼 */}
            <button
              onClick={() => handleGoogleLogin(userType)}
              disabled={loading}
              className="w-full flex items-center justify-center gap-3 bg-white text-gray-800 font-bold py-4 rounded-xl hover:bg-gray-100 transition-colors disabled:opacity-50 mb-4"
            >
              <svg width="20" height="20" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                />
              </svg>
              {loading ? "처리 중..." : "Google로 시작하기"}
            </button>

            {error && (
              <p className="text-red-400 text-sm text-center">{error}</p>
            )}

            <p className="text-white/20 text-xs text-center mt-4">
              가입하면 파잡 이용약관에 동의하는 것으로 간주됩니다
            </p>
          </div>
        )}
      </div>
    </main>
  );
}