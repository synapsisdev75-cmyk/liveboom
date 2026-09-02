import { Play, Plus } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { BOOM_CLIP_LABEL, FLASH_BOOM_LABEL } from '../../lib/brand';
import { groupBoomClipsByAuthor, type BoomClipGroup, type ReelItem } from '../../lib/boomClipGroups';
import { formatClipDuration, MAX_CLIP_DURATION_SECONDS } from '../../lib/contentType';
import { seedAvatarCache } from '../../hooks/useAuthorAvatar';
import { fetchFirestoreProfile } from '../../lib/profileFirestore';
import { listenActiveReels, listenActiveStories, type FsPost } from '../../lib/socialFirestore';
import { useAuthStore } from '../../store/authStore';
import { useUiStore } from '../../store/uiStore';
import { CreatePostModal } from '../social/CreatePostModal';
import { UserAvatar } from '../profile/UserAvatar';
import { AutoplayMuteVideo } from './AutoplayMuteVideo';
import { ReelFeedViewer } from './ReelFeedViewer';

export type { ReelItem };

function toReel(post: FsPost, avatarUrl?: string | null): ReelItem {
  if (avatarUrl) seedAvatarCache(post.authorUid, avatarUrl);
  return {
    id: post.id,
    username: post.username,
    authorUid: post.authorUid,
    caption: post.caption || 'Video',
    mediaUrl: post.mediaUrl || '',
    mediaType: 'video',
    shared: true,
    createdAt: post.createdAt,
    durationSec: post.durationSec,
    authorAvatarUrl: avatarUrl ?? null,
    contentBadge: BOOM_CLIP_LABEL,
  };
}

function ClipSegmentBar({ count }: { count: number }) {
  if (count <= 1) return null;
  return (
    <div className="absolute inset-x-2 top-2 z-[9] flex gap-0.5">
      {Array.from({ length: Math.min(count, 8) }).map((_, i) => (
        <span
          key={i}
          className={`h-[3px] min-w-0 flex-1 rounded-full ${
            i === count - 1 ? 'bg-fuchsia-400' : 'bg-white/45'
          }`}
        />
      ))}
    </div>
  );
}

function AvatarPlusBadge({
  onPublish,
  clipCount,
  isOwn,
}: {
  onPublish?: () => void;
  clipCount: number;
  isOwn: boolean;
}) {
  if (isOwn) {
    return (
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onPublish?.();
        }}
        className="absolute -bottom-0.5 -right-0.5 z-20 grid h-6 w-6 place-items-center rounded-full bg-gradient-to-br from-fuchsia-500 to-cyan-400 text-white ring-2 ring-zinc-950 transition hover:scale-105"
        aria-label="Publicar Boom Clip"
        title="+ Clip"
      >
        <Plus size={13} strokeWidth={3} />
      </button>
    );
  }
  if (clipCount > 1) {
    return (
      <span className="absolute -bottom-0.5 -right-0.5 z-20 grid h-5 min-w-5 place-items-center rounded-full bg-fuchsia-600 px-1 text-[9px] font-black tabular-nums text-white ring-2 ring-zinc-950">
        {clipCount}
      </span>
    );
  }
  return null;
}

