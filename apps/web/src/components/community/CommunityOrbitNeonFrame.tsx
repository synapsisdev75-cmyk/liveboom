import { useId } from 'react';

export type OrbitSlot = { x: number; y: number; size: number };
export type OrbitLayout = { center: OrbitSlot; friends: OrbitSlot[] };

const CYAN = '#22d3ee';
const MAGENTA = '#e879f9';
const CYAN_CORE = '#a5f3fc';

function spokeEnds(center: OrbitSlot, friend: OrbitSlot) {
  const dx = friend.x - center.x;
  const dy = friend.y - center.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const cr = center.size / 2;
  const fr = friend.size / 2;
  const gap = 0.45;
  return {
    x1: center.x + ux * (cr + gap),
    y1: center.y + uy * (cr + gap),
    x2: friend.x - ux * (fr + gap),
    y2: friend.y - uy * (fr + gap),
  };
}

function NeonRing({
  slot,
  glowId,
  thick,
}: {
  slot: OrbitSlot;
  glowId: string;
  thick?: boolean;
}) {
  const r = slot.size / 2;
  const outerW = thick ? 1.35 : 1.05;
  const innerW = thick ? 0.7 : 0.55;
  return (
    <g filter={`url(#${glowId})`}>
      <circle
        cx={slot.x}
        cy={slot.y}
        r={r}
        fill="none"
        stroke={MAGENTA}
        strokeWidth={outerW}
        opacity={0.95}
      />
      <circle
        cx={slot.x}
        cy={slot.y}
        r={r - (thick ? 0.55 : 0.4)}
        fill="none"
        stroke={CYAN}
        strokeWidth={innerW}
      />
      {/* brillo */}
      <circle
        cx={slot.x}
        cy={slot.y}
        r={r - (thick ? 0.55 : 0.4)}
        fill="none"
        stroke={CYAN_CORE}
        strokeWidth={innerW * 0.35}
        opacity={0.85}
        strokeDasharray={`${Math.PI * r * 0.22} ${Math.PI * r * 2}`}
        strokeDashoffset={Math.PI * r * 0.15}
      />
    </g>
  );
}

function NeonCrown({ x, y, size, glowId }: { x: number; y: number; size: number; glowId: string }) {
  const top = y - size / 2;
  const w = size * 0.95;
  const h = size * 0.55;
  const left = x - w / 2;
  const baseY = top - 0.35;
  // Corona de 3 picos + joyas
  const d = [
    `M ${left} ${baseY}`,
    `L ${left} ${baseY - h * 0.35}`,
    `L ${left + w * 0.18} ${baseY - h * 0.05}`,
    `L ${x} ${baseY - h}`,
    `L ${left + w * 0.82} ${baseY - h * 0.05}`,
    `L ${left + w} ${baseY - h * 0.35}`,
    `L ${left + w} ${baseY}`,
    'Z',
  ].join(' ');

  return (
    <g filter={`url(#${glowId})`}>
      <path d={d} fill="none" stroke={MAGENTA} strokeWidth={0.85} strokeLinejoin="round" />
      <path d={d} fill="none" stroke={CYAN} strokeWidth={0.45} strokeLinejoin="round" />
      {[
        [x, baseY - h],
        [left + w * 0.12, baseY - h * 0.32],
        [left + w * 0.88, baseY - h * 0.32],
      ].map(([cx, cy], i) => (
        <circle key={i} cx={cx} cy={cy} r={0.55} fill={CYAN_CORE} stroke={CYAN} strokeWidth={0.25} />
      ))}
    </g>
  );
}

/**
 * Marco neón editable (SVG puro, sin fondo).
 * Se dibuja según el layout de slots — al afinar, anillos y líneas se mueven juntos.
 */
export function CommunityOrbitNeonFrame({ layout }: { layout: OrbitLayout }) {
  const uid = useId().replace(/:/g, '');
  const glowId = `lb-orbit-glow-${uid}`;
  const crownFriend = layout.friends[0]!;

  return (
    <svg
      className="pointer-events-none absolute inset-0 z-[2] h-full w-full overflow-visible"
      viewBox="0 0 100 100"
      preserveAspectRatio="xMidYMid meet"
      aria-hidden
    >
      <defs>
        <filter id={glowId} x="-40%" y="-40%" width="180%" height="180%" colorInterpolationFilters="sRGB">
          <feGaussianBlur in="SourceGraphic" stdDeviation="0.55" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Radios centro → amigos */}
      {layout.friends.map((friend, index) => {
        const s = spokeEnds(layout.center, friend);
        return (
          <g key={`spoke-${index}`} filter={`url(#${glowId})`}>
            <line
              x1={s.x1}
              y1={s.y1}
              x2={s.x2}
              y2={s.y2}
              stroke={MAGENTA}
              strokeWidth={1.1}
              strokeLinecap="round"
              opacity={0.55}
            />
            <line
              x1={s.x1}
              y1={s.y1}
              x2={s.x2}
              y2={s.y2}
              stroke={CYAN}
              strokeWidth={0.55}
              strokeLinecap="round"
            />
          </g>
        );
      })}

      <NeonRing slot={layout.center} glowId={glowId} thick />
      {layout.friends.map((slot, index) => (
        <NeonRing key={`ring-${index}`} slot={slot} glowId={glowId} />
      ))}

      <NeonCrown x={crownFriend.x} y={crownFriend.y} size={crownFriend.size} glowId={glowId} />
    </svg>
  );
}
