"use client";

import { useRouter } from "next/navigation";

export default function TermsPage() {
  const router = useRouter();

  const sections = [
    {
      title: "제1조 (목적)",
      content: `본 약관은 파잡(PAZAB, 이하 "회사")이 제공하는 AI 기반 알바 매칭 및 인사관리 서비스(이하 "서비스")의 이용 조건 및 절차, 회사와 이용자의 권리·의무 및 책임 사항을 규정함을 목적으로 합니다.`
    },
    {
      title: "제2조 (정의)",
      content: `① "서비스"란 회사가 제공하는 AI 성향 분석 기반 알바 매칭, 근로계약서 자동생성, 근태·급여 관리, PAZ AI 에이전트 등 모든 서비스를 의미합니다.\n② "이용자"란 본 약관에 동의하고 서비스를 이용하는 모든 회원을 의미합니다.\n③ "사장님 회원"이란 구인을 목적으로 가입한 자영업자·사업주를 의미합니다.\n④ "알바생 회원"이란 구직을 목적으로 가입한 이용자를 의미합니다.\n⑤ "성향 분석 데이터"란 HEXACO 심리 모델 기반 AI 인터뷰를 통해 수집·분석된 성격 및 가치관 데이터를 의미합니다.`
    },
    {
      title: "제3조 (약관의 효력 및 변경)",
      content: `① 본 약관은 서비스 화면에 게시하거나 기타 방법으로 이용자에게 공지함으로써 효력이 발생합니다.\n② 회사는 관련 법령을 위반하지 않는 범위에서 약관을 변경할 수 있으며, 변경 시 최소 7일 전 공지합니다.\n③ 변경된 약관에 동의하지 않는 이용자는 서비스 이용을 중단하고 탈퇴할 수 있습니다.`
    },
    {
      title: "제4조 (서비스 이용)",
      content: `① 서비스 이용은 회사의 승낙과 함께 시작됩니다.\n② 회사는 다음 각 호에 해당하는 경우 이용 신청을 거절할 수 있습니다.\n  - 타인의 명의를 도용한 경우\n  - 허위 정보를 기재한 경우\n  - 만 15세 미만인 경우\n  - 이전에 서비스 이용 자격을 박탈당한 경우\n③ 서비스 이용은 연중무휴 24시간을 원칙으로 하나, 점검·장애 시 제한될 수 있습니다.`
    },
    {
      title: "제5조 (성향 분석 및 매칭)",
      content: `① 성향 분석 인터뷰는 이용자의 자발적 참여로 진행되며, 거부 시에도 기본 서비스를 이용할 수 있습니다.\n② 성향 분석 결과는 참고 자료이며, 최종 채용 결정은 이용자 본인이 합니다.\n③ AI 매칭 점수는 알고리즘에 의한 예측값으로, 실제 관계를 보장하지 않습니다.\n④ 성향 데이터는 매칭 서비스 제공 목적으로만 사용되며, 제3자에게 제공되지 않습니다.`
    },
    {
      title: "제6조 (근로계약서 및 HR 서비스)",
      content: `① 회사가 제공하는 근로계약서 자동생성 기능은 표준 근로계약서 양식을 기반으로 하며, 법적 검토는 이용자 본인의 책임입니다.\n② 근태·급여 데이터는 사장님 회원과 알바생 회원 간 공유되며, 분쟁 발생 시 참고 자료로 사용될 수 있습니다.\n③ 회사는 HR 서비스 제공에 최선을 다하나, 노무·법률 전문 서비스를 대체하지 않습니다.`
    },
    {
      title: "제7조 (이용자 의무)",
      content: `① 이용자는 다음 행위를 해서는 안 됩니다.\n  - 타인의 정보 도용 또는 허위 정보 등록\n  - 채용 목적 외 개인정보 수집·이용\n  - 서비스 운영 방해 또는 시스템 해킹\n  - 음란·폭력적·차별적 콘텐츠 등록\n  - 상업적 광고·홍보 목적의 무단 사용\n  - 타 이용자에 대한 스팸·사기 행위\n② 이용자는 계정 정보를 타인과 공유해서는 안 됩니다.`
    },
    {
      title: "제8조 (개인정보 보호)",
      content: `① 회사는 개인정보보호법 등 관련 법령에 따라 이용자의 개인정보를 보호합니다.\n② AI 서비스 이용 시 주민등록번호, 계좌번호, 전화번호 등 개인정보는 자동 마스킹 처리됩니다.\n③ 개인정보 처리에 관한 상세 내용은 개인정보처리방침을 참고하시기 바랍니다.`
    },
    {
      title: "제9조 (서비스 요금)",
      content: `① 알바생 회원의 기본 서비스 이용은 무료입니다.\n② 사장님 회원의 유료 서비스 요금은 서비스 내 별도 안내에 따릅니다.\n③ 유료 서비스 결제 후 7일 이내 미이용 시 전액 환불이 가능합니다.\n④ 이용 중 환불은 잔여 기간에 대해 일할 계산하여 환불합니다.`
    },
    {
      title: "제10조 (책임 제한)",
      content: `① 회사는 천재지변, 전쟁, 테러, 해킹 등 불가항력으로 인한 서비스 중단에 대해 책임을 지지 않습니다.\n② AI 성향 분석 및 매칭 결과로 인한 채용 결과에 대해 회사는 책임을 지지 않습니다.\n③ 이용자 간 거래·분쟁에 대해 회사는 중개자 역할에 그치며 직접적인 책임을 지지 않습니다.`
    },
    {
      title: "제11조 (서비스 중단 및 해지)",
      content: `① 이용자는 언제든지 서비스 내 탈퇴 기능을 통해 이용 계약을 해지할 수 있습니다.\n② 회사는 약관 위반, 타인의 명예 훼손 등의 경우 사전 통지 후 서비스 이용을 제한할 수 있습니다.\n③ 탈퇴 시 개인정보는 관련 법령에 따라 일정 기간 보관 후 삭제됩니다.`
    },
    {
      title: "제12조 (분쟁 해결)",
      content: `① 서비스 이용과 관련한 분쟁은 회사와 이용자 간 협의를 통해 해결합니다.\n② 협의가 이루어지지 않을 경우 소비자분쟁조정위원회에 조정을 신청할 수 있습니다.\n③ 본 약관과 관련한 소송은 서울중앙지방법원을 관할 법원으로 합니다.`
    },
    {
      title: "제13조 (문의)",
      content: `이메일: hellopazab@gmail.com\n서비스: pazab.vercel.app`
    },
  ];

  return (
    <main style={{ minHeight: "100vh", background: "var(--bg)", maxWidth: 480, margin: "0 auto", padding: "20px 16px 60px" }}>
      {/* 헤더 */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 24 }}>
        <button
          onClick={() => window.history.length > 1 ? router.back() : router.push("/mypage")}
          style={{ background: "none", border: "none", color: "var(--text-muted)", fontSize: 20, cursor: "pointer" }}>
          ←
        </button>
        <p style={{ fontSize: 16, fontWeight: 700, color: "var(--text)", margin: 0 }}>서비스 이용약관</p>
      </div>

      <p style={{ color: "var(--text-muted)", fontSize: 11, marginBottom: 24 }}>
        시행일: 2026년 1월 1일 | 최종 수정: 2026년 6월 1일
      </p>

      <div style={{ color: "var(--text)", fontSize: 13, lineHeight: 1.8 }}>
        {sections.map((section, i) => (
          <div key={i} style={{ marginBottom: 24, paddingBottom: 24, borderBottom: i < sections.length - 1 ? "1px solid var(--border)" : "none" }}>
            <p style={{ fontSize: 14, fontWeight: 700, color: "var(--text)", marginBottom: 8 }}>
              {section.title}
            </p>
            <p style={{ color: "var(--text-muted)", whiteSpace: "pre-line", margin: 0 }}>
              {section.content}
            </p>
          </div>
        ))}
        <p style={{ color: "var(--text-muted)", fontSize: 11, textAlign: "center" as const, marginTop: 24 }}>
          파잡(PAZAB) | 시행일 2026년 1월 1일
        </p>
      </div>
    </main>
  );
}
