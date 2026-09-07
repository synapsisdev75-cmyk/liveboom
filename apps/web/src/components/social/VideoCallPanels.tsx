import { AlertTriangle, Bell, Heart, MessageSquare, Minimize2, Video, X } from 'lucide-react';
import { UserAvatar } from '../profile/UserAvatar';
import { formatCallClock, type VideoCallEndedSummary } from '../../store/callStore';
import { openRechargeCoins } from '../../lib/giftsFirestore';
import { findLiveGift } from '../../lib/liveboomGifts';

type Person = {
  name: string;
  handle: string;
  avatar: string | null;
  uid?: string | null;
};

function handleOf(value: string) {
  return value.replace(/^@/, '');
}

export function VideoCallRequestSheet({
  handle,
  busy,
  onCancel,
  onRequest,
}: {
  handle: string;
  busy?: boolean;
  onCancel: () => void;
  onRequest: () => void;
}) {
  return (
    <div className="lb-video-sheet-backdrop" role="dialog" aria-modal="true">
      <article className="lb-video-sheet">
        <p className="lb-video-sheet__title">Solicitar videollamada</p>
        <p className="lb-video-sheet__handle">@{handleOf(handle)}</p>
        <div className="lb-video-sheet__choice is-on">
          <Video size={16} />
          Videollamada
        </div>
        <p className="lb-video-sheet__hint">
          Tu solicitud será enviada.
          <br />
          La otra persona deberá aceptarla.
        </p>
        <button type="button" className="lb-video-sheet__primary" disabled={busy} onClick={onRequest}>
          Solicitar ahora
        </button>
        <button type="button" className="lb-video-sheet__ghost" disabled={busy} onClick={onCancel}>
          Cancelar
        </button>
      </article>
    </div>
  );
}

export function VideoCallWaitingSheet({
  person,
  onCancel,
}: {
  person: Person;
  onCancel: () => void;
}) {
  return (
    <div className="lb-video-sheet-backdrop" role="dialog" aria-modal="true">
      <article className="lb-video-sheet">
        <p className="lb-video-sheet__title">Esperando respuesta...</p>
        <div className="lb-video-avatar-ring">
          <UserAvatar
            src={person.avatar}
            uid={person.uid}
            username={person.handle}
            displayName={person.name}
            size={88}
            ringClassName="ring-0"
          />
        </div>
        <p className="lb-video-sheet__hint">Tu solicitud de videollamada ha sido enviada.</p>
        <button type="button" className="lb-video-sheet__ghost" onClick={onCancel}>
          Cancelar solicitud
        </button>
      </article>
    </div>
  );
}

export function VideoCallOutgoing({
  person,
  onCancel,
  onMinimize,
}: {
  person: Person;
  onCancel: () => void;
  onMinimize?: () => void;
}) {
  const handle = handleOf(person.handle);
  return (
    <div className="lb-video-outgoing">
      <div className="lb-video-avatar-ring is-lg">
        <UserAvatar
          src={person.avatar}
          uid={person.uid}
          username={person.handle}
          displayName={person.name}
          size={112}
          ringClassName="ring-0"
        />
      </div>
      <p className="lb-video-outgoing__title">Videollamando...</p>
      <p className="lb-video-outgoing__sub">Esperando que @{handle || 'usuario'} responda...</p>
      <div className="lb-video-outgoing__actions">
        {onMinimize ? (
          <button type="button" className="lb-video-chip" onClick={onMinimize}>
            <Minimize2 size={14} /> Minimizar
          </button>
        ) : null}
        <button type="button" className="lb-video-chip is-danger" onClick={onCancel}>
          Cancelar
        </button>
      </div>
    </div>
  );
}

export function VideoCallMiniBar({
  person,
  label,
  onExpand,
  onHangup,
}: {
  person: Person;
  label: string;
  onExpand: () => void;
  onHangup: () => void;
}) {
  return (
    <div className="lb-video-mini" data-call-drag>
      <button type="button" className="lb-video-mini__main" data-call-drag onClick={onExpand}>
        <UserAvatar
          src={person.avatar}
          uid={person.uid}
          username={person.handle}
          displayName={person.name}
          size={36}
          ringClassName="ring-0"
        />
        <span>
          <strong>{person.name || `@${handleOf(person.handle)}`}</strong>
          <em>{label}</em>
        </span>
      </button>
      <button type="button" className="lb-video-mini__end" data-no-drag onClick={onHangup} aria-label="Finalizar">
        <X size={16} />
      </button>
    </div>
  );
}

export function VideoCallLowBalance({
  balance,
  rate,
  minutes,
  onContinue,
}: {
  balance: number;
  rate: number;
  minutes: number;
  onContinue: () => void;
}) {
  return (
    <div className="lb-video-alert" role="status">
      <AlertTriangle size={18} className="text-amber-300" />
      <div>
        <p>Te queda aproximadamente {minutes} minuto{minutes === 1 ? '' : 's'}.</p>
        <p>
          Saldo {balance.toLocaleString('es-CO')} · {rate} Blasts/min
        </p>
      </div>
      <button type="button" className="lb-video-alert__btn" onClick={() => openRechargeCoins()}>
        Recargar Blasts
      </button>
      <button type="button" className="lb-video-alert__ghost" onClick={onContinue}>
        Continuar llamada
      </button>
    </div>
  );
}

