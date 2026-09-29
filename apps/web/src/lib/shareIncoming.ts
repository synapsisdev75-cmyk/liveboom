import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core';

export type IncomingShareFile = {
  name: string;
  mimeType: string;
  size: number;
  /** Ruta absoluta en cache nativo (preferido; evita OOM). */
  path?: string;
  /** Legacy: solo archivos pequeños antiguos. */
  base64?: string;
};

export type IncomingSharePayload = {
  mimeType?: string;
  subject?: string;
  text?: string;
  files?: IncomingShareFile[];
  fileCount?: number;
};

export type PendingIncomingShare = {
  files: File[];
  text: string;
};

type ShareIncomingApi = {
  consumePending(): Promise<IncomingSharePayload>;
  addListener(
    eventName: 'shareReceived',
    listener: (payload: IncomingSharePayload) => void,
  ): Promise<PluginListenerHandle>;
};

const ShareIncoming = registerPlugin<ShareIncomingApi>('ShareIncoming');

export const SHARE_INCOMING_EVENT = 'liveboom:share-incoming';

let pendingShare: PendingIncomingShare | null = null;
let listenerInstalled = false;

function base64ToFile(item: IncomingShareFile): File | null {
  const b64 = String(item.base64 || '');
  if (!b64) return null;
  try {
    const raw = atob(b64);
    const bytes = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
    return new File([bytes], item.name || 'shared.bin', {
      type: item.mimeType || 'application/octet-stream',
    });
  } catch {
    return null;
  }
}

async function pathToFile(item: IncomingShareFile): Promise<File | null> {
  const path = String(item.path || '').trim();
  if (!path) return null;
  try {
    const url = Capacitor.convertFileSrc(path);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`fetch ${res.status}`);
    const blob = await res.blob();
    if (!blob.size) return null;
    return new File([blob], item.name || 'shared.bin', {
      type: item.mimeType || blob.type || 'application/octet-stream',
    });
  } catch (err) {
    console.warn('[share] pathToFile', path, err);
    return null;
  }
}

async function fileFromShareItem(item: IncomingShareFile): Promise<File | null> {
  if (item.path) return pathToFile(item);
  if (item.base64) return base64ToFile(item);
  return null;
}

export async function filesFromSharePayload(
  payload: IncomingSharePayload | null | undefined,
): Promise<PendingIncomingShare> {
  // Spotify / YouTube often put the title in EXTRA_SUBJECT and the URL in EXTRA_TEXT.
  const subject = String(payload?.subject || '').trim();
  const body = String(payload?.text || '').trim();
  let text = body || subject;
  if (subject && body && !body.toLowerCase().includes(subject.toLowerCase())) {
    text = `${subject}\n${body}`;
  }
  const files: File[] = [];
  for (const item of payload?.files || []) {
    const file = await fileFromShareItem(item);
    if (file) files.push(file);
  }
  return { files, text };
}

function payloadHasContent(payload: IncomingSharePayload | null | undefined): boolean {
  if (!payload) return false;
  const files = Number(payload.fileCount || payload.files?.length || 0);
  return files > 0 || Boolean(String(payload.text || '').trim()) || Boolean(String(payload.subject || '').trim());
}

export function peekPendingIncomingShare(): PendingIncomingShare | null {
  return pendingShare;
}

export function takePendingIncomingShare(): PendingIncomingShare | null {
  const next = pendingShare;
  pendingShare = null;
  return next;
}

function dispatchShare(payload: IncomingSharePayload) {
  void (async () => {
    const detail = await filesFromSharePayload(payload);
    if (!detail.files.length && !detail.text) return;
    pendingShare = detail;
    window.dispatchEvent(new CustomEvent(SHARE_INCOMING_EVENT, { detail }));
  })();
}

async function pullNativePending() {
  try {
    const payload = await ShareIncoming.consumePending();
    if (payloadHasContent(payload)) dispatchShare(payload);
  } catch {
    /* plugin no disponible */
  }
}

/** Escucha compartidos nativos (menú Compartir → LiveBoom). */
export function installShareIncomingListener() {
  if (typeof window === 'undefined' || !Capacitor.isNativePlatform()) return;
  if (listenerInstalled) {
    void pullNativePending();
    return;
  }
  listenerInstalled = true;

  void ShareIncoming.addListener('shareReceived', (payload) => {
    dispatchShare(payload);
  }).catch(() => undefined);

  // Cold start: el intent puede estar listo un poco después del primer paint.
  void pullNativePending();
  window.setTimeout(() => {
    void pullNativePending();
  }, 400);
  window.setTimeout(() => {
    void pullNativePending();
  }, 1200);
  window.setTimeout(() => {
    void pullNativePending();
  }, 2500);
}
