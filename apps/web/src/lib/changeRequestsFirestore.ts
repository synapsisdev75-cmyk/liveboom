import {
  addDoc,
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  type Unsubscribe,
} from 'firebase/firestore';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { db, storage } from './firebase';

export const CHANGE_REQUEST_SECTIONS = [
  { id: 'inicio', label: 'Inicio', hint: 'Feed / home' },
  { id: 'explorar', label: 'Explorar', hint: 'Explorar lives y contenido' },
  { id: 'grupos', label: 'Grupos', hint: 'Grupos y comunidades' },
  { id: 'mensajes', label: 'Mensajes', hint: 'Inbox y chats' },
  { id: 'actividad', label: 'Actividad', hint: 'Notificaciones / actividad' },
  { id: 'perfil', label: 'Perfil', hint: 'Perfil propio y edición' },
  { id: 'buscar', label: 'Buscar amigos', hint: 'Búsqueda de usuarios' },
  { id: 'billetera', label: 'Mi billetera', hint: 'Coins, packs, retiros' },
  { id: 'live', label: 'LIVE / Transmitir', hint: 'Sala en vivo y transmisión' },
  { id: 'otro', label: 'Otro', hint: 'Cualquier otra pantalla' },
] as const;

export type ChangeRequestSectionId = (typeof CHANGE_REQUEST_SECTIONS)[number]['id'];

export type ChangeRequestStatus = 'pending' | 'approved' | 'rejected' | 'applied';

export type AdminChangeRequest = {
  id: string;
  section: ChangeRequestSectionId | string;
  title: string;
  prompt: string;
  imageUrls: string[];
  status: ChangeRequestStatus;
  createdByUid: string;
  createdByEmail: string;
  createdByHandle: string;
  reviewNote: string;
  reviewedByEmail: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

function asIso(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === 'string') return value;
  if (typeof value === 'object' && value && 'toDate' in value) {
    try {
      return (value as { toDate: () => Date }).toDate().toISOString();
    } catch {
      return null;
    }
  }
  return null;
}

function mapDoc(id: string, data: Record<string, unknown>): AdminChangeRequest {
  const images = Array.isArray(data.imageUrls)
    ? data.imageUrls.filter((u): u is string => typeof u === 'string' && u.length > 0)
    : [];
  const status = String(data.status || 'pending') as ChangeRequestStatus;
  return {
    id,
    section: String(data.section || 'otro'),
    title: String(data.title || '').trim() || 'Sin título',
    prompt: String(data.prompt || '').trim(),
    imageUrls: images,
    status: ['pending', 'approved', 'rejected', 'applied'].includes(status) ? status : 'pending',
    createdByUid: String(data.createdByUid || ''),
    createdByEmail: String(data.createdByEmail || ''),
    createdByHandle: String(data.createdByHandle || ''),
    reviewNote: String(data.reviewNote || ''),
    reviewedByEmail: data.reviewedByEmail ? String(data.reviewedByEmail) : null,
    createdAt: asIso(data.createdAt),
    updatedAt: asIso(data.updatedAt),
  };
}

export function sectionLabel(sectionId: string): string {
  return CHANGE_REQUEST_SECTIONS.find((s) => s.id === sectionId)?.label ?? sectionId;
}

/** Texto listo para pegar en Cursor (opción A). */
export function formatChangeRequestForCursor(req: AdminChangeRequest): string {
  const lines = [
    `Pedido Super Admin #${req.id}`,
    `Sección: ${sectionLabel(req.section)} (${req.section})`,
    `Título: ${req.title}`,
    `Autor: @${req.createdByHandle || '—'} <${req.createdByEmail}>`,
    `Estado: ${req.status}`,
    '',
    'Prompt:',
    req.prompt || '(vacío)',
  ];
  if (req.imageUrls.length) {
    lines.push('', 'Imágenes de referencia (descárgalas o ábrelas):');
    req.imageUrls.forEach((url, i) => lines.push(`${i + 1}. ${url}`));
    lines.push(
      '',
      'Si pegaste esto en Cursor: implementa según el prompt; las imágenes están en las URLs de arriba (o adjúntalas si las descargaste).',
    );
  }
  if (req.reviewNote.trim()) {
    lines.push('', `Nota de revisión: ${req.reviewNote.trim()}`);
  }
  lines.push('', 'Implementar en apps/web según el prompt e imágenes. Mobile-first.');
  return lines.join('\n');
}

function safeFileBase(req: AdminChangeRequest): string {
  const title = req.title
    .replace(/[^\w\-áéíóúñüÁÉÍÓÚÑÜ]+/gi, '_')
    .replace(/_+/g, '_')
    .slice(0, 40)
    .replace(/^_|_$/g, '');
  return `pedido-${req.section}-${title || req.id.slice(0, 8)}`;
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 2500);
}

