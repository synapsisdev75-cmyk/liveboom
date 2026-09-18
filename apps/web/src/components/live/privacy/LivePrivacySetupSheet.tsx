import { X } from 'lucide-react';
import { GiftIcon } from '../FloatingGift';
import { findLiveGift, sortedLiveGiftCatalog } from '../../../lib/liveboomGifts';
import { PrivacyLockArt } from './PrivacyLockArt';

/** @deprecated El candado ya no usa aviso/countdown. */
export const PRIVACY_DELAY_OPTIONS = [] as const;

type Props = {
  open: boolean;
  busy?: boolean;
  draftIds: string[];
  /** Candado armado, LIVE sigue público. */
  lockArmed?: boolean;
  /** LIVE ya pasó a privado. */
  privateActive?: boolean;
  onClose: () => void;
  onToggleGift: (giftId: string) => void;
  onConfirm: () => void;
  onSealPrivate?: () => void;
  onClearPrivate?: () => void;
};

export function LivePrivacySetupSheet({
  open,
  busy,
  draftIds,
  lockArmed,
  privateActive,
  onClose,
  onToggleGift,
  onConfirm,
  onSealPrivate,
  onClearPrivate,
}: Props) {
  if (!open) return null;
  const selectedId = draftIds[0] || '';
  const selected = selectedId ? findLiveGift(selectedId) : null;
  const giftLocked = Boolean(lockArmed || privateActive);

  return (
    <div className="lb-live-privacy-setup" role="dialog" aria-modal="true">
      <div className="lb-live-privacy-setup__backdrop" onClick={onClose} aria-hidden />
      <div className="lb-live-privacy-setup__panel">
        <div className="lb-live-privacy-setup__head">
          <p className="lb-live-privacy-setup__title">Candado · LIVE privado</p>
          <button type="button" onClick={onClose} className="text-zinc-400 hover:text-white" aria-label="Cerrar">
            <X size={16} />
          </button>
        </div>
        <p className="lb-live-privacy-setup__hint">
          Elige 1 regalo de acceso. El LIVE sigue público. Tú decides cuándo pasar a privado.
          Quien envíe el regalo queda en reserva; al pasar a privado entra. Después, tú aceptas o rechazas.
        </p>
        {selected ? (
          <p className="lb-live-privacy-setup__chosen">
            <PrivacyLockArt
              appearance={privateActive ? 'sealed' : lockArmed ? 'collecting' : 'public'}
              className="lb-live-privacy-setup__art"
            />
            Regalo de acceso: {selected.name}
          </p>
        ) : null}
        <p className="lb-live-privacy-setup__section">Elige el regalo para entrar al privado</p>
        <div className="lb-live-privacy-setup__gifts">
          {sortedLiveGiftCatalog().map((gift) => {
            const active = selectedId === gift.id;
            return (
              <button
                key={gift.id}
                type="button"
                disabled={giftLocked}
                onClick={() => onToggleGift(gift.id)}
                className={`flex w-full min-w-0 items-center justify-between gap-2 rounded-lg px-2 py-2 text-left text-xs ${
                  active ? 'bg-amber-500/20 text-amber-100' : 'text-white'
                }`}
              >
                <span className="inline-flex min-w-0 items-center gap-2">
                  <GiftIcon giftId={gift.id} size={16} />
                  <span className="truncate">{gift.name}</span>
                </span>
                <span className="shrink-0 text-cyan-400">{gift.coins}</span>
              </button>
            );
          })}
        </div>
        {!lockArmed && !privateActive ? (
          <button
            type="button"
            disabled={busy || !selectedId}
            onClick={onConfirm}
            className="lb-live-privacy-setup__confirm"
          >
            {busy ? 'Aplicando…' : 'Activar candado'}
          </button>
        ) : null}
        {lockArmed && !privateActive && onSealPrivate ? (
          <button
            type="button"
            disabled={busy}
            onClick={onSealPrivate}
            className="lb-live-privacy-setup__confirm"
          >
            {busy ? 'Pasando…' : 'Pasar a privado'}
          </button>
        ) : null}
        {(lockArmed || privateActive) && onClearPrivate ? (
          <button
            type="button"
            disabled={busy}
            onClick={onClearPrivate}
            className="lb-live-privacy-setup__clear"
          >
            Quitar candado y reabrir al público
          </button>
        ) : null}
      </div>
    </div>
  );
}
