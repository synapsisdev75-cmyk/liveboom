import type { ReactNode } from 'react';

/** Contenedor exclusivo de videollamada. Chrome encima; LiveKit siempre con tamaño real. */
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
      className={[
        'lb-video-call-session',
        connected ? 'is-connected' : '',
        hold ? 'is-held' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      data-call-kind="video"
    >
      {live ? (
        <div
          className={
            hold
              ? 'lb-call-livekit-hold'
              : connected || !chrome
                ? 'lb-video-live-slot'
                : 'lb-video-live-slot is-under-chrome'
          }
          aria-hidden={hold || (!connected && Boolean(chrome)) ? true : undefined}
        >
          {live}
        </div>
      ) : null}
      {connected || hold ? null : chrome}
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
