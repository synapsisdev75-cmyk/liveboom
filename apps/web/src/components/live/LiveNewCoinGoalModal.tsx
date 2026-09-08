import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

type Props = {
  open: boolean;
  busy?: boolean;
  error?: string | null;
  onClose: () => void;
  onCreate: (targetCoins: number) => void;
};

export function LiveNewCoinGoalModal({ open, busy = false, error, onClose, onCreate }: Props) {
  const [value, setValue] = useState('1000');
  const [localError, setLocalError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setLocalError(null);
    const frame = window.requestAnimationFrame(() => inputRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [open]);

  if (!open || typeof document === 'undefined') return null;

  function parseTarget(raw: string) {
    const digits = raw.replace(/\D/g, '').slice(0, 7);
    return Number(digits);
  }

  function submit() {
    if (busy) return;
    const target = parseTarget(value);
    if (!Number.isInteger(target) || target <= 0) {
      setLocalError('Escribe un número entero mayor a 0');
      return;
    }
    setLocalError(null);
    onCreate(target);
  }

  function stop(event: { stopPropagation: () => void; preventDefault?: () => void }) {
    event.stopPropagation();
  }

  const message = localError || error;

  return createPortal(
    <div
      className="pointer-events-none fixed inset-0 z-[80]"
      role="presentation"
    >
      <div
        className="pointer-events-auto absolute left-[max(0.5rem,env(safe-area-inset-left))] right-[max(0.5rem,env(safe-area-inset-right))] top-[max(4.6rem,calc(env(safe-area-inset-top)+4.4rem))] sm:right-auto sm:w-[min(100%,18rem)]"
        role="dialog"
        aria-modal="true"
        aria-labelledby="lb-live-new-goal-title"
        onPointerDown={stop}
        onClick={stop}
      >
        <form
          className="lb-live-new-goal"
          onSubmit={(event) => {
            event.preventDefault();
            event.stopPropagation();
            submit();
          }}
        >
          <p id="lb-live-new-goal-title" className="lb-live-new-goal__title">
            Nueva meta en coins
          </p>
          <label className="lb-live-new-goal__label" htmlFor="lb-live-new-goal-input">
            Objetivo
          </label>
          <input
            ref={inputRef}
            id="lb-live-new-goal-input"
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            value={value}
            disabled={busy}
            placeholder="1000"
            autoComplete="off"
            onChange={(event) => {
              setValue(event.target.value.replace(/\D/g, '').slice(0, 7));
              setLocalError(null);
            }}
          />
          {message ? <p className="lb-live-new-goal__error">{message}</p> : null}
          <div className="lb-live-new-goal__actions">
            <button
              type="button"
              disabled={busy}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                onClose();
              }}
            >
              Cancelar
            </button>
            <button type="submit" className="is-primary" disabled={busy}>
              {busy ? 'Creando…' : 'Crear meta'}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}
