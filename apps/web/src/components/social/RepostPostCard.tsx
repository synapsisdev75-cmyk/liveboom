import { Globe, Lock, MessageCircle, Repeat2, Users } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ReelGiftControls } from '../feed/ReelGiftControls';
import { UserAvatar } from '../profile/UserAvatar';
import { POST_EMOJI_SIZE } from '../../lib/liveboomEmojis';
import { postPhotoUrls } from '../../lib/mediaFrame';
import { profileHref } from '../../lib/profileFirestore';
import { buildPostShareUrl } from '../../lib/shareContent';
import {
  isRepostPost,
  listenPostComments,
  listenPostReactions,
  loadRepostOriginal,
  setPostReaction,
  type FsPost,
  type PostReactionUser,
} from '../../lib/socialFirestore';
import { useAuthStore } from '../../store/authStore';
import { BoomLikeButton } from './BoomButtons';
import { EmojiText } from './EmojiText';
import { PostMediaCarousel } from './PostMediaCarousel';
import { PostPhotoViewer } from './PostPhotoViewer';
import { PostComments, PostVideoPlayer } from './PostVideoPlayer';
import { PublicationCaption } from './PublicationCaption';
import { ReactionList } from './PostReactionButtons';
import { ShareContentButton } from './ShareContentButton';

export type RepostSourcePost = {
  id: string;
  authorUid?: string;
  authorUsername: string;
  caption: string | null;
  createdAt: string;
  visibility?: 'public' | 'friends' | 'private' | 'circle';
  sharedFromPostId?: string;
  sharedFromAuthorUid?: string;
  sharedFromUsername?: string;
};

function isTextOnly(post: {
  type?: string | null;
  mediaUrl?: string | null;
  mediaUrls?: string[] | null;
}) {
  if (post.type === 'text') return true;
  if (post.type === 'photo' || post.type === 'video') return false;
  return !post.mediaUrl && !(post.mediaUrls && post.mediaUrls.length > 0);
}

type LiveHint = {
  username: string;
} | null;

