import { Globe, Lock, MessageCircle, UserMinus, UserPlus, Users } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  followUser,
  isFollowing,
  listenPostComments,
  listenPostReactions,
  setPostReaction,
  type FriendChip,
  type PostReactionUser,
  unfollowUser,
} from '../../lib/socialFirestore';
import { profileHref } from '../../lib/profileFirestore';
import { useAuthStore } from '../../store/authStore';
import { PostComments, PostVideoPlayer } from './PostVideoPlayer';
import { ShareContentButton } from './ShareContentButton';
import { buildPostShareUrl } from '../../lib/shareContent';
import { PostPhotoViewer } from './PostPhotoViewer';
import { PostMediaCarousel } from './PostMediaCarousel';
import type { MediaOverlayItem } from '../../lib/mediaOverlays';
import { postPhotoUrls } from '../../lib/mediaFrame';
import { POST_EMOJI_SIZE } from '../../lib/liveboomEmojis';
import { EmojiText } from './EmojiText';
import { PublicationCaption } from './PublicationCaption';
import { PostReactionButtons } from './PostReactionButtons';
import { ReelGiftControls } from '../feed/ReelGiftControls';
import { isBoomClipPost, isPublicationPost } from '../../lib/contentType';
import { RepostPostCard } from './RepostPostCard';
import { isRepostPost } from '../../lib/socialFirestore';

type Props = {
  username: string;
  targetUid?: string | null;
  targetHint?: Partial<Pick<FriendChip, 'uid' | 'username' | 'displayName' | 'avatarUrl'>> | null;
  initialFollowing: boolean;
  isOwnProfile: boolean;
  onChange?: (following: boolean) => void;
  /** outline = borde cyan (rail mensajes); default = gradiente */
  variant?: 'default' | 'outline';
  size?: 'md' | 'sm';
};

export function FollowButton({
  username,
  targetUid,
  targetHint,
  initialFollowing,
  isOwnProfile,
  onChange,
  variant = 'default',
  size = 'md',
}: Props) {
  const profile = useAuthStore((state) => state.profile);
  const [following, setFollowing] = useState(initialFollowing);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const resolvedUid = targetUid || targetHint?.uid || null;
  const hint = targetHint || (resolvedUid ? { uid: resolvedUid, username } : null);

  useEffect(() => {
    setFollowing(initialFollowing);
  }, [initialFollowing, username]);

  useEffect(() => {
    if (!profile || isOwnProfile) return;
    void isFollowing(profile.firebaseUid, username, resolvedUid).then((value) => {
      setFollowing(value);
    });
  }, [profile?.firebaseUid, username, resolvedUid, isOwnProfile]);

  if (isOwnProfile || !profile) return null;

  async function toggle() {
    setBusy(true);
    setError(null);
    try {
      if (following) {
        await unfollowUser(profile!.firebaseUid, username, resolvedUid, hint);
        setFollowing(false);
        onChange?.(false);
      } else {
        await followUser(
          {
            firebaseUid: profile!.firebaseUid,
            handle: profile!.handle,
            displayName: profile!.displayName,
            avatarUrl: profile!.avatarUrl,
          },
          username,
          resolvedUid,
          hint,
        );
        setFollowing(true);
        onChange?.(true);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo actualizar');
    } finally {
      setBusy(false);
    }
  }

  const sm = size === 'sm';
  const outline = variant === 'outline';

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        type="button"
        disabled={busy}
        onClick={() => void toggle()}
        className={`inline-flex shrink-0 items-center justify-center font-bold transition disabled:opacity-60 ${
          sm ? 'gap-1 rounded-full px-2.5 py-1 text-[10px]' : 'gap-2 rounded-full px-4 py-2 text-sm'
        } ${
          outline
            ? following
              ? 'border border-zinc-600 text-zinc-400 hover:border-zinc-500'
              : 'border border-cyan-400/70 text-cyan-300 hover:bg-cyan-400/10'
            : following
              ? 'border border-zinc-600 bg-zinc-800 text-zinc-200 hover:border-fuchsia-400'
              : 'bg-gradient-to-r from-cyan-500 to-fuchsia-500 text-zinc-950'
        }`}
      >
        {outline ? null : following ? <UserMinus size={16} /> : <UserPlus size={16} />}
        {following ? 'Siguiendo' : 'Seguir'}
      </button>
      {error ? <p className="text-[10px] text-fuchsia-300">{error}</p> : null}
    </div>
  );
}

type UserChip = {
  uid?: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
};

