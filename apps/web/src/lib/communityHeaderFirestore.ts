import {
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  type Unsubscribe,
} from 'firebase/firestore';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { db, storage } from './firebase';
import type { OrbitLayout } from '../components/community/CommunityOrbitNeonFrame';

const DOC_PATH = 'config/communityHeader';

export type OrbitSlot = { x: number; y: number; size: number };

export type CommunityHeaderSticker = {
  id: string;
  kind: 'image' | 'text';
  url?: string;
  text?: string;
  x: number;
  y: number;
  w: number;
  h: number;
  z: number;
};

export type CommunityHeaderTheme = {
  eyebrow: string;
  title: string;
  subtitle: string;
  bgKind: 'image' | 'video' | 'none';
  bgUrl: string | null;
  overlayOpacity: number;
  showOrbit: boolean;
  orbitLayout: OrbitLayout;
  stickers: CommunityHeaderSticker[];
};

export type CommunityHeaderDoc = {
  version: number;
  updatedBy?: string;
  light: CommunityHeaderTheme;
  dark: CommunityHeaderTheme;
};

export const DEFAULT_ORBIT_LAYOUT: OrbitLayout = {
  center: { x: 50.2, y: 52.3, size: 22.8 },
  friends: [
    { x: 50.5, y: 21.5, size: 11.9 },
    { x: 81.3, y: 36, size: 11.9 },
    { x: 81.1, y: 70.2, size: 13.1 },
    { x: 50, y: 85.5, size: 13.1 },
    { x: 18.6, y: 70.7, size: 13.1 },
    { x: 18.9, y: 36.5, size: 13.4 },
  ],
};

const DEFAULT_SUBTITLE =
  'Encuentra creadores por @usuario, nombre, biografía o categoría. Abajo ves las solicitudes recibidas y las que tú enviaste, en tiempo real.';

function cloneOrbit(layout: OrbitLayout): OrbitLayout {
  return {
    center: { ...layout.center },
    friends: layout.friends.map((s) => ({ ...s })),
  };
}

function defaultTheme(mode: 'light' | 'dark'): CommunityHeaderTheme {
  return {
    eyebrow: 'Comunidad',
    title: 'Buscar amigos',
    subtitle: DEFAULT_SUBTITLE,
    bgKind: 'image',
    bgUrl: mode === 'dark' ? '/community/header-bg-dark.jpg' : '/community/header-bg-light.jpg',
    overlayOpacity: mode === 'dark' ? 0.55 : 0.45,
    showOrbit: true,
    orbitLayout: cloneOrbit(DEFAULT_ORBIT_LAYOUT),
    stickers: [],
  };
}

export function buildDefaultCommunityHeader(): CommunityHeaderDoc {
  return {
    version: 1,
    light: defaultTheme('light'),
    dark: defaultTheme('dark'),
  };
}

function normalizeOrbit(raw: unknown): OrbitLayout {
  const fallback = cloneOrbit(DEFAULT_ORBIT_LAYOUT);
  if (!raw || typeof raw !== 'object') return fallback;
  const data = raw as Partial<OrbitLayout>;
  if (!data.center || !Array.isArray(data.friends) || data.friends.length !== 6) return fallback;
  const { center } = data;
  if (
    typeof center.x !== 'number' ||
    typeof center.y !== 'number' ||
    typeof center.size !== 'number'
  ) {
    return fallback;
  }
  const friends: OrbitSlot[] = [];
  for (const slot of data.friends) {
    if (
      !slot ||
      typeof slot.x !== 'number' ||
      typeof slot.y !== 'number' ||
      typeof slot.size !== 'number'
    ) {
      return fallback;
    }
    friends.push({ x: slot.x, y: slot.y, size: slot.size });
  }
  return { center: { ...center }, friends };
}

function normalizeSticker(raw: unknown, index: number): CommunityHeaderSticker | null {
  if (!raw || typeof raw !== 'object') return null;
  const s = raw as Partial<CommunityHeaderSticker>;
  const kind = s.kind === 'text' ? 'text' : s.kind === 'image' ? 'image' : null;
  if (!kind) return null;
  const sticker: CommunityHeaderSticker = {
    id: typeof s.id === 'string' && s.id ? s.id : `sticker-${index}`,
    kind,
    x: typeof s.x === 'number' ? s.x : 40,
    y: typeof s.y === 'number' ? s.y : 40,
    w: typeof s.w === 'number' ? s.w : 18,
    h: typeof s.h === 'number' ? s.h : 18,
    z: typeof s.z === 'number' ? s.z : index + 1,
  };
  if (typeof s.url === 'string' && s.url) sticker.url = s.url;
  if (typeof s.text === 'string') sticker.text = s.text;
  return sticker;
}

