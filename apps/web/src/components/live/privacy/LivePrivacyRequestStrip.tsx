import { useLayoutEffect, useRef, useState } from 'react';
import { UserAvatar } from '../../profile/UserAvatar';
import type { PrivateAccessRequest } from '../../../lib/livePrivateAccessFirestore';

type Props = {
  requests: PrivateAccessRequest[];
  onSelect?: (request: PrivateAccessRequest) => void;
  onOverflow?: () => void;
};

const AVATAR = 32;
const GAP = 6;
const OVERFLOW_W = 34;

/** Fila de avatares a la derecha del candado (crece L→R, +N si no caben). */
export function LivePrivacyRequestStrip({ requests, onSelect, onOverflow }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [maxVisible, setMaxVisible] = useState(4);

  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const measure = () => {
      const width = el.clientWidth;
      if (width <= 0) return;
      let n = Math.floor((width + GAP) / (AVATAR + GAP));
      if (requests.length > n) {
        n = Math.max(1, Math.floor((width - OVERFLOW_W - GAP + GAP) / (AVATAR + GAP)));
      }
      setMaxVisible(Math.max(1, n));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [requests.length]);

  if (!requests.length) return null;
  const visible = requests.slice(0, maxVisible);
  const overflow = requests.length - visible.length;

  return (
    <div ref={wrapRef} className="lb-live-privacy-strip" role="list">
      {visible.map((row) => (
        <button
          key={row.uid}
          type="button"
          className="lb-live-privacy-strip__avatar"
          role="listitem"
          onClick={() => onSelect?.(row)}
          aria-label={row.displayName}
        >
          <UserAvatar
            uid={row.uid}
            src={row.avatarUrl}
            username={row.username}
            displayName={row.displayName}
            size={AVATAR}
          />
        </button>
      ))}
      {overflow > 0 ? (
        <button
          type="button"
          className="lb-live-privacy-strip__more"
          onClick={() => onOverflow?.()}
          aria-label={`${overflow} solicitudes más`}
        >
          +{overflow}
        </button>
      ) : null}
    </div>
  );
}
