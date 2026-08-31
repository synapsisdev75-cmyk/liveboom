import { frameConfigForXp } from '../../lib/levelFrameConfig';
import { levelFromXp } from '../../lib/userLevels';

const SIZE_CLASS = {
  sm: 'h-14 w-14',
  md: 'h-[104px] w-[104px]',
  lg: 'h-[136px] w-[136px]',
  xl: 'h-[172px] w-[172px]',
  '2xl': 'h-[196px] w-[196px]',
} as const;

type Size = keyof typeof SIZE_CLASS;

type Props = {
  levelXp: number;
  avatarUrl?: string | null;
  fallbackLetter?: string;
  size?: Size;
  className?: string;
  showLevelChip?: boolean;
  /** Vista previa del super admin — sobreescribe layout / src. */
  previewFrameSrc?: string;
  previewAvatarLayout?: {
    top: string;
    left: string;
    width: string;
    height: string;
  };
};

export function LevelAvatarFrame({
  levelXp,
  avatarUrl,
  fallbackLetter = '?',
  size = 'xl',
  className = '',
  showLevelChip = false,
  previewFrameSrc,
  previewAvatarLayout,
}: Props) {
  const info = levelFromXp(levelXp);
  const frame = frameConfigForXp(levelXp);
  const layout = previewAvatarLayout ?? frame.avatarLayout;
  const frameSrc = previewFrameSrc ?? frame.src;
  const letter = fallbackLetter.slice(0, 1).toUpperCase();

  return (
    <div className={`relative isolate shrink-0 ${SIZE_CLASS[size]} ${className}`}>
      <div
        className="absolute z-[1] overflow-hidden rounded-full bg-zinc-900"
        style={layout}
      >
        {avatarUrl ? (
          <img
            src={avatarUrl}
            alt=""
            className="block h-full w-full rounded-full object-cover object-center"
            draggable={false}
          />
        ) : (
          <div className="grid h-full w-full place-items-center bg-zinc-900 text-xl font-black text-cyan-300">
            {letter}
          </div>
        )}
      </div>

      <img
        src={frameSrc}
        alt=""
        aria-hidden
        draggable={false}
        className="pointer-events-none absolute inset-0 z-[2] h-full w-full object-contain"
      />

      {showLevelChip ? (
        <span className="absolute -bottom-0.5 left-1/2 z-[3] -translate-x-1/2 whitespace-nowrap rounded-full bg-gradient-to-r from-fuchsia-500 to-cyan-400 px-2 py-0.5 text-[9px] font-black text-white shadow-lg sm:text-[10px]">
          Nivel {info.level}
        </span>
      ) : null}
    </div>
  );
}
