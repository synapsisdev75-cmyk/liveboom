import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  BOOM_ANIMATIONS,
  boomAnimationShowEvent,
  canPlayVp9Webm,
  onBoomAnimationEnded,
  type BoomAnimationDef,
} from '../../lib/boomAnimations';

type PlayItem = { token: string; def: BoomAnimationDef };

export function GlobalBoomAnimationOverlay() {
  const [item, setItem] = useState<PlayItem | null>(null);
  const [useFallback, setUseFallback] = useState(false);
  const queueRef = useRef<string[]>([]);
  const playingIdRef = useRef<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const capRef = useRef(0);

  useEffect(() => {
    const onShow = (event: Event) => {
      const id = String((event as CustomEvent<{ id?: string }>).detail?.id || '');
      const def = BOOM_ANIMATIONS[id];
      if (!def) return;
      if (playingIdRef.current === id) {
        setUseFallback(false);
        setItem({ token: `${id}-${Date.now()}`, def });
        return;
      }
      if (playingIdRef.current) {
        if (!queueRef.current.includes(id)) queueRef.current.push(id);
        return;
      }
      playingIdRef.current = id;
      setUseFallback(false);
      setItem({ token: `${id}-${Date.now()}`, def });
    };
    window.addEventListener(boomAnimationShowEvent(), onShow);
    return () => window.removeEventListener(boomAnimationShowEvent(), onShow);
  }, []);

  const finish = (id: string) => {
    onBoomAnimationEnded(id);
    const nextId = queueRef.current.shift();
    const nextDef = nextId ? BOOM_ANIMATIONS[nextId] : null;
    if (nextDef && nextId) {
      playingIdRef.current = nextId;
      setUseFallback(false);
      setItem({ token: `${nextId}-${Date.now()}`, def: nextDef });
      return;
    }
    playingIdRef.current = null;
    setItem(null);
  };

  useEffect(() => {
    if (!item) return;
    const id = item.def.id;
    const video = videoRef.current;
    window.clearTimeout(capRef.current);
    capRef.current = window.setTimeout(() => finish(id), item.def.durationMs + 900);
    if (video) {
      video.currentTime = 0;
      video.muted = true;
      void video.play().catch(() => setUseFallback(true));
    }
    return () => window.clearTimeout(capRef.current);
    // token cambia al reiniciar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item?.token]);

  if (!item || typeof document === 'undefined') return null;

  const showVideo = canPlayVp9Webm() && !useFallback;

  return createPortal(
    <div className="lb-global-boom-overlay" aria-hidden="true">
      {showVideo ? (
        <video
          key={item.token}
          ref={videoRef}
          className="lb-global-boom-overlay__anim"
          src={item.def.src}
          autoPlay
          muted
          playsInline
          preload="auto"
          disablePictureInPicture
          controls={false}
          onEnded={() => finish(item.def.id)}
          onError={() => setUseFallback(true)}
        />
      ) : (
        <img
          key={`${item.token}-img`}
          className="lb-global-boom-overlay__anim"
          src={item.def.fallbackSrc || item.def.src}
          alt=""
          draggable={false}
        />
      )}
    </div>,
    document.body,
  );
}
