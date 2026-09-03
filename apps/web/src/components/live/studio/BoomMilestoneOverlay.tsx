type Props = {
  milestone: number | null;
};

/** Explosión visual al alcanzar múltiplos de 20 Boom globales. */
export function BoomMilestoneOverlay({ milestone }: Props) {
  if (!milestone) return null;
  return (
    <div className="lb-live-boom-milestone pointer-events-none absolute inset-0 z-[22] flex items-center justify-center">
      <div className="lb-live-boom-milestone-core flex flex-col items-center">
        <img
          src="/reactions/boom-on.png"
          alt=""
          draggable={false}
          className="lb-live-boom-milestone-img h-24 w-24 object-contain sm:h-32 sm:w-32"
        />
        <p className="lb-live-boom-milestone-text mt-2 text-2xl font-black uppercase tracking-wider text-amber-200 sm:text-3xl">
          BOOM!
        </p>
        <p className="text-sm font-bold text-white sm:text-base">{milestone} BOOM</p>
      </div>
    </div>
  );
}
