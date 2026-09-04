import { Link, useSearchParams } from 'react-router-dom';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ReelFeedViewer, type ReelFeedItem } from '../components/feed/ReelFeedViewer';
import { BOOM_CLIP_LABEL } from '../lib/brand';
import {
  contentTypeLabel,
  isBoomClipPost,
  isPublicationPost,
  resolveContentType,
} from '../lib/contentType';
import {
  markExploreSessionSeen,
  readExploreHistory,
  readExploreSessionSeen,
  recordExploreWatch,
  type ExploreHistory,
} from '../lib/exploreHistory';
import {
  exploreWatchTags,
  mergeExploreQueue,
  preferUnseenFirst,
  rankExploreForYou,
  rankExploreRecent,
  rankExploreViral,
  skipSameAsCurrent,
  type ExploreTabId,
} from '../lib/exploreRanking';
import { isStoryPost } from '../lib/storyLifecycle';
import { listenExploreVideoPool, listenFollowing, type FsPost } from '../lib/socialFirestore';
import { useAuthStore } from '../store/authStore';

type ExploreTab = ExploreTabId;

const TABS: { id: ExploreTab; label: string }[] = [
  { id: 'para_ti', label: 'Para ti' },
  { id: 'virales', label: 'Virales' },
  { id: 'recientes', label: 'Recientes' },
];

const EMPTY_QUEUES: Record<ExploreTab, string[]> = {
  para_ti: [],
  virales: [],
  recientes: [],
};

const EMPTY_INDICES: Record<ExploreTab, number> = {
  para_ti: 0,
  virales: 0,
  recientes: 0,
};

function isExploreVideo(post: FsPost): boolean {
  if (post.type !== 'video' || !post.mediaUrl) return false;
  if (isStoryPost(post)) return false;
  return isBoomClipPost(post) || isPublicationPost(post);
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
    durationSec: post.durationSec,
    thumbUrl: post.thumbUrl,
    sharedFromPostId: post.sharedFromPostId,
    sharedFromAuthorUid: post.sharedFromAuthorUid,
    sharedFromUsername: post.sharedFromUsername,
  };
}

function parseTab(value: string | null): ExploreTab {
  if (value === 'virales' || value === 'recientes' || value === 'para_ti') return value;
  return 'para_ti';
}

