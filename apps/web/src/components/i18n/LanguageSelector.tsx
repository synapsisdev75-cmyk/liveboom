import { Globe } from 'lucide-react';
import { useT, type AppLocale } from '../../i18n';
import { useLocaleStore } from '../../store/localeStore';
import { LocaleMenuList } from './LanguageDropdown';

export function LanguageSelector({
  compact = false,
  onPicked,
}: {
  compact?: boolean;
  onPicked?: (locale: AppLocale) => void;
}) {
  const t = useT();
  const locale = useLocaleStore((state) => state.locale);
  const setLocale = useLocaleStore((state) => state.setLocale);

  return (
    <div className="space-y-3">
      {compact ? null : (
        <div>
          <p className="text-sm font-bold text-white">{t('language.choose')}</p>
          <p className="mt-0.5 text-xs text-zinc-500">{t('language.realtimeHint')}</p>
        </div>
      )}
      <LocaleMenuList
        selected={locale}
        onPick={(id) => {
          setLocale(id);
          onPicked?.(id);
        }}
      />
      {compact ? null : (
        <p className="flex items-start gap-2 rounded-xl border border-cyan-500/20 bg-cyan-500/10 px-3 py-2 text-xs text-cyan-50">
          <Globe size={14} className="mt-0.5 shrink-0" />
          <span>
            <strong className="font-semibold">{t('language.realtimeTitle')}. </strong>
            {t('language.realtimeHint')}
          </span>
        </p>
      )}
    </div>
  );
}
