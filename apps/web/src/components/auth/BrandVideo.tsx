import { Logo } from '../brand/Logo';

type BrandVideoProps = {
  className?: string;
};

/** Logo animado pequeño (sin caja negra del video). */
export function BrandVideo({ className = '' }: BrandVideoProps) {
  return <Logo iconOnly large className={className} />;
}
