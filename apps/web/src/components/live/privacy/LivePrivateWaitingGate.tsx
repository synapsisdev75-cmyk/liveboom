import { Link } from 'react-router-dom';
import { GiftIcon } from '../FloatingGift';
import { PrivacyLockArt } from './PrivacyLockArt';
import { findLiveGift } from '../../../lib/liveboomGifts';

export type PrivateGateStatus = 'outside' | 'pending' | 'approved' | 'rejected';

type GiftRow = {
  giftId: string;
  giftName: string;
};

type Props = {
  gift: GiftRow | null;
  status: PrivateGateStatus;
  sending?: boolean;
  flashApproved?: boolean;
  error?: string | null;
  onRequest: () => void;
};

export function LivePrivateWaitingGate({
  gift,
  status,
  sending = false,
  flashApproved = false,
  error = null,
  onRequest,
}: Props) {
  const catalog = gift ? findLiveGift(gift.giftId) : null;
  const name = catalog?.name || gift?.giftName || 'el regalo';

  return (
    <div className="lb-live-private-gate">
      <div className="lb-live-private-gate__card">
        <PrivacyLockArt open={false} className="lb-live-private-gate__lock" />
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
        ) : status === 'rejected' ? (
          <>
            <p className="lb-live-private-gate__lead">Solicitud no aceptada</p>
            <p className="lb-live-private-gate__hint">Tus coins fueron devueltos.</p>
            <button
              type="button"
              disabled={sending || !gift}
              className="lb-live-private-gate__cta"
              onClick={onRequest}
            >
              {sending ? 'Enviando…' : 'Solicitar nuevamente'}
            </button>
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
            <button
              type="button"
              disabled={sending || !gift || status === 'approved'}
              className="lb-live-private-gate__cta"
              onClick={onRequest}
            >
              {sending ? 'Enviando…' : `Enviar ${name} y solicitar entrada`}
            </button>
          </>
        )}
        {flashApproved || status === 'approved' ? (
          <p className="lb-live-private-gate__ok">✓ Acceso aprobado</p>
        ) : null}
        {error ? <p className="lb-live-private-gate__error">{error}</p> : null}
        <Link to="/" className="lb-live-private-gate__home">
          Volver al inicio
        </Link>
      </div>
    </div>
  );
}
