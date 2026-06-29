"use client";

import { useRouter } from "next/navigation";

export default function PrivacyPage() {
  const router = useRouter();
  const today = "2026년 06월 10일";

  const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <div style={{ marginBottom: 28 }}>
      <h2 style={{ fontSize: 15, fontWeight: 700, color: "var(--text)", marginBottom: 10, paddingBottom: 6, borderBottom: "1px solid var(--border)" }}>
        {title}
      </h2>
      <div style={{ fontSize: 13, color: "var(--text-muted)", lineHeight: 1.8 }}>
        {children}
      </div>
    </div>
  );

  return (
    <main style={{ minHeight: "100vh", background: "var(--bg)", color: "var(--text)", maxWidth: 480, margin: "0 auto", paddingBottom: 60 }}>
      {/* 헤더 */}
      <div style={{ position: "sticky", top: 0, zIndex: 20, background: "rgba(24,24,27,0.97)", backdropFilter: "blur(12px)", borderBottom: "1px solid var(--border)", padding: "14px 16px", display: "flex", alignItems: "center", gap: 8 }}>
        <button onClick={() => router.back()} style={{ background: "none", border: "none", color: "var(--text-muted)", fontSize: 20, cursor: "pointer", padding: 0 }}>←</button>
        <span style={{ width: 1, height: 14, background: "var(--border)", display: "inline-block" }} />
        <span style={{ fontSize: 17, fontWeight: 900, background: "linear-gradient(135deg, #8b5cf6, #ec4899)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>PAZAB</span>
        <span style={{ width: 1, height: 14, background: "var(--border)", display: "inline-block" }} />
        <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-muted)" }}>개인정보처리방침</span>
      </div>

      <div style={{ padding: "24px 16px" }}>
        {/* 상단 안내 */}
        <div style={{ background: "rgba(139,92,246,0.08)", border: "1px solid rgba(139,92,246,0.2)", borderRadius: 14, padding: 16, marginBottom: 28 }}>
          <p style={{ fontSize: 13, color: "var(--text-muted)", margin: 0, lineHeight: 1.7 }}>
            파잡(PAZAB)은 이용자의 개인정보를 중요하게 생각하며,
            「개인정보 보호법」 등 관련 법령을 준수합니다.<br />
            <span style={{ color: "#c4b5fd", fontWeight: 600 }}>시행일: {today}</span>
          </p>
        </div>

        <Section title="제1조 수집하는 개인정보 항목">
          <p style={{ marginBottom: 8 }}>파잡은 서비스 제공을 위해 다음과 같은 개인정보를 수집합니다.</p>
          <p style={{ marginBottom: 4 }}><strong style={{ color: "var(--text)" }}>① 회원가입 시</strong></p>
          <p style={{ marginBottom: 8 }}>이메일 주소, 닉네임, 역할(알바생/사장님)</p>
          <p style={{ marginBottom: 4 }}><strong style={{ color: "var(--text)" }}>② 소셜 로그인 시 (구글)</strong></p>
          <p style={{ marginBottom: 8 }}>이메일 주소, 프로필 이름 (제공 동의한 항목에 한함)</p>
          <p style={{ marginBottom: 4 }}><strong style={{ color: "var(--text)" }}>③ 서비스 이용 시</strong></p>
          <p>성향분석 대화 내용, 공고/구직 정보, 채팅 내용, 매칭 이력, AI 봇 대화 로그, 평가/리뷰</p>
        </Section>

        <Section title="제2조 개인정보 수집 및 이용 목적">
          <ul style={{ paddingLeft: 16, margin: 0 }}>
            {[
              "회원 가입 및 관리, 본인 확인",
              "알바생-사장님 매칭 서비스 제공",
              "AI 성향 분석 및 궁합 점수 산출",
              "AI 매장봇 지식 베이스 구축",
              "서비스 이용 통계 및 품질 개선",
              "법령 준수 및 분쟁 해결",
            ].map((item, i) => (
              <li key={i} style={{ marginBottom: 6 }}>{item}</li>
            ))}
          </ul>
        </Section>

        <Section title="제3조 개인정보 보유 및 이용 기간">
          <p style={{ marginBottom: 8 }}>회원 탈퇴 시 즉시 파기하는 것을 원칙으로 합니다. 단, 관련 법령에 따라 일정 기간 보관이 필요한 정보는 아래와 같습니다.</p>
          <div style={{ background: "var(--surface)", borderRadius: 10, padding: 12 }}>
            {[
              ["계약/청약 철회 기록", "5년 (전자상거래법)"],
              ["대금 결제 기록", "5년 (전자상거래법)"],
              ["소비자 불만/분쟁 기록", "3년 (전자상거래법)"],
              ["접속 로그", "3개월 (통신비밀보호법)"],
            ].map(([label, period]) => (
              <div key={label} style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, fontSize: 12 }}>
                <span>{label}</span>
                <span style={{ color: "#c4b5fd", fontWeight: 600 }}>{period}</span>
              </div>
            ))}
          </div>
        </Section>

        <Section title="제4조 개인정보 제3자 제공">
          <p>파잡은 이용자의 개인정보를 원칙적으로 외부에 제공하지 않습니다. 다만, 아래의 경우는 예외입니다.</p>
          <ul style={{ paddingLeft: 16, margin: "8px 0 0" }}>
            <li style={{ marginBottom: 6 }}>이용자가 사전에 동의한 경우</li>
            <li style={{ marginBottom: 6 }}>법령의 규정에 의거하거나 수사 목적으로 법령에 정해진 절차와 방법에 따라 수사기관의 요구가 있는 경우</li>
          </ul>
        </Section>

        <Section title="제5조 AI 서비스 관련 정보 처리">
          <p style={{ marginBottom: 8 }}>파잡은 Anthropic Claude API를 활용하여 다음 서비스를 제공합니다.</p>
          <ul style={{ paddingLeft: 16, margin: 0 }}>
            {[
              "성향 분석 인터뷰 및 결과 생성",
              "AI 사전미팅 (매장봇/직원봇)",
              "사장님 심층 인터뷰 및 지식 베이스 구축",
            ].map((item, i) => (
              <li key={i} style={{ marginBottom: 6 }}>{item}</li>
            ))}
          </ul>
          <p style={{ marginTop: 8 }}>AI 처리를 위해 대화 내용이 Anthropic 서버로 전송될 수 있으며, Anthropic의 개인정보처리방침이 적용됩니다. AI 대화 원본은 서비스 내 저장되지 않으며, 분석 결과 요약본만 저장됩니다.</p>
        </Section>

        <Section title="제6조 익명 통계 데이터">
          <p>파잡은 서비스 품질 개선을 위해 개인을 식별할 수 없는 형태의 익명 통계 데이터를 수집·활용합니다. 이 데이터는 매칭 패턴, 성향 조합, 매칭 결과 등을 포함하며 개인 삭제 요청과 무관하게 보관될 수 있습니다.</p>
        </Section>

        <Section title="제7조 이용자의 권리">
          <p style={{ marginBottom: 8 }}>이용자는 언제든지 다음 권리를 행사할 수 있습니다.</p>
          <ul style={{ paddingLeft: 16, margin: 0 }}>
            {[
              "개인정보 열람 요청",
              "개인정보 정정·삭제 요청",
              "개인정보 처리 정지 요청",
              "회원 탈퇴 (서비스 내 마이페이지 또는 이메일 문의)",
            ].map((item, i) => (
              <li key={i} style={{ marginBottom: 6 }}>{item}</li>
            ))}
          </ul>
        </Section>

        <Section title="제8조 쿠키 및 자동 수집 정보">
          <p>파잡은 Supabase를 통한 세션 관리를 위해 쿠키 및 로컬스토리지를 사용합니다. 브라우저 설정을 통해 쿠키 저장을 거부할 수 있으나, 이 경우 서비스 이용에 제한이 있을 수 있습니다.</p>
        </Section>

        <Section title="제9조 개인정보 보호책임자">
          <div style={{ background: "var(--surface)", borderRadius: 10, padding: 12 }}>
            {[
              ["서비스명", "파잡 (PAZAB)"],
              ["이메일", "hellopazab@gmail.com"],
              ["처리방침 시행일", today],
            ].map(([label, value]) => (
              <div key={label} style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, fontSize: 12 }}>
                <span style={{ color: "var(--text-muted)" }}>{label}</span>
                <span style={{ fontWeight: 600 }}>{value}</span>
              </div>
            ))}
          </div>
        </Section>

        <Section title="제10조 개인정보처리방침 변경">
          <p>본 방침은 법령·정책 변경 또는 서비스 변경에 따라 수정될 수 있으며, 변경 시 서비스 내 공지합니다.</p>
        </Section>

        <div style={{ textAlign: "center", paddingTop: 16, borderTop: "1px solid var(--border)" }}>
          <p style={{ fontSize: 12, color: "var(--text-muted)" }}>문의: hellopazab@gmail.com</p>
          <p style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>파잡 (PAZAB) · {today} 시행</p>
        </div>
      </div>
    </main>
  );
}
