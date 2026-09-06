import { doc, getDoc } from 'firebase/firestore';
import { db } from './firebase';
import type { ChatMessage } from './socialFirestore';

function sanitizeFilePart(value: string) {
  return String(value || 'usuario')
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 24) || 'usuario';
}

function latin1(text: string) {
  return Array.from(text)
    .map((ch) => {
      const code = ch.charCodeAt(0);
      if (code === 10 || (code >= 32 && code <= 126) || (code >= 160 && code <= 255)) return ch;
      const map: Record<string, string> = {
        '—': '-',
        '–': '-',
        '“': '"',
        '”': '"',
        '‘': "'",
        '’': "'",
        '…': '...',
        '•': String.fromCharCode(183),
      };
      return map[ch] || '?';
    })
    .join('');
}

function pdfEscape(text: string) {
  return latin1(text).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

function wrapLine(text: string, width: number) {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > width && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }
  if (current) lines.push(current);
  return lines.length ? lines : [''];
}

function pad2(value: number) {
  return String(value).padStart(2, '0');
}

function formatClock(date: Date, withYear = false) {
  const dd = pad2(date.getDate());
  const mm = pad2(date.getMonth() + 1);
  const year = date.getFullYear();
  const yy = String(year).slice(-2);
  const hours = date.getHours();
  const minutes = pad2(date.getMinutes());
  const h12 = hours % 12 || 12;
  const suffix = hours < 12 ? 'a. m.' : 'p. m.';
  if (withYear) return `${dd}/${mm}/${year} - ${pad2(h12)}:${minutes} ${suffix}`;
  return `${dd}/${mm}/${yy}, ${h12}:${minutes} ${suffix}`;
}

function formatDay(date: Date) {
  return `${pad2(date.getDate())}/${pad2(date.getMonth() + 1)}/${date.getFullYear()}`;
}

function clockOf(message: ChatMessage) {
  const time = new Date(message.createdAt);
  return Number.isNaN(time.getTime()) ? '' : formatClock(time);
}

function formatMmSs(totalSec: number) {
  const dur = Math.max(0, Math.floor(totalSec));
  return `${pad2(Math.floor(dur / 60))}:${pad2(dur % 60)}`;
}

function durationFromText(text: string) {
  const match = String(text || '').match(/(\d{1,2}):(\d{2})(?!\d)/);
  if (!match) return null;
  return `${pad2(Number(match[1]))}:${match[2]}`;
}

