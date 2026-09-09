import { MessageCircle } from 'lucide-react';
import { type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { PostReactionUser } from '../../lib/socialFirestore';
import { profileHref } from '../../lib/profileFirestore';
import { UserAvatar } from '../profile/UserAvatar';
import { LiveBoomReactionControl } from './LiveBoomReactionControl';
import { ShareContentButton } from './ShareContentButton';
import { PostViewsIndicator } from './PostViewsIndicator';
import { ReelGiftControls } from '../feed/ReelGiftControls';
import { useT } from '../../i18n';

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
      className={`lb-action-rail__btn grid place-items-center rounded-full shadow-lg backdrop-blur-sm transition disabled:opacity-50 ${
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
  onGiftsOpenChange?: (open: boolean) => void;
  /** `media` = anclado al borde del video; `viewport` = borde de pantalla (legacy). */
  anchor?: 'media' | 'viewport';
  /** `aside` = columna al lado del media (PC, igual que Explorar). */
  layout?: 'default' | 'corner' | 'aside';
};

/**
 * Barra de acciones (perfil, Boom, regalos, comentarios, compartir)
 * a la izquierda del media, igual en Explorar / Clip / Flash / Publicaciones.
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
  shareText,
  mediaUrl,
  mediaType = 'photo',
  commentsPanelOpen = false,
  showGifts = true,
  onGiftsOpenChange,
  anchor = 'viewport',
  layout = 'default',
}: Props) {
  const t = useT();
  const profilePath =
    authorUsername || authorUid ? profileHref(authorUsername || 'user', authorUid) : null;
  const resolvedShareText = shareText ?? t('share.lookAtThis');
  const isAsideRail = layout === 'aside';
  const isCornerRail = layout === 'corner' && anchor === 'media';
  const isMediaRail = anchor === 'media' || isCornerRail || isAsideRail;

  return (
    <div
      className={`pointer-events-auto z-20 flex flex-col items-center ${
        isMediaRail ? 'lb-action-rail--fit' : ''
      } ${
        isAsideRail
          ? 'lb-action-rail--aside relative'
          : `absolute overflow-visible ${
              isCornerRail
                ? `lb-action-rail--media lb-action-rail--corner ${
                    commentsPanelOpen ? 'lb-action-rail--comments-open' : ''
                  }`
                : `${anchor === 'media' ? 'lb-action-rail--media' : 'pl-1'} ${
                    commentsPanelOpen ? 'lb-action-rail--comments-open' : ''
                  } ${
                    anchor === 'media'
                      ? 'top-1/2 -translate-y-1/2'
                      : commentsPanelOpen
                        ? 'bottom-[min(46dvh,calc(100dvh-8rem))]'
                        : 'bottom-[max(1rem,env(safe-area-inset-bottom,0px))] sm:bottom-4'
                  }`
            }`
      }`}
      style={
        isAsideRail
          ? undefined
          : anchor === 'viewport'
            ? { left: 'max(0.5rem, env(safe-area-inset-left, 0px))' }
            : undefined
      }
    >
      {profilePath ? (
        <Link
          to={profilePath}
          onClick={(e) => e.stopPropagation()}
          className="lb-action-rail__avatar-wrap mb-0.5"
          aria-label={authorUsername ? t('actions.profileOf', { name: authorUsername }) : t('actions.viewProfile')}
          title={authorUsername ? `@${authorUsername}` : t('nav.profile')}
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

      <LiveBoomReactionControl
        currentUserReaction={viewerReaction}
        likeCount={likes}
        dislikeCount={dislikes}
        likers={likers}
        dislikers={dislikers}
        busy={busy}
        onReact={onReact}
        size="md"
        layout="rail"
      />

      {showGifts && authorUsername ? (
        <div className="lb-action-rail__gift">
          <ReelGiftControls
            authorUsername={authorUsername}
            authorUid={authorUid}
            postId={postId}
            onOpenChange={onGiftsOpenChange}
          />
        </div>
      ) : null}

      <div className="relative flex flex-col items-center gap-[var(--lb-action-gap,0.2rem)]">
        <OverlayIconButton
          active={commentsOpen}
          activeClass="bg-cyan-500 text-zinc-950"
          onClick={onToggleComments}
        >
          <MessageCircle className="lb-action-rail__icon" size={20} />
        </OverlayIconButton>
        <span className="lb-action-rail__label min-h-[14px] font-bold text-white drop-shadow">
          {commentCount > 0 ? commentCount : t('actions.comment')}
        </span>
      </div>

      <PostViewsIndicator postId={postId} variant="rail" recordMode="open" />

      {shareUrl ? (
        <ShareContentButton
          url={shareUrl}
          title={shareTitle}
          text={resolvedShareText}
          mediaUrl={mediaUrl}
          mediaType={mediaType}
          postId={postId}
          authorUid={authorUid}
          authorUsername={authorUsername}
          iconOnly
          className="lb-action-rail-share"
        />
      ) : null}
    </div>
  );
}
