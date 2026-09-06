import { Link } from 'react-router-dom';
import { useT } from '../../i18n';

export function LegalFooter({ compact = false }: { compact?: boolean }) {
  const t = useT();
  return (
    <footer
      className={`text-center text-xs text-zinc-500 ${compact ? 'mt-4 space-y-1' : 'border-t border-white/10 px-4 py-6'}`}
    >
      <p className={compact ? '' : 'mb-1'}>{t('legal.rights', { year: new Date().getFullYear() })}</p>
      <p className={compact ? 'text-[10px] text-zinc-600' : 'mb-2 text-[11px] text-zinc-600'}>
        {t('legal.developed')}
      </p>
      <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
        <Link to="/legal/terminos" className="hover:text-boom-cyan">
          {t('legal.terms')}
        </Link>
        <span aria-hidden="true">·</span>
        <Link to="/legal/privacidad" className="hover:text-boom-cyan">
          {t('legal.privacy')}
        </Link>
        <span aria-hidden="true">·</span>
        <Link to="/legal/cookies" className="hover:text-boom-cyan">
          {t('legal.cookies')}
        </Link>
        <span aria-hidden="true">·</span>
        <Link to="/legal/seguridad-infantil" className="hover:text-boom-cyan">
          {t('legal.childSafety')}
        </Link>
      </div>
    </footer>
  );
}
