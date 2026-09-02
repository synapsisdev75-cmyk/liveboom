import { MessageCircle, ThumbsDown } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { PostReactionUser } from '../../lib/socialFirestore';
import { profileHref } from '../../lib/profileFirestore';
import { UserAvatar } from '../profile/UserAvatar';
import { BoomLikeButton } from './BoomButtons';
import { ReactionList } from './PostReactionButtons';
import { ShareContentButton } from './ShareContentButton';
import { ReelGiftControls } from '../feed/ReelGiftControls';

export function OverlayIconButton({
  children,
  onClick,
  disabled,
  active,
  activeClass,
}: {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
  activeClass: string;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      className={`grid h-10 w-10 place-items-center rounded-full shadow-lg backdrop-blur-sm transition disabled:opacity-50 sm:h-12 sm:w-12 ${
        active ? activeClass : 'bg-black/55 text-white'
      }`}
    >
      {children}
    </button>
  );
}

type Props = {
  postId: string;
  authorUid?: string;
  authorUsername?: string;
  authorAvatarUrl?: string | null;
  likes: number;
  dislikes: number;
  viewerReaction: 'like' | 'dislike' | null;
  likers: PostReactionUser[];
  dislikers: PostReactionUser[];
  busy?: boolean;
  onReact: (reaction: 'like' | 'dislike') => void;
  commentCount: number;
  commentsOpen: boolean;
  onToggleComments: () => void;
  shareUrl?: string | null;
  shareTitle?: string;
  shareText?: string;
  mediaUrl?: string | null;
  mediaType?: 'photo' | 'video' | null;
  /** Ajusta altura cuando el panel de comentarios está abierto. */
  commentsPanelOpen?: boolean;
  showGifts?: boolean;
  /** `media` = anclado al borde del video; `viewport` = borde de pantalla (legacy). */
  anchor?: 'media' | 'viewport';
  /** Solo Explorar: rail abajo-derecha en móvil/tablet/PC. */
  layout?: 'default' | 'corner' | 'aside';
};

/**
 * Barra derecha única de acciones para cualquier publicación abierta
 * (foto, video, explorar, perfil, feed, etc.).
 */
