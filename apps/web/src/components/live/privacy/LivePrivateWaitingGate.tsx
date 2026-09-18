import { Link } from 'react-router-dom';
import { GiftIcon } from '../FloatingGift';
import { PrivacyLockArt } from './PrivacyLockArt';
import { findLiveGift } from '../../../lib/liveboomGifts';

export type PrivateGateStatus = 'outside' | 'pending' | 'approved' | 'rejected';
export const PRIVATE_GATE_MAX_REJECTS = 3;

type GiftRow = {
  giftId: string;
  giftName: string;
};

type Props = {
  gift: GiftRow | null;
  status: PrivateGateStatus;
  sending?: boolean;
  rejectCount?: number;
  error?: string | null;
  onRequest: () => void;
};

export function LivePrivateWaitingGate({
  gift,
  status,
  sending = false,
  rejectCount = 0,
  error = null,
  onRequest,
}: Props) {
  const catalog = gift ? findLiveGift(gift.giftId) : null;
  const name = catalog?.name || gift?.giftName || 'el regalo';
  const retriesLeft = Math.max(0, PRIVATE_GATE_MAX_REJECTS - rejectCount);
  const blocked = retriesLeft <= 0 && status === 'rejected';
  const canSend = Boolean(gift) && !sending && status !== 'pending' && status !== 'approved' && !blocked;

  return (
    <div className="lb-live-private-gate">
      <div className="lb-live-private-gate__card">
        <PrivacyLockArt appearance="sealed" className="lb-live-private-gate__lock" />
        <p className="lb-live-private-gate__title">LIVE privado</p>
        {status === 'pending' ? (
          <>
            <p className="lb-live-private-gate__lead">Solicitud enviada</p>
            <p className="lb-live-private-gate__gift">
              <GiftIcon giftId={gift?.giftId || ''} size={22} />
              {name} reservado
            </p>
            <p className="lb-live-private-gate__hint">Esperando respuesta del creador...</p>
          </>
        ) : (
          <>
            <p className="lb-live-private-gate__lead">
              Este creador está compartiendo un momento privado.
            </p>
            <p className="lb-live-private-gate__gift">
              <GiftIcon giftId={gift?.giftId || ''} size={22} />
              Regalo solicitado: {name}
            </p>
          </>
        )}
        <button
          type="button"
          disabled={!canSend}
          className="lb-live-private-gate__cta"
          onClick={onRequest}
        >
          {sending ? 'Enviando…' : status === 'pending' ? 'Solicitud enviada' : `Enviar ${name} y solicitar entrada`}
        </button>
        {status === 'approved' ? (
          <p className="lb-live-private-gate__notice is-ok" role="status">
            ✓ Acceso aprobado
          </p>
        ) : null}
        {status === 'rejected' ? (
          <p className="lb-live-private-gate__notice is-no" role="status">
            ✗ Acceso rechazado
            {blocked
              ? '. Te enviamos al inicio.'
              : retriesLeft > 0
                ? `. Puedes enviarlo ${retriesLeft} ${retriesLeft === 1 ? 'vez' : 'veces'} más.`
                : ''}
          </p>
        ) : null}
        {error && status !== 'approved' ? <p className="lb-live-private-gate__error">{error}</p> : null}
        <Link to="/" className="lb-live-private-gate__home">
          Volver al inicio
        </Link>
      </div>
    </div>
  );
}
