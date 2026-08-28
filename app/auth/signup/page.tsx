"use client";

// 회원가입 = 로그인과 똑같은 소셜 버튼(역할 선택 없음) — 예전엔 여기서 먼저 "사장님/알바생"을
// 고르고 OAuth로 넘어간 뒤, app/onboarding에서 똑같은 질문을 또 물어봐서 신규가입자가
// "선택했는데 왜 또 물어봐?" 하고 혼란스러워했음. 이제 역할 선택은 OAuth 이후
// /onboarding 한 곳에서만(프로필이 없는 계정은 proxy.ts가 무조건 거기로 보냄) 한다 —
// 가입 경로(구글/카카오/직접 로그인)와 무관하게 항상 딱 한 번만 물어보게 통일.
export default function SignupPage() {
  const handleOAuthLogin = (provider: "google" | "kakao") => {
    window.location.href = `/api/auth/login?provider=${provider}`;
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

        <h2 className="text-2xl font-black text-center mb-2">
          회원가입
        </h2>
        <p className="text-white/40 text-center text-sm mb-8">
          원하시는 계정으로 간편하게 시작하세요
        </p>

        {/* 구글 로그인 버튼 */}
        <button
          onClick={() => handleOAuthLogin("google")}
          className="w-full flex items-center justify-center gap-3 bg-white text-gray-800 font-bold py-4 rounded-xl hover:bg-gray-100 transition-colors mb-3"
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
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18c-.75 1.48-1.18 3.15-1.18 4.93s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
            />
            <path
              fill="#EA4335"
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
            />
          </svg>
          Google로 시작하기
        </button>

        {/* 카카오 로그인 버튼 */}
        <button
          onClick={() => handleOAuthLogin("kakao")}
          className="w-full flex items-center justify-center gap-3 bg-[#FEE500] text-[#191919] font-bold py-4 rounded-xl hover:bg-[#FDD835] transition-colors mb-4"
        >
          <KakaoIcon />
          카카오톡으로 시작하기
        </button>

        <p className="text-white/20 text-xs text-center mt-4">
          가입하면 파잡 이용약관에 동의하는 것으로 간주됩니다
        </p>
      </div>
    </main>
  );
}

function KakaoIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#191919" d="M12 3C6.48 3 2 6.48 2 10.8c0 2.76 1.72 5.19 4.32 6.63L5.28 21l4.44-2.31C10.44 18.9 11.22 19 12 19c5.52 0 10-3.48 10-8.2C22 6.48 17.52 3 12 3z"/>
    </svg>
  );
}