export function downloadPromptFile(req: AdminChangeRequest): void {
  const text = formatChangeRequestForCursor(req);
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  triggerDownload(blob, `${safeFileBase(req)}-prompt.txt`);
}

async function fetchAsBlob(url: string): Promise<Blob> {
  const res = await fetch(url, { mode: 'cors' });
  if (!res.ok) throw new Error(`No se pudo descargar imagen (${res.status})`);
  return res.blob();
}

function extFromUrlOrType(url: string, blob: Blob): string {
  const fromType = blob.type.includes('png')
    ? 'png'
    : blob.type.includes('webp')
      ? 'webp'
      : blob.type.includes('gif')
        ? 'gif'
        : blob.type.includes('jpeg') || blob.type.includes('jpg')
          ? 'jpg'
          : '';
  if (fromType) return fromType;
  const m = url.match(/\.(png|jpe?g|webp|gif)(?:\?|$)/i);
  return m?.[1]?.toLowerCase().replace('jpeg', 'jpg') || 'jpg';
}

/** Descarga cada imagen del pedido (una tras otra). */
export async function downloadChangeRequestImages(req: AdminChangeRequest): Promise<number> {
  const base = safeFileBase(req);
  let ok = 0;
  for (let i = 0; i < req.imageUrls.length; i += 1) {
    const url = req.imageUrls[i]!;
    try {
      const blob = await fetchAsBlob(url);
      const ext = extFromUrlOrType(url, blob);
      triggerDownload(blob, `${base}-${i + 1}.${ext}`);
      ok += 1;
      // Pequeña pausa para que el navegador no bloquee múltiples descargas
      await new Promise((r) => window.setTimeout(r, 350));
    } catch {
      /* skip failed image */
    }
  }
  return ok;
}

/** Prompt .txt + todas las imágenes — listo para pegar en Cursor. */
export async function downloadChangeRequestBundle(req: AdminChangeRequest): Promise<{
  images: number;
  prompt: boolean;
}> {
  downloadPromptFile(req);
  await new Promise((r) => window.setTimeout(r, 400));
  const images = await downloadChangeRequestImages(req);
  return { images, prompt: true };
}

export function listenChangeRequests(
  onChange: (rows: AdminChangeRequest[]) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  const q = query(collection(db, 'adminChangeRequests'), orderBy('createdAt', 'desc'));
  return onSnapshot(
    q,
    (snap) => {
      onChange(snap.docs.map((d) => mapDoc(d.id, d.data() as Record<string, unknown>)));
    },
    (err) => onError?.(err instanceof Error ? err : new Error(String(err))),
  );
}

export async function uploadChangeRequestImage(
  uid: string,
  file: Blob,
  contentType = 'image/jpeg',
): Promise<string> {
  const type =
    contentType && contentType.startsWith('image/')
      ? contentType
      : file.type && file.type.startsWith('image/')
        ? file.type
        : 'image/jpeg';
  const ext = type.includes('png') ? 'png' : type.includes('webp') ? 'webp' : 'jpg';
  const name = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const objectRef = ref(storage, `admin/change-requests/${uid}/${name}`);
  await uploadBytes(objectRef, file, { contentType: type });
  return getDownloadURL(objectRef);
}

export async function createChangeRequest(input: {
  section: string;
  title: string;
  prompt: string;
  imageUrls: string[];
  createdByUid: string;
  createdByEmail: string;
  createdByHandle: string;
}): Promise<string> {
  const refDoc = await addDoc(collection(db, 'adminChangeRequests'), {
    section: input.section,
    title: input.title.trim().slice(0, 120),
    prompt: input.prompt.trim().slice(0, 8000),
    imageUrls: input.imageUrls.slice(0, 8),
    status: 'pending',
    createdByUid: input.createdByUid,
    createdByEmail: input.createdByEmail.trim().toLowerCase(),
    createdByHandle: input.createdByHandle.replace(/^@/, '').trim(),
    reviewNote: '',
    reviewedByEmail: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return refDoc.id;
}

export async function updateChangeRequestStatus(input: {
  id: string;
  status: ChangeRequestStatus;
  reviewNote?: string;
  reviewedByEmail: string;
}): Promise<void> {
  await updateDoc(doc(db, 'adminChangeRequests', input.id), {
    status: input.status,
    reviewNote: (input.reviewNote ?? '').trim().slice(0, 2000),
    reviewedByEmail: input.reviewedByEmail.trim().toLowerCase(),
    updatedAt: serverTimestamp(),
  });
}
