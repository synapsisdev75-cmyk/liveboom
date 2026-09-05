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

export async function fileFromMediaUrl(url: string, fallbackName = 'media.jpg'): Promise<File> {
  const response = await fetch(url);
  if (!response.ok) throw new Error('No se pudo cargar el archivo original.');
  const blob = await response.blob();
  const type = blob.type || 'application/octet-stream';
  const ext = type.includes('png')
    ? 'png'
    : type.includes('gif')
      ? 'gif'
      : type.includes('webp')
        ? 'webp'
        : type.includes('mp4')
          ? 'mp4'
          : type.includes('webm')
            ? 'webm'
            : 'jpg';
  const name = /\.[a-z0-9]+$/i.test(fallbackName) ? fallbackName : `${fallbackName}.${ext}`;
  return new File([blob], name, { type });
}
