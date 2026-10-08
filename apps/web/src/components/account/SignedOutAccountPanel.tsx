import { ChevronRight, Info, User } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useT } from '../../i18n';

const SHORTCUTS = [
  { key: 'profile' as const, icon: '/assets/account/signed-out-profile.png?v=2', to: '/login' },
  { key: 'wallet' as const, icon: '/assets/account/signed-out-wallet.png?v=2', to: '/login' },
  { key: 'security' as const, icon: '/assets/account/signed-out-shield.png?v=2', to: '/login' },
];

/** Panel de configuración cuando no hay sesión. No cambia el flujo de login. */
export function SignedOutAccountPanel() {
  const t = useT();
  const labels = {
    profile: t('nav.profile'),
    wallet: t('nav.walletShort'),
    security: t('settings.signedOutSecurity'),
  };

  return (
    <section className="lb-signed-out" aria-labelledby="lb-signed-out-title">
      <img
        src="/assets/account/signed-out-bg.png?v=2"
        alt=""
        className="lb-signed-out__bg"
        decoding="async"
      />
      <div className="lb-signed-out__row">
        <div className="lb-signed-out__art" aria-hidden="true">
          <img src="/assets/account/signed-out-person.png?v=2" alt="" className="lb-signed-out__person" />
          <img src="/assets/account/signed-out-lock.png?v=2" alt="" className="lb-signed-out__lock" />
        </div>

        <div className="lb-signed-out__copy">
          <h1 id="lb-signed-out-title" className="lb-signed-out__title">
            {t('settings.signedOutLead')} <span>{t('settings.signedOutAccent')}</span>
          </h1>
          <p className="lb-signed-out__body">{t('settings.signedOutBody')}</p>
          <div className="lb-signed-out__actions">
            <Link to="/login" className="lb-signed-out__login">
              <User size={16} aria-hidden="true" />
              {t('nav.signIn')}
              <ChevronRight size={16} aria-hidden="true" />
            </Link>
            <Link to="/registro" className="lb-signed-out__register">
              <User size={16} aria-hidden="true" />
              {t('nav.signUp')}
            </Link>
          </div>
          <p className="lb-signed-out__note">
            <Info size={14} aria-hidden="true" />
            {t('settings.signedOutNote')}
          </p>
        </div>

        <div className="lb-signed-out__links">
          {SHORTCUTS.map((item) => (
            <Link key={item.key} to={item.to} className="lb-signed-out__link">
              <img src={item.icon} alt="" />
              <span>{labels[item.key]}</span>
              <ChevronRight size={16} aria-hidden="true" />
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
