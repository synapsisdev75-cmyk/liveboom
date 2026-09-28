import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core';

export type IncomingShareFile = {
  name: string;
  mimeType: string;
  size: number;
  base64: string;
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
  try {
    const raw = atob(item.base64);
    const bytes = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
    return new File([bytes], item.name || 'shared.bin', {
      type: item.mimeType || 'application/octet-stream',
    });
  } catch {
    return null;
  }
}

export function filesFromSharePayload(
  payload: IncomingSharePayload | null | undefined,
): PendingIncomingShare {
  // Spotify / YouTube often put the title in EXTRA_SUBJECT and the URL in EXTRA_TEXT.
  const subject = String(payload?.subject || '').trim();
  const body = String(payload?.text || '').trim();
  let text = body || subject;
  if (subject && body && !body.toLowerCase().includes(subject.toLowerCase())) {
    text = `${subject}\n${body}`;
  }
  const files: File[] = [];
  for (const item of payload?.files || []) {
    const file = base64ToFile(item);
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
  const detail = filesFromSharePayload(payload);
  if (!detail.files.length && !detail.text) return;
  pendingShare = detail;
  window.dispatchEvent(new CustomEvent(SHARE_INCOMING_EVENT, { detail }));
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
