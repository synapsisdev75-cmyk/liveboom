import { collection, deleteDoc, doc, getDocs, serverTimestamp, setDoc } from 'firebase/firestore';
import { deleteObject, getDownloadURL, getMetadata, listAll, ref, uploadBytes } from 'firebase/storage';
import { db, storage } from './firebase';
import type { ComposerSticker } from './composerStickers';

export const CUSTOM_STICKER_MAX = 60;
const CUSTOM_STICKER_SCALE = 1.9;

export type CustomSticker = ComposerSticker & {
  storagePath: string;
  createdAt: number;
  /** Id del doc en `users/{uid}/savedStickers` cuando es un sticker guardado de otro creador. */
  savedId?: string;
};

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

function toSaved(savedId: string, src: string, createdAt: number): CustomSticker {
  return {
    id: `saved-${savedId}`,
    label: 'Sticker guardado',
    src,
    kind: 'sticker',
    pack: 'mios',
    scale: CUSTOM_STICKER_SCALE,
    storagePath: '',
    createdAt,
    savedId,
  };
}

/** Uid del creador si el sticker fue creado por un usuario (`users/{uid}/stickers/...`). */
export function stickerCreatorUid(src: string | null | undefined): string | null {
  const match = /\/o\/users%2F([^/?#%]+)%2Fstickers%2F/i.exec(String(src || ''));
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

/** Clave estable del sticker sin token ni cache-bust, para comparar y como id de Firestore. */
export function stickerKey(src: string): string {
  const raw = String(src || '').trim();
  let path = raw;
  try {
    const url = new URL(raw, 'https://liveboomapp.com');
    path = url.pathname.includes('/o/') ? decodeURIComponent(url.pathname.split('/o/')[1] ?? '') : url.pathname;
  } catch {
    path = raw.split(/[?#]/)[0] ?? raw;
  }
  return path.replace(/^\/+/, '').replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 200) || 'sticker';
}

export function cachedCustomStickers(uid: string): CustomSticker[] | null {
  return cache.get(uid) ?? null;
}

async function listCreated(uid: string): Promise<CustomSticker[]> {
  const result = await listAll(ref(storage, folder(uid)));
  return Promise.all(
    result.items.map(async (item) => {
      const [url, meta] = await Promise.all([getDownloadURL(item), getMetadata(item).catch(() => null)]);
      const fromName = Number.parseInt(item.name, 10);
      const createdAt = Number.isFinite(fromName) ? fromName : Date.parse(meta?.timeCreated ?? '') || 0;
      return toSticker(item.fullPath, url, createdAt);
    }),
  );
}

async function listSaved(uid: string): Promise<CustomSticker[]> {
  const snap = await getDocs(collection(db, 'users', uid, 'savedStickers'));
  return snap.docs
    .map((entry) => {
      const data = entry.data() as { src?: unknown; savedAtMs?: unknown };
      const src = typeof data.src === 'string' ? data.src : '';
      const savedAt = typeof data.savedAtMs === 'number' ? data.savedAtMs : 0;
      return src ? toSaved(entry.id, src, savedAt) : null;
    })
    .filter((item): item is CustomSticker => item !== null);
}

export async function listCustomStickers(uid: string): Promise<CustomSticker[]> {
  const [created, saved] = await Promise.all([listCreated(uid), listSaved(uid).catch(() => [])]);
  const items = [...created, ...saved];
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

/** Guarda en "Mis stickers" un sticker de otro creador (referencia, sin copiar el archivo). */
export async function saveStickerReference(uid: string, src: string): Promise<CustomSticker> {
  const savedId = stickerKey(src);
  const savedAtMs = Date.now();
  const creatorUid = stickerCreatorUid(src);
  await setDoc(doc(db, 'users', uid, 'savedStickers', savedId), {
    src,
    creatorUid: creatorUid ?? null,
    savedAtMs,
    savedAt: serverTimestamp(),
  });
  const sticker = toSaved(savedId, src, savedAtMs);
  cache.set(uid, [sticker, ...(cache.get(uid) ?? []).filter((item) => item.savedId !== savedId)]);
  return sticker;
}

export async function deleteCustomSticker(uid: string, sticker: Pick<CustomSticker, 'storagePath' | 'savedId'>): Promise<void> {
  if (sticker.savedId) {
    await deleteDoc(doc(db, 'users', uid, 'savedStickers', sticker.savedId));
  } else {
    await deleteObject(ref(storage, sticker.storagePath));
  }
  cache.set(
    uid,
    (cache.get(uid) ?? []).filter((item) =>
      sticker.savedId ? item.savedId !== sticker.savedId : item.storagePath !== sticker.storagePath,
    ),
  );
}