function normalizeTheme(raw: unknown, mode: 'light' | 'dark'): CommunityHeaderTheme {
  const base = defaultTheme(mode);
  if (!raw || typeof raw !== 'object') return base;
  const t = raw as Partial<CommunityHeaderTheme>;
  const bgKind =
    t.bgKind === 'video' || t.bgKind === 'image' || t.bgKind === 'none' ? t.bgKind : base.bgKind;
  const stickersRaw = Array.isArray(t.stickers) ? t.stickers : [];
  const stickers = stickersRaw
    .map((item, i) => normalizeSticker(item, i))
    .filter((item): item is CommunityHeaderSticker => Boolean(item));
  return {
    eyebrow: typeof t.eyebrow === 'string' ? t.eyebrow : base.eyebrow,
    title: typeof t.title === 'string' ? t.title : base.title,
    subtitle: typeof t.subtitle === 'string' ? t.subtitle : base.subtitle,
    bgKind,
    bgUrl: typeof t.bgUrl === 'string' ? t.bgUrl : t.bgUrl === null ? null : base.bgUrl,
    overlayOpacity:
      typeof t.overlayOpacity === 'number'
        ? Math.min(1, Math.max(0, t.overlayOpacity))
        : base.overlayOpacity,
    showOrbit: typeof t.showOrbit === 'boolean' ? t.showOrbit : base.showOrbit,
    orbitLayout: normalizeOrbit(t.orbitLayout),
    stickers,
  };
}

export function normalizeCommunityHeader(raw: unknown): CommunityHeaderDoc {
  const defaults = buildDefaultCommunityHeader();
  if (!raw || typeof raw !== 'object') return defaults;
  const data = raw as Partial<CommunityHeaderDoc>;
  const doc: CommunityHeaderDoc = {
    version: Math.max(1, Math.floor(Number(data.version) || 1)),
    light: normalizeTheme(data.light, 'light'),
    dark: normalizeTheme(data.dark, 'dark'),
  };
  if (typeof data.updatedBy === 'string' && data.updatedBy) doc.updatedBy = data.updatedBy;
  return doc;
}

export function cloneCommunityHeader(doc: CommunityHeaderDoc): CommunityHeaderDoc {
  return normalizeCommunityHeader(JSON.parse(JSON.stringify(doc)));
}

/** Firestore no acepta `undefined`; solo null / valores definidos. */
function stickerForFirestore(sticker: CommunityHeaderSticker): Record<string, unknown> {
  const row: Record<string, unknown> = {
    id: sticker.id,
    kind: sticker.kind,
    x: sticker.x,
    y: sticker.y,
    w: sticker.w,
    h: sticker.h,
    z: sticker.z,
  };
  if (sticker.kind === 'image') row.url = sticker.url || null;
  if (sticker.kind === 'text') row.text = sticker.text || '';
  return row;
}

function themeForFirestore(theme: CommunityHeaderTheme): Record<string, unknown> {
  return {
    eyebrow: theme.eyebrow,
    title: theme.title,
    subtitle: theme.subtitle,
    bgKind: theme.bgKind,
    bgUrl: theme.bgUrl ?? null,
    overlayOpacity: theme.overlayOpacity,
    showOrbit: theme.showOrbit,
    orbitLayout: {
      center: { ...theme.orbitLayout.center },
      friends: theme.orbitLayout.friends.map((s) => ({ ...s })),
    },
    stickers: theme.stickers.map(stickerForFirestore),
  };
}

export async function fetchCommunityHeader(): Promise<CommunityHeaderDoc> {
  const snap = await getDoc(doc(db, DOC_PATH));
  if (!snap.exists()) return buildDefaultCommunityHeader();
  return normalizeCommunityHeader(snap.data());
}

export function listenCommunityHeader(
  onChange: (config: CommunityHeaderDoc) => void,
): Unsubscribe {
  return onSnapshot(doc(db, DOC_PATH), (snap) => {
    onChange(
      snap.exists() ? normalizeCommunityHeader(snap.data()) : buildDefaultCommunityHeader(),
    );
  });
}

export async function saveCommunityHeader(
  config: CommunityHeaderDoc,
  updatedBy: string,
): Promise<void> {
  const normalized = normalizeCommunityHeader(config);
  await setDoc(doc(db, DOC_PATH), {
    version: Math.max(1, Math.floor(Number(normalized.version) || 1)),
    updatedBy: updatedBy || 'super-admin',
    updatedAt: serverTimestamp(),
    light: themeForFirestore(normalized.light),
    dark: themeForFirestore(normalized.dark),
  });
}

export async function uploadCommunityAsset(
  theme: 'light' | 'dark',
  kind: 'bg' | 'sticker',
  file: Blob,
  contentType: string,
): Promise<string> {
  const ext =
    contentType.includes('webm')
      ? 'webm'
      : contentType.includes('mp4')
        ? 'mp4'
        : contentType.includes('webp')
          ? 'webp'
          : contentType.includes('jpeg') || contentType.includes('jpg')
            ? 'jpg'
            : 'png';
  const objectRef = ref(storage, `admin/community/${theme}/${kind}-${Date.now()}.${ext}`);
  await uploadBytes(objectRef, file, { contentType: contentType || 'application/octet-stream' });
  return getDownloadURL(objectRef);
}

export function newStickerId(): string {
  return `stk-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}
