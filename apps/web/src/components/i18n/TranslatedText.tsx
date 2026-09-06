import { useEffect, useState } from 'react';
import { EmojiText } from '../social/TextWithEntities';
import { useT } from '../../i18n';
import { LOCALE_META, parseAppLocale } from '../../i18n/locales';
import { shouldTranslateMessage, translateText } from '../../lib/translateText';
import { useLocaleStore } from '../../store/localeStore';

export function TranslatedText({
  text,
  sourceLang,
  mine = false,
  emojiSize,
}: {
  text: string;
  sourceLang?: string | null;
  mine?: boolean;
  emojiSize?: number;
}) {
  const t = useT();
  const locale = useLocaleStore((state) => state.locale);
  const [translated, setTranslated] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showOriginal, setShowOriginal] = useState(false);
  const canTranslate = !mine && shouldTranslateMessage(text, sourceLang, locale);

  useEffect(() => {
    if (!canTranslate) {
      setTranslated(null);
      setBusy(false);
      return undefined;
    }
    let cancelled = false;
    setBusy(true);
    void translateText(text, sourceLang, locale).then((result) => {
      if (cancelled) return;
      setBusy(false);
      setTranslated(result && result !== text ? result : null);
    });
    return () => {
      cancelled = true;
    };
  }, [canTranslate, locale, sourceLang, text]);

  const display = mine || showOriginal || !translated ? text : translated;
  const source = sourceLang ? parseAppLocale(sourceLang) : null;
  const sourceName = source ? LOCALE_META[source].nativeName : null;

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