export function FollowListModal({
  title,
  users,
  onClose,
}: {
  title: string;
  users: UserChip[];
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-end bg-black/70 p-0 backdrop-blur-sm sm:place-items-center sm:p-4"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="lb-safe-sheet max-h-[80dvh] w-full max-w-md overflow-y-auto rounded-t-3xl border border-white/10 bg-zinc-950 p-4 sm:rounded-3xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-bold text-white">{title}</h3>
          <button type="button" onClick={onClose} className="text-sm text-zinc-500 hover:text-white">
            Cerrar
          </button>
        </div>
        {users.length === 0 ? (
          <p className="text-sm text-zinc-500">Nadie aquí todavía.</p>
        ) : (
          <ul className="space-y-2">
            {users.map((user) => (
              <li key={user.uid || user.username}>
                <Link
                  to={profileHref(user.username, user.uid)}
                  onClick={onClose}
                  className="flex items-center gap-3 rounded-xl border border-white/5 px-3 py-2 hover:border-cyan-400/30"
                >
                  {user.avatarUrl ? (
                    <img src={user.avatarUrl} alt="" className="h-10 w-10 rounded-full object-cover" />
                  ) : (
                    <div className="grid h-10 w-10 place-items-center rounded-full bg-zinc-800 text-sm font-bold text-cyan-300">
                      {user.username.slice(0, 1).toUpperCase()}
                    </div>
                  )}
                  <div>
                    <p className="text-sm font-semibold text-white">@{user.username}</p>
                    <p className="text-xs text-zinc-500">{user.displayName}</p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export type SocialPost = {
  id: string;
  authorUid?: string;
  authorUsername: string;
  type: 'photo' | 'video' | 'text';
  caption: string | null;
  mediaUrl: string | null;
  mediaUrls?: string[];
  mediaWidth?: number;
  mediaHeight?: number;
  thumbUrl?: string | null;
  visibility?: 'public' | 'friends' | 'private' | 'circle';
  createdAt: string;
  likes: number;
  dislikes: number;
  viewerReaction: 'like' | 'dislike' | null;
  postFormat?: 'story' | 'post' | null;
  durationSec?: number | null;
  reelFeedUntilMs?: number | null;
  sharedFromPostId?: string;
  sharedFromAuthorUid?: string;
  sharedFromUsername?: string;
  overlays?: MediaOverlayItem[];
};

/** Nota de texto: solo texto (nunca player de video). Desplegable si es larga. */
export function TextNoteBody({
  caption,
  className = '',
}: {
  caption?: string | null;
  className?: string;
}) {
  const text = String(caption || '').trim();
  const [expanded, setExpanded] = useState(false);
  const long = text.length > 160 || text.split('\n').length > 4;

  if (!text) {
    return (
      <div className={`px-3.5 py-5 text-sm text-zinc-500 sm:px-4 ${className}`}>
        Sin texto
      </div>
    );
  }

  return (
    <div
      className={`bg-gradient-to-br from-zinc-900 via-zinc-950 to-zinc-900 px-3.5 py-4 sm:px-5 sm:py-5 ${className}`}
    >
      <div
        className={`text-sm leading-relaxed text-white sm:text-[15px] ${
          expanded || !long ? '' : 'line-clamp-5'
        }`}
      >
        <EmojiText text={text} size={POST_EMOJI_SIZE} />
      </div>
      {long ? (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-3 inline-flex min-h-10 items-center rounded-full bg-white/10 px-3 py-1.5 text-xs font-bold text-cyan-200 hover:bg-white/15"
        >
          {expanded ? 'Ver menos' : 'Desplegar'}
        </button>
      ) : null}
    </div>
  );
}

export function ShareAttribution({
  username,
  authorUid,
  postId,
}: {
  username?: string | null;
  authorUid?: string | null;
  postId?: string | null;
}) {
  const handle = String(username || '').replace(/^@/, '').trim();
  if (!handle) return null;
  const base = profileHref(handle, authorUid);
  const href = postId ? `${base}${base.includes('?') ? '&' : '?'}post=${encodeURIComponent(postId)}` : base;
  return (
    <p className="text-[11px] text-zinc-400">
      Reposteado de{' '}
      <Link to={href} className="font-semibold text-cyan-300 hover:underline">
        @{handle}
      </Link>
    </p>
  );
}

export function isTextOnlyPost(post: {
  type?: string | null;
  mediaUrl?: string | null;
  mediaUrls?: string[] | null;
}): boolean {
  if (post.type === 'text') return true;
  if (post.type === 'photo' || post.type === 'video') return false;
  return !post.mediaUrl && !(post.mediaUrls && post.mediaUrls.length > 0);
}

export function PostCard({
  post,
  canDelete,
  canChangeVisibility,
  onDelete,
  onChangeVisibility,
  startVideoExpanded,
  onCloseVideoExpand,
  startPhotoExpanded,
  onClosePhotoExpand,
  onVideoExpand,
}: {
  post: SocialPost;
  canDelete?: boolean;
  canChangeVisibility?: boolean;
  onDelete?: () => void;
  onReact?: (post: SocialPost) => void;
  onChangeVisibility?: (visibility: 'public' | 'friends' | 'private' | 'circle') => void;
  startVideoExpanded?: boolean;
  onCloseVideoExpand?: () => void;
  startPhotoExpanded?: boolean;
  onClosePhotoExpand?: () => void;
  onVideoExpand?: () => void;
}) {
  if (isRepostPost(post)) {
    return (
      <RepostPostCard
        post={post}
        canDelete={canDelete}
        canChangeVisibility={canChangeVisibility}
        onDelete={onDelete}
        onChangeVisibility={onChangeVisibility}
        showVisibility={Boolean(post.visibility)}
      />
    );
  }
  return (
    <StandardPostCard
      post={post}
      canDelete={canDelete}
      canChangeVisibility={canChangeVisibility}
      onDelete={onDelete}
      onChangeVisibility={onChangeVisibility}
      startVideoExpanded={startVideoExpanded}
      onCloseVideoExpand={onCloseVideoExpand}
      startPhotoExpanded={startPhotoExpanded}
      onClosePhotoExpand={onClosePhotoExpand}
      onVideoExpand={onVideoExpand}
    />
  );
}

function StandardPostCard({
  post,
  canDelete,
  canChangeVisibility,
  onDelete,
  onChangeVisibility,
  startVideoExpanded,
  onCloseVideoExpand,
  startPhotoExpanded,
  onClosePhotoExpand,
  onVideoExpand,
}: {
  post: SocialPost;
  canDelete?: boolean;
  canChangeVisibility?: boolean;
  onDelete?: () => void;
  onChangeVisibility?: (visibility: 'public' | 'friends' | 'private' | 'circle') => void;
  startVideoExpanded?: boolean;
  onCloseVideoExpand?: () => void;
  startPhotoExpanded?: boolean;
  onClosePhotoExpand?: () => void;
  onVideoExpand?: () => void;
}) {
  const profile = useAuthStore((state) => state.profile);
  const [busy, setBusy] = useState(false);
  const [reactError, setReactError] = useState<string | null>(null);
  const [likes, setLikes] = useState(post.likes);
  const [dislikes, setDislikes] = useState(post.dislikes);
  const [viewerReaction, setViewerReaction] = useState(post.viewerReaction);
  const [likers, setLikers] = useState<PostReactionUser[]>([]);
  const [dislikers, setDislikers] = useState<PostReactionUser[]>([]);
  const [mediaExpanded, setMediaExpanded] = useState(
    Boolean(startVideoExpanded || startPhotoExpanded),
  );
  const [showComments, setShowComments] = useState(false);
  const [commentCount, setCommentCount] = useState(0);
  const shareUrl = buildPostShareUrl(post.authorUsername, post.id, post.authorUid);
  const shareText =
    post.caption?.trim() ||
    `Mira esta publicación de @${post.authorUsername} en LiveBoom`;

  useEffect(() => {
    return listenPostReactions(post.id, profile?.firebaseUid, (stats) => {
      setLikes(stats.likes);
      setDislikes(stats.dislikes);
      setViewerReaction(stats.viewerReaction);
      setLikers(stats.likers);
      setDislikers(stats.dislikers);
    });
  }, [post.id, profile?.firebaseUid]);

  useEffect(() => {
    return listenPostComments(post.id, (list) => setCommentCount(list.length));
  }, [post.id]);

  useEffect(() => {
    if (startVideoExpanded && onVideoExpand) {
      onVideoExpand();
      return;
    }
    if (startVideoExpanded || startPhotoExpanded) {
      setMediaExpanded(true);
    }
  }, [startVideoExpanded, startPhotoExpanded, onVideoExpand]);

  async function react(reaction: 'like' | 'dislike') {
    if (!profile) {
      setReactError('Inicia sesión para reaccionar');
      return;
    }
    setBusy(true);
    setReactError(null);
    const next = viewerReaction === reaction ? null : reaction;
    try {
      await setPostReaction(post.id, profile.firebaseUid, next, {
        username: profile.handle,
        displayName: profile.displayName,
        avatarUrl: profile.avatarUrl,
      });
    } catch (err) {
      setReactError(err instanceof Error ? err.message : 'No se pudo guardar la reacción');
    } finally {
      setBusy(false);
    }
  }

  const contentKind = {
    type: post.type,
    mediaUrl: post.mediaUrl,
    visibility: post.visibility,
    postFormat: post.postFormat,
    durationSec: post.durationSec,
    reelFeedUntilMs: post.reelFeedUntilMs,
  };
  const showFeedCaption =
    (isPublicationPost(contentKind) || isBoomClipPost(contentKind)) &&
    (post.type === 'photo' || post.type === 'video') &&
    Boolean(post.caption?.trim());

  return (
    <article className="min-w-0 max-w-full overflow-hidden rounded-2xl border border-white/10 bg-zinc-950">
      {post.visibility ? (
        <p className="border-b border-white/5 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
          {post.visibility === 'public'
            ? 'Público · registrados'
            : post.visibility === 'friends'
              ? 'Solo amigos'
              : 'Privado'}
        </p>
      ) : null}
      {post.type === 'photo' && postPhotoUrls(post).length > 1 ? (
        <PostMediaCarousel
          sources={postPhotoUrls(post)}
          caption={post.caption}
          postId={post.id}
          authorUsername={post.authorUsername}
          authorUid={post.authorUid}
          startExpanded={startPhotoExpanded}
          onCloseExpand={onClosePhotoExpand}
          onExpandChange={setMediaExpanded}
          overlays={post.overlays}
        />
      ) : null}
      {post.type === 'photo' && post.mediaUrl && postPhotoUrls(post).length <= 1 ? (
        <PostPhotoViewer
          src={post.mediaUrl}
          caption={post.caption}
          postId={post.id}
          authorUsername={post.authorUsername}
          authorUid={post.authorUid}
          startExpanded={startPhotoExpanded}
          onCloseExpand={onClosePhotoExpand}
          onExpandChange={setMediaExpanded}
          publicationCaption
          overlays={post.overlays}
        />
      ) : null}
      {post.type === 'video' && post.mediaUrl ? (
        <PostVideoPlayer
          src={post.mediaUrl}
          postId={post.id}
          authorUid={post.authorUid}
          authorUsername={post.authorUsername}
          caption={post.caption}
          likes={likes}
          dislikes={dislikes}
          viewerReaction={viewerReaction}
          likers={likers}
          dislikers={dislikers}
          busy={busy}
          onReact={(reaction) => void react(reaction)}
          visibility={post.visibility}
          canChangeVisibility={canChangeVisibility}
          onChangeVisibility={onChangeVisibility}
          canDelete={canDelete}
          onDelete={onDelete}
          startExpanded={onVideoExpand ? false : startVideoExpanded}
          onRequestExpand={onVideoExpand}
          onCloseExpand={onCloseVideoExpand}
          onExpandChange={setMediaExpanded}
          publicationCaption
          overlays={post.overlays}
        />
      ) : null}
      {post.type === 'text' || isTextOnlyPost(post) ? (
        <TextNoteBody caption={post.caption} />
      ) : post.caption && post.type !== 'photo' && post.type !== 'video' ? (
        <p className="border-t border-white/5 px-3 py-2 text-sm text-zinc-300">
          <EmojiText text={post.caption} size={POST_EMOJI_SIZE} />
        </p>
      ) : null}
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
      ) : null}
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-2 border-t border-white/5 px-3 py-2">
        <div className="flex min-w-0 flex-wrap items-center gap-1">
          <PostReactionButtons
            likes={likes}
            dislikes={dislikes}
            viewerReaction={viewerReaction}
            likers={likers}
            dislikers={dislikers}
            busy={busy}
            onReact={(reaction) => void react(reaction)}
          />
          <button
            type="button"
            onClick={() => setShowComments((value) => !value)}
            className={`inline-flex min-h-10 items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-semibold hover:bg-white/5 ${
              showComments ? 'bg-white/10 text-white' : 'text-zinc-300'
            }`}
          >
            <MessageCircle size={15} className="text-cyan-300" />
            {commentCount > 0 ? commentCount : 'Comentar'}
          </button>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {post.authorUsername ? (
            <ReelGiftControls
              authorUsername={post.authorUsername}
              authorUid={post.authorUid}
              postId={post.id}
              inline
            />
          ) : null}
          <ShareContentButton
            url={shareUrl}
            title={`@${post.authorUsername} en LiveBoom`}
            text={shareText}
            mediaUrl={post.mediaUrl}
            mediaType={post.type === 'video' ? 'video' : post.type === 'photo' ? 'photo' : 'text'}
            postId={post.id}
            authorUid={post.authorUid}
            authorUsername={post.authorUsername}
          />
        </div>
        {canDelete && !canChangeVisibility ? (
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
      {reactError ? <p className="px-3 pb-1 text-[11px] text-fuchsia-400">{reactError}</p> : null}
      {showFeedCaption ? <PublicationCaption key={post.id} caption={post.caption || ''} /> : null}
      {!(post.type === 'video' && mediaExpanded) && showComments ? (
        <PostComments postId={post.id} authorUid={post.authorUid} defaultOpen />
      ) : null}
    </article>
  );
}