export function VideoCallNoBalance({ seconds }: { seconds: number }) {
  return (
    <div className="lb-video-alert is-critical" role="alert">
      <AlertTriangle size={18} className="text-rose-300" />
      <div>
        <p>Saldo insuficiente</p>
        <p>La videollamada finalizará en {seconds}s si no recargas.</p>
      </div>
      <button type="button" className="lb-video-alert__btn" onClick={() => openRechargeCoins()}>
        Recargar Blasts
      </button>
    </div>
  );
}

export function VideoCallEnded({
  summary,
  onClose,
  onDetails,
}: {
  summary: VideoCallEndedSummary;
  onClose: () => void;
  onDetails?: () => void;
}) {
  const paid = summary.rateBlasts > 0 && summary.totalBlasts > 0;
  return (
    <div className="lb-video-sheet-backdrop" role="dialog" aria-modal="true">
      <article className="lb-video-sheet">
        <div className="lb-video-ended-mark">
          <Heart size={22} />
        </div>
        <p className="lb-video-sheet__title">Videollamada finalizada</p>
        <p className="lb-video-sheet__handle">@{handleOf(summary.handle) || 'usuario'}</p>
        <dl className="lb-video-ended-stats">
          <div>
            <dt>Duración</dt>
            <dd>{formatCallClock(summary.durationSec)}</dd>
          </div>
          {paid ? (
            <>
              <div>
                <dt>Tarifa</dt>
                <dd>{summary.rateBlasts} Blasts/min</dd>
              </div>
              <div>
                <dt>Bloques cobrados</dt>
                <dd>{summary.blocksCharged}</dd>
              </div>
              <div>
                <dt>{summary.received ? 'Recibido' : 'Gastado'}</dt>
                <dd>{summary.totalBlasts} Blasts</dd>
              </div>
              {summary.giftName ? (
                <div>
                  <dt>Regalo</dt>
                  <dd>{summary.giftName}</dd>
                </div>
              ) : null}
            </>
          ) : null}
        </dl>
        <button type="button" className="lb-video-sheet__ghost" onClick={onDetails || onClose}>
          Ver detalles
        </button>
        <button type="button" className="lb-video-sheet__primary" onClick={onClose}>
          Cerrar
        </button>
      </article>
    </div>
  );
}

export function VideoCallRequestReceived({
  name,
  handle,
  avatar,
  uid,
  rateBlasts,
  giftId,
  giftName,
  giftEmoji,
  busy,
  onAccept,
  onReject,
}: {
  name: string;
  handle: string;
  avatar: string | null;
  uid?: string | null;
  rateBlasts: number;
  giftId?: string | null;
  giftName?: string | null;
  giftEmoji?: string | null;
  busy?: boolean;
  onAccept: () => void;
  onReject: () => void;
}) {
  const gift = giftId ? findLiveGift(giftId) : null;
  return (
    <div className="lb-video-sheet-backdrop" role="dialog" aria-modal="true">
      <article className="lb-video-sheet">
        <UserAvatar src={avatar} uid={uid} username={handle} displayName={name} size={72} ringClassName="ring-0" />
        <p className="lb-video-sheet__title">@{handleOf(handle)} quiere hacer una videollamada contigo</p>
        <p className="lb-video-sheet__hint">{name}</p>
        {rateBlasts > 0 ? (
          <p className="lb-video-rate-pill">
            {gift?.image ? <img src={gift.image} alt="" /> : <span>{giftEmoji || '🎁'}</span>}
            {giftName || gift?.name || 'Regalo'} · {rateBlasts} Blasts / minuto
          </p>
        ) : (
          <p className="lb-video-rate-pill is-free">Gratis</p>
        )}
        <div className="lb-video-sheet__row">
          <button type="button" className="lb-video-sheet__ghost" disabled={busy} onClick={onReject}>
            Rechazar
          </button>
          <button type="button" className="lb-video-sheet__primary" disabled={busy} onClick={onAccept}>
            Aceptar
          </button>
        </div>
      </article>
    </div>
  );
}

export function VideoCallIncomingExtras({
  onMessage,
  onRemind,
}: {
  onMessage: () => void;
  onRemind: () => void;
}) {
  return (
    <div className="lb-video-incoming-extras">
      <button type="button" className="lb-call-chip" onClick={onMessage}>
        <MessageSquare size={14} /> Mensaje
      </button>
      <button type="button" className="lb-call-chip" onClick={onRemind}>
        <Bell size={14} /> Recordar más tarde
      </button>
    </div>
  );
}
