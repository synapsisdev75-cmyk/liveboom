import { CoinPackagesModal } from './CoinPackagesModal';

type Props = {
  packages?: unknown[];
  onClose: () => void;
  onDone?: () => void;
};

/** Misma recarga Wompi que la billetera (no usa /api/wallet de Vercel). */
export function TopupModal({ onClose, onDone }: Props) {
  return (
    <CoinPackagesModal
      onClose={() => {
        onDone?.();
        onClose();
      }}
    />
  );
}
