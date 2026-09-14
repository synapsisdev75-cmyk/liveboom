import type { CSSProperties } from 'react';
import { BATTLE_HP_MAX } from '../../../lib/battleHp';
import { BATTLE_HP_SEGMENTS } from '../../../lib/battleNeonAssets';
import { getUserLevelStyle } from '../../../lib/liveChatLevelStyle';

type Props = {
  hp: number;
  levelXp?: number | null;
  /** a = llena de izquierda a derecha; b = de derecha a izquierda (hacia el VS). */
  side: 'a' | 'b';
  className?: string;
  label?: string;
  showPct?: boolean;
};

/**
 * Barra de vida segmentada estilo neón LED.
 * Color activo = paleta del nivel/insignia del host.
 */
export function BattleNeonHpBar({
  hp,
  levelXp,
  side,
  className = '',
  label,
  showPct = true,
}: Props) {
  const style = getUserLevelStyle(levelXp);
  const pct = Math.min(BATTLE_HP_MAX, Math.max(0, Number(hp) || 0));
  const lit = Math.round((pct / BATTLE_HP_MAX) * BATTLE_HP_SEGMENTS);
  // Ambos lados: primeros N segmentos encendidos; el lado B usa flex invertido (hacia el VS).
  const segments = Array.from({ length: BATTLE_HP_SEGMENTS }, (_, i) => i < lit);

  return (
    <div
      className={`lb-battle-neon-hp${side === 'b' ? ' is-b' : ' is-a'} ${className}`.trim()}
      style={
        {
          '--lb-hp-primary': style.primaryColor,
          '--lb-hp-secondary': style.secondaryColor,
          '--lb-hp-glow': style.glow,
        } as CSSProperties
      }
      aria-label={label || `Vida ${Math.round(pct)}%`}
    >
      {label || showPct ? (
        <div className="lb-battle-neon-hp__meta">
          {label ? <span className="lb-battle-neon-hp__label">{label}</span> : null}
          {showPct ? <span className="lb-battle-neon-hp__pct">{Math.round(pct)}%</span> : null}
        </div>
      ) : null}
      <div
        className="lb-battle-neon-hp__track"
        role="meter"
        aria-valuenow={Math.round(pct)}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        {segments.map((on, i) => (
          <span
            key={i}
            className={`lb-battle-neon-hp__seg${on ? ' is-on' : ''}`}
            style={on ? { transitionDelay: `${i * 12}ms` } : undefined}
          />
        ))}
      </div>
    </div>
  );
}
