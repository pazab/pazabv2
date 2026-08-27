// "media" 버킷 public URL에서 스토리지 내부 경로만 추출
// 예: https://xxx.supabase.co/storage/v1/object/public/media/feed/abc.jpg → feed/abc.jpg
export function extractMediaStoragePath(fileUrl: string | null | undefined): string | null {
  if (!fileUrl) return null;
  const marker = "/object/public/media/";
  const idx = fileUrl.indexOf(marker);
  if (idx === -1) return null;
  return fileUrl.slice(idx + marker.length);
}
