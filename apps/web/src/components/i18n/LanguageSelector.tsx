import { Check, Globe } from 'lucide-react';
import { APP_LOCALES, LOCALE_META, useT, type AppLocale } from '../../i18n';
import { useLocaleStore } from '../../store/localeStore';

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
      <div className={`grid gap-2 ${compact ? 'grid-cols-2' : 'grid-cols-1 sm:grid-cols-2'}`}>
        {APP_LOCALES.map((id) => {
          const meta = LOCALE_META[id];
          const active = locale === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => {
                setLocale(id);
                onPicked?.(id);
              }}
              className={`flex min-h-11 items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition ${
                active
                  ? 'border-violet-500/60 bg-violet-500/15 text-white'
                  : 'border-white/10 bg-[#0f1016] text-zinc-200 hover:bg-white/[0.04]'
              }`}
              aria-pressed={active}
            >
              <span className="text-lg leading-none" aria-hidden="true">
                {meta.flag}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold">{meta.nativeName}</span>
                <span className="block text-[11px] text-zinc-500">{meta.englishName}</span>
              </span>
              {active ? <Check size={16} className="shrink-0 text-violet-300" /> : null}
            </button>
          );
        })}
      </div>
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
