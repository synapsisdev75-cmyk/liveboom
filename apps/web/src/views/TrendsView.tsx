import { Hash, TrendingUp } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { PostCard, type SocialPost } from '../components/social/SocialPostCard';
import {
  listenPostsByHashtag,
  listenTopTrends,
  seedTrendsFromRecentPosts,
  type TrendTag,
} from '../lib/trendsFirestore';
import type { FsPost } from '../lib/socialFirestore';

function toSocial(post: FsPost): SocialPost {
  return {
    id: post.id,
    authorUid: post.authorUid,
    authorUsername: post.username,
    type: post.type,
    caption: post.caption,
    mediaUrl: post.mediaUrl,
    mediaUrls: post.mediaUrls,
    visibility: post.visibility,
    createdAt: post.createdAt,
    likes: post.likes,
    dislikes: 0,
    viewerReaction: null,
    sharedFromPostId: post.sharedFromPostId,
    sharedFromAuthorUid: post.sharedFromAuthorUid,
    sharedFromUsername: post.sharedFromUsername,
  };
}

export function TrendsView() {
  const [searchParams, setSearchParams] = useSearchParams();
  const selected = (searchParams.get('tag') || '').replace(/^#/, '').toLowerCase();
  const [trends, setTrends] = useState<TrendTag[]>([]);
  const [posts, setPosts] = useState<SocialPost[]>([]);

  useEffect(() => {
    const unsub = listenTopTrends(setTrends);
    void seedTrendsFromRecentPosts().catch(() => undefined);
    return unsub;
  }, []);

  useEffect(() => {
    if (!selected) {
      setPosts([]);
      return;
    }
    return listenPostsByHashtag(selected, (list) => setPosts(list.map(toSocial)));
  }, [selected]);

  return (
    <div className="lb-page mx-auto flex w-full max-w-3xl flex-col gap-5">
      <div className="rounded-2xl bg-zinc-900 p-4 sm:p-6">
        <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-cyan-400">
          <TrendingUp size={14} /> Tendencias
        </p>
        <h1 className="mt-1 text-xl font-bold text-white sm:text-2xl"># en LiveBoom</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Hashtags más usados en publicaciones. Usa #en tus captions al publicar.
        </p>

        {trends.length === 0 ? (
          <p className="mt-4 text-sm text-zinc-500">
            Aún no hay tendencias. Publica un reel o post con un #hashtag.
          </p>
        ) : (
          <ul className="mt-4 flex flex-wrap gap-2">
            {trends.map((item, index) => {
              const active = selected === item.tag;
              return (
                <li key={item.tag}>
                  <button
                    type="button"
                    onClick={() =>
                      setSearchParams(active ? {} : { tag: item.tag }, { replace: true })
                    }
                    className={`inline-flex min-h-10 items-center gap-1.5 rounded-full px-3 py-2 text-sm font-semibold transition ${
                      active
                        ? 'bg-cyan-400 text-zinc-950'
                        : 'bg-zinc-800 text-zinc-200 ring-1 ring-white/10 hover:ring-cyan-400/40'
                    }`}
                  >
                    <Hash size={14} />
                    {item.tag}
                    <span className={`text-[11px] ${active ? 'text-zinc-700' : 'text-zinc-500'}`}>
                      #{index + 1} · {item.count}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {selected ? (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-white">Publicaciones con #{selected}</h2>
          {posts.length === 0 ? (
            <p className="rounded-2xl bg-zinc-900 p-4 text-sm text-zinc-400">
              No hay posts públicos con este hashtag todavía.
            </p>
          ) : (
            posts.map((post) => (
              <PostCard key={post.id} post={post} />
            ))
          )}
        </section>
      ) : (
        <p className="text-center text-sm text-zinc-500">Elige una tendencia para ver publicaciones.</p>
      )}

      <Link to="/explorar" className="text-center text-sm font-semibold text-cyan-400 hover:underline">
        Ir a Explorar posts
      </Link>
    </div>
  );
}
