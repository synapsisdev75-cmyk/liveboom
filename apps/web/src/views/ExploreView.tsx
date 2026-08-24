import { Compass, Image as ImageIcon, PenLine, Video } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { PostCard, type SocialPost } from '../components/social/SocialPostCard';
import { listenRecentPosts, type FsPost } from '../lib/socialFirestore';
import { useAuthStore } from '../store/authStore';

type Filter = 'all' | 'photo' | 'video' | 'text';

function toSocial(post: FsPost): SocialPost {
  return {
    id: post.id,
    authorUid: post.authorUid,
    authorUsername: post.username,
    type: post.type,
    caption: post.caption,
    mediaUrl: post.mediaUrl,
    visibility: post.visibility,
    createdAt: post.createdAt,
    likes: post.likes,
    dislikes: 0,
    viewerReaction: null,
  };
}

export function ExploreView() {
  const profile = useAuthStore((state) => state.profile);
  const ready = useAuthStore((state) => state.ready);
  const [posts, setPosts] = useState<SocialPost[]>([]);
  const [filter, setFilter] = useState<Filter>('all');

  useEffect(() => {
    if (!profile) {
      setPosts([]);
      return;
    }
    return listenRecentPosts((list) => {
      setPosts(list.map(toSocial));
    });
  }, [profile?.firebaseUid]);

  const visible = useMemo(() => {
    if (filter === 'all') return posts;
    return posts.filter((post) => post.type === filter);
  }, [posts, filter]);

  const counts = useMemo(
    () => ({
      all: posts.length,
      photo: posts.filter((p) => p.type === 'photo').length,
      video: posts.filter((p) => p.type === 'video').length,
      text: posts.filter((p) => p.type === 'text').length,
    }),
    [posts],
  );

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-5">
      <header className="rounded-2xl bg-zinc-900 p-4 sm:p-6">
        <h1 className="flex items-center gap-2 text-lg font-bold text-white sm:text-xl">
          <Compass className="text-cyan-300" size={22} />
          Explorar
        </h1>
        <p className="mt-1 text-sm text-zinc-400">
          Publicaciones públicas para cuentas registradas: fotos, reels, videos y posts.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          {(
            [
              ['all', 'Todo', counts.all],
              ['photo', 'Fotos', counts.photo],
              ['video', 'Reels / Video', counts.video],
              ['text', 'Posts', counts.text],
            ] as const
          ).map(([value, label, count]) => (
            <button
              key={value}
              type="button"
              onClick={() => setFilter(value)}
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold ${
                filter === value
                  ? 'bg-cyan-500/20 text-cyan-200 ring-1 ring-cyan-400/40'
                  : 'bg-zinc-950 text-zinc-400 ring-1 ring-white/10 hover:text-white'
              }`}
            >
              {value === 'photo' ? <ImageIcon size={12} /> : null}
              {value === 'video' ? <Video size={12} /> : null}
              {value === 'text' ? <PenLine size={12} /> : null}
              {label}
              <span className="text-[10px] opacity-70">{count}</span>
            </button>
          ))}
        </div>
      </header>

      {!ready ? (
        <p className="rounded-2xl bg-zinc-900 px-4 py-10 text-center text-sm text-zinc-500">Cargando…</p>
      ) : !profile ? (
        <p className="rounded-2xl border border-dashed border-white/10 bg-zinc-900/60 px-4 py-10 text-center text-sm text-zinc-500">
          <Link to="/login" className="text-cyan-400 underline">
            Inicia sesión
          </Link>{' '}
          o{' '}
          <Link to="/registro" className="text-cyan-400 underline">
            crea una cuenta
          </Link>{' '}
          para ver las publicaciones públicas.
        </p>
      ) : visible.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-white/10 bg-zinc-900/60 px-4 py-10 text-center text-sm text-zinc-500">
          Aún no hay publicaciones públicas. Sé el primero desde tu perfil.
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {visible.map((post) => (
            <div key={post.id} className="space-y-2">
              <Link
                to={`/u/${encodeURIComponent(post.authorUsername)}`}
                className="px-1 text-xs font-semibold text-cyan-400 hover:underline"
              >
                @{post.authorUsername}
              </Link>
              <PostCard post={post} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