function BoomClipGroupThumb({
  group,
  isOwn,
  onOpen,
  onPublish,
}: {
  group: BoomClipGroup;
  isOwn?: boolean;
  onOpen: () => void;
  onPublish?: () => void;
}) {
  const latest = group.clips[group.clips.length - 1];
  if (!latest) return null;

  const durationLabel =
    latest.durationSec && latest.durationSec > 0 ? formatClipDuration(latest.durationSec) : null;

  return (
    <button
      type="button"
      onClick={onOpen}
      className="lb-card group relative aspect-[9/16] w-[7.25rem] shrink-0 overflow-hidden rounded-2xl bg-zinc-950 text-left ring-1 ring-fuchsia-400/25 transition duration-300 hover:ring-fuchsia-300/50 sm:w-[8rem]"
    >
      <AutoplayMuteVideo
        src={latest.mediaUrl}
        className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.04]"
      />
      <span className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/80 via-black/15 to-black/25" />

      <ClipSegmentBar count={group.clips.length} />

      <span className="absolute left-1/2 top-1/2 z-10 grid h-9 w-9 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-black/55 text-white ring-1 ring-white/30 backdrop-blur-sm">
        <Play size={16} fill="currentColor" className="ml-0.5" />
      </span>

      {durationLabel ? (
        <span className="absolute right-1.5 top-1.5 z-10 rounded-md bg-black/70 px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-white ring-1 ring-white/15">
          {durationLabel}
        </span>
      ) : (
        <span className="absolute right-1.5 top-1.5 z-10 rounded-md bg-fuchsia-500/80 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white">
          Clip
        </span>
      )}

      <span className="absolute left-2 top-5 z-10">
        <span className="relative inline-block">
          <UserAvatar
            uid={group.authorUid}
            src={group.authorAvatarUrl}
            username={group.username}
            size={32}
            ringClassName="ring-2 ring-fuchsia-400/60 ring-offset-1 ring-offset-black/40"
          />
          <AvatarPlusBadge
            isOwn={Boolean(isOwn)}
            clipCount={group.clips.length}
            onPublish={onPublish}
          />
        </span>
      </span>

      <div className="absolute inset-x-0 bottom-0 p-2">
        <p className="line-clamp-1 text-[10px] font-semibold text-white/95">{latest.caption}</p>
        <p className="truncate text-[9px] text-fuchsia-200/90">
          {isOwn ? 'Tu Boom Clip' : `@${group.username}`}
        </p>
      </div>
    </button>
  );
}

function OwnClipPublishCard({
  avatarUrl,
  handle,
  uid,
  hasClips,
  group,
  onOpenOwn,
  onPublish,
}: {
  avatarUrl: string | null;
  handle: string;
  uid: string;
  hasClips: boolean;
  group: BoomClipGroup | null;
  onOpenOwn: () => void;
  onPublish: () => void;
}) {
  if (hasClips && group) {
    return (
      <BoomClipGroupThumb
        group={group}
        isOwn
        onOpen={onOpenOwn}
        onPublish={onPublish}
      />
    );
  }

  return (
    <button
      type="button"
      onClick={onPublish}
      className="lb-card group relative aspect-[9/16] w-[7.25rem] shrink-0 overflow-hidden rounded-2xl bg-zinc-900 text-left ring-1 ring-white/15 transition duration-300 hover:ring-cyan-400/35 sm:w-[8rem]"
    >
      <span className="absolute inset-0 bg-gradient-to-br from-zinc-800 via-zinc-900 to-zinc-950" />
      <span className="absolute left-2 top-5 z-10">
        <span className="relative inline-block">
          <UserAvatar
            uid={uid}
            src={avatarUrl}
            username={handle}
            size={32}
            ringClassName="ring-2 ring-cyan-400/50 ring-offset-1 ring-offset-black/40"
          />
          <span className="absolute -bottom-0.5 -right-0.5 z-20 grid h-6 w-6 place-items-center rounded-full bg-gradient-to-br from-fuchsia-500 to-cyan-400 text-white ring-2 ring-zinc-950">
            <Plus size={13} strokeWidth={3} />
          </span>
        </span>
      </span>
      <div className="absolute inset-x-0 bottom-0 p-2">
        <p className="text-[10px] font-semibold text-cyan-300">Tu Boom Clip</p>
        <p className="text-[9px] text-zinc-500">+ Clip</p>
      </div>
    </button>
  );
}

