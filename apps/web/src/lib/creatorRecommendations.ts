import {
  collection,
  doc,
  documentId,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  startAt,
  where,
  type DocumentData,
  type QuerySnapshot,
} from 'firebase/firestore';
import { db } from './firebase';
import { parsePublicGeo, type PublicGeo } from './geoKeys';
import { detectViewerGeo } from './publicGeo';
import { readIgnoredSuggestionUids } from './ignoredSuggestions';
import {
  emptySignals,
  pickDiverse,
  reasonLabel,
  scoreCandidate,
  stableJitter,
  type CandidateSignals,
  type ReasonKind,
  type RecommendationContext,
} from './creatorRanking';

export type { RecommendationContext } from './creatorRanking';

export type RecommendedCreator = {
  uid: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  isFollowing: boolean;
  reason: string;
  reasonKind: ReasonKind;
};

type Candidate = {
  uid: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  geo: PublicGeo | null;
  updatedAtMs: number;
  signals: CandidateSignals;
};

type ViewerGraph = {
  zone: PublicGeo | null;
  following: Set<string>;
  blocked: Set<string>;
  candidates: Map<string, Candidate>;
  seed: string;
  at: number;
};

const GRAPH_TTL_MS = 10 * 60 * 1000;
const RECENT_ACTIVITY_MS = 21 * 24 * 60 * 60 * 1000;
const ZONE_POOL = 30;
const GENERAL_POOL = 80;
const MUTUAL_SAMPLE = 6;
const FRIEND_SAMPLE = 4;
const SUBLIST_LIMIT = 30;
const ID_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

const graphs = new Map<string, { at: number; promise: Promise<ViewerGraph> }>();

function shuffled<T>(items: T[]): T[] {
  const list = [...items];
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [list[i], list[j]] = [list[j]!, list[i]!];
  }
  return list;
}

function readUsername(data: Record<string, unknown>): string {
  return String(data.username || '')
    .trim()
    .toLowerCase();
}

function shortName(data: Record<string, unknown>): string {
  const display = String(data.displayName || '').trim();
  return display.split(/\s+/)[0] || readUsername(data);
}

function readMillis(value: unknown): number {
  if (typeof value === 'number') return value;
  const maybe = value as { toMillis?: () => number } | null;
  return typeof maybe?.toMillis === 'function' ? maybe.toMillis() : 0;
}

async function safeDocs(promise: Promise<QuerySnapshot<DocumentData>>) {
  try {
    return (await promise).docs;
  } catch {
    return [];
  }
}

async function generalPool() {
  const users = collection(db, 'users');
  const start = ID_ALPHABET[Math.floor(Math.random() * ID_ALPHABET.length)]!;
  const first = await safeDocs(
    getDocs(query(users, orderBy(documentId()), startAt(start), limit(GENERAL_POOL))),
  );
  if (first.length >= GENERAL_POOL) return first;
  const wrap = await safeDocs(getDocs(query(users, orderBy(documentId()), limit(GENERAL_POOL - first.length))));
  return [...first, ...wrap];
}

