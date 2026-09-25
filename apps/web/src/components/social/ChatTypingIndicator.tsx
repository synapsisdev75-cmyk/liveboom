import { useEffect, useRef, useState } from 'react';

const TYPING_SRC = '/chat/escritura.webm';
/** Retardo antes de mostrar la animación al que espera el mensaje. */
const SHOW_DELAY_MS = 450;

type Props = {
  active: boolean;
};

/**
 * Solo para quien espera: animación + texto pequeño debajo (centrado).
 * Quien escribe no debe montar este componente.
 */
export function ChatTypingIndicator({ active }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!active) {
      setVisible(false);
      return;
    }
    const t = window.setTimeout(() => setVisible(true), SHOW_DELAY_MS);
    return () => window.clearTimeout(t);
  }, [active]);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    if (visible) {
      el.currentTime = 0;
      void el.play().catch(() => undefined);
      return;
    }
    el.pause();
    try {
      el.currentTime = 0;
    } catch {
      /* ignore */
    }
  }, [visible]);

  if (!visible) return null;

  return (
    <div
      className="lb-chat-typing flex w-full flex-col items-start px-3 pb-0.5 pt-0"
      role="status"
      aria-live="polite"
      aria-label="escribiendo"
    >
      <video
        ref={videoRef}
        src={TYPING_SRC}
        className="lb-asset-screen h-[7.5rem] w-[7.5rem] shrink-0 bg-transparent object-contain object-bottom"
        muted
        playsInline
        loop
        autoPlay
        preload="auto"
        aria-hidden
      />
      <p className="lb-chat-typing__label -mt-5 w-[7.5rem] text-center text-[10px] font-medium leading-none tracking-wide text-zinc-400">
        escribiendo
      </p>
    </div>
  );
}