/** Fila horizontal de Boom Clip (videos cortos) agrupados por creador. */
export function ReelsRow({
  title,
  subtitle,
  mode = 'reels',
}: {
  title?: string;
  subtitle?: string;
  /** `reels` = Boom Clip; `stories` = Flash Boom 24 h (legacy; prefer FlashBoomRow). */
  mode?: 'reels' | 'stories';
}) {
  const sectionTitle = title ?? (mode === 'stories' ? FLASH_BOOM_LABEL : BOOM_CLIP_LABEL);
  const sectionSubtitle =
    subtitle ??
    (mode === 'reels' ? `Videos cortos de hasta ${MAX_CLIP_DURATION_SECONDS} segundos` : undefined);
  const profile = useAuthStore((state) => state.profile);
  const setToast = useUiStore((state) => state.setToast);
  const [reels, setReels] = useState<ReelItem[]>([]);
  const [viewerReels, setViewerReels] = useState<ReelItem[] | null>(null);
  const [viewerIndex, setViewerIndex] = useState(0);
  const [viewerStoryMode, setViewerStoryMode] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const showUpload = mode === 'reels' && Boolean(profile);

  useEffect(() => {
    if (!profile) {
      setReels([]);
      return;
    }
    const listen = mode === 'stories' ? listenActiveStories : listenActiveReels;
    return listen((posts) => {
      setReels((prev) => {
        const prevById = new Map(prev.map((r) => [r.id, r]));
        return posts.map((post) => {
          const existing = prevById.get(post.id);
          return toReel(post, existing?.authorAvatarUrl);
        });
      });
    });
  }, [profile?.firebaseUid, mode]);

  const authorUidsKey = useMemo(
    () => [...new Set(reels.map((r) => r.authorUid).filter(Boolean))].sort().join('|'),
    [reels],
  );

  useEffect(() => {
    if (!authorUidsKey) return;
    const uids = authorUidsKey.split('|').filter(Boolean);
    if (uids.length === 0) return;

    let cancelled = false;
    void Promise.all(
      uids.map(async (uid) => {
        const author = await fetchFirestoreProfile(uid);
        const url = author?.avatarUrl ?? null;
        if (url) seedAvatarCache(uid, url);
        return [uid, url] as const;
      }),
    ).then((pairs) => {
      if (cancelled) return;
      const map = Object.fromEntries(pairs);
      setReels((prev) =>
        prev.map((reel) => {
          const loaded = map[reel.authorUid];
          if (!loaded) return reel;
          if (reel.authorAvatarUrl === loaded) return reel;
          return { ...reel, authorAvatarUrl: loaded };
        }),
      );
    });

    return () => {
      cancelled = true;
    };
  }, [authorUidsKey]);

  const clipGroups = useMemo(
    () => (mode === 'reels' ? groupBoomClipsByAuthor(reels, profile?.firebaseUid) : []),
    [reels, mode, profile?.firebaseUid],
  );

  const ownGroup = useMemo(
    () => (profile ? clipGroups.find((g) => g.authorUid === profile.firebaseUid) ?? null : null),
    [clipGroups, profile?.firebaseUid],
  );

  const otherGroups = useMemo(
    () => (profile ? clipGroups.filter((g) => g.authorUid !== profile.firebaseUid) : clipGroups),
    [clipGroups, profile?.firebaseUid],
  );

  function openAuthorClips(authorUid: string, storyMode: boolean) {
    const group = clipGroups.find((g) => g.authorUid === authorUid);
    if (!group?.clips.length) return;
    setViewerReels(group.clips);
    setViewerIndex(0);
    setViewerStoryMode(storyMode);
  }

  const hasAnyClips = clipGroups.length > 0;
  const legacyFlat = mode === 'stories';

  return (
    <section className="w-full">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-sm font-bold uppercase tracking-[0.12em] text-white">{sectionTitle}</h2>
          {sectionSubtitle ? <p className="mt-0.5 text-[10px] text-zinc-500">{sectionSubtitle}</p> : null}
        </div>
        <div className="flex shrink-0 items-center gap-3">
          {showUpload ? (
            <button
              type="button"
              onClick={() => setCreateOpen(true)}
              className="shrink-0 text-[11px] font-semibold text-cyan-400 hover:underline"
            >
              + Clip
            </button>
          ) : null}
          <Link
            to={mode === 'reels' ? '/explorar?tipo=boom_clip' : '/explorar'}
            className="text-[12px] font-semibold text-[#22d3ee] transition hover:text-cyan-200"
          >
            Ver todos &gt;
          </Link>
        </div>
      </div>

      {!profile ? (
        <p className="rounded-2xl border border-dashed border-white/10 px-4 py-8 text-center text-sm text-zinc-500">
          <Link to="/login" className="text-cyan-400 underline">
            Inicia sesión
          </Link>{' '}
          para ver {mode === 'stories' ? FLASH_BOOM_LABEL : BOOM_CLIP_LABEL}.
        </p>
      ) : !hasAnyClips && !legacyFlat ? (
        <div className="rounded-2xl border border-dashed border-white/10 px-4 py-8 text-center">
          <p className="text-sm text-zinc-500">
            Aún no hay {BOOM_CLIP_LABEL}. Sé el primero en publicar uno.
          </p>
          {showUpload ? (
            <button
              type="button"
              onClick={() => setCreateOpen(true)}
              className="mt-4 text-sm font-semibold text-cyan-400 hover:underline"
            >
              + Clip
            </button>
          ) : null}
        </div>
      ) : legacyFlat ? (
        reels.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-white/10 px-4 py-8 text-center">
            <p className="text-sm text-zinc-500">
              Aún no hay {FLASH_BOOM_LABEL}. Publica uno en{' '}
              <Link to="/crear" className="text-cyan-400 underline">
                Crear
              </Link>
              .
            </p>
          </div>
        ) : (
          <div className="gift-row -mx-0.5 flex gap-3 overflow-x-auto px-0.5 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {reels.map((reel, index) => (
              <BoomClipGroupThumb
                key={reel.id}
                group={{
                  authorUid: reel.authorUid,
                  username: reel.username,
                  authorAvatarUrl: reel.authorAvatarUrl ?? null,
                  clips: [reel],
                }}
                onOpen={() => {
                  setViewerReels(reels);
                  setViewerIndex(index);
                  setViewerStoryMode(true);
                }}
              />
            ))}
          </div>
        )
      ) : (
        <div className="gift-row -mx-0.5 flex gap-3 overflow-x-auto px-0.5 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {profile ? (
            <OwnClipPublishCard
              avatarUrl={profile.avatarUrl ?? null}
              handle={profile.handle}
              uid={profile.firebaseUid}
              hasClips={Boolean(ownGroup?.clips.length)}
              group={ownGroup}
              onOpenOwn={() => openAuthorClips(profile.firebaseUid, true)}
              onPublish={() => setCreateOpen(true)}
            />
          ) : null}

          {otherGroups.map((group) => (
            <BoomClipGroupThumb
              key={group.authorUid}
              group={group}
              onOpen={() => openAuthorClips(group.authorUid, true)}
            />
          ))}
        </div>
      )}

      {viewerReels && viewerReels.length > 0 ? (
        <ReelFeedViewer
          reels={viewerReels}
          initialIndex={viewerIndex}
          storyMode={viewerStoryMode}
          onClose={() => setViewerReels(null)}
        />
      ) : null}

      {createOpen && profile ? (
        <CreatePostModal
          username={profile.handle}
          autoOpen
          hideTrigger
          defaultKind="video"
          defaultVideoMode="post"
          onClose={() => setCreateOpen(false)}
          onCreated={() => {
            setCreateOpen(false);
            setToast(`${BOOM_CLIP_LABEL} publicado`, 'success');
          }}
        />
      ) : null}
    </section>
  );
}
