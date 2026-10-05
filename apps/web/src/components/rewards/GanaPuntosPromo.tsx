import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { X } from 'lucide-react';
import { isUnsafeAdContext, takeGanaPuntosPromoTurn } from '../../lib/adRewardCadence';

const ACTIONS: { emoji: string; text: string; color: string }[] = [
  { emoji: '👀', text: 'Mira contenido patrocinado.', color: 'text-[#67e8f9]' },
  { emoji: '❤️', text: 'Interactúa.', color: 'text-[#f9a8d4]' },
  { emoji: '➕', text: 'Sigue cuentas.', color: 'text-[#bef264]' },
  { emoji: '📝', text: 'Participa en actividades.', color: 'text-[#fcd34d]' },
  { emoji: '🎯', text: 'Completa misiones disponibles.', color: 'text-[#c4b5fd]' },
];

const FIRE: string[] = [
  'Mira contenido y gana puntos.',
  'Sigue una cuenta y suma más.',
  'Completa actividades especiales y aumenta tu saldo.',
];

const BOOM: { text: string; gradient: string }[] = [
  { text: 'MIRA.', gradient: 'from-[#22d3ee] to-[#a78bfa]' },
  { text: 'PARTICIPA.', gradient: 'from-[#f472b6] to-[#fb923c]' },
  { text: 'ACUMULA.', gradient: 'from-[#a3e635] to-[#22d3ee]' },
  { text: 'CONVIERTE TUS PUNTOS EN BLAST.', gradient: 'from-[#fde047] via-[#fb923c] to-[#f472b6]' },
];

const GRADIENT_TEXT = 'bg-gradient-to-r bg-clip-text text-transparent';

