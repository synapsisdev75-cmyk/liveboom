import {
  Globe,
  Lock,
  Maximize2,
  MessageCircle,
  ThumbsDown,
  ThumbsUp,
  Volume2,
  VolumeX,
  X,
  Users,
} from 'lucide-react';
import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  addPostComment,
  deletePostComment,
  listenPostComments,
  type PostComment,
} from '../../lib/socialFirestore';
import { profileHref } from '../../lib/profileFirestore';
import { useAuthStore } from '../../store/authStore';

type Visibility = 'public' | 'friends' | 'private';

type Props = {
  src: string;
  postId: string;
  authorUid?: string;
  caption?: string | null;
  likes: number;
  dislikes: number;
  viewerReaction: 'like' | 'dislike' | null;
  busy?: boolean;
  onReact: (reaction: 'like' | 'dislike') => void;
  visibility?: Visibility;
  canChangeVisibility?: boolean;
  onChangeVisibility?: (visibility: Visibility) => void;
  canDelete?: boolean;
  onDelete?: () => void;
  /** Abrir expandido al montar (p. ej. justo después de publicar). */
  startExpanded?: boolean;
  onCloseExpand?: () => void;
};

export function PostVideoPlayer({
  src,
  postId,
  authorUid,
  caption,
  likes,
  dislikes,
  viewerReaction,
  busy,
  onReact,
  visibility,
  canChangeVisibility,
  onChangeVisibility,
  canDelete,
  onDelete,
  startExpanded = false,
  onCloseExpand,
}: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const inlineRef = useRef<HTMLVideoElement>(null);
  const fullRef = useRef<HTMLVideoElement>(null);
  const [expanded, setExpanded] = useState(startExpanded);
  const [muted, setMuted] = useState(true);

  useEffect(() => {
    if (startExpanded) setExpanded(true);
  }, [startExpanded]);

  // Autoplay (muted) cuando el video entra en viewport
  useEffect(() => {
    const host = wrapRef.current;
    const video = inlineRef.current;
    if (!host || !video || expanded) return;

    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry) return;
        if (entry.isIntersecting && entry.intersectionRatio >= 0.45) {
          video.muted = true;
          setMuted(true);
          void video.play().catch(() => undefined);
        } else {
          video.pause();
        }
      },
      { threshold: [0, 0.45, 0.75] },
    );
    io.observe(host);
    return () => io.disconnect();
  }, [src, expanded]);

  // En pantalla completa: reproducir y sincronizar tiempo
  useEffect(() => {
    if (!expanded) return;
    const full = fullRef.current;
    const inline = inlineRef.current;
    if (!full) return;
    if (inline) full.currentTime = inline.currentTime;
    full.muted = muted;
    void full.play().catch(() => undefined);

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow;
      if (inline && full) {
        inline.currentTime = full.currentTime;
        void inline.play().catch(() => undefined);
      }
    };
  }, [expanded]);

  useEffect(() => {
    const el = expanded ? fullRef.current : inlineRef.current;
    if (el) el.muted = muted;
  }, [muted, expanded]);

  function toggleMute(event: MouseEvent) {
    event.stopPropagation();
    setMuted((value) => !value);
  }

  function openExpand(event?: MouseEvent) {
    event?.stopPropagation();
    setExpanded(true);
  }

  function closeExpand() {
    setExpanded(false);
    onCloseExpand?.();
  }

  return (
    <>
      <div ref={wrapRef} className="relative aspect-[4/5] w-full bg-black">
        <video
          ref={inlineRef}
          src={src}
          className="h-full w-full object-cover"
          muted={muted}
          loop
          playsInline
          preload="metadata"
          onClick={openExpand}
        />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/70 to-transparent" />
        <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={toggleMute}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur-sm"
            aria-label={muted ? 'Activar sonido' : 'Silenciar'}
          >
            {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
          </button>
          <button
            type="button"
            onClick={openExpand}
            className="inline-flex items-center gap-1.5 rounded-full bg-black/55 px-3 py-2 text-xs font-bold text-white backdrop-blur-sm"
          >
            <Maximize2 size={14} /> Expandir
          </button>
        </div>
      </div>

      {expanded ? (
        <div className="fixed inset-0 z-[70] flex flex-col bg-black">
          <video
            ref={fullRef}
            src={src}
            className="absolute inset-0 h-full w-full object-cover"
            muted={muted}
            loop
            playsInline
            autoPlay
            onClick={() => {
              const el = fullRef.current;
              if (!el) return;
              if (el.paused) void el.play();
              else el.pause();
            }}
          />
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/55 via-transparent to-black/80" />

          <div className="relative z-10 flex items-start justify-between gap-3 p-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
            <button
              type="button"
              onClick={closeExpand}
              className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur-sm"
              aria-label="Cerrar"
            >
              <X size={18} />
            </button>
            <button
              type="button"
              onClick={toggleMute}
              className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur-sm"
              aria-label={muted ? 'Activar sonido' : 'Silenciar'}
            >
              {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
            </button>
          </div>

          <div className="relative z-10 mt-auto flex min-h-0 flex-1 flex-col justify-end">
            <div className="absolute bottom-28 right-3 flex flex-col items-center gap-3 sm:bottom-32">
              <OverlayIconButton
                active={viewerReaction === 'like'}
                activeClass="bg-cyan-500 text-zinc-950"
                onClick={() => onReact('like')}
                disabled={busy}
                label={String(likes)}
              >
                <ThumbsUp size={20} />
              </OverlayIconButton>
              <OverlayIconButton
                active={viewerReaction === 'dislike'}
                activeClass="bg-fuchsia-500 text-zinc-950"
                onClick={() => onReact('dislike')}
                disabled={busy}
                label={String(dislikes)}
              >
                <ThumbsDown size={20} />
              </OverlayIconButton>
            </div>

            <div className="space-y-2 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
              {caption ? (
                <p className="line-clamp-3 text-sm font-medium text-white drop-shadow">{caption}</p>
              ) : null}

              {canChangeVisibility ? (
                <div className="flex flex-wrap items-center gap-1">
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
                      onClick={() => onChangeVisibility?.(value)}
                      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-bold backdrop-blur-sm ${
                        visibility === value
                          ? 'bg-emerald-400 text-zinc-950'
                          : 'bg-white/15 text-white'
                      }`}
                    >
                      <Icon size={12} />
                      {label}
                    </button>
                  ))}
                  {canDelete ? (
                    <button
                      type="button"
                      onClick={onDelete}
                      className="rounded-full bg-white/10 px-2.5 py-1 text-[10px] font-bold text-rose-200 backdrop-blur-sm"
                    >
                      Eliminar
                    </button>
                  ) : null}
                </div>
              ) : null}

              <div className="max-h-[38dvh] overflow-hidden rounded-2xl border border-white/15 bg-black/45 backdrop-blur-md">
                <PostComments
                  postId={postId}
                  authorUid={authorUid}
                  variant="overlay"
                />
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

function OverlayIconButton({
  children,
  label,
  onClick,
  disabled,
  active,
  activeClass,
}: {
  children: ReactNode;
  label: string;
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
      className="flex flex-col items-center gap-1 disabled:opacity-50"
    >
      <span
        className={`grid h-12 w-12 place-items-center rounded-full shadow-lg backdrop-blur-sm ${
          active ? activeClass : 'bg-black/55 text-white'
        }`}
      >
        {children}
      </span>
      <span className="text-[11px] font-bold text-white drop-shadow">{label}</span>
    </button>
  );
}

export function PostComments({
  postId,
  authorUid,
  variant = 'inline',
}: {
  postId: string;
  authorUid?: string;
  variant?: 'inline' | 'overlay';
}) {
  const profile = useAuthStore((state) => state.profile);
  const [comments, setComments] = useState<PostComment[]>([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    return listenPostComments(postId, setComments);
  }, [postId]);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [comments.length]);

  async function submit() {
    if (!profile) {
      setError('Inicia sesión para comentar');
      return;
    }
    const body = text.trim();
    if (!body) return;
    setBusy(true);
    setError(null);
    try {
      await addPostComment(
        postId,
        {
          firebaseUid: profile.firebaseUid,
          handle: profile.handle,
          displayName: profile.displayName,
          avatarUrl: profile.avatarUrl,
        },
        body,
      );
      setText('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo publicar el comentario');
    } finally {
      setBusy(false);
    }
  }

  async function remove(commentId: string) {
    setError(null);
    try {
      await deletePostComment(postId, commentId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo eliminar el comentario');
    }
  }

  const overlay = variant === 'overlay';

  return (
    <div className={overlay ? 'px-3 py-2.5' : 'border-t border-white/5 px-3 py-3'}>
      <p
        className={`mb-2 inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide ${
          overlay ? 'text-white/70' : 'text-zinc-500'
        }`}
      >
        <MessageCircle size={12} />
        Comentarios
        {comments.length > 0 ? <span className={overlay ? 'text-white/50' : 'text-zinc-400'}>{comments.length}</span> : null}
      </p>
      <ul
        ref={listRef}
        className={`space-y-2 overflow-y-auto ${overlay ? 'max-h-[22dvh]' : 'max-h-48'}`}
      >
        {comments.length === 0 ? (
          <li className={`text-[11px] ${overlay ? 'text-white/45' : 'text-zinc-600'}`}>
            Sé el primero en comentar.
          </li>
        ) : (
          comments.map((comment) => {
            const canRemove =
              Boolean(profile) &&
              (profile!.firebaseUid === comment.authorUid ||
                (authorUid && profile!.firebaseUid === authorUid));
            return (
              <li
                key={comment.id}
                className={overlay ? 'rounded-xl bg-white/10 px-2.5 py-2' : 'rounded-xl bg-zinc-900/80 px-2.5 py-2'}
              >
                <div className="flex items-start justify-between gap-2">
                  <Link
                    to={profileHref(comment.username, comment.authorUid)}
                    className={`min-w-0 text-[11px] font-semibold hover:underline ${
                      overlay ? 'text-cyan-300' : 'text-cyan-400'
                    }`}
                  >
                    @{comment.username}
                  </Link>
                  {canRemove ? (
                    <button
                      type="button"
                      onClick={() => void remove(comment.id)}
                      className={`shrink-0 text-[10px] ${
                        overlay ? 'text-white/50 hover:text-rose-300' : 'text-zinc-500 hover:text-fuchsia-400'
                      }`}
                    >
                      Eliminar
                    </button>
                  ) : null}
                </div>
                <p className={`mt-1 whitespace-pre-wrap text-xs ${overlay ? 'text-white' : 'text-zinc-200'}`}>
                  {comment.text}
                </p>
              </li>
            );
          })
        )}
      </ul>
      {profile ? (
        <form
          className="mt-2 flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <input
            value={text}
            onChange={(event) => setText(event.target.value)}
            maxLength={500}
            placeholder="Escribe un comentario…"
            className={`min-w-0 flex-1 rounded-lg px-2.5 py-1.5 text-xs outline-none ${
              overlay
                ? 'border border-white/20 bg-black/40 text-white placeholder:text-white/40'
                : 'border border-white/10 bg-black/40 text-white placeholder:text-zinc-600'
            }`}
          />
          <button
            type="submit"
            disabled={busy || !text.trim()}
            className="rounded-lg bg-cyan-500/30 px-3 py-1.5 text-xs font-semibold text-cyan-100 disabled:opacity-50"
          >
            {busy ? '…' : 'Enviar'}
          </button>
        </form>
      ) : (
        <p className={`mt-2 text-[11px] ${overlay ? 'text-white/45' : 'text-zinc-600'}`}>
          Inicia sesión para comentar.
        </p>
      )}
      {error ? <p className="mt-1 text-[11px] text-rose-300">{error}</p> : null}
    </div>
  );
}
