import { useEffect, useState } from 'react';
import { listenPostsByUsername, type FsPost } from '../../lib/socialFirestore';
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
    title: post.caption || 'Video',
    dataUrl: post.mediaUrl || '',
    shared: true,
    createdAt: post.createdAt,
  };
}

export function MyReelsPanel({ username }: Props) {
  const profile = useAuthStore((state) => state.profile);
  const [reels, setReels] = useState<ReelItem[]>([]);

  useEffect(() => {
    return listenPostsByUsername(username, (posts) => {
      setReels(posts.filter((post) => post.type === 'video' && post.mediaUrl).map(toReel));
    }, profile ? { uid: profile.firebaseUid, isOwner: true } : null);
  }, [username, profile?.firebaseUid]);

  if (reels.length === 0) return null;

  return (
    <section className="mt-8 space-y-3 border-t border-zinc-800 pt-6">
      <h2 className="text-base font-bold text-white">Mis videos / reels</h2>
      <p className="text-xs text-zinc-500">Se guardan en Firebase Storage y aparecen en tu biblioteca.</p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {reels.map((reel) => (
          <article key={reel.id} className="overflow-hidden rounded-xl border border-white/10 bg-zinc-950">
            <AutoplayMuteVideo src={reel.dataUrl} className="aspect-[9/16] w-full object-cover" />
            <div className="p-2">
              <p className="line-clamp-2 text-xs font-semibold text-white">{reel.title}</p>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
