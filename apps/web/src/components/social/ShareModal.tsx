import {
  Check,
  Copy,
  Globe,
  Link2,
  Lock,
  MoreHorizontal,
  Users,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { listenMyGroups, sendGroupMessage, type LiveGroup } from '../../lib/groupsFirestore';
import { POST_EMOJI_SIZE } from '../../lib/liveboomEmojis';
import { profileHref } from '../../lib/profileFirestore';
import { buildPostShareUrl, shareContent, type ShareMediaType } from '../../lib/shareContent';
import { createRepost, getPostById } from '../../lib/socialFirestore';
import { useBodyScrollLock } from '../../lib/useBodyScrollLock';
import { useAuthStore } from '../../store/authStore';
import { UserAvatar } from '../profile/UserAvatar';
import { EmojiInput, type EmojiInputHandle } from './EmojiInput';
import { EmojiPickerButton } from './EmojiPicker';

export type ShareVisibility = 'public' | 'friends' | 'private';

export type ShareDestinationId = 'whatsapp' | 'copy' | 'groups' | 'x' | 'telegram' | 'more';

/** Destinos visibles. Añadir aquí nuevas opciones externas o internas. */
export const SHARE_DESTINATIONS: Array<{
  id: ShareDestinationId;
  label: string;
  group: 'internal' | 'external';
}> = [
  { id: 'whatsapp', label: 'WhatsApp', group: 'external' },
  { id: 'copy', label: 'Copiar enlace', group: 'external' },
  { id: 'groups', label: 'Grupo', group: 'internal' },
  { id: 'x', label: 'X', group: 'external' },
  { id: 'telegram', label: 'Telegram', group: 'external' },
  { id: 'more', label: 'Más', group: 'external' },
];

const PRIVACY_OPTIONS: Array<{
  id: ShareVisibility;
  label: string;
  icon: typeof Globe;
}> = [
  { id: 'public', label: 'Público', icon: Globe },
  { id: 'friends', label: 'Amigos', icon: Users },
  { id: 'private', label: 'Privado', icon: Lock },
];

type Props = {
  open: boolean;
  onClose: () => void;
  url: string;
  title?: string;
  text?: string;
  mediaUrl?: string | null;
  mediaType?: ShareMediaType | null;
  postId?: string | null;
  authorUid?: string | null;
  authorUsername?: string | null;
  onCopied?: () => void;
  onReposted?: () => void;
};

function WhatsAppIcon({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M19.05 4.91A9.82 9.82 0 0 0 12.04 2C6.55 2 2.08 6.45 2.08 11.94c0 1.78.46 3.45 1.28 4.9L2 22l5.31-1.39a10 10 0 0 0 4.73 1.2h.01c5.49 0 9.96-4.45 9.96-9.94 0-2.66-1.04-5.16-2.96-7.0zm-7.01 15.29h-.01a8.26 8.26 0 0 1-4.21-1.15l-.3-.18-3.15.82.84-3.07-.2-.32a8.2 8.2 0 0 1-1.26-4.38c0-4.54 3.7-8.23 8.26-8.23 2.2 0 4.28.86 5.84 2.42a8.18 8.18 0 0 1 2.42 5.83c0 4.54-3.7 8.26-8.23 8.26zm4.52-6.17c-.25-.12-1.47-.72-1.7-.81-.23-.08-.39-.12-.56.12-.17.25-.64.81-.79.97-.14.17-.29.19-.54.06-.25-.12-1.05-.39-2-1.23-.74-.66-1.24-1.47-1.38-1.72-.14-.25-.02-.38.11-.51.11-.11.25-.29.37-.43.12-.14.17-.25.25-.41.08-.17.04-.31-.02-.43-.06-.12-.56-1.35-.77-1.84-.2-.49-.41-.42-.56-.43h-.48c-.17 0-.43.06-.66.31-.23.25-.87.85-.87 2.07 0 1.22.89 2.4 1.01 2.56.12.17 1.75 2.67 4.23 3.74 1.76.76 2.18.83 2.96.7.45-.08 1.47-.6 1.67-1.18.21-.58.21-1.07.14-1.18-.06-.10-.23-.17-.48-.29z" />
    </svg>
  );
}

function XLogo({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M18.24 2H21l-6.51 7.44L22 22h-6.17l-4.83-6.31L5.7 22H3l6.97-7.96L2 2h6.32l4.36 5.77L18.24 2zm-1.08 18.1h1.7L6.93 3.81H5.1l12.06 16.29z" />
    </svg>
  );
}

function TelegramIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M21.5 4.3 18.7 20c-.2 1-1.2 1.3-2 .8l-5.5-4.1-2.7 2.6c-.3.3-.8.1-.9-.3l-.6-5.1L3 11.6c-1-.3-1-1.6.1-1.9l17.2-6.6c.9-.3 1.7.5 1.2 1.2zM9.4 13.6l.4 3.3 1.1-1 4.4 3.3 4.5-14.3z" />
    </svg>
  );
}

