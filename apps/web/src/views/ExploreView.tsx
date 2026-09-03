import { Link, useSearchParams } from 'react-router-dom';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ReelFeedViewer, type ReelFeedItem } from '../components/feed/ReelFeedViewer';
import { BOOM_CLIP_LABEL } from '../lib/brand';
import {
  flattenBoomClipGroups,
  groupBoomClipsByAuthor,
  type ReelItem,
} from '../lib/boomClipGroups';
import {
  contentTypeLabel,
  isBoomClipPost,
  isPublicationPost,
  resolveContentType,
} from '../lib/contentType';
import { diversifyReelFeed } from '../lib/reelLifecycle';
import { isStoryPost } from '../lib/storyLifecycle';
import { listenRecentPosts, type FsPost } from '../lib/socialFirestore';
import { useAuthStore } from '../store/authStore';

type ExploreTab = 'para_ti' | 'virales' | 'recientes';

const TABS: { id: ExploreTab; label: string }[] = [
  { id: 'para_ti', label: 'Para ti' },
  { id: 'virales', label: 'Virales' },
  { id: 'recientes', label: 'Recientes' },
];

function isExploreVideo(post: FsPost): boolean {
  if (post.type !== 'video' || !post.mediaUrl) return false;
  if (isStoryPost(post)) return false;
  return isBoomClipPost(post) || isPublicationPost(post);
}

function viralScore(post: FsPost): number {
  const likes = Number(post.likes) || 0;
  const ageHours = Math.max(
    1,
    (Date.now() - Date.parse(post.createdAt || '')) / (1000 * 60 * 60) || 24,
  );
  // Engagement disponible en front (likes) + ligera recencia
  return likes * 10 + 24 / ageHours;
}

function toReelItem(post: FsPost): ReelFeedItem {
  const type = resolveContentType(post);
  return {
    id: post.id,
    username: post.username,
    authorUid: post.authorUid,
    caption: post.caption || '',
    mediaUrl: post.mediaUrl || '',
    mediaType: 'video',
    contentBadge: type === 'boom_clip' ? BOOM_CLIP_LABEL : contentTypeLabel(type),
  };
}

function toGroupedBoomClipReels(posts: FsPost[], ownUid?: string | null): ReelFeedItem[] {
  const boomPosts = posts.filter(isBoomClipPost);
  const reelItems: ReelItem[] = boomPosts.map((post) => ({
    ...toReelItem(post),
    shared: true,
    createdAt: post.createdAt,
    durationSec: post.durationSec,
  }));
  const groups = groupBoomClipsByAuthor(reelItems, ownUid);
  return flattenBoomClipGroups(groups);
}

function dedupeById(posts: FsPost[]): FsPost[] {
  const map = new Map<string, FsPost>();
  for (const post of posts) map.set(post.id, post);
  return [...map.values()];
}

function sortForTab(posts: FsPost[], tab: ExploreTab): FsPost[] {
  const list = dedupeById(posts.filter(isExploreVideo));
  if (tab === 'virales') {
    return [...list].sort((a, b) => viralScore(b) - viralScore(a));
  }
  if (tab === 'recientes') {
    return [...list].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }
  // Para ti: mezcla diversificada por autor (descubrimiento)
  const recent = [...list].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  const viral = [...list].sort((a, b) => viralScore(b) - viralScore(a));
  const mixed: FsPost[] = [];
  const seen = new Set<string>();
  const push = (post: FsPost | undefined) => {
    if (!post || seen.has(post.id)) return;
    seen.add(post.id);
    mixed.push(post);
  };
  for (let i = 0; i < Math.max(recent.length, viral.length); i += 1) {
    push(viral[i]);
    push(recent[i]);
  }
  return diversifyReelFeed(mixed, 2, 80);
}

