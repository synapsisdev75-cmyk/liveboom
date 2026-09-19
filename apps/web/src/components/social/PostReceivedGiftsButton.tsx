import { Gift } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { DocumentData, QueryDocumentSnapshot } from 'firebase/firestore';
import {
  fetchOlderPostReceivedGifts,
  listenPostGiftUnits,
  listenPostReceivedGiftsPage,
  POST_RECEIVED_GIFTS_PAGE,
  type PostReceivedGiftRow,
} from '../../lib/postReceivedGifts';
import { formatViewCount } from '../../lib/postViews';
import { useBodyScrollLock } from '../../lib/useBodyScrollLock';
import { UserAvatar } from '../profile/UserAvatar';
import { GiftIcon } from '../live/FloatingGift';
import { useAuthStore } from '../../store/authStore';
import { useT } from '../../i18n';

function formatReceivedAt(ms: number, now = Date.now()) {
  if (!ms) return '';
  const mins = Math.max(0, Math.floor((now - ms) / 60000));
  if (mins < 1) return 'Ahora';
  if (mins < 60) return `Hace ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `Hace ${hours} h`;
  const days = Math.floor(hours / 24);
  return `Hace ${days} d`;
}

function stopCardEvent(event: { stopPropagation: () => void; preventDefault?: () => void }) {
  event.stopPropagation();
}

type Variant = 'rail' | 'pill';

export function PostReceivedGiftsButton({
  postId,
  authorUid,
  variant,
  initialUnits = 0,
}: {
  postId?: string | null;
  authorUid?: string | null;
  variant: Variant;
  initialUnits?: number;
}) {
  const t = useT();
  const myUid = useAuthStore((state) => state.profile?.firebaseUid);
  const id = String(postId || '').trim();
  const ownerUid = String(authorUid || '').trim();
  const isOwner = Boolean(myUid && ownerUid && myUid === ownerUid);
  const [units, setUnits] = useState(Math.max(0, Math.floor(Number(initialUnits) || 0)));
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setUnits(Math.max(0, Math.floor(Number(initialUnits) || 0)));
  }, [id, initialUnits]);

  useEffect(() => {
    if (!id || !isOwner) return undefined;
    return listenPostGiftUnits(id, setUnits);
  }, [id, isOwner]);

  if (!id || !isOwner) return null;

  const label = t('actions.viewReceivedGifts');
  const iconSize = variant === 'rail' ? 22 : 18;

  return (
    <>
      <button
        type="button"
        className={
          variant === 'rail'
            ? 'lb-gift-history lb-gift-history--rail'
            : 'lb-gift-history lb-gift-history--pill'
        }
        aria-label={label}
        title={label}
        aria-haspopup="dialog"
        aria-expanded={open}
        onPointerDown={stopCardEvent}
        onMouseDown={stopCardEvent}
        onClick={(event) => {
          event.stopPropagation();
          setOpen(true);
        }}
      >
        <Gift className="lb-gift-history__icon" size={iconSize} strokeWidth={1.85} />
        <span className="lb-gift-history__count">{formatViewCount(units)}</span>
      </button>
      {open ? <PostReceivedGiftsPanel postId={id} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

function PostReceivedGiftsPanel({
  postId,
  onClose,
}: {
  postId: string;
  onClose: () => void;
}) {
  const t = useT();
  const [rows, setRows] = useState<PostReceivedGiftRow[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [loadingMore, setLoadingMore] = useState(false);
  const [retryTick, setRetryTick] = useState(0);
  const lastDocRef = useRef<QueryDocumentSnapshot<DocumentData> | null>(null);
  const [hasMore, setHasMore] = useState(false);

  useBodyScrollLock(true);

  useEffect(() => {
    setStatus('loading');
    setRows([]);
    lastDocRef.current = null;
    const unsub = listenPostReceivedGiftsPage(postId, (result) => {
      if (result.error) {
        setStatus('error');
        return;
      }
      lastDocRef.current = result.last;
      setHasMore(result.rows.length >= POST_RECEIVED_GIFTS_PAGE);
      setRows(result.rows);
      setStatus('ready');
    });
    return () => unsub();
  }, [postId, retryTick]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function loadMore() {
    if (!lastDocRef.current || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await fetchOlderPostReceivedGifts(postId, lastDocRef.current);
      lastDocRef.current = page.last;
      setHasMore(page.rows.length >= POST_RECEIVED_GIFTS_PAGE);
      setRows((prev) => {
        const seen = new Set(prev.map((row) => row.id));
        return [...prev, ...page.rows.filter((row) => !seen.has(row.id))];
      });
    } catch {
      setStatus('error');
    } finally {
      setLoadingMore(false);
    }
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[120] grid place-items-end bg-black/70 p-0 backdrop-blur-sm sm:place-items-center sm:p-4"
      role="presentation"
      onPointerDown={stopCardEvent}
      onMouseDown={stopCardEvent}
      onClick={(event) => {
        event.stopPropagation();
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t('giftsReceived.title')}
        className="lb-safe-sheet flex max-h-[82dvh] w-full max-w-md flex-col rounded-t-3xl border border-white/10 bg-zinc-950 shadow-[0_0_40px_rgba(0,0,0,0.45)] sm:rounded-3xl"
        onPointerDown={stopCardEvent}
        onClick={stopCardEvent}
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-white/5 px-4 py-3">
          <h2 className="text-base font-bold text-white">{t('giftsReceived.title')}</h2>
          <button
            type="button"
            onClick={onClose}
            className="min-h-10 min-w-10 text-sm text-zinc-400 hover:text-white"
          >
            {t('common.close')}
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
          {status === 'loading' ? (
            <p className="px-1 py-6 text-center text-sm text-zinc-400">{t('giftsReceived.loading')}</p>
          ) : null}
          {status === 'error' ? (
            <div className="grid place-items-center gap-3 px-2 py-8 text-center">
              <p className="text-sm text-fuchsia-300">{t('giftsReceived.error')}</p>
              <button
                type="button"
                onClick={() => setRetryTick((n) => n + 1)}
                className="min-h-10 rounded-full border border-white/15 px-4 text-sm font-semibold text-white"
              >
                {t('giftsReceived.retry')}
              </button>
            </div>
          ) : null}
          {status === 'ready' && rows.length === 0 ? (
            <p className="px-1 py-8 text-center text-sm text-zinc-400">{t('giftsReceived.empty')}</p>
          ) : null}
          {status === 'ready' && rows.length > 0 ? (
            <ul className="flex flex-col gap-1">
              {rows.map((row) => (
                <li key={row.id} className="flex items-center gap-3 rounded-2xl px-1.5 py-2">
                  <UserAvatar
                    uid={row.senderUid}
                    username={row.senderUsername || row.senderName}
                    displayName={row.senderName}
                    size={40}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-white">
                      {row.senderUsername ? `@${row.senderUsername}` : row.senderName}
                    </p>
                    <p className="truncate text-xs text-zinc-400">{row.giftName}</p>
                    <p className="text-[11px] text-zinc-500">{formatReceivedAt(row.createdAtMs)}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <GiftIcon giftId={row.giftId} size={36} />
                    <span className="text-sm font-bold tabular-nums text-white">x{row.units}</span>
                  </div>
                </li>
              ))}
            </ul>
          ) : null}
          {status === 'ready' && hasMore ? (
            <button
              type="button"
              disabled={loadingMore}
              onClick={() => void loadMore()}
              className="mt-2 min-h-10 w-full rounded-full text-sm font-semibold text-cyan-300 disabled:opacity-50"
            >
              {loadingMore ? t('giftsReceived.loading') : t('giftsReceived.more')}
            </button>
          ) : null}
        </div>
      </div>
    </div>,
    document.body,
  );
}
