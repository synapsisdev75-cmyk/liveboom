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
  const text = String(payload?.text || payload?.subject || '').trim();
  const files: File[] = [];
  for (const item of payload?.files || []) {
    const file = base64ToFile(item);
    if (file) files.push(file);
  }
  return { files, text };
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

/** Escucha compartidos nativos (menú Compartir → LiveBoom). */
export function installShareIncomingListener() {
  if (typeof window === 'undefined' || !Capacitor.isNativePlatform()) return;
  void ShareIncoming.consumePending()
    .then((payload) => {
      if (payload && (payload.fileCount || payload.text || payload.subject)) {
        dispatchShare(payload);
      }
    })
    .catch(() => undefined);
  void ShareIncoming.addListener('shareReceived', (payload) => {
    dispatchShare(payload);
  }).catch(() => undefined);
}
