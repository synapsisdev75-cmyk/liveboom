/** GIF 1×1 transparente: Android WebView no inyecta el play nativo si hay `poster`. */
export const TRANSPARENT_VIDEO_POSTER =
  'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

export function resolveVideoPoster(src?: string | null) {
  const value = src?.trim();
  return value ? value : TRANSPARENT_VIDEO_POSTER;
}