function fileBaseName(value: string | null | undefined) {
  const raw = String(value || '').trim();
  if (!raw || /^https?:\/\//i.test(raw) || raw.includes('/')) {
    const name = raw.split(/[/?#]/).filter(Boolean).pop() || '';
    if (!name || /^https?:/i.test(name) || name.length > 80) return '';
    return name.replace(/[?#].*$/, '');
  }
  return raw.slice(0, 80);
}

function stripPrivate(text: string) {
  return String(text || '')
    .replace(/https?:\/\/\S+/gi, '')
    .replace(/gs:\/\/\S+/gi, '')
    .replace(/\btoken=[^\s&]+/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function callOutcomeLabel(outcome: string) {
  const key = String(outcome || '').toLowerCase();
  if (key === 'completed') return 'Completada';
  if (key === 'missed') return 'Perdida';
  if (key === 'declined') return 'Rechazada';
  if (key === 'cancelled' || key === 'canceled') return 'Cancelada';
  if (key === 'failed') return 'Fallida';
  return '';
}

function withDuration(label: string, duration: string | null) {
  return duration ? `[${label} · ${duration}]` : `[${label}]`;
}

function isStickerMessage(message: ChatMessage) {
  const text = String(message.text || '').trim();
  return /^sticker$/i.test(text) || /^pegatina$/i.test(text);
}

function isVideoNoteMessage(message: ChatMessage) {
  const text = String(message.text || '');
  return /nota de video/i.test(text) || /🎬/.test(text);
}

function isGifMessage(message: ChatMessage) {
  const text = String(message.text || '').trim();
  if (message.mediaType === 'gif') return true;
  if (/^:[a-z0-9_]*gif[a-z0-9_]*:$/i.test(text)) return true;
  return /\.gif(?:$|\?)/i.test(String(message.mediaUrl || ''));
}

function callLine(message: ChatMessage) {
  const meta = message.callMeta;
  const video = Boolean(meta?.video) || /videollamada/i.test(message.text || '');
  const kind = video ? 'Videollamada' : 'Llamada';
  const outcome = callOutcomeLabel(meta?.outcome || '');
  const durationSec = Math.max(0, meta?.durationSec || 0);
  const showDuration = durationSec > 0 && (!outcome || outcome === 'Completada' || outcome === 'Cancelada');
  if (showDuration && outcome) return `${kind} · ${formatMmSs(durationSec)} · ${outcome}`;
  if (showDuration) return `${kind} · ${formatMmSs(durationSec)}`;
  if (outcome) return `${kind} · ${outcome}`;
  return kind;
}

function messageLine(message: ChatMessage) {
  const clock = clockOf(message);
  const who = message.mine ? 'Tú' : 'Contacto';
  const prefix = `[${clock}] ${who}:`;
  if (message.deleted || message.deletedForEveryone) {
    return `${prefix} Mensaje eliminado para todos`;
  }
  if (message.hiddenForMe) {
    return `${prefix} Mensaje eliminado`;
  }
  if (message.callMeta || message.mediaType === 'call') {
    return `${prefix} ${callLine(message)}`;
  }
  if (isGifMessage(message)) return `${prefix} [GIF]`;
  if (isStickerMessage(message)) return `${prefix} [Sticker]`;
  if (message.mediaType === 'image') return `${prefix} [Imagen]`;
  if (message.mediaType === 'video') {
    return `${prefix} ${withDuration(isVideoNoteMessage(message) ? 'Nota de video' : 'Video', durationFromText(message.text || ''))}`;
  }
  if (message.mediaType === 'audio') {
    return `${prefix} ${withDuration('Audio', durationFromText(message.text || ''))}`;
  }
  if (message.mediaType === 'file') {
    const name = fileBaseName(message.fileName);
    return `${prefix} ${name ? `[Archivo · ${name}]` : '[Archivo]'}`;
  }
  if (message.giftId) return `${prefix} [Regalo]`;
  const text = stripPrivate(message.text || '');
  return `${prefix} ${text}`.trim();
}

export function conversationPdfFilename(meHandle: string, peerHandle: string, at = new Date()) {
  const day = at.toISOString().slice(0, 10);
  return `LiveBoom_chat_${sanitizeFilePart(meHandle)}_${sanitizeFilePart(peerHandle)}_${day}.pdf`;
}

export async function generateConversationPdf(input: {
  chatId: string;
  requestingUserId: string;
  meHandle: string;
  peerHandle: string;
  peerName: string;
  messages: ChatMessage[];
  rangeLabel?: string;
}) {
  if (!input.requestingUserId || !input.chatId) {
    throw new Error('No se pudo completar la acción. Intenta nuevamente.');
  }
  const chatSnap = await getDoc(doc(db, 'chats', input.chatId));
  if (!chatSnap.exists()) {
    throw new Error('No se pudo completar la acción. Intenta nuevamente.');
  }
  const participants = (chatSnap.data().participants as string[]) || [];
  if (!participants.includes(input.requestingUserId)) {
    throw new Error('No se pudo completar la acción. Intenta nuevamente.');
  }

  const messages = [...input.messages].sort(
    (a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt),
  );
  const created = new Date();
  const times = messages
    .map((item) => Date.parse(item.createdAt))
    .filter((value) => Number.isFinite(value));
  const range =
    times.length > 0
      ? `${formatDay(new Date(Math.min(...times)))} - ${formatDay(new Date(Math.max(...times)))}`
      : formatDay(created);
  const header = [
    'LIVEBOOM',
    'Historial de conversación',
    '',
    'Usuario:',
    `@${input.meHandle.replace(/^@/, '')}`,
    '',
    'Contacto:',
    `@${input.peerHandle.replace(/^@/, '')}`,
    '',
    'Exportado:',
    formatClock(created, true),
    '',
    'Rango:',
    range,
    '',
    'Mensajes:',
    String(messages.length),
    '',
  ];

  const body = messages.map(messageLine);
  const all = [...header, ...body];
  const wrapped: string[] = [];
  for (const line of all) {
    wrapped.push(...wrapLine(line, 92));
  }

  const pageW = 595;
  const pageH = 842;
  const margin = 48;
  const lineH = 14;
  const perPage = Math.floor((pageH - margin * 2) / lineH);
  const pages: string[][] = [];
  for (let i = 0; i < wrapped.length; i += perPage) {
    pages.push(wrapped.slice(i, i + perPage));
  }
  if (pages.length === 0) pages.push(['(Sin mensajes)']);

  const objs: string[] = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  const pageObjectIds: number[] = [];
  for (let i = 0; i < pages.length; i += 1) {
    const pageId = objs.length + 1;
    const contentId = pageId + 1;
    pageObjectIds.push(pageId);
    objs.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageW} ${pageH}] /Contents ${contentId} 0 R /Resources << /Font << /F1 3 0 R >> >> >>`,
    );
    const cmds = ['BT', '/F1 10 Tf', `${margin} ${pageH - margin} Td`, `${lineH} TL`];
    (pages[i] ?? []).forEach((line, idx) => {
      if (idx === 0) cmds.push(`(${pdfEscape(line)}) Tj`);
      else cmds.push(`T* (${pdfEscape(line)}) Tj`);
    });
    cmds.push('ET');
    cmds.push('BT', '/F1 8 Tf', `${pageW - margin - 36} 28 Td`, `(${i + 1} / ${pages.length}) Tj`, 'ET');
    const stream = cmds.join('\n');
    objs.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
  }
  objs[1] = `<< /Type /Pages /Kids [${pageObjectIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pages.length} >>`;

  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  for (let i = 0; i < objs.length; i += 1) {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${objs[i]}\nendobj\n`;
  }
  const xref = pdf.length;
  pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= objs.length; i += 1) {
    pdf += `${String(offsets[i] ?? 0).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer << /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;

  const bytes = Uint8Array.from(pdf, (ch) => ch.charCodeAt(0) & 0xff);
  const blob = new Blob([bytes], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = conversationPdfFilename(input.meHandle, input.peerHandle, created);
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 4_000);
}
