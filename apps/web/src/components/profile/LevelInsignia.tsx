import { levelFromXp } from '../../lib/userLevels';

type Props = {
  levelXp: number;
  className?: string;
  previewSrc?: string;
  previewSize?: {
    mobile: { width: number; height: number };
    desktop: { width: number; height: number };
  };
};

export function LevelInsignia({ levelXp, className = '', previewSrc, previewSize }: Props) {
  const info = levelFromXp(levelXp);
  const size = previewSize ?? info.insigniaSize;
  const src = previewSrc ?? info.image;

  return (
    <img
      src={src}
      alt={info.title}
      className={`lb-insignia mx-auto object-contain object-bottom drop-shadow-[0_6px_18px_rgba(255,120,0,0.25)] sm:ml-auto sm:mr-0 ${className}`}
      style={
        {
          '--ins-w-mobile': `${size.mobile.width}px`,
          '--ins-h-mobile': `${size.mobile.height}px`,
          '--ins-w-desktop': `${size.desktop.width}px`,
          '--ins-h-desktop': `${size.desktop.height}px`,
        } as React.CSSProperties
      }
      draggable={false}
    />
  );
}