function shareMessage(text: string | undefined, url: string) {
  const body = String(text || '').trim() || 'Mira esto en LiveBoom';
  return `${body}\n${url}`;
}

function openExternal(href: string) {
  window.open(href, '_blank', 'noopener,noreferrer');
}

function DestinationButton({
  label,
  onClick,
  children,
  active,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-[clamp(3.5rem,22vw,4.75rem)] shrink-0 flex-col items-center gap-1.5 ${active ? 'text-cyan-200' : 'text-zinc-200'}`}
    >
      <span
        className={`grid h-11 w-11 place-items-center rounded-full transition ${
          active ? 'bg-cyan-500/25 text-cyan-200' : 'bg-white/10 text-white hover:bg-white/15'
        }`}
      >
        {children}
      </span>
      <span className="max-w-full text-center text-[10px] font-semibold leading-tight text-zinc-300">{label}</span>
    </button>
  );
}

export function ShareModal({
  open,
  onClose,
  url,
  title = 'LiveBoom',
  text,
  mediaUrl,
  mediaType,
  postId,
  authorUid,
  authorUsername,
  onCopied,
  onReposted,
}: Props) {
  const profile = useAuthStore((state) => state.profile);
  const [caption, setCaption] = useState('');
  const [privacy, setPrivacy] = useState<ShareVisibility>('public');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [groupNote, setGroupNote] = useState<string | null>(null);
  const [showGroups, setShowGroups] = useState(false);
  const [groups, setGroups] = useState<LiveGroup[]>([]);
  const [sendingGroupId, setSendingGroupId] = useState<string | null>(null);
  const [shareUrl, setShareUrl] = useState(url);
  const [origin, setOrigin] = useState({
    handle: String(authorUsername || '').replace(/^@/, ''),
    uid: authorUid,
    postId: postId || null,
  });
  const captionInputRef = useRef<EmojiInputHandle>(null);

  useBodyScrollLock(open);

  useEffect(() => {
    if (!open) return;
    setCaption('');
    setPrivacy('public');
    setBusy(false);
    setError(null);
    setCopied(false);
    setGroupNote(null);
    setShowGroups(false);
    setSendingGroupId(null);
    setShareUrl(url);
    setOrigin({
      handle: String(authorUsername || '').replace(/^@/, ''),
      uid: authorUid,
      postId: postId || null,
    });
  }, [open, postId, url, authorUsername, authorUid]);

  useEffect(() => {
    if (!open || !postId) return;
    let cancelled = false;
    void getPostById(postId)
      .then((post) => {
        if (cancelled || !post) return;
        const fromUser = (post.sharedFromUsername || post.username).replace(/^@/, '');
        const fromUid = post.sharedFromAuthorUid || post.authorUid;
        const fromPostId = post.sharedFromPostId || post.id;
        setOrigin({ handle: fromUser, uid: fromUid, postId: fromPostId });
        if (post.sharedFromPostId && post.sharedFromUsername) {
          setShareUrl(buildPostShareUrl(post.sharedFromUsername, post.sharedFromPostId, post.sharedFromAuthorUid));
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [open, postId]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open || !showGroups || !profile?.firebaseUid) {
      setGroups([]);
      return;
    }
    return listenMyGroups(profile.firebaseUid, setGroups);
  }, [open, showGroups, profile?.firebaseUid]);

  const canRepost = Boolean(profile && postId);
  const originalPostHref = useMemo(() => {
    if (!origin.handle) return null;
    const base = profileHref(origin.handle, origin.uid);
    return origin.postId
      ? `${base}${base.includes('?') ? '&' : '?'}post=${encodeURIComponent(origin.postId)}`
      : base;
  }, [origin.handle, origin.uid, origin.postId]);

  async function handleRepost() {
    if (!profile || !postId) {
      setError('Inicia sesión para republicar en LiveBoom');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await createRepost({
        authorUid: profile.firebaseUid,
        username: profile.handle,
        authorDisplayName: profile.displayName,
        sourcePostId: postId,
        caption,
        visibility: privacy,
      });
      onReposted?.();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo compartir');
    } finally {
      setBusy(false);
    }
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      onCopied?.();
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setError('No se pudo copiar el enlace');
    }
  }

  async function handleMore() {
    const result = await shareContent({ url: shareUrl, title, text, mediaUrl, mediaType });
    if (result === 'copied') {
      setCopied(true);
      onCopied?.();
      window.setTimeout(() => setCopied(false), 1800);
    }
  }

  async function handleGroup(group: LiveGroup) {
    if (!profile) {
      setError('Inicia sesión para compartir en un grupo');
      return;
    }
    setSendingGroupId(group.id);
    setGroupNote(null);
    try {
      await sendGroupMessage(group.id, {
        fromUid: profile.firebaseUid,
        username: profile.handle,
        text: caption.trim() || `Mira esto en LiveBoom`,
        linkUrl: shareUrl,
      });
      setGroupNote(`Enviado a ${group.name}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo enviar al grupo');
    } finally {
      setSendingGroupId(null);
    }
  }

  function onDestination(id: ShareDestinationId) {
    setError(null);
    if (id === 'whatsapp') {
      openExternal(`https://wa.me/?text=${encodeURIComponent(shareMessage(text, shareUrl))}`);
      return;
    }
    if (id === 'copy') {
      void handleCopy();
      return;
    }
    if (id === 'groups') {
      setShowGroups((value) => !value);
      return;
    }
    if (id === 'x') {
      const params = new URLSearchParams();
      params.set('url', shareUrl);
      if (text) params.set('text', text);
      openExternal(`https://twitter.com/intent/tweet?${params.toString()}`);
      return;
    }
    if (id === 'telegram') {
      const params = new URLSearchParams();
      params.set('url', shareUrl);
      params.set('text', text || 'Mira esto en LiveBoom');
      openExternal(`https://t.me/share/url?${params.toString()}`);
      return;
    }
    if (id === 'more') {
      void handleMore();
    }
  }

  if (!open || typeof document === 'undefined') return null;

  const destinationIcon = (id: ShareDestinationId) => {
    if (id === 'whatsapp') return <span className="text-emerald-400"><WhatsAppIcon /></span>;
    if (id === 'copy') return copied ? <Check size={18} className="text-cyan-300" /> : <Copy size={18} />;
    if (id === 'groups') return <Users size={18} className="text-cyan-300" />;
    if (id === 'x') return <XLogo />;
    if (id === 'telegram') return <span className="text-sky-400"><TelegramIcon /></span>;
    return <MoreHorizontal size={18} />;
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[122] flex items-end justify-center overscroll-none bg-black/75 sm:items-center"
      style={{
        paddingTop: 'max(0.5rem, var(--lb-safe-top, env(safe-area-inset-top)))',
        paddingBottom: 'max(0.5rem, var(--lb-safe-bottom, env(safe-area-inset-bottom)))',
        paddingLeft: 'max(0.5rem, var(--lb-safe-left, env(safe-area-inset-left)))',
        paddingRight: 'max(0.5rem, var(--lb-safe-right, env(safe-area-inset-right)))',
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="flex w-full max-w-lg flex-col overflow-hidden rounded-t-3xl border border-white/10 bg-zinc-950 shadow-[0_20px_80px_rgba(0,0,0,0.55)] sm:rounded-3xl"
        style={{
          maxHeight:
            'min(92dvh, calc(100dvh - var(--lb-safe-top, 0px) - var(--lb-safe-bottom, 0px) - 1rem))',
        }}
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="share-modal-title"
      >
        <div className="flex shrink-0 items-center border-b border-white/10 px-2 py-2">
          <span className="h-11 w-11 shrink-0" aria-hidden />
          <h3 id="share-modal-title" className="flex-1 text-center text-base font-bold text-white">
            Compartir
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-white/10 text-white hover:bg-white/15"
            aria-label="Cerrar"
          >
            <X size={18} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3">
          <section className="rounded-2xl border border-white/10 bg-zinc-900/70 p-3">
            {profile ? (
              <div className="mb-3 flex items-center gap-2.5">
                <UserAvatar
                  uid={profile.firebaseUid}
                  src={profile.avatarUrl}
                  username={profile.handle}
                  displayName={profile.displayName}
                  size={36}
                />
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-white">@{profile.handle}</p>
                  {origin.handle ? (
                    <p className="truncate text-[11px] text-zinc-400">
                      Publicación de{' '}
                      {originalPostHref ? (
                        <Link to={originalPostHref} className="font-semibold text-cyan-300 hover:underline">
                          @{origin.handle}
                        </Link>
                      ) : (
                        <span>@{origin.handle}</span>
                      )}
                    </p>
                  ) : null}
                </div>
              </div>
            ) : (
              <p className="mb-3 text-sm text-zinc-300">
                <Link to="/login" className="font-semibold text-cyan-300 hover:underline">
                  Inicia sesión
                </Link>{' '}
                para republicar en tu feed.
              </p>
            )}

            <div className="mb-3 flex flex-wrap gap-1.5">
              {PRIVACY_OPTIONS.map((option) => {
                const Icon = option.icon;
                const active = privacy === option.id;
                return (
                  <button
                    key={option.id}
                    type="button"
                    disabled={!canRepost}
                    onClick={() => setPrivacy(option.id)}
                    className={`inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 text-xs font-semibold transition disabled:opacity-50 ${
                      active
                        ? 'bg-gradient-to-r from-fuchsia-500/90 to-cyan-400/90 text-zinc-950'
                        : 'bg-white/10 text-zinc-200 hover:bg-white/15'
                    }`}
                  >
                    <Icon size={14} />
                    {option.label}
                  </button>
                );
              })}
            </div>

            <div className="relative mb-3">
              <EmojiInput
                ref={captionInputRef}
                multiline
                rows={3}
                value={caption}
                onChange={setCaption}
                maxLength={2000}
                disabled={!canRepost || busy}
                placeholder="Haz un comentario..."
                emojiSize={POST_EMOJI_SIZE}
                fieldClassName="min-h-[4.5rem] w-full rounded-xl border border-white/10 bg-black/40"
                padClassName="px-3 py-2 pr-11"
                mirrorTextClassName="text-white"
              />
              <div className="absolute bottom-1.5 right-1.5 z-10">
                {canRepost ? (
                  <EmojiPickerButton
                    placement="above"
                    showUnicode
                    onPick={(id) => captionInputRef.current?.insertToken(id)}
                  />
                ) : null}
              </div>
            </div>

            <div className="flex justify-end">
              <button
                type="button"
                disabled={!canRepost || busy}
                onClick={() => void handleRepost()}
                className="inline-flex min-h-11 min-w-[min(100%,9.5rem)] items-center justify-center rounded-full bg-gradient-to-r from-fuchsia-500 to-cyan-400 px-5 text-sm font-bold text-zinc-950 disabled:opacity-50"
              >
                {busy ? 'Compartiendo…' : 'Compartir ahora'}
              </button>
            </div>
          </section>

          <div className="my-4 h-px bg-white/10" />

          <section>
            <div className="mb-3 flex items-center gap-2">
              <Link2 size={14} className="text-zinc-500" />
              <h4 className="text-sm font-semibold text-white">Compartir en</h4>
            </div>
            <div className="flex flex-wrap justify-start gap-x-1 gap-y-3 sm:gap-x-2">
              {SHARE_DESTINATIONS.map((item) => (
                <DestinationButton
                  key={item.id}
                  label={item.id === 'copy' && copied ? 'Copiado' : item.label}
                  active={item.id === 'groups' && showGroups}
                  onClick={() => onDestination(item.id)}
                >
                  {destinationIcon(item.id)}
                </DestinationButton>
              ))}
            </div>

            {showGroups ? (
              <div className="mt-3 max-h-48 overflow-y-auto overscroll-contain rounded-2xl border border-white/10 bg-black/30 p-2">
                {!profile ? (
                  <p className="px-2 py-3 text-sm text-zinc-400">
                    <Link to="/login" className="text-cyan-300 hover:underline">
                      Inicia sesión
                    </Link>{' '}
                    para compartir en un grupo.
                  </p>
                ) : groups.length === 0 ? (
                  <p className="px-2 py-3 text-sm text-zinc-400">
                    Aún no tienes grupos.{' '}
                    <Link to="/grupos" className="text-cyan-300 hover:underline">
                      Crear uno
                    </Link>
                  </p>
                ) : (
                  <ul className="space-y-1">
                    {groups.map((group) => (
                      <li key={group.id}>
                        <button
                          type="button"
                          disabled={sendingGroupId === group.id}
                          onClick={() => void handleGroup(group)}
                          className="flex min-h-11 w-full items-center gap-2.5 rounded-xl px-2 py-1.5 text-left hover:bg-white/10 disabled:opacity-60"
                        >
                          {group.photoUrl ? (
                            <img src={group.photoUrl} alt="" className="h-9 w-9 rounded-full object-cover" />
                          ) : (
                            <span className="grid h-9 w-9 place-items-center rounded-full bg-white/10 text-xs font-bold text-cyan-300">
                              {group.name.slice(0, 1).toUpperCase()}
                            </span>
                          )}
                          <span className="min-w-0 flex-1 truncate text-sm font-semibold text-white">{group.name}</span>
                          <span className="text-[11px] text-zinc-500">
                            {sendingGroupId === group.id ? 'Enviando…' : 'Enviar'}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ) : null}
            {groupNote ? <p className="mt-2 text-xs font-semibold text-cyan-300">{groupNote}</p> : null}
          </section>

          {error ? <p className="mt-3 text-sm text-fuchsia-400">{error}</p> : null}
        </div>
      </div>
    </div>,
    document.body,
  );
}
