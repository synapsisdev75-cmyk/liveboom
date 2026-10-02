import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronLeft, Languages } from 'lucide-react';
import { APP_LOCALES, LOCALE_META, type AppLocale } from '../../i18n/locales';
import { readChatTranslateTarget, writeChatTranslateTarget } from '../../lib/chatTranslatePref';
import { useLocaleStore } from '../../store/localeStore';

type Props = {
  /** Idioma al que ya está traducido el mensaje (null = original). */
  translatedTo: AppLocale | null;
  onTranslate: (lang: AppLocale) => void;
  onClear: () => void;
  className?: string;
};

const MENU_W = 200;

/**
 * Botón «Traducir» para mensajes sin menú propio (chat del LIVE).
 * Mismo menú y mismo idioma predeterminado que Mensajes; el menú va en portal para no recortarse.
 */
export function MessageTranslateButton({ translatedTo, onTranslate, onClear, className = '' }: Props) {
  const appLocale = useLocaleStore((state) => state.locale);
  const [open, setOpen] = useState(false);
  const [picker, setPicker] = useState(false);
  const [target, setTarget] = useState<AppLocale>(appLocale);
  const [pos, setPos] = useState<{ left: number; bottom: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!open || !btnRef.current) return;
    const rect = btnRef.current.getBoundingClientRect();
    const vw = window.innerWidth;
    setPos({
      left: Math.max(8, Math.min(rect.left, vw - MENU_W - 8)),
      bottom: Math.max(8, window.innerHeight - rect.top + 6),
    });
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const close = (event: Event) => {
      const node = event.target as Node | null;
      if (node && (menuRef.current?.contains(node) || btnRef.current?.contains(node))) return;
      setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    const onResize = () => setOpen(false);
    document.addEventListener('pointerdown', close, true);
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', onResize);
    return () => {
      document.removeEventListener('pointerdown', close, true);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', onResize);
    };
  }, [open]);

  function toggle() {
    if (!open) {
      setTarget(readChatTranslateTarget() ?? appLocale);
      setPicker(false);
    }
    setOpen((value) => !value);
  }

  function pick(lang: AppLocale, remember: boolean) {
    if (remember) writeChatTranslateTarget(lang);
    onTranslate(lang);
    setOpen(false);
  }

  const menu =
    open && pos && typeof document !== 'undefined'
      ? createPortal(
          <div
            ref={menuRef}
            className="lb-chat-msg-menu fixed z-[160]"
            style={{ left: pos.left, bottom: pos.bottom, width: MENU_W }}
            role="menu"
          >
            {picker ? (
              <>
                <button
                  type="button"
                  onClick={() => setPicker(false)}
                  className="lb-chat-msg-menu__item lb-chat-msg-menu__item--head"
                >
                  <ChevronLeft size={14} className="opacity-80" />
                  Traducir a…
                </button>
                <div className="lb-chat-msg-menu__langs">
                  {APP_LOCALES.map((lang) => (
                    <button
                      key={lang}
                      type="button"
                      role="menuitemradio"
                      aria-checked={target === lang}
                      onClick={() => pick(lang, true)}
                      className={`lb-chat-msg-menu__item ${target === lang ? 'is-current' : ''}`}
                    >
                      <img
                        src={LOCALE_META[lang].flagSrc}
                        alt=""
                        className="h-3.5 w-5 shrink-0 rounded-[2px] object-cover"
                      />
                      <span className="min-w-0 flex-1 truncate">{LOCALE_META[lang].nativeName}</span>
                      {target === lang ? <Check size={13} className="shrink-0 opacity-90" /> : null}
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <>
                {translatedTo ? (
                  <button
                    type="button"
                    onClick={() => {
                      onClear();
                      setOpen(false);
                    }}
                    className="lb-chat-msg-menu__item"
                  >
                    <Languages size={14} className="opacity-80" />
                    Ver original
                  </button>
                ) : (
                  <button type="button" onClick={() => pick(target, false)} className="lb-chat-msg-menu__item">
                    <Languages size={14} className="opacity-80" />
                    Traducir a {LOCALE_META[target].nativeName}
                  </button>
                )}
                <button type="button" onClick={() => setPicker(true)} className="lb-chat-msg-menu__item">
                  <Languages size={14} className="opacity-0" aria-hidden />
                  Traducir a otro idioma…
                </button>
              </>
            )}
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          toggle();
        }}
        className={`lb-msg-translate-btn ${translatedTo ? 'is-active' : ''} ${open ? 'is-open' : ''} ${className}`}
        aria-label="Traducir mensaje"
        aria-expanded={open}
        title="Traducir"
      >
        <Languages size={12} strokeWidth={2.3} />
      </button>
      {menu}
    </>
  );
}
