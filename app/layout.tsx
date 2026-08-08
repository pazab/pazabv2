import type { Metadata, Viewport } from "next";
import { Noto_Sans_KR } from "next/font/google";
import "./globals.css";

const notoSansKR = Noto_Sans_KR({
  variable: "--font-noto-kr",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
});

export const metadata: Metadata = {
  title: "파잡 — 내 주변 알바 긴급 매칭",
  description: "파잡: 대타·출퇴근·급여 관리까지 한 번에. 사장님의 HR파트너, 알바생의 빠른 매칭.",
  manifest: "/manifest.json",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "파잡" },
  openGraph: {
    title: "파잡 — 내 주변 알바 긴급 매칭",
    description: "대타 구하기 / 출퇴근 관리 / 급여 자동화",
    type: "website",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#3B82F6",
};

import AuthGuard from "@/components/AuthGuard";
import BottomNav from "@/components/BottomNav";
// PazFloatingButton: 전역 노출 중단(2026-08-08) — 코드는 유지, 필요해지면 아래 렌더만 복원

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko" className={`${notoSansKR.variable} h-full`}>
      <head>
        <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@2.44.0/tabler-icons.min.css" />
      </head>
      <body className="min-h-full flex flex-col font-sans antialiased">
        <AuthGuard />
        {children}
        <BottomNav />
      </body>
    </html>
  );
}
