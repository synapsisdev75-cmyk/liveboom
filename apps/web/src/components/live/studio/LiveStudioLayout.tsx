import type { ReactNode } from 'react';

type Props = {
  topBar?: ReactNode;
  left?: ReactNode;
  center: ReactNode;
  right?: ReactNode;
  bottom?: ReactNode;
  className?: string;
};

export function LiveStudioLayout({
  topBar,
  left,
  center,
  right,
  bottom,
  className = '',
}: Props) {
  return (
    <div className={`lb-live-studio mx-auto flex w-full max-w-[1600px] flex-col gap-4 ${className}`}>
      {topBar}
      <div className="lb-live-studio-grid grid min-h-0 flex-1 gap-3 lg:grid-cols-[minmax(200px,240px)_minmax(0,1fr)_minmax(220px,280px)] lg:gap-4">
        {left ? (
          <aside className="lb-live-studio-left order-2 flex flex-col gap-3 lg:order-1 lg:max-h-[min(72dvh,720px)] lg:overflow-y-auto">
            {left}
          </aside>
        ) : null}
        <main className="lb-live-studio-center order-1 min-w-0 lg:order-2">{center}</main>
        {right ? (
          <aside className="lb-live-studio-right order-3 flex flex-col gap-3 lg:max-h-[min(72dvh,720px)] lg:overflow-y-auto">
            {right}
          </aside>
        ) : null}
      </div>
      {bottom ? (
        <footer className="lb-live-studio-bottom order-4 flex flex-col gap-3 border-t border-white/[0.06] pt-3">
          {bottom}
        </footer>
      ) : null}
    </div>
  );
}
