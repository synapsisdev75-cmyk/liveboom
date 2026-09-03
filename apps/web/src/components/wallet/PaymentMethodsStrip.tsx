import { ACCEPTED_PAYMENT_LOGOS } from '../../lib/paymentMethods';

type Props = {
  className?: string;
  /** Compacto para modales de recarga. */
  compact?: boolean;
};

/** Franja de logos de pago (Nequi, Visa, Daviplata, PayPal, Mastercard). */
export function PaymentMethodsStrip({ className = '', compact = false }: Props) {
  return (
    <div
      className={`flex flex-wrap items-center gap-3 rounded-2xl border border-zinc-200 bg-white ${
        compact ? 'gap-2.5 px-3 py-2.5' : 'gap-3.5 px-4 py-3.5'
      } ${className}`}
    >
      {ACCEPTED_PAYMENT_LOGOS.map((method) => (
        <img
          key={method.id}
          src={method.src}
          alt={method.label}
          title={method.label}
          className={`w-auto object-contain object-center ${
            compact ? 'h-7 max-w-[4.75rem]' : 'h-8 max-w-[5.75rem]'
          }`}
          loading="lazy"
          decoding="async"
        />
      ))}
      <span className={`font-medium text-zinc-500 ${compact ? 'text-[10px]' : 'text-[11px]'}`}>
        … y más
      </span>
    </div>
  );
}
