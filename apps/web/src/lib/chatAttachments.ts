/** Límite de adjuntos de chat. Subir este valor no requiere reescribir el módulo. */
export const MAX_CHAT_ATTACHMENT_BYTES = 25 * 1024 * 1024;

const BLOCKED_EXTENSIONS = new Set([
  'exe',
  'bat',
  'cmd',
  'com',
  'msi',
  'scr',
  'js',
  'vbs',
  'ps1',
  'sh',
  'apk',
  'dmg',
  'app',
  'jar',
]);

const ALLOWED_EXTENSIONS = new Set([
  'pdf',
  'doc',
  'docx',
  'xls',
  'xlsx',
  'ppt',
  'pptx',
  'txt',
  'zip',
  'rar',
  'jpg',
  'jpeg',
  'png',
  'gif',
  'webp',
  'heic',
  'heif',
  'mp3',
  'm4a',
  'wav',
  'ogg',
  'webm',
  'aac',
  'mp4',
  'mov',
  'mkv',
]);

const MIME_BY_EXT: Record<string, string> = {
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  txt: 'text/plain',
  zip: 'application/zip',
  rar: 'application/vnd.rar',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  heic: 'image/heic',
  heif: 'image/heif',
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  webm: 'audio/webm',
  aac: 'audio/aac',
  mp4: 'video/mp4',
  mov: 'video/quicktime',
  mkv: 'video/x-matroska',
};

export const CHAT_FILE_ACCEPT = [
  '.pdf',
  '.doc',
  '.docx',
  '.xls',
  '.xlsx',
  '.ppt',
  '.pptx',
  '.txt',
  '.zip',
  '.rar',
  'image/*',
  'audio/*',
  'video/*',
  'application/pdf',
].join(',');

export type ChatAttachmentKind = 'image' | 'audio' | 'video' | 'file';

export type ChatAttachmentPreview = {
  file: File;
  name: string;
  size: number;
  kind: ChatAttachmentKind;
  mime: string;
  previewUrl?: string;
};

function fileExtension(name: string): string {
  const base = name.split(/[/\\]/).pop() || name;
  const dot = base.lastIndexOf('.');
  if (dot < 0) return '';
  return base.slice(dot + 1).toLowerCase();
}

export function sanitizeChatFileName(name: string): string {
  const base = (name.split(/[/\\]/).pop() || 'archivo').replace(/[^\w.\- ()áéíóúñÁÉÍÓÚÑ]/gi, '_');
  return base.slice(0, 80) || 'archivo';
}

export function formatChatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function mimeFromFileName(name: string): string | null {
  const ext = fileExtension(name);
  return MIME_BY_EXT[ext] || null;
}

export function inferChatFileMime(file: File): string {
  const fromName = mimeFromFileName(file.name);
  if (file.type && file.type !== 'application/octet-stream') return file.type;
  return fromName || file.type || 'application/octet-stream';
}

export function chatAttachmentKind(file: File): ChatAttachmentKind {
  const mime = inferChatFileMime(file);
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('audio/')) return 'audio';
  if (mime.startsWith('video/')) return 'video';
  return 'file';
}

export function validateChatAttachment(file: File): { ok: true } | { ok: false; error: string } {
  const name = sanitizeChatFileName(file.name);
  const ext = fileExtension(name);
  if (BLOCKED_EXTENSIONS.has(ext) || /\.exe$/i.test(name)) {
    return { ok: false, error: 'Ese tipo de archivo no está permitido por seguridad.' };
  }
  if (ext && !ALLOWED_EXTENSIONS.has(ext) && !file.type.startsWith('image/') && !file.type.startsWith('audio/') && !file.type.startsWith('video/')) {
    return { ok: false, error: 'Formato no permitido. Usa PDF, Office, ZIP, imagen, audio o video.' };
  }
  if (file.size > MAX_CHAT_ATTACHMENT_BYTES) {
    const mb = Math.round(MAX_CHAT_ATTACHMENT_BYTES / (1024 * 1024));
    return {
      ok: false,
      error: `El archivo supera el límite de ${mb} MB. Elige uno más liviano.`,
    };
  }
  if (file.size <= 0) {
    return { ok: false, error: 'El archivo está vacío.' };
  }
  return { ok: true };
}

export function previewChatAttachment(file: File): ChatAttachmentPreview | { error: string } {
  const check = validateChatAttachment(file);
  if (!check.ok) return { error: check.error };
  const kind = chatAttachmentKind(file);
  return {
    file,
    name: sanitizeChatFileName(file.name),
    size: file.size,
    kind,
    mime: inferChatFileMime(file),
    previewUrl: kind === 'image' || kind === 'video' ? URL.createObjectURL(file) : undefined,
  };
}

export function isAnimatedChatGif(url: string | null | undefined, mediaType?: string | null): boolean {
  if (!url) return false;
  if (mediaType === 'gif') return true;
  return /\.gif(\?|#|$)/i.test(url) || /giphy\.com|media\.tenor/i.test(url);
}
