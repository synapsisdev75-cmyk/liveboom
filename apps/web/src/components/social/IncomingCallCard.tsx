import { BellOff, MessageSquare, Phone, PhoneOff, Smartphone, Video } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { UserAvatar } from '../profile/UserAvatar';

type Props = {
  name: string;
  handle: string;
  avatar: string | null;
  uid?: string | null;
  video: boolean;
  accepting?: boolean;
  error?: string | null;
  ringMuted: boolean;
  onAccept: () => void;
  onDecline: () => void;
  onMuteRing: () => void;
  onMessage: () => void;
};

function useCoarseLayout() {
  const [coarse, setCoarse] = useState(false);
  useEffect(() => {
    const sync = () => {
      const narrow = window.matchMedia('(max-width: 767px)').matches;
      const touch = window.matchMedia('(pointer: coarse)').matches;
      setCoarse(narrow || (touch && window.innerWidth < 1024));
    };
    sync();
    window.addEventListener('resize', sync);
    window.addEventListener('orientationchange', sync);
    return () => {
      window.removeEventListener('resize', sync);
      window.removeEventListener('orientationchange', sync);
    };
  }, []);
  return coarse;
}

function AnswerSlider({ onAccept, disabled }: { onAccept: () => void; disabled?: boolean }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [offset, setOffset] = useState(0);
  const drag = useRef<{ start: number; base: number } | null>(null);

  const maxTravel = useCallback(() => {
    const track = trackRef.current;
    if (!track) return 160;
    return Math.max(80, track.clientWidth - 52);
  }, []);

  function onPointerDown(event: ReactPointerEvent<HTMLButtonElement>) {
    if (disabled) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { start: event.clientX, base: offset };
  }

  function onPointerMove(event: ReactPointerEvent<HTMLButtonElement>) {
    if (!drag.current) return;
    const next = Math.max(0, Math.min(maxTravel(), drag.current.base + event.clientX - drag.current.start));
    setOffset(next);
  }

  function onPointerUp() {
    if (!drag.current) return;
    const travel = maxTravel();
    const done = offset >= travel * 0.72;
    drag.current = null;
    if (done) {
      setOffset(travel);
      onAccept();
      return;
    }
    setOffset(0);
  }

  return (
    <div ref={trackRef} className="lb-call-slider">
      <span className="lb-call-slider__hint">Desliza para responder</span>
      <button
        type="button"
        className="lb-call-slider__knob"
        style={{ transform: `translateX(${offset}px)` }}
        disabled={disabled}
        aria-label="Desliza para responder"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => {
          drag.current = null;
          setOffset(0);
        }}
      >
        <Phone size={18} />
      </button>
    </div>
  );
}

export function IncomingCallCard({
  name,
  handle,
  avatar,
  uid,
  video,
  accepting,
  error,
  ringMuted,
  onAccept,
  onDecline,
  onMuteRing,
  onMessage,
}: Props) {
  const mobile = useCoarseLayout();
  const title = name || (handle ? `@${handle}` : 'LiveBoom');
  const kind = video ? 'Videollamada' : 'Llamada de voz';

  return (
    <article className={`lb-call-incoming${mobile ? ' is-mobile' : ''}`}>
      <div className="lb-call-incoming__glow" aria-hidden />
      <div className="lb-call-incoming__body">
        <div className="lb-call-incoming__person">
          <div className="lb-call-avatar-wrap">
            <span className="lb-call-avatar-ring" aria-hidden />
            <UserAvatar
              src={avatar}
              uid={uid}
              username={handle}
              displayName={name}
              size={96}
              ringClassName="ring-0"
            />
          </div>
          <h2 className="lb-call-incoming__name">{title}</h2>
          <p className="lb-call-incoming__status">Te está llamando...</p>
          <p className="lb-call-incoming__kind">{kind}</p>
          {error ? <p className="lb-call-incoming__error">{error}</p> : null}
          {accepting ? <p className="lb-call-incoming__kind">Conectando...</p> : null}
        </div>

        {!mobile ? (
          <aside className="lb-call-incoming__mobile-hint">
            <Smartphone size={36} className="text-cyan-300" />
            <p>También puedes responder desde tu móvil</p>
          </aside>
        ) : null}
      </div>

      <div className="lb-call-incoming__actions">
        <button
          type="button"
          className="lb-call-round lb-call-round--decline"
          onClick={onDecline}
          aria-label="Rechazar"
          disabled={accepting}
        >
          <PhoneOff size={22} />
        </button>
        <button
          type="button"
          className="lb-call-round lb-call-round--accept"
          onClick={onAccept}
          aria-label="Responder"
          disabled={accepting}
        >
          {video ? <Video size={22} /> : <Phone size={22} />}
        </button>
      </div>
      <div className="lb-call-incoming__labels">
        <span>Rechazar</span>
        <span>Responder</span>
      </div>

      <AnswerSlider onAccept={onAccept} disabled={accepting} />

      {mobile ? (
        <div className="lb-call-incoming__extras">
          <button type="button" className="lb-call-chip" onClick={onMuteRing}>
            <BellOff size={14} />
            {ringMuted ? 'Timbre silenciado' : 'Silenciar timbre'}
          </button>
          <button type="button" className="lb-call-chip" onClick={onMessage}>
            <MessageSquare size={14} />
            Enviar mensaje
          </button>
        </div>
      ) : (
        <div className="lb-call-incoming__extras">
          <button type="button" className="lb-call-chip" onClick={onMuteRing}>
            <BellOff size={14} />
            {ringMuted ? 'Timbre silenciado' : 'Silenciar timbre'}
          </button>
          <button type="button" className="lb-call-chip" onClick={onMessage}>
            <MessageSquare size={14} />
            Enviar mensaje
          </button>
        </div>
      )}
    </article>
  );
}
