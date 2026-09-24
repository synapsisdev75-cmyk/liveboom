import { useEffect, useMemo, useState, type ComponentType } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { motion, useMotionValueEvent, useSpring } from 'framer-motion';
import { prefetchRoute } from '../../lib/routePrefetch';
import { useAuthStore } from '../../store/authStore';
import { useUnreadMessageCount } from '../social/MessageInboxBadge';

type NavItem = {
  id: string;
  label: string;
  icon: ComponentType<{ size?: number; strokeWidth?: number; className?: string }>;
  to: string;
  accent?: boolean;
};

function NavUnreadBadge({ className = '' }: { className?: string }) {
  const unread = useUnreadMessageCount();
  if (unread <= 0) return null;
  return (
    <span
      className={`grid h-[18px] min-w-[18px] place-items-center rounded-full bg-[#A855F7] px-1 text-[10px] font-black leading-none text-white ${className}`}
    >
      {unread > 9 ? '9+' : unread}
    </span>
  );
}

function profilePathHandle(pathname: string): string | null {
  if (!pathname.startsWith('/u/')) return null;
  const raw = pathname.slice(3).split('/')[0] || '';
  try {
    return decodeURIComponent(raw).trim().toLowerCase();
  } catch {
    return raw.trim().toLowerCase();
  }
}

/** `/perfil` redirige a `/u/:handle` — hay que tratar ambos como Perfil activo. */
function isItemActive(pathname: string, to: string, ownHandle?: string | null) {
  if (to === '/') return pathname === '/';
  if (to === '/perfil') {
    if (pathname.startsWith('/perfil/editar')) return false;
    if (pathname === '/perfil' || pathname.startsWith('/perfil/')) return true;
    const handle = profilePathHandle(pathname);
    if (!handle) return false;
    const mine = String(ownHandle || '')
      .trim()
      .toLowerCase();
    return Boolean(mine) && handle === mine;
  }
  return pathname === to || pathname.startsWith(`${to}/`);
}

/** Dip líquido: viewBox 0..100 × 0..22 (flat en y=0, hueco hacia abajo). */
function liquidNotchPath(cx: number, width = 100, height = 22) {
  const r = 12.2;
  const dip = 14.8;
  const left = Math.max(0.4, cx - r - 2.8);
  const right = Math.min(width - 0.4, cx + r + 2.8);
  return [
    `M0,0`,
    `H${left.toFixed(2)}`,
    `C${(cx - r * 0.32).toFixed(2)},0 ${(cx - r * 0.92).toFixed(2)},${dip.toFixed(2)} ${cx.toFixed(2)},${dip.toFixed(2)}`,
    `C${(cx + r * 0.92).toFixed(2)},${dip.toFixed(2)} ${(cx + r * 0.32).toFixed(2)},0 ${right.toFixed(2)},0`,
    `H${width}`,
    `V${height}`,
    `H0`,
    `Z`,
  ].join(' ');
}

type Props = {
  items: NavItem[];
};

/**
 * Bottom nav líquido (burbuja + dip) — solo teléfono (&lt; md).
 * Tablet/desktop: menú izquierdo (sidebar).
 * Sin cristal ni hide animado: el glass edge-to-edge va solo en el header superior.
 */
export function LiquidBottomNav({ items }: Props) {
  const location = useLocation();
  const ownHandle = useAuthStore((s) => s.profile?.handle ?? null);
  const activeIndex = useMemo(() => {
    const idx = items.findIndex((item) => isItemActive(location.pathname, item.to, ownHandle));
    return idx >= 0 ? idx : 0;
  }, [items, location.pathname, ownHandle]);

  const count = Math.max(1, items.length);
  const targetCx = ((activeIndex + 0.5) / count) * 100;
  const springCx = useSpring(targetCx, { stiffness: 380, damping: 32, mass: 0.85 });
  const [pathD, setPathD] = useState(() => liquidNotchPath(targetCx));

  useEffect(() => {
    springCx.set(targetCx);
  }, [springCx, targetCx]);

  useMotionValueEvent(springCx, 'change', (v) => {
    setPathD(liquidNotchPath(v));
  });

  const bubbleLeft = `calc(${(activeIndex + 0.5) * (100 / count)}% - 1.375rem)`;
  const activeItem = items[activeIndex] ?? items[0];
  const ActiveIcon = activeItem?.icon;

  return (
    <nav className="lb-liquid-nav fixed inset-x-0 bottom-0 z-40 md:hidden" aria-label="Navegación principal">
      <div className="lb-liquid-nav__shell relative mx-auto w-full max-w-[42rem] px-[max(0.25rem,var(--lb-safe-left))] pr-[max(0.25rem,var(--lb-safe-right))]">
        <motion.div
          className="lb-liquid-nav__bubble pointer-events-none absolute z-[2] grid h-11 w-11 place-items-center rounded-full"
          initial={false}
          animate={{ left: bubbleLeft }}
          transition={{ type: 'spring', stiffness: 380, damping: 32, mass: 0.85 }}
          style={{ top: 0 }}
          aria-hidden
        >
          {ActiveIcon ? (
            <ActiveIcon
              key={activeItem.id}
              size={20}
              strokeWidth={2.45}
              className="lb-liquid-nav__bubble-icon"
            />
          ) : null}
        </motion.div>

        <div className="lb-liquid-nav__bar relative z-[1] mt-[1.35rem] overflow-hidden rounded-t-[1.15rem]">
          <svg
            className="lb-liquid-nav__curve pointer-events-none absolute inset-x-0 top-0 h-8 w-full"
            viewBox="0 0 100 22"
            preserveAspectRatio="none"
            aria-hidden
          >
            <path className="lb-liquid-nav__curve-fill" d={pathD} />
          </svg>
          <div className="lb-liquid-nav__bar-fill absolute inset-x-0 bottom-0 top-7" aria-hidden />

          <ul className="relative z-[3] grid grid-cols-5 pb-[max(0.35rem,var(--lb-safe-bottom))] pt-1">
            {items.map((item, index) => {
              const Icon = item.icon;
              const messages = item.to === '/mensajes';
              const active = index === activeIndex;
              return (
                <li key={item.id} className="min-w-0">
                  <NavLink
                    to={item.to}
                    end={item.to === '/'}
                    onPointerEnter={() => prefetchRoute(item.to)}
                    onFocus={() => prefetchRoute(item.to)}
                    className="lb-liquid-nav__item relative flex min-h-[2.85rem] flex-col items-center justify-start gap-0.5 px-0.5 pt-1 text-[9px] font-semibold sm:min-h-[3rem] sm:text-[10px]"
                    aria-current={active ? 'page' : undefined}
                  >
                    <span
                      className={`relative grid h-9 w-9 place-items-center transition-[transform,color,opacity] duration-200 ${
                        active ? 'lb-liquid-nav__icon--active' : 'lb-liquid-nav__icon--idle'
                      }`}
                      aria-hidden={active}
                    >
                      {/* Icono activo vive en la burbuja (fuera del overflow de la barra). */}
                      <Icon
                        size={active ? 20 : 18}
                        strokeWidth={active ? 2.45 : 1.85}
                        className={active ? 'opacity-0' : undefined}
                      />
                      {messages ? <NavUnreadBadge className="absolute -right-1 -top-0.5" /> : null}
                    </span>
                    <span
                      className={`max-w-full truncate leading-tight ${
                        active ? 'lb-liquid-nav__label--active' : 'lb-liquid-nav__label--idle'
                      }`}
                    >
                      {item.label}
                    </span>
                  </NavLink>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </nav>
  );
}
