import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { listenRecentPosts, type FsPost } from '../../lib/socialFirestore';
import { useAuthStore } from '../../store/authStore';

export type ReelItem = {
  id: string;
  username: string;
  title: string;
  dataUrl: string;
  shared: boolean;
  createdAt: string;
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

export function ReelsRow({ title = 'Reels' }: { title?: string }) {
  const profile = useAuthStore((state) => state.profile);
  const [reels, setReels] = useState<ReelItem[]>([]);

  useEffect(() => {
    if (!profile) {
      setReels([]);
      return;
    }
    return listenRecentPosts((posts) => {
      setReels(
        posts
          .filter((post) => post.type === 'video' && post.mediaUrl)
          .map(toReel)
          .slice(0, 24),
      );
    });
  }, [profile?.firebaseUid]);

  if (reels.length === 0) return null;

  return (
    <section className="space-y-3">
      <h2 className="text-base font-bold text-white">{title}</h2>
      <div className="flex gap-3 overflow-x-auto pb-2">
        {reels.map((reel) => (
          <article
            key={reel.id}
            className="w-36 shrink-0 overflow-hidden rounded-2xl border border-white/10 bg-zinc-950"
          >
            <video src={reel.dataUrl} className="aspect-[9/16] w-full object-cover" muted playsInline controls />
            <div className="space-y-0.5 p-2">
              <p className="line-clamp-2 text-[11px] font-semibold text-white">{reel.title}</p>
              <Link to={`/u/${encodeURIComponent(reel.username)}`} className="truncate text-[10px] text-cyan-400">
                @{reel.username}
              </Link>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
