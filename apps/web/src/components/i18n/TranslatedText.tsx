import { useEffect, useState } from 'react';
import { EmojiText } from '../social/TextWithEntities';
import { useT } from '../../i18n';
import { LOCALE_META, parseAppLocale, type AppLocale } from '../../i18n/locales';
import { shouldTranslateMessage, translateText } from '../../lib/translateText';
import { useLocaleStore } from '../../store/localeStore';

export function TranslatedText({
  text,
  sourceLang,
  mine = false,
  emojiSize,
  forceTarget = null,
  onClearForced,
}: {
  text: string;
  sourceLang?: string | null;
  mine?: boolean;
  emojiSize?: number;
  /** Traducción pedida por el usuario a un idioma concreto (también en mensajes propios). */
  forceTarget?: AppLocale | null;
  onClearForced?: () => void;
}) {
  const t = useT();
  const locale = useLocaleStore((state) => state.locale);
  const [translated, setTranslated] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showOriginal, setShowOriginal] = useState(false);
  const forced = Boolean(forceTarget);
  const target = forceTarget ?? locale;
  const canTranslate = forced
    ? shouldTranslateMessage(text, null, target)
    : !mine && shouldTranslateMessage(text, sourceLang, locale);

  useEffect(() => {
    if (forced) setShowOriginal(false);
    if (!canTranslate) {
      setTranslated(null);
      setBusy(false);
      return undefined;
    }
    let cancelled = false;
    setBusy(true);
    void translateText(text, forced ? null : sourceLang, target).then((result) => {
      if (cancelled) return;
      setBusy(false);
      setTranslated(result && result !== text ? result : null);
    });
    return () => {
      cancelled = true;
    };
  }, [canTranslate, forced, sourceLang, target, text]);

  const display = (mine && !forced) || showOriginal || !translated ? text : translated;
  const source = sourceLang ? parseAppLocale(sourceLang) : null;
  const sourceName = source ? LOCALE_META[source].nativeName : null;

  if (forced) {
    const targetName = LOCALE_META[target].nativeName;
    return (
      <span className="block min-w-0">
        <span className="whitespace-pre-wrap break-words">
          {emojiSize ? <EmojiText text={display} size={emojiSize} /> : display}
        </span>
        <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[10px] font-semibold">
          <span className="opacity-80">
            {busy
              ? t('chat.translating')
              : translated
                ? `Traducido a ${targetName}`
                : `Ya está en ${targetName}`}
          </span>
          {!busy && translated ? (
            <button
              type="button"
              className="min-h-6 underline-offset-2 hover:underline"
              onClick={() => setShowOriginal((value) => !value)}
            >
              {showOriginal ? 'Ver traducción' : 'Ver original'}
            </button>
          ) : null}
          {onClearForced && !busy ? (
            <button
              type="button"
              className="min-h-6 underline-offset-2 opacity-80 hover:underline"
              onClick={onClearForced}
            >
              Quitar
            </button>
          ) : null}
        </span>
      </span>
    );
  }

  return (
    <span className="block min-w-0">
      <span className="whitespace-pre-wrap break-words">
        {emojiSize ? <EmojiText text={display} size={emojiSize} /> : display}
      </span>
      {canTranslate && (busy || translated) ? (
        <button
          type="button"
          className="mt-0.5 block min-h-6 text-left text-[10px] font-semibold text-cyan-300/90 hover:text-cyan-200"
          onClick={() => setShowOriginal((value) => !value)}
        >
          {busy
            ? t('chat.translating')
            : showOriginal
              ? t('chat.showTranslation')
              : t('chat.translatedFrom', { language: sourceName || t('common.general') })}
        </button>
      ) : null}
    </span>
  );
}
