import type { ReelFeedItem } from '../components/feed/ReelFeedViewer';

export type ReelItem = ReelFeedItem & { shared: boolean; createdAt: string; durationSec?: number };

export type BoomClipGroup = {
  authorUid: string;
  username: string;
  authorAvatarUrl: string | null;
  clips: ReelItem[];
};

/** Agrupa Boom Clips por creador; clips ordenados cronológicamente para secuencia en viewer. */
export function groupBoomClipsByAuthor(reels: ReelItem[], ownUid?: string | null): BoomClipGroup[] {
  const map = new Map<string, BoomClipGroup>();
  for (const reel of reels) {
    let group = map.get(reel.authorUid);
    if (!group) {
      group = {
        authorUid: reel.authorUid,
        username: reel.username,
        authorAvatarUrl: reel.authorAvatarUrl ?? null,
        clips: [],
      };
      map.set(reel.authorUid, group);
    }
    group.clips.push(reel);
    if (!group.authorAvatarUrl && reel.authorAvatarUrl) {
      group.authorAvatarUrl = reel.authorAvatarUrl;
    }
  }

  const groups = [...map.values()].map((group) => ({
    ...group,
    clips: [...group.clips].sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
  }));

  groups.sort((a, b) => {
    if (ownUid) {
      if (a.authorUid === ownUid && b.authorUid !== ownUid) return -1;
      if (b.authorUid === ownUid && a.authorUid !== ownUid) return 1;
    }
    const aLatest = a.clips[a.clips.length - 1]?.createdAt ?? '';
    const bLatest = b.clips[b.clips.length - 1]?.createdAt ?? '';
    return bLatest.localeCompare(aLatest);
  });

  return groups;
}

/** Ordena Boom Clips por creador (secuencia interna cronológica) para Explorar. */
export function flattenBoomClipGroups(groups: BoomClipGroup[]): ReelItem[] {
  const ordered: ReelItem[] = [];
  for (const group of groups) {
    ordered.push(...group.clips);
  }
  return ordered;
}
