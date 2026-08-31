import { CoinPackagesModal } from './CoinPackagesModal';

export { CoinPackagesModal };

export function CoinModal({ onClose }: { onClose: () => void }) {
  return <CoinPackagesModal onClose={onClose} />;
}

export function RechargeButton({ onClick, className = '' }: { onClick: () => void; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full bg-gradient-to-r from-cyan-500 to-fuchsia-500 px-6 py-2 font-bold text-white shadow-[0_0_15px_rgba(0,240,255,0.5)] transition-transform hover:scale-105 ${className}`}
    >
      Recargar Blast
    </button>
  );
}