async function buildGraph(viewerUid: string | null): Promise<ViewerGraph> {
  const users = collection(db, 'users');
  const sub = (name: string) => collection(db, 'users', viewerUid!, name);
  const [selfSnap, followingDocs, friendDocs, followerDocs, blockedDocs] = await Promise.all([
    viewerUid ? getDoc(doc(db, 'users', viewerUid)).catch(() => null) : Promise.resolve(null),
    viewerUid ? safeDocs(getDocs(sub('following'))) : Promise.resolve([]),
    viewerUid ? safeDocs(getDocs(query(sub('friends'), limit(100)))) : Promise.resolve([]),
    viewerUid ? safeDocs(getDocs(query(sub('followers'), limit(100)))) : Promise.resolve([]),
    viewerUid ? safeDocs(getDocs(sub('blocked'))) : Promise.resolve([]),
  ]);

  let zone = parsePublicGeo((selfSnap?.data() as Record<string, unknown> | undefined)?.geo);
  if (!zone) zone = await detectViewerGeo().catch(() => null);

  const following = new Set(followingDocs.map((item) => item.id));
  const blocked = new Set(blockedDocs.map((item) => item.id));
  const candidates = new Map<string, Candidate>();

  const upsert = (uid: string, data: Record<string, unknown>, fromUserDoc = false): Candidate | null => {
    if (!uid || uid === viewerUid) return null;
    let candidate = candidates.get(uid);
    if (!candidate) {
      const username = readUsername(data);
      if (!username) return null;
      const avatar = typeof data.avatarUrl === 'string' && data.avatarUrl.trim() ? data.avatarUrl.trim() : null;
      candidate = {
        uid,
        username,
        displayName: String(data.displayName || data.username || username),
        avatarUrl: avatar,
        geo: null,
        updatedAtMs: 0,
        signals: emptySignals(),
      };
      candidates.set(uid, candidate);
    }
    if (fromUserDoc) {
      candidate.geo = parsePublicGeo(data.geo);
      candidate.updatedAtMs = readMillis(data.updatedAt) || Number(data.updatedAtMs || 0);
    }
    return candidate;
  };

  for (const item of friendDocs) {
    const candidate = upsert(item.id, item.data());
    if (candidate) candidate.signals.isFriend = true;
  }
  for (const item of followerDocs) {
    const candidate = upsert(item.id, item.data());
    if (candidate) candidate.signals.followsYou = true;
  }

  const zoneQueries: ReturnType<typeof safeDocs>[] = [];
  if (zone?.cityKey) {
    zoneQueries.push(safeDocs(getDocs(query(users, where('geo.cityKey', '==', zone.cityKey), limit(ZONE_POOL)))));
  }
  if (zone?.regionKey) {
    zoneQueries.push(
      safeDocs(getDocs(query(users, where('geo.regionKey', '==', zone.regionKey), limit(ZONE_POOL)))),
    );
  }
  if (zone?.countryCode) {
    zoneQueries.push(
      safeDocs(getDocs(query(users, where('geo.countryCode', '==', zone.countryCode), limit(ZONE_POOL)))),
    );
  }

  const mutualSources = shuffled(followingDocs).slice(0, MUTUAL_SAMPLE);
  const friendSources = shuffled(friendDocs).slice(0, FRIEND_SAMPLE);

  const [zoneDocs, generalDocs, mutualLists, friendLists] = await Promise.all([
    Promise.all(zoneQueries),
    generalPool(),
    Promise.all(
      mutualSources.map((source) =>
        safeDocs(getDocs(query(collection(db, 'users', source.id, 'following'), limit(SUBLIST_LIMIT)))),
      ),
    ),
    Promise.all(
      friendSources.map((source) =>
        safeDocs(getDocs(query(collection(db, 'users', source.id, 'friends'), limit(SUBLIST_LIMIT)))),
      ),
    ),
  ]);

  for (const item of [...zoneDocs.flat(), ...generalDocs]) upsert(item.id, item.data(), true);

  mutualLists.forEach((list, index) => {
    const name = shortName(mutualSources[index]!.data());
    for (const item of list) {
      const candidate = upsert(item.id, item.data());
      if (candidate && !candidate.signals.mutualNames.includes(name)) candidate.signals.mutualNames.push(name);
    }
  });
  friendLists.forEach((list, index) => {
    const name = shortName(friendSources[index]!.data());
    for (const item of list) {
      const candidate = upsert(item.id, item.data());
      if (candidate && !candidate.signals.friendOfFriendNames.includes(name)) {
        candidate.signals.friendOfFriendNames.push(name);
      }
    }
  });

  const now = Date.now();
  for (const candidate of candidates.values()) {
    const geo = candidate.geo;
    const signals = candidate.signals;
    if (zone && geo) {
      signals.sameCity = Boolean(zone.cityKey) && geo.cityKey === zone.cityKey;
      signals.sameRegion = Boolean(zone.regionKey) && geo.regionKey === zone.regionKey;
      signals.sameCountry = geo.countryCode === zone.countryCode;
    }
    signals.hasAvatar = Boolean(candidate.avatarUrl);
    signals.recentlyActive = candidate.updatedAtMs > 0 && now - candidate.updatedAtMs < RECENT_ACTIVITY_MS;
  }

  return {
    zone,
    following,
    blocked,
    candidates,
    seed: Math.random().toString(36).slice(2),
    at: now,
  };
}

function loadGraph(viewerUid: string | null): Promise<ViewerGraph> {
  const key = viewerUid || 'anon';
  const cached = graphs.get(key);
  if (cached && Date.now() - cached.at < GRAPH_TTL_MS) return cached.promise;
  const promise = buildGraph(viewerUid);
  graphs.set(key, { at: Date.now(), promise });
  promise.catch(() => graphs.delete(key));
  return promise;
}

/** Tras seguir desde una tarjeta: que no reaparezca en las demás hasta recalcular. */
export function markCreatorFollowed(viewerUid: string | null | undefined, targetUid: string) {
  const cached = graphs.get(viewerUid || 'anon');
  if (!cached || !targetUid) return;
  void cached.promise.then((graph) => graph.following.add(targetUid)).catch(() => undefined);
}

/**
 * Creadores recomendados con motivo visible («En Medellín», «Lo siguen Ana y 2 más», «Amigo de Carlos»).
 * `context` cambia el énfasis según la tarjeta donde se muestran.
 */
export async function getCreatorRecommendations(
  viewerUid: string | null | undefined,
  excludeUsername: string | null | undefined,
  options: { limit?: number; excludeUids?: Iterable<string>; context?: RecommendationContext } = {},
): Promise<RecommendedCreator[]> {
  const uid = viewerUid ? String(viewerUid) : null;
  const graph = await loadGraph(uid);
  const context = options.context ?? 'sidebar';
  const max = Math.max(1, options.limit ?? 8);
  const exclude = new Set(
    [...(options.excludeUids || []), ...readIgnoredSuggestionUids(uid || undefined)]
      .map((id) => String(id).trim())
      .filter(Boolean),
  );
  const excludeName = String(excludeUsername || '')
    .trim()
    .toLowerCase()
    .replace(/^@/, '');

  const ranked: Array<{ candidate: Candidate; score: number; kind: ReasonKind }> = [];
  for (const candidate of graph.candidates.values()) {
    if (
      exclude.has(candidate.uid) ||
      graph.following.has(candidate.uid) ||
      graph.blocked.has(candidate.uid) ||
      candidate.username === excludeName
    ) {
      continue;
    }
    const { score, kind } = scoreCandidate(candidate.signals, context);
    ranked.push({ candidate, score: score + stableJitter(graph.seed, candidate.uid), kind });
  }

  const zone = graph.zone ? { city: graph.zone.city, region: graph.zone.region, country: graph.zone.country } : null;
  return pickDiverse(ranked, max).map(({ candidate, kind }) => ({
    uid: candidate.uid,
    username: candidate.username,
    displayName: candidate.displayName,
    avatarUrl: candidate.avatarUrl,
    isFollowing: false,
    reason: reasonLabel(kind, candidate.signals, zone),
    reasonKind: kind,
  }));
}
