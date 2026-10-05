/**
 * Ranking de creadores sugeridos (lógica pura, sin Firestore).
 * Señales sociales (amigos, te sigue, seguidos en común, amigos de amigos)
 * + zona (ciudad › departamento › país) + calidad del perfil.
 */

export type RecommendationContext = 'sidebar' | 'featured' | 'social';

export type ReasonKind =
  | 'friend'
  | 'followsYou'
  | 'mutual'
  | 'friendOfFriend'
  | 'city'
  | 'region'
  | 'country'
  | 'suggested';

export type CandidateSignals = {
  isFriend: boolean;
  followsYou: boolean;
  mutualNames: string[];
  friendOfFriendNames: string[];
  sameCity: boolean;
  sameRegion: boolean;
  sameCountry: boolean;
  hasAvatar: boolean;
  recentlyActive: boolean;
};

export type ViewerZone = { city: string; region: string; country: string } | null;

const SOCIAL_KINDS = new Set<ReasonKind>(['friend', 'followsYou', 'mutual', 'friendOfFriend']);
const ZONE_KINDS = new Set<ReasonKind>(['city', 'region', 'country']);

const CONTEXT_WEIGHTS: Record<RecommendationContext, { social: number; zone: number }> = {
  sidebar: { social: 1, zone: 1 },
  featured: { social: 0.9, zone: 1.35 },
  social: { social: 1.45, zone: 0.6 },
};

export function emptySignals(): CandidateSignals {
  return {
    isFriend: false,
    followsYou: false,
    mutualNames: [],
    friendOfFriendNames: [],
    sameCity: false,
    sameRegion: false,
    sameCountry: false,
    hasAvatar: false,
    recentlyActive: false,
  };
}

export function scoreCandidate(
  signals: CandidateSignals,
  context: RecommendationContext,
): { score: number; kind: ReasonKind } {
  const weights = CONTEXT_WEIGHTS[context];
  const parts: Array<[ReasonKind, number]> = [];
  if (signals.isFriend) parts.push(['friend', 60 * weights.social]);
  if (signals.followsYou) parts.push(['followsYou', 45 * weights.social]);
  if (signals.mutualNames.length) {
    parts.push(['mutual', 18 * Math.min(signals.mutualNames.length, 5) * weights.social]);
  }
  if (signals.friendOfFriendNames.length) {
    parts.push(['friendOfFriend', 14 * Math.min(signals.friendOfFriendNames.length, 5) * weights.social]);
  }
  if (signals.sameCity) parts.push(['city', 30 * weights.zone]);
  else if (signals.sameRegion) parts.push(['region', 18 * weights.zone]);
  else if (signals.sameCountry) parts.push(['country', 8 * weights.zone]);

  let score = parts.reduce((sum, [, value]) => sum + value, 0);
  if (signals.hasAvatar) score += 4;
  if (signals.recentlyActive) score += 6;

  let kind: ReasonKind = 'suggested';
  let best = 0;
  for (const [partKind, value] of parts) {
    if (value > best) {
      best = value;
      kind = partKind;
    }
  }
  return { score, kind };
}

function namesLabel(prefixOne: string, prefixMany: string, names: string[]): string {
  const first = names[0] || '';
  if (names.length <= 1) return `${prefixOne} ${first}`.trim();
  return `${prefixMany} ${first} y ${names.length - 1} más`;
}

export function reasonLabel(kind: ReasonKind, signals: CandidateSignals, zone: ViewerZone): string {
  switch (kind) {
    case 'friend':
      return 'Es tu amigo';
    case 'followsYou':
      return 'Te sigue';
    case 'mutual':
      return namesLabel('Lo sigue', 'Lo siguen', signals.mutualNames);
    case 'friendOfFriend':
      return namesLabel('Amigo de', 'Amigo de', signals.friendOfFriendNames);
    case 'city':
      return zone?.city ? `En ${zone.city}` : 'Cerca de ti';
    case 'region':
      return zone?.region ? `En ${zone.region}` : 'En tu departamento';
    case 'country':
      return zone?.country ? `En ${zone.country}` : 'En tu país';
    default:
      return 'Sugerido para ti';
  }
}

/** Pseudoaleatorio estable por (semilla, uid) para variar sin reordenar en cada render. */
export function stableJitter(seed: string, uid: string, max = 5): number {
  let hash = 2166136261;
  const text = `${seed}:${uid}`;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return ((hash >>> 0) % 1000) / 1000 * max;
}

/**
 * Toma los mejores sin que un mismo motivo acapare la tarjeta
 * (ej. no 5 «En Medellín» seguidos si hay amigos en común).
 */
export function pickDiverse<T extends { score: number; kind: ReasonKind }>(ranked: T[], limit: number): T[] {
  const sorted = [...ranked].sort((a, b) => b.score - a.score);
  if (limit <= 2) return sorted.slice(0, limit);
  const cap = Math.max(1, Math.ceil(limit / 2));
  const groupOf = (kind: ReasonKind) =>
    SOCIAL_KINDS.has(kind) ? kind : ZONE_KINDS.has(kind) ? 'zone' : 'suggested';
  const counts = new Map<string, number>();
  const picked: T[] = [];
  const skipped: T[] = [];
  for (const item of sorted) {
    if (picked.length >= limit) break;
    const group = groupOf(item.kind);
    const used = counts.get(group) || 0;
    if (used >= cap) {
      skipped.push(item);
      continue;
    }
    counts.set(group, used + 1);
    picked.push(item);
  }
  for (const item of skipped) {
    if (picked.length >= limit) break;
    picked.push(item);
  }
  return picked.sort((a, b) => b.score - a.score);
}
