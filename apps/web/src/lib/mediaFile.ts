/** Detecta tipo de archivo cuando el móvil no envía MIME (común en iOS/Android). */
export function isVideoFile(file: File): boolean {
  if (file.type.startsWith('video/')) return true;
  return /\.(mp4|mov|webm|m4v|avi|mkv|3gp)$/i.test(file.name);
}

export function isImageFile(file: File): boolean {
  if (file.type.startsWith('image/')) return true;
  return /\.(jpe?g|png|gif|webp|heic|heif|bmp)$/i.test(file.name);
}

export function mediaKindFromFile(file: File): 'photo' | 'video' | null {
  if (isVideoFile(file)) return 'video';
  if (isImageFile(file)) return 'photo';
  return null;
}
