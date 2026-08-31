import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { BOOM_CLIP_LABEL, FLASH_BOOM_LABEL } from '../../lib/brand';
import { fetchFirestoreProfile } from '../../lib/profileFirestore';
import { listenActiveReels, listenActiveStories, type FsPost } from '../../lib/socialFirestore';
import { useAuthStore } from '../../store/authStore';
import { useVideoAspect } from '../../lib/videoAspect';
import { AutoplayMuteVideo } from './AutoplayMuteVideo';
import { ReelFeedViewer, type ReelFeedItem } from './ReelFeedViewer';

export type ReelItem = ReelFeedItem & { shared: boolean; createdAt: string };

function toReel(post: FsPost): ReelItem {
  return {
    id: post.id,
    username: post.username,
    authorUid: post.authorUid,
    caption: post.caption || 'Video',
    mediaUrl: post.mediaUrl || '',
    mediaType: post.type === 'photo' ? 'photo' : 'video',
    shared: true,
    createdAt: post.createdAt,
  };
}

function ReelThumb({
  reel,
  avatarUrl,
  onOpen,
}: {
  reel: ReelItem;
  avatarUrl: string | null;
  onOpen: () => void;
}) {
  const videoAspect = useVideoAspect(reel.mediaUrl);
  const cardWidth =
    videoAspect.isLandscape ? 'w-[10rem] sm:w-[11rem]' : 'w-[7.5rem] sm:w-[8.25rem]';

  return (
    <button
      type="button"
      onClick={onOpen}
      className={`lb-card group relative ${videoAspect.isReady ? '' : videoAspect.aspectClass} ${cardWidth} shrink-0 overflow-hidden rounded-2xl bg-zinc-900 text-left ring-1 ring-white/10 transition duration-300 hover:ring-cyan-400/40`}
      style={videoAspect.isReady ? videoAspect.aspectStyle : undefined}
    >
      {reel.mediaType === 'photo' ? (
        <img
          src={reel.mediaUrl}
          alt=""
          className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.04]"
        />
      ) : (
        <AutoplayMuteVideo
          src={reel.mediaUrl}
          className={`h-full w-full transition duration-500 group-hover:scale-[1.04] ${
            videoAspect.isLandscape ? 'object-contain' : 'object-cover'
          }`}
        />
      )}
      <span className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/75 via-black/10 to-transparent" />
      <span className="absolute left-2 top-2 z-10 h-9 w-9 overflow-hidden rounded-full bg-zinc-800 ring-2 ring-cyan-400/70 ring-offset-1 ring-offset-black/50">
        {avatarUrl ? (
          <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <span className="grid h-full w-full place-items-center text-[11px] font-bold uppercase text-zinc-300">
            {reel.username.slice(0, 1) || '?'}
          </span>
        )}
      </span>
      <div className="absolute inset-x-0 bottom-0 p-2">
        <p className="line-clamp-1 text-[10px] font-semibold text-white/95">{reel.caption}</p>
        <p className="truncate text-[9px] text-cyan-300/90">@{reel.username}</p>
      </div>
    </button>
  );
}

/** Fila horizontal de Flash Boom (historias) o Boom Clip (reels) en Inicio. */
export function ReelsRow({
  title,
  subtitle,
  mode = 'reels',
}: {
  title?: string;
  subtitle?: string;
  /** `reels` = Boom Clip; `stories` = Flash Boom 24 h. */
  mode?: 'reels' | 'stories';
}) {
  const sectionTitle = title ?? (mode === 'stories' ? FLASH_BOOM_LABEL : BOOM_CLIP_LABEL);
  const profile = useAuthStore((state) => state.profile);
  const [reels, setReels] = useState<ReelItem[]>([]);
  const [authorAvatars, setAuthorAvatars] = useState<Record<string, string | null>>({});
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  useEffect(() => {
    if (!profile) {
      setReels([]);
      return;
    }
    const listen = mode === 'stories' ? listenActiveStories : listenActiveReels;
    return listen((posts) => {
      setReels(posts.map(toReel));
    });
  }, [profile?.firebaseUid, mode]);

  useEffect(() => {
    const uids = [...new Set(reels.map((reel) => reel.authorUid).filter(Boolean))];
    if (uids.length === 0) {
      setAuthorAvatars({});
      return;
    }

    let cancelled = false;
    void Promise.all(
      uids.map(async (uid) => {
        const author = await fetchFirestoreProfile(uid);
        return [uid, author?.avatarUrl ?? null] as const;
      }),
    ).then((pairs) => {
      if (cancelled) return;
      setAuthorAvatars(Object.fromEntries(pairs));
    });

    return () => {
      cancelled = true;
    };
  }, [reels]);

  return (
    <section className="w-full">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-sm font-bold uppercase tracking-[0.12em] text-white">{sectionTitle}</h2>
          {subtitle ? <p className="mt-0.5 text-[10px] text-zinc-500">{subtitle}</p> : null}
        </div>
        <Link
          to="/explorar"
          className="text-[12px] font-semibold text-[#22d3ee] transition hover:text-cyan-200"
        >
          Ver todos &gt;
        </Link>
      </div>

      {!profile ? (
        <p className="rounded-2xl border border-dashed border-white/10 px-4 py-8 text-center text-sm text-zinc-500">
          <Link to="/login" className="text-cyan-400 underline">
            Inicia sesión
          </Link>{' '}
          para ver {mode === 'stories' ? FLASH_BOOM_LABEL : BOOM_CLIP_LABEL}.
        </p>
      ) : reels.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-white/10 px-4 py-8 text-center text-sm text-zinc-500">
          {mode === 'stories' ? (
            <>
              Aún no hay {FLASH_BOOM_LABEL}. Publica uno en{' '}
              <Link to="/crear" className="text-cyan-400 underline">
                Crear
              </Link>{' '}
              o pestaña {FLASH_BOOM_LABEL}.
            </>
          ) : (
            <>
              Aún no hay {BOOM_CLIP_LABEL}. Publica un video desde{' '}
              <Link to="/crear" className="text-cyan-400 underline">
                Crear
              </Link>
              .
            </>
          )}
        </p>
      ) : (
        <div className="gift-row -mx-0.5 flex gap-3 overflow-x-auto px-0.5 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {reels.map((reel, index) => (
            <ReelThumb
              key={reel.id}
              reel={reel}
              avatarUrl={authorAvatars[reel.authorUid] ?? null}
              onOpen={() => setActiveIndex(index)}
            />
          ))}
        </div>
      )}

      {activeIndex !== null && reels.length > 0 ? (
        <ReelFeedViewer
          reels={reels}
          initialIndex={activeIndex}
          storyMode={mode === 'stories'}
          onClose={() => setActiveIndex(null)}
        />
      ) : null}
    </section>
  );
}