export function GanaPuntosPromoCard({ onClose }: { onClose: () => void }) {
  return (
    <article
      aria-label="Gana puntos en LiveBoom"
      className="relative w-full min-w-0 overflow-hidden rounded-2xl border border-[#c084fc]/40 bg-[linear-gradient(150deg,#1a0b2e_0%,#2a0f45_45%,#3b0a33_100%)] p-[clamp(1rem,3.5vw,1.5rem)] text-[#f5f3ff] shadow-[0_0_32px_rgba(192,132,252,0.22)]"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-[radial-gradient(circle,rgba(250,204,21,0.28),transparent_70%)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-20 -left-16 h-56 w-56 rounded-full bg-[radial-gradient(circle,rgba(34,211,238,0.22),transparent_70%)]"
      />

      <div className="relative flex items-start justify-between gap-3">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-[#fde047]/50 bg-[#fde047]/15 px-3 py-1 text-[11px] font-black uppercase tracking-[0.16em] text-[#fde047]">
          🎁 Gana puntos
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar aviso"
          className="-mr-2 -mt-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[#e9d5ff] transition hover:bg-[#ffffff]/10"
        >
          <X size={18} />
        </button>
      </div>

      <h3
        className={`relative mt-3 text-[clamp(1.2rem,4.6vw,1.7rem)] font-black leading-tight ${GRADIENT_TEXT} from-[#fde047] via-[#fb923c] to-[#f472b6]`}
      >
        🚀 TU TIEMPO EN LIVEBOOM AHORA TAMBIÉN SUMA
      </h3>

      <p className="relative mt-3 text-sm leading-relaxed text-[#e9d5ff]">
        En LiveBoom ya puedes encontrar publicaciones y actividades que te permiten{' '}
        <strong className="font-bold text-[#fde047]">ganar puntos</strong> mientras usas la
        plataforma.
      </p>

      <ul className="relative mt-4 grid grid-cols-1 gap-2 min-[420px]:grid-cols-2">
        {ACTIONS.map((a) => (
          <li
            key={a.text}
            className="flex min-h-11 items-center gap-2.5 rounded-xl border border-[#ffffff]/10 bg-[#ffffff]/[0.06] px-3 py-2"
          >
            <span className="text-lg leading-none" aria-hidden>
              {a.emoji}
            </span>
            <span className={`text-sm font-bold ${a.color}`}>{a.text}</span>
          </li>
        ))}
      </ul>

      <p className="relative mt-4 text-sm font-semibold italic text-[#f0abfc]">
        ✨ Cada actividad tendrá su propia recompensa.
      </p>

      <ul className="relative mt-3 space-y-1.5">
        {FIRE.map((line) => (
          <li key={line} className="flex items-start gap-2 text-sm font-bold text-[#fdba74]">
            <span aria-hidden>🔥</span>
            <span>{line}</span>
          </li>
        ))}
      </ul>

      <p className="relative mt-4 text-sm leading-relaxed text-[#e9d5ff]">
        💰 Tus puntos se acumulan y, cuando alcances la cantidad necesaria, podrás convertirlos en{' '}
        <strong className={`font-black ${GRADIENT_TEXT} from-[#fde047] to-[#fb923c]`}>
          BLAST ganados
        </strong>{' '}
        dentro de LiveBoom.
      </p>

      <div className="relative mt-4 flex flex-wrap gap-2">
        <span className="rounded-full border border-[#34d399]/40 bg-[#34d399]/12 px-3 py-1.5 text-xs font-bold text-[#6ee7b7]">
          ✅ No tienes que pagar para participar.
        </span>
        <span className="rounded-full border border-[#38bdf8]/40 bg-[#38bdf8]/12 px-3 py-1.5 text-xs font-bold text-[#7dd3fc]">
          🙌 Tú decides cuáles actividades quieres realizar.
        </span>
      </div>

      <div className="relative mt-5 grid grid-cols-1 gap-1.5 min-[420px]:grid-cols-3">
        {BOOM.map((b, i) => (
          <p
            key={b.text}
            className={`text-[clamp(1rem,3.8vw,1.25rem)] font-black leading-tight tracking-wide ${
              i === BOOM.length - 1 ? 'min-[420px]:col-span-3' : ''
            }`}
          >
            <span aria-hidden>💥 </span>
            <span className={`${GRADIENT_TEXT} ${b.gradient}`}>{b.text}</span>
          </p>
        ))}
      </div>

      <div className="relative mt-5 flex flex-wrap items-center gap-2 text-sm text-[#e9d5ff]">
        <span>Busca las publicaciones marcadas como:</span>
        <span className="inline-flex items-center gap-1 rounded-lg bg-gradient-to-r from-[#facc15] to-[#fb923c] px-2.5 py-1 text-xs font-black uppercase tracking-wider text-[#1a0b2e] shadow-[0_0_14px_rgba(250,204,21,0.45)]">
          🎁 Gana puntos
        </span>
      </div>

      <div className="relative mt-5 flex flex-col gap-3 border-t border-[#ffffff]/10 pt-4 min-[420px]:flex-row min-[420px]:items-center min-[420px]:justify-between">
        <div>
          <p className={`text-lg font-black ${GRADIENT_TEXT} from-[#f472b6] via-[#c084fc] to-[#22d3ee]`}>
            LiveBoom
          </p>
          <p className="text-sm font-semibold text-[#e9d5ff]">⏳ Tu tiempo también cuenta.</p>
        </div>
        <Link
          to="/recompensas"
          className="inline-flex min-h-11 items-center justify-center rounded-xl bg-gradient-to-r from-[#f472b6] via-[#c084fc] to-[#22d3ee] px-5 py-2.5 text-sm font-black text-[#14051f] shadow-[0_0_18px_rgba(192,132,252,0.45)] transition hover:brightness-110"
        >
          🎁 Ver mis puntos
        </Link>
      </div>
    </article>
  );
}

/**
 * Espacio del feed de Publicaciones: muestra el aviso la primera vez y luego cada
 * 20 min de uso activo, solo cuando entra en pantalla. Si no toca, no ocupa altura.
 */
export function GanaPuntosPromoSlot() {
  const ref = useRef<HTMLDivElement>(null);
  const location = useLocation();
  const [visible, setVisible] = useState(false);
  const [closed, setClosed] = useState(false);
  const pathRef = useRef(location.pathname);
  pathRef.current = location.pathname;

  useEffect(() => {
    if (visible || closed) return;
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        if (isUnsafeAdContext(pathRef.current)) return;
        if (!takeGanaPuntosPromoTurn()) return;
        setVisible(true);
      },
      { rootMargin: '0px 0px 320px 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [visible, closed]);

  const show = visible && !closed;
  return (
    <div ref={ref} className={show ? undefined : 'mb-0'}>
      {show ? <GanaPuntosPromoCard onClose={() => setClosed(true)} /> : null}
    </div>
  );
}
