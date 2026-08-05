// iOS 기본 카메라 포맷(HEIC/HEIF)은 Safari 외 브라우저의 <img>가 디코딩하지 못해
// 크롭 화면이 검정으로 보이는 원인이 됨(onLoad가 안 터지고 onError도 없어 조용히 빈 화면만 남음).
// FileReader로 읽어 <img>/캔버스에 넣기 전에 JPEG로 변환해서 이 문제를 없앤다.
// heic2any는 WASM 디코더라 무거워서, HEIC 파일을 만났을 때만 동적 import로 불러온다.
export async function convertHeicIfNeeded(file: File): Promise<File> {
  const isHeic = file.type === "image/heic" || file.type === "image/heif" || /\.hei[cf]$/i.test(file.name);
  if (!isHeic) return file;

  try {
    const heic2any = (await import("heic2any")).default;
    const converted = await heic2any({ blob: file, toType: "image/jpeg", quality: 0.9 });
    const blob = Array.isArray(converted) ? converted[0] : converted;
    const newName = file.name.replace(/\.hei[cf]$/i, ".jpg") || "photo.jpg";
    return new File([blob], newName, { type: "image/jpeg" });
  } catch (err) {
    // 변환 실패해도 업로드 자체를 막지 않음 — 원본을 그대로 반환(크롭 화면에서 디코딩 에러로 안내됨).
    console.error("HEIC 변환 실패:", err);
    return file;
  }
}