export function ExploreView() {
  const profile = useAuthStore((state) => state.profile);
  const ready = useAuthStore((state) => state.ready);
  const uid = profile?.firebaseUid || '';
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = parseTab(searchParams.get('tab'));
  const videoParam = searchParams.get('v');
  const tipoParam = searchParams.get('tipo');
  const boomClipOnly = tipoParam === 'boom_clip';

  const [rawPosts, setRawPosts] = useState<FsPost[]>([]);
  const [poolReady, setPoolReady] = useState(false);
  const [followingUids, setFollowingUids] = useState<Set<string>>(new Set());
  const [queues, setQueues] = useState<Record<ExploreTab, string[]>>(EMPTY_QUEUES);
  const [indices, setIndices] = useState<Record<ExploreTab, number>>(EMPTY_INDICES);
  const [history, setHistory] = useState<ExploreHistory>({});
  const [sessionSeen, setSessionSeen] = useState<Set<string>>(new Set());
  const [deviceLandscape, setDeviceLandscape] = useState(false);

  const saltRef = useRef(Date.now());
  const queuesRef = useRef(queues);
  const indicesRef = useRef(indices);
  const historyRef = useRef(history);
  const sessionSeenRef = useRef(sessionSeen);
  const dwellRef = useRef<{ id: string; at: number } | null>(null);
  const postsByIdRef = useRef<Map<string, FsPost>>(new Map());
  const appliedStartRef = useRef(false);
  const visitedRef = useRef<Record<ExploreTab, boolean>>({
    para_ti: false,
    virales: false,
    recientes: false,
  });

  queuesRef.current = queues;
  indicesRef.current = indices;
  historyRef.current = history;
  sessionSeenRef.current = sessionSeen;

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
    if (!uid) {
      setRawPosts([]);
      setPoolReady(false);
      setFollowingUids(new Set());
      setQueues(EMPTY_QUEUES);
      setIndices(EMPTY_INDICES);
      setHistory({});
      setSessionSeen(new Set());
      appliedStartRef.current = false;
      visitedRef.current = { para_ti: false, virales: false, recientes: false };
      return;
    }
    setHistory(readExploreHistory(uid));
    setSessionSeen(readExploreSessionSeen(uid));
    appliedStartRef.current = false;
    visitedRef.current = { para_ti: false, virales: false, recientes: false };
    const stopPool = listenExploreVideoPool((posts) => {
      setRawPosts(posts);
      setPoolReady(true);
    });
    const stopFollowing = listenFollowing(uid, (users) => {
      setFollowingUids(new Set(users.map((user) => user.uid).filter(Boolean)));
    });
    return () => {
      stopPool();
      stopFollowing();
    };
  }, [uid]);

  const eligible = useMemo(() => {
    const videos = rawPosts.filter(isExploreVideo);
    if (!boomClipOnly) return videos;
    const clips = videos.filter(isBoomClipPost);
    return clips.length > 0 ? clips : videos;
  }, [rawPosts, boomClipOnly]);

  const postsById = useMemo(() => {
    const map = new Map<string, FsPost>();
    for (const post of eligible) map.set(post.id, post);
    postsByIdRef.current = map;
    return map;
  }, [eligible]);

  const rankedIds = useMemo(() => {
    const viewer = { uid, followingUids };
    const salt = saltRef.current;
    const forYou = preferUnseenFirst(
      rankExploreForYou(eligible, viewer, history, salt),
      sessionSeen,
    ).map((post) => post.id);
    const viral = preferUnseenFirst(rankExploreViral(eligible), sessionSeen).map((post) => post.id);
    const recent = rankExploreRecent(eligible).map((post) => post.id);
    const fallback = eligible
      .slice()
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
      .map((post) => post.id);
    return {
      para_ti: forYou.length ? forYou : fallback,
      virales: viral.length ? viral : fallback,
      recientes: recent.length ? recent : fallback,
    };
  }, [eligible, uid, followingUids, history, sessionSeen]);

  useEffect(() => {
    const prevQueues = queuesRef.current;
    const prevIndices = indicesRef.current;
    const viewingId = prevQueues[tab][prevIndices[tab]] || null;
    const startId =
      !appliedStartRef.current && videoParam && rankedIds[tab].includes(videoParam) ? videoParam : null;
    if (startId) appliedStartRef.current = true;

    const nextQueues: Record<ExploreTab, string[]> = { ...prevQueues };
    const nextIndices: Record<ExploreTab, number> = { ...prevIndices };

    (Object.keys(rankedIds) as ExploreTab[]).forEach((id) => {
      const ranked = rankedIds[id];
      if (!visitedRef.current[id]) {
        const seed = id === tab && startId ? startId : null;
        const seedIndex = seed ? Math.max(0, ranked.indexOf(seed)) : 0;
        const avoid = id === tab ? null : viewingId;
        nextQueues[id] = ranked;
        nextIndices[id] = skipSameAsCurrent(ranked, seedIndex, avoid);
        return;
      }
      const currentId = (id === tab && startId) || prevQueues[id][prevIndices[id]] || null;
      const merged = mergeExploreQueue(
        prevQueues[id],
        ranked,
        currentId,
        id === 'recientes' ? 'recientes' : 'append',
      );
      nextQueues[id] = merged.ids;
      nextIndices[id] = merged.index;
    });

    const queuesChanged = (Object.keys(rankedIds) as ExploreTab[]).some(
      (id) => nextQueues[id].join(' ') !== prevQueues[id].join(' '),
    );
    const indicesChanged = (Object.keys(rankedIds) as ExploreTab[]).some(
      (id) => nextIndices[id] !== prevIndices[id],
    );
    if (!queuesChanged && !indicesChanged) return;
    queuesRef.current = nextQueues;
    indicesRef.current = nextIndices;
    if (queuesChanged) setQueues(nextQueues);
    if (indicesChanged) setIndices(nextIndices);
  }, [rankedIds, tab, videoParam]);

  const activeId = queues[tab][indices[tab]] || null;

  const reels = useMemo(() => {
    const ids = queues[tab];
    const items: ReelFeedItem[] = [];
    for (const id of ids) {
      const post = postsById.get(id);
      if (post) items.push(toReelItem(post));
    }
    return items;
  }, [queues, tab, postsById]);

  const flushDwell = useCallback(
    (postId: string | null, at = Date.now()) => {
      if (!uid || !postId || !dwellRef.current || dwellRef.current.id !== postId) return;
      const dwellMs = at - dwellRef.current.at;
      const post = postsByIdRef.current.get(postId);
      const nextHistory = recordExploreWatch(
        uid,
        postId,
        {
          dwellMs,
          durationSec: post?.durationSec,
          authorUid: post?.authorUid || '',
          tags: exploreWatchTags(post?.caption),
        },
        historyRef.current,
      );
      historyRef.current = nextHistory;
      setHistory(nextHistory);
      dwellRef.current = null;
    },
    [uid],
  );

  const onIndexChange = useCallback(
    (index: number) => {
      const currentTab = parseTab(searchParams.get('tab'));
      const id = queuesRef.current[currentTab][index];
      if (!id) return;

      const prev = dwellRef.current;
      if (prev && prev.id && prev.id !== id) flushDwell(prev.id);

      dwellRef.current = { id, at: Date.now() };
      visitedRef.current[currentTab] = true;
      indicesRef.current = { ...indicesRef.current, [currentTab]: index };
      setIndices((state) => (state[currentTab] === index ? state : { ...state, [currentTab]: index }));

      const nextSeen = markExploreSessionSeen(uid, id, sessionSeenRef.current);
      sessionSeenRef.current = nextSeen;
      setSessionSeen(nextSeen);

      const next = new URLSearchParams(searchParams);
      next.set('tab', currentTab);
      next.set('v', id);
      setSearchParams(next, { replace: true });
    },
    [flushDwell, searchParams, setSearchParams, uid],
  );

  function selectTab(next: ExploreTab) {
    if (next === tab) return;
    const avoidId = queuesRef.current[tab][indicesRef.current[tab]] || activeId;
    flushDwell(avoidId);
    visitedRef.current[next] = true;
    const nextIndex = skipSameAsCurrent(queuesRef.current[next], indicesRef.current[next], avoidId);
    indicesRef.current = { ...indicesRef.current, [next]: nextIndex };
    setIndices((state) => ({ ...state, [next]: nextIndex }));
    const nextId = queuesRef.current[next][nextIndex];
    const params = new URLSearchParams(searchParams);
    params.set('tab', next);
    if (nextId) params.set('v', nextId);
    else params.delete('v');
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

  const showEmpty = poolReady && eligible.length === 0;
  const showLoading = !poolReady || (!showEmpty && reels.length === 0);

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

      {showEmpty ? (
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
      ) : showLoading ? (
        <div className="grid h-full place-items-center bg-black text-sm text-zinc-500">Cargando…</div>
      ) : (
        <ReelFeedViewer
          key={tab}
          reels={reels}
          initialIndex={Math.min(indices[tab], Math.max(reels.length - 1, 0))}
          activeId={activeId}
          embedded
          immersiveLandscapeLayout
          onIndexChange={onIndexChange}
        />
      )}
    </div>
  );
}
