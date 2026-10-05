import { ACCEPTED_PAYMENT_LOGOS } from '../../lib/paymentMethods';

type Props = {
  className?: string;
  /** Compacto para modales de recarga. */
  compact?: boolean;
};

/** El grupo debe ser más ancho que la franja para que el bucle no deje huecos. */
const LOGOS_PER_GROUP = [...ACCEPTED_PAYMENT_LOGOS, ...ACCEPTED_PAYMENT_LOGOS];

/** Franja de logos de pago (Nequi, Visa, Daviplata, Mastercard, PSE) en banda animada. */
export function PaymentMethodsStrip({ className = '', compact = false }: Props) {
  const label = ACCEPTED_PAYMENT_LOGOS.map((m) => m.label).join(', ');
  return (
    <div
      className={`lb-payment-methods lb-payment-marquee overflow-hidden rounded-2xl ${
        compact ? 'py-2.5' : 'py-3.5'
      } ${className}`}
      role="img"
      aria-label={label}
    >
      <div className="lb-payment-marquee__track flex w-max">
        {[0, 1].map((group) => (
          <div
            key={group}
            className={`flex shrink-0 items-center ${compact ? 'gap-6 pr-6' : 'gap-8 pr-8'}`}
            aria-hidden
          >
            {LOGOS_PER_GROUP.map((method, i) => (
              <img
                key={`${method.id}-${i}`}
                src={method.src}
                alt=""
                title={method.label}
                className={`w-auto shrink-0 object-contain object-center ${
                  compact ? 'h-7 max-w-[4.75rem]' : 'h-8 max-w-[5.75rem]'
                }`}
                loading="lazy"
                decoding="async"
                draggable={false}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
