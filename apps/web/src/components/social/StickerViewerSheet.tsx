import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { Check, Loader2, Plus, X } from 'lucide-react';
import { COMPOSER_STICKERS, COMPOSER_STICKER_PACKS } from '../../lib/composerStickers';
import {
  CUSTOM_STICKER_MAX,
  listCustomStickers,
  saveStickerReference,
  stickerCreatorUid,
  stickerKey,
} from '../../lib/customStickers';
import { fetchPublicUserByUid, profileHref, type PublicFsUser } from '../../lib/profileFirestore';
import { useAuthStore } from '../../store/authStore';
import { UserAvatar } from '../profile/UserAvatar';

type Props = {
  src: string | null;
  onClose: () => void;
};

type SaveState = 'checking' | 'idle' | 'saving' | 'saved' | 'own' | 'full' | 'error';

export function StickerViewerSheet({ src, onClose }: Props) {
  const uid = useAuthStore((state) => state.profile?.firebaseUid ?? state.firebaseUser?.uid ?? null);
  const creatorUid = useMemo(() => stickerCreatorUid(src), [src]);
  const builtIn = useMemo(() => {
    if (!src || creatorUid) return null;
    const key = stickerKey(src);
    const sticker = COMPOSER_STICKERS.find((item) => item.src && stickerKey(item.src) === key);
    if (!sticker) return null;
    const packLabel = COMPOSER_STICKER_PACKS.find((pack) => pack.id === sticker.pack)?.label ?? null;
    return { label: sticker.label, packLabel };
  }, [src, creatorUid]);
  const [creator, setCreator] = useState<PublicFsUser | null>(null);
  const [creatorLoading, setCreatorLoading] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>('checking');

  useEffect(() => {
    setCreator(null);
    if (!src || !creatorUid) return;
    let alive = true;
    setCreatorLoading(true);
    fetchPublicUserByUid(creatorUid)
      .then((user) => {
        if (alive) setCreator(user);
      })
      .catch(() => undefined)
      .finally(() => {
        if (alive) setCreatorLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [src, creatorUid]);

  useEffect(() => {
    if (!src || !uid) return;
    if (creatorUid && creatorUid === uid) {
      setSaveState('own');
      return;
    }
    let alive = true;
    setSaveState('checking');
    const key = stickerKey(src);
    listCustomStickers(uid)
      .then((list) => {
        if (!alive) return;
        if (list.some((item) => stickerKey(item.src) === key)) setSaveState('saved');
        else setSaveState(list.length >= CUSTOM_STICKER_MAX ? 'full' : 'idle');
      })
      .catch(() => {
        if (alive) setSaveState('idle');
      });
    return () => {
      alive = false;
    };
  }, [src, uid, creatorUid]);

  useEffect(() => {
    if (!src) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [src, onClose]);

  async function save() {
    if (!uid || !src || saveState !== 'idle') return;
    setSaveState('saving');
    try {
      await saveStickerReference(uid, src);
      setSaveState('saved');
    } catch {
      setSaveState('error');
    }
  }

  if (!src || typeof document === 'undefined') return null;

  const creatorName = creator?.displayName || creator?.username || '';

  return createPortal(
    <div
      className="lb-msg-overlay fixed inset-0 z-[130] flex items-end justify-center bg-black/75 sm:items-center sm:p-4"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Sticker"
    >
      <div className="flex max-h-[min(88dvh,40rem)] w-full max-w-sm flex-col overflow-hidden rounded-t-3xl border border-fuchsia-400/35 bg-zinc-950 pb-[max(0.75rem,var(--lb-safe-bottom))] sm:rounded-3xl">
        <div className="flex shrink-0 items-center justify-between px-4 pt-3">
          <p className="text-sm font-bold text-fuchsia-200">Sticker</p>
          <button
            type="button"
            onClick={onClose}
            className="grid h-11 w-11 place-items-center rounded-full bg-white/10 text-white"
            aria-label="Cerrar"
          >
            <X size={16} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-1">
          <div className="lb-sticker-creator__canvas mx-auto mt-2 grid aspect-square w-[min(100%,18rem)] place-items-center rounded-2xl">
            <img
              src={src}
              alt="Sticker"
              draggable={false}
              className="h-[88%] w-[88%] select-none object-contain drop-shadow-[0_6px_14px_rgba(0,0,0,0.5)]"
            />
          </div>

          <div className="mt-3 flex min-h-12 items-center gap-3 rounded-2xl bg-white/[0.05] px-3 py-2">
            {creatorUid ? (
              creatorLoading && !creator ? (
                <div className="flex items-center gap-2 text-xs text-zinc-400">
                  <Loader2 size={14} className="animate-spin" /> Cargando creador…
                </div>
              ) : creator ? (
                <Link
                  to={profileHref(creator.username, creator.firebaseUid || creatorUid)}
                  onClick={onClose}
                  className="flex min-w-0 flex-1 items-center gap-3"
                >
                  <UserAvatar
                    src={creator.avatarUrl}
                    uid={creator.firebaseUid || creatorUid}
                    username={creator.username}
                    displayName={creator.displayName}
                    size="sm"
                  />
                  <span className="min-w-0">
                    <span className="block text-[11px] text-zinc-400">Creado por</span>
                    <span className="block truncate text-sm font-bold text-white">{creatorName}</span>
                    {creator.username ? (
                      <span className="block truncate text-[11px] text-fuchsia-300">@{creator.username}</span>
                    ) : null}
                  </span>
                </Link>
              ) : (
                <span className="text-xs text-zinc-400">Creado por un usuario de LiveBoom</span>
              )
            ) : (
              <span className="min-w-0">
                <span className="block text-[11px] text-zinc-400">Creado por</span>
                <span className="block text-sm font-bold text-white">LiveBoom</span>
                {builtIn ? (
                  <span className="block truncate text-[11px] text-fuchsia-300">
                    {builtIn.label}
                    {builtIn.packLabel ? ` · ${builtIn.packLabel}` : ''}
                  </span>
                ) : null}
              </span>
            )}
          </div>
        </div>

        <div className="shrink-0 px-4 pt-3">
          {!uid ? (
            <p className="text-center text-xs text-zinc-400">Inicia sesión para guardar stickers.</p>
          ) : (
            <>
              <button
                type="button"
                onClick={() => void save()}
                disabled={saveState !== 'idle'}
                className={`flex min-h-12 w-full items-center justify-center gap-2 rounded-full text-sm font-bold transition ${
                  saveState === 'saved' || saveState === 'own'
                    ? 'bg-emerald-500/15 text-emerald-300'
                    : 'bg-gradient-to-r from-fuchsia-500 to-violet-500 text-white shadow-[0_0_14px_rgba(217,70,239,0.45)] disabled:opacity-60'
                }`}
              >
                {saveState === 'saving' || saveState === 'checking' ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : saveState === 'saved' || saveState === 'own' ? (
                  <Check size={16} />
                ) : (
                  <Plus size={16} />
                )}
                {saveState === 'own'
                  ? 'Es tu sticker · ya está en Mis stickers'
                  : saveState === 'saved'
                    ? 'Guardado en Mis stickers'
                    : saveState === 'saving'
                      ? 'Guardando…'
                      : saveState === 'full'
                        ? `Mis stickers está lleno (${CUSTOM_STICKER_MAX})`
                        : 'Guardar en mis stickers'}
              </button>
              {saveState === 'error' ? (
                <button
                  type="button"
                  onClick={() => setSaveState('idle')}
                  className="mt-2 w-full text-center text-xs text-rose-300"
                >
                  No se pudo guardar. Toca para reintentar.
                </button>
              ) : null}
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
