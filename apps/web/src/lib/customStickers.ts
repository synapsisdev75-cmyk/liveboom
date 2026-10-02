import { deleteObject, getDownloadURL, getMetadata, listAll, ref, uploadBytes } from 'firebase/storage';
import { storage } from './firebase';
import type { ComposerSticker } from './composerStickers';

export const CUSTOM_STICKER_MAX = 60;
const CUSTOM_STICKER_SCALE = 1.9;

export type CustomSticker = ComposerSticker & { storagePath: string; createdAt: number };

function folder(uid: string) {
  return `users/${uid}/stickers`;
}

const cache = new Map<string, CustomSticker[]>();

function toSticker(storagePath: string, url: string, createdAt: number): CustomSticker {
  return {
    id: `my-${storagePath.split('/').pop() ?? createdAt}`,
    label: 'Mi sticker',
    src: url,
    kind: 'sticker',
    pack: 'mios',
    scale: CUSTOM_STICKER_SCALE,
    storagePath,
    createdAt,
  };
}

export function cachedCustomStickers(uid: string): CustomSticker[] | null {
  return cache.get(uid) ?? null;
}

export async function listCustomStickers(uid: string): Promise<CustomSticker[]> {
  const result = await listAll(ref(storage, folder(uid)));
  const items = await Promise.all(
    result.items.map(async (item) => {
      const [url, meta] = await Promise.all([getDownloadURL(item), getMetadata(item).catch(() => null)]);
      const fromName = Number.parseInt(item.name, 10);
      const createdAt = Number.isFinite(fromName) ? fromName : Date.parse(meta?.timeCreated ?? '') || 0;
      return toSticker(item.fullPath, url, createdAt);
    }),
  );
  items.sort((a, b) => b.createdAt - a.createdAt);
  cache.set(uid, items);
  return items;
}

export async function saveCustomSticker(uid: string, blob: Blob): Promise<CustomSticker> {
  const ext = blob.type === 'image/webp' ? 'webp' : 'png';
  const createdAt = Date.now();
  const storagePath = `${folder(uid)}/${createdAt}.${ext}`;
  const objectRef = ref(storage, storagePath);
  await uploadBytes(objectRef, blob, {
    contentType: blob.type || 'image/png',
    cacheControl: 'public, max-age=31536000, immutable',
    customMetadata: { visibility: 'public', kind: 'sticker' },
  });
  const url = await getDownloadURL(objectRef);
  const sticker = toSticker(storagePath, url, createdAt);
  cache.set(uid, [sticker, ...(cache.get(uid) ?? [])]);
  return sticker;
}

export async function deleteCustomSticker(uid: string, storagePath: string): Promise<void> {
  await deleteObject(ref(storage, storagePath));
  cache.set(
    uid,
    (cache.get(uid) ?? []).filter((item) => item.storagePath !== storagePath),
  );
}