function timeAgo(iso: string) {
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return '';
  const m = Math.floor(ms / 60_000);
  if (m < 60) return `${Math.max(1, m)}m`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

export function originalPostPath(
  username: string,
  postId: string,
  authorUid?: string | null,
) {
  const base = profileHref(username, authorUid);
  return `${base}${base.includes('?') ? '&' : '?'}post=${encodeURIComponent(postId)}`;
}

function OriginalPostEmbed({
  originId,
  fallbackUsername,
  fallbackUid,
  onInteracted,
}: {
  originId: string;
  fallbackUsername?: string | null;
  fallbackUid?: string | null;
  onInteracted?: () => void;
}) {
  const profile = useAuthStore((state) => state.profile);
  const [origin, setOrigin] = useState<FsPost | null | undefined>(undefined);
  const [likes, setLikes] = useState(0);
  const [dislikes, setDislikes] = useState(0);
  const [viewerReaction, setViewerReaction] = useState<'like' | 'dislike' | null>(null);
  const [likers, setLikers] = useState<PostReactionUser[]>([]);
  const [dislikers, setDislikers] = useState<PostReactionUser[]>([]);
  const [showLikers, setShowLikers] = useState(false);
  const [busy, setBusy] = useState(false);
  const [commentCount, setCommentCount] = useState(0);
  const [showComments, setShowComments] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setOrigin(undefined);
    void loadRepostOriginal(originId, profile?.firebaseUid)
      .then((post) => {
        if (!cancelled) setOrigin(post);
      })
      .catch(() => {
        if (!cancelled) setOrigin(null);
      });
    return () => {
      cancelled = true;
    };
  }, [originId, profile?.firebaseUid]);

  useEffect(() => {
    if (!origin) return;
    return listenPostReactions(origin.id, profile?.firebaseUid, (stats) => {
      setLikes(stats.likes);
      setDislikes(stats.dislikes);
      setViewerReaction(stats.viewerReaction);
      setLikers(stats.likers);
      setDislikers(stats.dislikers);
    });
  }, [origin?.id, profile?.firebaseUid]);

  useEffect(() => {
    if (!origin) return;
    return listenPostComments(origin.id, (list) => setCommentCount(list.length));
  }, [origin?.id]);

  async function react(reaction: 'like' | 'dislike') {
    if (!profile || !origin) return;
    setBusy(true);
    try {
      onInteracted?.();
      await setPostReaction(
        origin.id,
        profile.firebaseUid,
        viewerReaction === reaction ? null : reaction,
        {
          username: profile.handle,
          displayName: profile.displayName,
          avatarUrl: profile.avatarUrl,
        },
      );
    } finally {
      setBusy(false);
    }
  }

  const href = origin
    ? originalPostPath(origin.username, origin.id, origin.authorUid)
    : fallbackUsername
      ? originalPostPath(fallbackUsername, originId, fallbackUid)
      : null;

  return (
    <div className="overflow-hidden rounded-xl border border-fuchsia-400/25 bg-zinc-950/80 ring-1 ring-cyan-400/10">
      {origin === undefined ? (
        <p className="px-3 py-6 text-center text-xs text-zinc-500">Cargando publicación original…</p>
      ) : !origin ? (
        <div className="px-3 py-6 text-center">
          <p className="text-sm font-semibold text-zinc-300">Esta publicación ya no está disponible</p>
          <p className="mt-1 text-[11px] text-zinc-500">
            El autor la eliminó, la ocultó o cambió su privacidad.
          </p>
        </div>
      ) : (
        <>
          <Link
            to={href || '#'}
            className="flex min-w-0 items-center gap-2 px-3 pt-3 hover:bg-white/[0.03] sm:gap-2.5"
          >
            <UserAvatar uid={origin.authorUid} username={origin.username} size={36} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold text-white">@{origin.username}</p>
              <p className="text-[11px] text-zinc-500">
                {timeAgo(origin.createdAt)}
                {origin.createdAt ? ' · publicación original' : ''}
              </p>
            </div>
            <span className="shrink-0 rounded-full bg-gradient-to-r from-fuchsia-500/20 to-cyan-400/20 px-2 py-0.5 text-[9px] font-black uppercase tracking-wide text-cyan-200 ring-1 ring-cyan-400/30">
              Original
            </span>
          </Link>
          <p className="px-3 pb-2 pt-1 text-[11px] text-zinc-500">
            Reposteado de{' '}
            <Link
              to={profileHref(origin.username, origin.authorUid)}
              className="font-semibold text-fuchsia-300 hover:underline"
            >
              @{origin.username}
            </Link>
          </p>

          {isTextOnly(origin) ? (
            <Link to={href || '#'} className="block px-3 pb-3 text-sm leading-relaxed text-white">
              <EmojiText text={origin.caption || ''} size={POST_EMOJI_SIZE} />
            </Link>
          ) : origin.mediaUrl && origin.type === 'video' ? (
            <PostVideoPlayer
              src={origin.mediaUrl}
              postId={origin.id}
              authorUid={origin.authorUid}
              authorUsername={origin.username}
              caption={origin.caption}
              likes={likes}
              dislikes={dislikes}
              viewerReaction={viewerReaction}
              likers={likers}
              dislikers={dislikers}
              busy={busy}
              onReact={(r) => void react(r)}
              mediaWidth={origin.mediaWidth}
              mediaHeight={origin.mediaHeight}
              posterUrl={origin.thumbUrl}
              publicationCaption
            />
          ) : postPhotoUrls(origin).length > 1 ? (
            <PostMediaCarousel
              sources={postPhotoUrls(origin)}
              caption={origin.caption}
              postId={origin.id}
              authorUsername={origin.username}
              authorUid={origin.authorUid}
            />
          ) : origin.mediaUrl && origin.type === 'photo' ? (
            <PostPhotoViewer
              src={origin.mediaUrl}
              caption={origin.caption}
              postId={origin.id}
              authorUsername={origin.username}
              authorUid={origin.authorUid}
              mediaWidth={origin.mediaWidth}
              mediaHeight={origin.mediaHeight}
              publicationCaption
            />
          ) : origin.caption ? (
            <Link to={href || '#'} className="block px-3 pb-2 text-sm leading-relaxed text-zinc-200">
              <EmojiText text={origin.caption} size={POST_EMOJI_SIZE} />
            </Link>
          ) : null}

          {origin.caption &&
          (origin.type === 'photo' || origin.type === 'video') &&
          !isTextOnly(origin) ? (
            <PublicationCaption key={origin.id} caption={origin.caption} />
          ) : null}

          <div className="relative flex min-w-0 max-w-full flex-wrap items-center gap-1 border-t border-white/5 px-2 py-2 sm:gap-2 sm:px-3">
            <span className="relative inline-flex items-center">
              <BoomLikeButton
                active={viewerReaction === 'like'}
                busy={busy}
                count={likes}
                size="sm"
                onToggle={() => void react('like')}
                onShowWho={() => setShowLikers((v) => !v)}
              />
              {showLikers ? (
                <ReactionList title="Les gustó (Boom)" users={likers} onClose={() => setShowLikers(false)} />
              ) : null}
            </span>
            <button
              type="button"
              onClick={() => {
                onInteracted?.();
                setShowComments((v) => !v);
              }}
              className={`inline-flex min-h-10 items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-semibold hover:bg-white/5 ${
                showComments ? 'bg-white/10 text-white' : 'text-zinc-300'
              }`}
            >
              <MessageCircle size={15} className="text-cyan-300" />
              {commentCount > 0 ? commentCount : 'Comentar'}
            </button>
            {origin.username ? (
              <span onClick={() => onInteracted?.()}>
                <ReelGiftControls
                  authorUsername={origin.username}
                  authorUid={origin.authorUid}
                  postId={origin.id}
                  inline
                />
              </span>
            ) : null}
            <span className="ml-auto" onClick={() => onInteracted?.()}>
              <ShareContentButton
                url={buildPostShareUrl(origin.username, origin.id, origin.authorUid)}
                title={`@${origin.username} en LiveBoom`}
                text={origin.caption || `Mira esta publicación de @${origin.username} en LiveBoom`}
                mediaUrl={origin.mediaUrl}
                mediaType={origin.type === 'video' ? 'video' : origin.type === 'photo' ? 'photo' : 'text'}
                postId={origin.id}
                authorUid={origin.authorUid}
                authorUsername={origin.username}
              />
            </span>
          </div>
          {showComments ? (
            <PostComments
              postId={origin.id}
              authorUid={origin.authorUid}
              defaultOpen
            />
          ) : null}
        </>
      )}
    </div>
  );
}

