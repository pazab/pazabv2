import { redirect } from "next/navigation";

// 소셜 프로필과 파잡 커리어(/worker/[id])가 하나로 통합되면서 이 라우트는 리다이렉트로 남긴다.
// /worker/[id]가 정본인 이유: app/api/lovecall/route.ts가 알림에 /worker/${id} 링크를 영구 저장하기 때문.
interface Props {
  params: Promise<{ userId: string }>;
}

export default async function ProfileRedirectPage({ params }: Props) {
  const { userId } = await params;
  redirect(`/worker/${userId}`);
}
