import { Radio } from 'lucide-react';
import { Link, NavLink } from 'react-router-dom';
import { bcp47For, useT } from '../../i18n';
import { prefetchRoute } from '../../lib/routePrefetch';
import { useAuthStore } from '../../store/authStore';
import { useLocaleStore } from '../../store/localeStore';

type Props = {
  onNavigate?: () => void;
  className?: string;
};

/** Transmitir + Mi Billetera (antes en sidebar izquierdo). */
export function SidebarWalletDock({ onNavigate, className = '' }: Props) {
  const t = useT();
  const locale = useLocaleStore((state) => state.locale);
  const profile = useAuthStore((state) => state.profile);
  const numberLocale = bcp47For(locale);

  function openRecharge() {
    window.dispatchEvent(new CustomEvent('liveboom:open-recharge'));
  }

  return (
    <div className={`lb-sidebar-dock${className ? ` ${className}` : ''}`}>
      <NavLink
        to="/transmitir"
        onClick={onNavigate}
        onPointerEnter={() => {
          prefetchRoute('/transmitir');
          prefetchRoute('/stream');
        }}
        onFocus={() => {
          prefetchRoute('/transmitir');
          prefetchRoute('/stream');
        }}
        className={({ isActive }) => `lb-sidebar-cta${isActive ? ' is-active' : ''}`}
      >
        <Radio size={15} strokeWidth={2.5} className="lb-sidebar-cta__icon" />
        {t('nav.goLive')}
      </NavLink>

      <div className="lb-sidebar-wallet">
        <p className="lb-sidebar-wallet__title">{t('nav.myWallet')}</p>
        {profile ? (
          <>
            <p className="lb-sidebar-wallet__balance">
              <span className="lb-sidebar-wallet__amount">
                {profile.coinsBalance.toLocaleString(numberLocale)}
              </span>
              <span className="lb-sidebar-wallet__unit">{t('nav.coins')}</span>
            </p>
            <button type="button" onClick={openRecharge} className="lb-sidebar-wallet__recharge">
              {t('nav.recharge')}
            </button>
            <Link to="/billetera" onClick={onNavigate} className="lb-sidebar-wallet__withdraw">
              {t('nav.withdraw')}
            </Link>
          </>
        ) : (
          <div className="mt-2 flex flex-col gap-1.5">
            <Link
              to="/login"
              onClick={onNavigate}
              className="text-sm font-medium text-cyan-400 hover:text-white"
            >
              {t('nav.signIn')}
            </Link>
            <Link to="/registro" onClick={onNavigate} className="lb-sidebar-cta">
              {t('nav.signUp')}
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
