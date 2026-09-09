import { Check, ChevronDown, Globe, Search } from 'lucide-react';
import { useCallback, useMemo, useRef, useState } from 'react';
import { useDismissOnOutside } from '../../hooks/useDismissOnOutside';
import {
  APP_LOCALES,
  LOCALE_META,
  localeSearchHaystack,
  useT,
  type AppLocale,
  type MessageKey,
} from '../../i18n';

const LOCALE_LABEL_KEY: Record<AppLocale, MessageKey> = {
  es: 'language.localeEs',
  en: 'language.localeEn',
  pt: 'language.localePt',
  fr: 'language.localeFr',
  de: 'language.localeDe',
  it: 'language.localeIt',
  zh: 'language.localeZh',
  ja: 'language.localeJa',
  ko: 'language.localeKo',
  hi: 'language.localeHi',
  bn: 'language.localeBn',
  ar: 'language.localeAr',
  ru: 'language.localeRu',
};
import { useLocaleStore } from '../../store/localeStore';

export function LanguageDropdown() {
  const t = useT();
  const locale = useLocaleStore((state) => state.locale);
  const setLocale = useLocaleStore((state) => state.setLocale);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismissOnOutside(open, rootRef, close);
  const meta = LOCALE_META[locale];

  return (
    <div className="lb-lang-dd" ref={rootRef}>
      <button
        type="button"
        className="lb-lang-dd__btn"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`${t('language.openPicker')} · ${meta.nativeName}`}
        onClick={() => setOpen((value) => !value)}
      >
        <Globe size={15} strokeWidth={2.1} className="lb-lang-dd__globe" />
        <span className="lb-lang-dd__current" dir="auto">
          {meta.nativeName}
        </span>
        <ChevronDown size={14} className={`lb-lang-dd__caret${open ? ' is-open' : ''}`} />
      </button>
      {open ? (
        <LocaleMenuList
          selected={locale}
          onPick={(id) => {
            setLocale(id);
            setOpen(false);
          }}
        />
      ) : null}
    </div>
  );
}

export function LocaleMenuList({
  selected,
  onPick,
}: {
  selected: AppLocale;
  onPick: (locale: AppLocale) => void;
}) {
  const t = useT();
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return [...APP_LOCALES];
    return APP_LOCALES.filter((id) => {
      const hay = `${localeSearchHaystack(id)} ${t(LOCALE_LABEL_KEY[id])}`.toLowerCase();
      return hay.includes(needle);
    });
  }, [query, t]);

  function move(delta: number) {
    if (matches.length === 0) return;
    setActiveIndex((current) => (current + delta + matches.length) % matches.length);
  }

  return (
    <div className="lb-lang-menu" role="presentation">
      <div className="lb-lang-menu__search">
        <Search size={14} />
        <input
          type="search"
          value={query}
          autoComplete="off"
          spellCheck={false}
          placeholder={t('language.searchPlaceholder')}
          aria-label={t('language.searchPlaceholder')}
          onChange={(event) => {
            setQuery(event.target.value);
            setActiveIndex(0);
          }}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown') {
              event.preventDefault();
              move(1);
            } else if (event.key === 'ArrowUp') {
              event.preventDefault();
              move(-1);
            } else if (event.key === 'Enter') {
              event.preventDefault();
              const id = matches[activeIndex];
              if (id) onPick(id);
            }
          }}
        />
      </div>
      <div className="lb-lang-menu__list" role="listbox" aria-label={t('language.title')} ref={listRef}>
        {matches.length === 0 ? (
          <p className="lb-lang-menu__empty">—</p>
        ) : (
          matches.map((id, index) => {
            const meta = LOCALE_META[id];
            const active = selected === id;
            const translated = t(LOCALE_LABEL_KEY[id]);
            const extra = translated && translated !== meta.nativeName ? translated : null;
            return (
              <button
                key={id}
                type="button"
                role="option"
                aria-selected={active}
                dir="ltr"
                className={`lb-lang-menu__item${active ? ' is-on' : ''}${index === activeIndex ? ' is-focus' : ''}`}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => onPick(id)}
              >
                <span className="lb-lang-menu__lead">
                  <span className="lb-lang-menu__code">{meta.regionCode}</span>
                  <span className="lb-lang-menu__names">
                    <span className="lb-lang-menu__native" dir={meta.dir}>
                      {meta.nativeName}
                    </span>
                    {extra ? <span className="lb-lang-menu__latin">{extra}</span> : null}
                  </span>
                </span>
                <span className="lb-lang-menu__trail">
                  {active ? <Check size={15} className="lb-lang-menu__check" /> : null}
                  <img
                    className="lb-lang-menu__flag"
                    src={meta.flagSrc}
                    alt=""
                    width={22}
                    height={16}
                    draggable={false}
                  />
                </span>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
