import type { ReactNode } from 'react';

/** Contenedor exclusivo de videollamada. Misma estructura que voz: chrome fuera, LiveKit en live. */
export function VideoCallSessionFrame({
  connected,
  hold,
  chrome,
  live,
}: {
  connected: boolean;
  hold: boolean;
  chrome: ReactNode;
  live: ReactNode;
}) {
  return (
    <article
      className={connected ? 'lb-video-call-session is-connected' : 'lb-video-call-session'}
      data-call-kind="video"
    >
      {live ? (
        <div
          className={connected ? 'lb-video-live-slot' : hold ? 'lb-call-livekit-hold' : 'lb-video-live-slot'}
          aria-hidden={!connected && hold ? true : undefined}
        >
          {live}
        </div>
      ) : null}
      {connected ? null : chrome || (
        <div className="lb-video-ring-screen" role="status">
          <p className="lb-video-ring-screen__type">Videollamada</p>
          <p className="lb-video-ring-screen__status">Conectando video...</p>
        </div>
      )}
    </article>
  );
}

/** Contenedor exclusivo de llamada de voz. Nunca monta UI de video ni cámara. */
export function VoiceCallSessionFrame({
  connected,
  hold,
  chrome,
  live,
}: {
  connected: boolean;
  hold: boolean;
  chrome: ReactNode;
  live: ReactNode;
}) {
  return (
    <article
      className={connected ? 'lb-voice-call-session is-connected' : 'lb-voice-call-session'}
      data-call-kind="voice"
    >
      {connected ? null : chrome}
      {live ? (
        <div
          className={connected ? 'lb-voice-live-slot' : hold ? 'lb-call-livekit-hold' : 'lb-voice-live-slot'}
          aria-hidden={!connected && hold ? true : undefined}
        >
          {live}
        </div>
      ) : null}
    </article>
  );
}
