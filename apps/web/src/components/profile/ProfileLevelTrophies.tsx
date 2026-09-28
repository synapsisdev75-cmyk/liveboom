import { Lock } from 'lucide-react';
import { levelFromXp } from '../../lib/userLevels';
import { LEVEL_TROPHIES, type LevelTrophyDef } from '../../lib/levelTrophies';
import { getActiveTiers } from '../../store/levelsConfigStore';

type Props = {
  levelXp: number;
  className?: string;
};

function trophyUnlocked(def: LevelTrophyDef, levelXp: number): boolean {
  const current = levelFromXp(levelXp);
  const tiers = getActiveTiers();
  const currentIdx = tiers.findIndex((t) => t.slug === current.slug);
  const trophyIdx = tiers.findIndex((t) => t.slug === def.slug);
  if (trophyIdx < 0) return current.slug === def.slug;
  if (currentIdx < 0) return false;
  return trophyIdx <= currentIdx;
}

export function ProfileLevelTrophies({ levelXp, className = '' }: Props) {
  const current = levelFromXp(levelXp);
  const items = LEVEL_TROPHIES.map((def) => ({
    def,
    unlocked: trophyUnlocked(def, levelXp),
    active: def.slug === current.slug,
  }));

  if (!items.length) return null;

  return (
    <section
      className={`lb-profile-trophies ${className}`.trim()}
      aria-label="Trofeos de nivel"
    >
      <div className="lb-profile-trophies__head">
        <h2 className="lb-profile-trophies__title">Trofeos</h2>
        <p className="lb-profile-trophies__hint">
          {current.title} · se desbloquean al subir de nivel
        </p>
      </div>
      <ul className="lb-profile-trophies__row">
        {items.map(({ def, unlocked, active }) => (
          <li
            key={def.id}
            className={`lb-profile-trophies__item${unlocked ? ' is-unlocked' : ' is-locked'}${
              active ? ' is-active' : ''
            }`}
          >
            <div className="lb-profile-trophies__frame" title={unlocked ? def.name : `Bloqueado · ${def.name}`}>
              <img
                src={def.image}
                alt={unlocked ? def.name : ''}
                className="lb-profile-trophies__img"
                draggable={false}
                loading="lazy"
              />
              {!unlocked ? (
                <span className="lb-profile-trophies__lock" aria-hidden>
                  <Lock size={12} strokeWidth={2.4} />
                </span>
              ) : null}
            </div>
            <span className="lb-profile-trophies__name">{def.name.replace(/^Trofeo\s+/i, '')}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