export function PostActionRail({
  postId,
  authorUid,
  authorUsername,
  authorAvatarUrl,
  likes,
  dislikes,
  viewerReaction,
  likers,
  dislikers,
  busy,
  onReact,
  commentCount,
  commentsOpen,
  onToggleComments,
  shareUrl,
  shareTitle = 'LiveBoom',
  shareText = 'Mira esto en LiveBoom',
  mediaUrl,
  mediaType = 'photo',
  commentsPanelOpen = false,
  showGifts = true,
  anchor = 'viewport',
  layout = 'default',
}: Props) {
  const [showLikers, setShowLikers] = useState(false);
  const [showDislikers, setShowDislikers] = useState(false);
  const profilePath =
    authorUsername || authorUid ? profileHref(authorUsername || 'user', authorUid) : null;
  const isAsideRail = layout === 'aside';
  const isCornerRail = layout === 'corner' && anchor === 'media';

  return (
    <div
      className={`pointer-events-auto z-20 flex flex-col items-center ${
        isAsideRail
          ? 'lb-action-rail--aside relative max-h-full overflow-visible'
          : `absolute overflow-y-auto overscroll-contain ${
              isCornerRail
                ? `lb-action-rail--media lb-action-rail--corner gap-1.5 sm:gap-2 ${
                    commentsPanelOpen ? 'lb-action-rail--comments-open' : ''
                  }`
                : `${anchor === 'media' ? 'lb-action-rail--media pr-0' : 'pr-1'} gap-2 sm:gap-3 ${
                    commentsPanelOpen
                      ? anchor === 'media'
                        ? 'top-1/2 max-h-[min(55%,calc(100%-2rem))] -translate-y-1/2'
                        : 'bottom-[min(46dvh,calc(100dvh-8rem))] max-h-[min(40dvh,calc(100dvh-12rem))]'
                      : anchor === 'media'
                        ? 'top-1/2 max-h-[min(72%,calc(100%-1rem))] -translate-y-1/2'
                        : 'bottom-[max(1rem,env(safe-area-inset-bottom,0px))] max-h-[min(72dvh,calc(100dvh-6rem))] sm:bottom-4 sm:max-h-none'
                  }`
            }`
      }`}
      style={
        isAsideRail
          ? undefined
          : anchor === 'viewport'
            ? { right: 'max(0.5rem, env(safe-area-inset-right, 0px))' }
            : undefined
      }
    >
      {profilePath ? (
        <Link
          to={profilePath}
          onClick={(e) => e.stopPropagation()}
          className="mb-0.5"
          aria-label={authorUsername ? `Perfil @${authorUsername}` : 'Ver perfil'}
          title={authorUsername ? `@${authorUsername}` : 'Perfil'}
        >
          <UserAvatar
            uid={authorUid}
            src={authorAvatarUrl}
            username={authorUsername}
            size={isAsideRail ? 40 : 48}
            ringClassName="ring-2 ring-white/80"
          />
        </Link>
      ) : null}

      <div className={`relative flex flex-col items-center ${isAsideRail ? 'gap-0.5' : 'gap-1'}`}>
        <div
          className={`grid place-items-center rounded-full bg-black/55 shadow-lg backdrop-blur-sm ${
            isAsideRail
              ? 'h-[clamp(2rem,5.2vh,2.45rem)] w-[clamp(2rem,5.2vh,2.45rem)]'
              : 'h-10 w-10 sm:h-12 sm:w-12'
          }`}
        >
          <BoomLikeButton
            active={viewerReaction === 'like'}
            busy={busy}
            count={likes}
            showCount={false}
            size="md"
            onToggle={() => onReact('like')}
          />
        </div>
        <button
          type="button"
          disabled={likes === 0}
          onClick={(event) => {
            event.stopPropagation();
            setShowDislikers(false);
            setShowLikers((v) => !v);
          }}
          className="text-[11px] font-bold text-white drop-shadow disabled:opacity-40"
        >
          {likes}
        </button>
        {showLikers ? (
          <div className="absolute bottom-full right-0 mb-2">
            <ReactionList title="Les gustó (Boom)" users={likers} onClose={() => setShowLikers(false)} />
          </div>
        ) : null}
      </div>

      {showGifts && authorUsername ? (
        <ReelGiftControls
          authorUsername={authorUsername}
          authorUid={authorUid}
          postId={postId}
        />
      ) : null}

      <div className="relative flex flex-col items-center gap-0.5">
        <OverlayIconButton
          active={viewerReaction === 'dislike'}
          activeClass="bg-fuchsia-500 text-zinc-950"
          onClick={() => onReact('dislike')}
          disabled={busy}
        >
          <ThumbsDown size={isAsideRail ? 18 : 20} />
        </OverlayIconButton>
        <button
          type="button"
          disabled={dislikes === 0}
          onClick={(event) => {
            event.stopPropagation();
            setShowLikers(false);
            setShowDislikers((v) => !v);
          }}
          className="text-[11px] font-bold text-white drop-shadow disabled:opacity-40"
        >
          {dislikes}
        </button>
        {showDislikers ? (
          <div className="absolute bottom-full right-0 mb-2">
            <ReactionList title="No les gustó" users={dislikers} onClose={() => setShowDislikers(false)} />
          </div>
        ) : null}
      </div>

      <div className={`relative flex flex-col items-center ${isAsideRail ? 'gap-0.5' : 'gap-0.5'}`}>
        <OverlayIconButton
          active={commentsOpen}
          activeClass="bg-cyan-500 text-zinc-950"
          onClick={onToggleComments}
        >
          <MessageCircle size={isAsideRail ? 18 : 20} />
        </OverlayIconButton>
        <span
          className={`min-h-[14px] font-bold text-white drop-shadow ${
            isAsideRail ? 'text-[clamp(0.55rem,1.4vw,0.625rem)]' : 'text-[10px]'
          }`}
        >
          {commentCount > 0 ? commentCount : 'Comentar'}
        </span>
      </div>

      {shareUrl ? (
        <ShareContentButton
          url={shareUrl}
          title={shareTitle}
          text={shareText}
          mediaUrl={mediaUrl}
          mediaType={mediaType}
          iconOnly
        />
      ) : null}
    </div>
  );
}