export function RepostPostCard({
  post,
  live = null,
  canDelete,
  canChangeVisibility,
  onDelete,
  onChangeVisibility,
  onInteracted,
  showVisibility = false,
}: {
  post: RepostSourcePost;
  live?: LiveHint;
  canDelete?: boolean;
  canChangeVisibility?: boolean;
  onDelete?: () => void;
  onChangeVisibility?: (visibility: 'public' | 'friends' | 'private' | 'circle') => void;
  onInteracted?: () => void;
  showVisibility?: boolean;
}) {
  const originId = post.sharedFromPostId || '';
  const originHandle = String(post.sharedFromUsername || '').replace(/^@/, '');
  const commentary = String(post.caption || '').trim();

  return (
    <article className="lb-card lb-panel min-w-0 max-w-full overflow-hidden rounded-2xl">
      {showVisibility && post.visibility ? (
        <p className="border-b border-white/5 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
          {post.visibility === 'public'
            ? 'Público · registrados'
            : post.visibility === 'friends'
              ? 'Solo amigos'
              : 'Privado'}
        </p>
      ) : null}

      <div className="flex min-w-0 items-start gap-2.5 px-3 pt-3 sm:items-center sm:gap-3 sm:px-4 sm:pt-4">
        <Link to={`/u/${encodeURIComponent(post.authorUsername)}`} className="shrink-0">
          <UserAvatar
            uid={post.authorUid}
            username={post.authorUsername}
            size={40}
            ringClassName="ring-2 ring-cyan-400/35"
          />
        </Link>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <Link
              to={`/u/${encodeURIComponent(post.authorUsername)}`}
              className="max-w-full truncate text-sm font-bold text-white hover:text-cyan-300"
            >
              @{post.authorUsername}
            </Link>
            <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-zinc-400">
              <Repeat2 size={13} className="text-fuchsia-300" />
              reposteó
            </span>
            <span className="text-[11px] text-zinc-500">{timeAgo(post.createdAt)}</span>
          </div>
          {originHandle ? (
            <p className="min-w-0 truncate text-[11px] text-zinc-500">
              Reposteado de{' '}
              <Link
                to={originalPostPath(originHandle, originId, post.sharedFromAuthorUid)}
                className="font-semibold text-cyan-300 hover:underline"
              >
                @{originHandle}
              </Link>
            </p>
          ) : null}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1 sm:flex-row sm:items-center">
          <span className="rounded-full bg-fuchsia-500/15 px-2 py-0.5 text-[9px] font-black uppercase tracking-wide text-fuchsia-200 ring-1 ring-fuchsia-400/30">
            Repost
          </span>
          {live ? (
            <Link
              to={`/stream/${encodeURIComponent(live.username)}`}
              className="inline-flex min-h-8 items-center gap-1.5 rounded-full bg-fuchsia-600/90 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-white"
            >
              En vivo
            </Link>
          ) : null}
        </div>
      </div>

      {commentary ? (
        <p className="min-w-0 break-words px-3.5 pt-3 text-sm leading-relaxed text-zinc-100 sm:px-4">
          <EmojiText text={commentary} size={POST_EMOJI_SIZE} />
        </p>
      ) : null}

      <div className="px-[clamp(0.65rem,3vw,0.9rem)] pb-3 pt-3">
        {originId ? (
          <OriginalPostEmbed
            originId={originId}
            fallbackUsername={originHandle}
            fallbackUid={post.sharedFromAuthorUid}
            onInteracted={onInteracted}
          />
        ) : null}
      </div>

      {canChangeVisibility ? (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/5 px-3 py-2">
          <div className="flex items-center gap-1">
            {(
              [
                ['public', Globe, 'Público'],
                ['friends', Users, 'Amigos'],
                ['private', Lock, 'Privado'],
              ] as const
            ).map(([value, Icon, label]) => (
              <button
                key={value}
                type="button"
                title={`Cambiar a ${label.toLowerCase()}`}
                onClick={() => onChangeVisibility?.(value)}
                className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-bold ${
                  post.visibility === value
                    ? 'bg-emerald-500/15 text-emerald-300'
                    : 'text-zinc-500 hover:text-zinc-200'
                }`}
              >
                <Icon size={12} />
                {label}
              </button>
            ))}
          </div>
          {canDelete ? (
            <button
              type="button"
              onClick={() => {
                if (window.confirm('¿Estás seguro de borrar esta publicación?')) onDelete?.();
              }}
              className="text-[11px] text-zinc-500 hover:text-fuchsia-400"
            >
              Eliminar
            </button>
          ) : null}
        </div>
      ) : canDelete ? (
        <div className="flex justify-end border-t border-white/5 px-3 py-2">
          <button
            type="button"
            onClick={() => {
              if (window.confirm('¿Estás seguro de borrar esta publicación?')) onDelete?.();
            }}
            className="text-[11px] text-zinc-500 hover:text-fuchsia-400"
          >
            Eliminar
          </button>
        </div>
      ) : null}
    </article>
  );
}

export { isRepostPost };
