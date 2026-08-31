import {
  collection,
  doc,
  getDocs,
  increment,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  where,
  type Unsubscribe,
} from 'firebase/firestore';
import { getFirestore } from 'firebase/firestore';
import { firebaseApp } from './firebase';
import type { FsPost } from './socialFirestore';

const db = getFirestore(firebaseApp);

export type TrendTag = {
  tag: string;
  count: number;
  updatedAtMs: number;
};

const TAG_RE = /#([\p{L}\p{N}_]{2,32})/gu;

export function extractHashtags(text: string): string[] {
  const found = new Set<string>();
  const raw = String(text || '');
  let match: RegExpExecArray | null;
  TAG_RE.lastIndex = 0;
  while ((match = TAG_RE.exec(raw))) {
    const tag = String(match[1] || '').toLowerCase();
    if (tag) found.add(tag);
  }
  return [...found].slice(0, 12);
}

export async function bumpHashtagsFromCaption(caption: string) {
  const tags = extractHashtags(caption);
  await Promise.all(
    tags.map(async (tag) => {
      const ref = doc(db, 'hashtags', tag);
      await setDoc(
        ref,
        {
          tag,
          count: increment(1),
          updatedAt: serverTimestamp(),
          updatedAtMs: Date.now(),
        },
        { merge: true },
      );
    }),
  );
  return tags;
}

export function listenTopTrends(onChange: (tags: TrendTag[]) => void): Unsubscribe {
  const q = query(collection(db, 'hashtags'), orderBy('count', 'desc'), limit(40));
  return onSnapshot(
    q,
    (snap) => {
      onChange(
        snap.docs.map((item) => {
          const data = item.data() as Record<string, unknown>;
          return {
            tag: String(data.tag || item.id),
            count: Number(data.count || 0),
            updatedAtMs: Number(data.updatedAtMs || 0),
          };
        }),
      );
    },
    async () => {
      // Sin índice: fallback lecturas recientes y orden local.
      try {
        const snap = await getDocs(query(collection(db, 'hashtags'), limit(80)));
        const list = snap.docs
          .map((item) => {
            const data = item.data() as Record<string, unknown>;
            return {
              tag: String(data.tag || item.id),
              count: Number(data.count || 0),
              updatedAtMs: Number(data.updatedAtMs || 0),
            };
          })
          .sort((a, b) => b.count - a.count)
          .slice(0, 40);
        onChange(list);
      } catch {
        onChange([]);
      }
    },
  );
}

export function listenPostsByHashtag(
  tag: string,
  onChange: (posts: FsPost[]) => void,
): Unsubscribe {
  const needle = String(tag || '')
    .trim()
    .replace(/^#/, '')
    .toLowerCase();
  if (!needle) {
    onChange([]);
    return () => undefined;
  }

  // Filtrado en cliente sobre posts recientes (evita índice compuesto caption).
  const q = query(collection(db, 'posts'), orderBy('createdAt', 'desc'), limit(120));
  return onSnapshot(
    q,
    (snap) => {
      const posts = snap.docs
        .map((item) => {
          const data = item.data() as Record<string, unknown>;
          const created =
            data.createdAt && typeof (data.createdAt as { toDate?: () => Date }).toDate === 'function'
              ? (data.createdAt as { toDate: () => Date }).toDate().toISOString()
              : String(data.createdAt || '');
          return {
            id: item.id,
            authorUid: String(data.authorUid || ''),
            username: String(data.username || ''),
            type: (data.type as FsPost['type']) || 'text',
            caption: (data.caption as string | null) ?? null,
            mediaUrl: (data.mediaUrl as string | null) ?? null,
            storagePath: (data.storagePath as string | null) ?? null,
            visibility: (data.visibility as FsPost['visibility']) || 'public',
            likes: Number(data.likes || 0),
            createdAt: created,
            viewerReaction: null,
          } satisfies FsPost;
        })
        .filter((post) => {
          if (post.visibility === 'private') return false;
          const tags = extractHashtags(post.caption || '');
          return tags.includes(needle);
        })
        .slice(0, 40);
      onChange(posts);
    },
    () => onChange([]),
  );
}

/** Seed suave si aún no hay tendencias: cuenta hashtags de posts públicos recientes. */
export async function seedTrendsFromRecentPosts() {
  const snap = await getDocs(query(collection(db, 'posts'), where('visibility', '==', 'public'), limit(60)));
  const counts = new Map<string, number>();
  for (const item of snap.docs) {
    const caption = String((item.data() as Record<string, unknown>).caption || '');
    for (const tag of extractHashtags(caption)) {
      counts.set(tag, (counts.get(tag) || 0) + 1);
    }
  }
  await Promise.all(
    [...counts.entries()].slice(0, 30).map(([tag, count]) =>
      setDoc(
        doc(db, 'hashtags', tag),
        {
          tag,
          count,
          updatedAt: serverTimestamp(),
          updatedAtMs: Date.now(),
        },
        { merge: true },
      ),
    ),
  );
}