export function ExploreView() {
  const profile = useAuthStore((state) => state.profile);
  const ready = useAuthStore((state) => state.ready);
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab') as ExploreTab | null;
  const videoParam = searchParams.get('v');
  const tipoParam = searchParams.get('tipo');
  const boomClipOnly = tipoParam === 'boom_clip';

  const [tab, setTab] = useState<ExploreTab>(
    tabParam === 'virales' || tabParam === 'recientes' || tabParam === 'para_ti'
      ? tabParam
      : 'para_ti',
  );
  const [rawPosts, setRawPosts] = useState<FsPost[]>([]);
  const [deviceLandscape, setDeviceLandscape] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(orientation: landscape)');
    const sync = () => setDeviceLandscape(mq.matches && window.innerWidth < 1024);
    sync();
    mq.addEventListener('change', sync);
    window.addEventListener('resize', sync);
    return () => {
      mq.removeEventListener('change', sync);
      window.removeEventListener('resize', sync);
    };
  }, []);

  useEffect(() => {
    if (!profile) {
      setRawPosts([]);
      return;
    }
    return listenRecentPosts(setRawPosts);
  }, [profile?.firebaseUid]);

  const reels = useMemo(() => {
    if (boomClipOnly) {
      return toGroupedBoomClipReels(rawPosts, profile?.firebaseUid);
    }
    return sortForTab(rawPosts, tab).map(toReelItem);
  }, [rawPosts, tab, boomClipOnly, profile?.firebaseUid]);

  const startIndex = useMemo(() => {
    if (!videoParam || reels.length === 0) return 0;
    const idx = reels.findIndex((r) => r.id === videoParam);
    return idx >= 0 ? idx : 0;
  }, [videoParam, reels]);

  const onIndexChange = useCallback(
    (index: number) => {
      const reel = reels[index];
      if (!reel) return;
      const next = new URLSearchParams(searchParams);
      next.set('tab', tab);
      next.set('v', reel.id);
      setSearchParams(next, { replace: true });
    },
    [reels, searchParams, setSearchParams, tab],
  );

  function selectTab(next: ExploreTab) {
    setTab(next);
    const params = new URLSearchParams(searchParams);
    params.set('tab', next);
    params.delete('v');
    setSearchParams(params, { replace: true });
  }

  if (!ready) {
    return (
      <div className="grid h-full place-items-center bg-black text-sm text-zinc-500">Cargando…</div>
    );
  }

  if (!profile) {
    return (
      <div className="grid h-full place-items-center bg-zinc-950 px-4 text-center text-sm text-zinc-400">
        <p>
          <Link to="/login" className="text-cyan-400 underline">
            Inicia sesión
          </Link>{' '}
          para descubrir videos en Explorar.
        </p>
      </div>
    );
  }

  return (
    <div className="lb-explore-view relative flex h-full min-h-0 w-full flex-col overflow-hidden bg-black">
      {!deviceLandscape ? (
        <div className="pointer-events-none absolute inset-x-0 top-0 z-30 flex justify-center pt-[max(0.5rem,var(--lb-safe-top))] lg:pt-3">
          <div className="pointer-events-auto flex max-w-full items-center gap-1 overflow-x-auto rounded-full border border-white/10 bg-black/55 px-1.5 py-1 backdrop-blur-md [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {TABS.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => selectTab(item.id)}
                className={`shrink-0 rounded-full px-3.5 py-1.5 text-[12px] font-bold transition ${
                  tab === item.id
                    ? 'bg-white text-zinc-950'
                    : 'text-white/75 hover:bg-white/10 hover:text-white'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {reels.length === 0 ? (
        <div className="grid h-full place-items-center px-6 text-center">
          <div>
            <p className="text-sm text-zinc-400">Aún no hay videos públicos para descubrir.</p>
            <Link
              to="/crear"
              className="mt-4 inline-flex min-h-10 items-center rounded-full bg-gradient-to-r from-fuchsia-500 to-cyan-400 px-5 text-sm font-bold text-white"
            >
              Subir video
            </Link>
          </div>
        </div>
      ) : (
        <ReelFeedViewer
          key={tab}
          reels={reels}
          initialIndex={startIndex}
          embedded
          immersiveLandscapeLayout
          onIndexChange={onIndexChange}
        />
      )}
    </div>
  );
}
