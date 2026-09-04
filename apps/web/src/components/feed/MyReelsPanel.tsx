import { useEffect, useState } from 'react';
import { BOOM_CLIP_LABEL } from '../../lib/brand';
import { isBoomClipPost } from '../../lib/contentType';
import { listenPostsByUsername, type FsPost } from '../../lib/socialFirestore';
import { useVideoAspect } from '../../lib/videoAspect';
import { useAuthStore } from '../../store/authStore';
import { AutoplayMuteVideo } from './AutoplayMuteVideo';
import type { ReelItem } from './ReelsRow';

type Props = {
  username: string;
};

function toReel(post: FsPost): ReelItem {
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
    sharedFromPostId: post.sharedFromPostId,
    sharedFromAuthorUid: post.sharedFromAuthorUid,
    sharedFromUsername: post.sharedFromUsername,
  };
}

function MyClipTile({ reel }: { reel: ReelItem }) {
  const videoAspect = useVideoAspect(reel.mediaUrl);

  return (
    <article className="overflow-hidden rounded-xl border border-white/10 bg-zinc-950">
      <div
        className={`w-full bg-black ${videoAspect.isReady ? '' : videoAspect.aspectClass}`}
        style={videoAspect.isReady ? videoAspect.aspectStyle : undefined}
      >
        <AutoplayMuteVideo
          src={reel.mediaUrl}
          className={`h-full w-full ${videoAspect.isLandscape ? 'object-contain' : 'object-cover'}`}
        />
      </div>
      <div className="p-2">
        <p className="line-clamp-2 text-xs font-semibold text-white">{reel.caption}</p>
      </div>
    </article>
  );
}

/** Biblioteca de Boom Clips del usuario (perfil / ajustes). */
export function MyReelsPanel({ username }: Props) {
  const profile = useAuthStore((state) => state.profile);
  const [reels, setReels] = useState<ReelItem[]>([]);

  useEffect(() => {
    return listenPostsByUsername(
      username,
      (posts) => {
        setReels(posts.filter((post) => isBoomClipPost(post) && post.mediaUrl).map(toReel));
      },
      profile ? { uid: profile.firebaseUid, isOwner: true } : null,
    );
  }, [username, profile?.firebaseUid]);

  if (reels.length === 0) return null;

  return (
    <section className="mt-8 space-y-3 border-t border-zinc-800 pt-6">
      <h2 className="text-base font-bold text-white">Mis {BOOM_CLIP_LABEL}</h2>
      <p className="text-xs text-zinc-500">
        Videos cortos publicados como {BOOM_CLIP_LABEL}. También aparecen en Inicio → Boom Clip.
      </p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {reels.map((reel) => (
          <MyClipTile key={reel.id} reel={reel} />
        ))}
      </div>
    </section>
  );
}
