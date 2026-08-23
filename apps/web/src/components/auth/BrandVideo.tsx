import { Logo } from '../brand/Logo';

type BrandVideoProps = {
  className?: string;
};

/** Logo principal en pantallas de auth. */
export function BrandVideo({ className = '' }: BrandVideoProps) {
  return <Logo large className={className} />;
}
