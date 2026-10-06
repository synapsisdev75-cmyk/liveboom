import { Check } from 'lucide-react';
import { useEffect } from 'react';
import type { ProcessedBackground } from '../../chatThemes/backgroundImage';
import { CHAT_FONT_CHOICES, ensureChatFonts, fontStack } from '../../chatThemes/fonts';
import type { ChatAppearance, ChatBubbleStyle, ChatTextSize, ChatTheme } from '../../chatThemes/types';
import { CustomBackgroundPicker } from './CustomBackgroundPicker';

const TEXT_SIZES: Array<{ id: ChatTextSize; label: string }> = [
  { id: 'sm', label: 'Pequeño' },
  { id: 'md', label: 'Normal' },
  { id: 'lg', label: 'Grande' },
  { id: 'xl', label: 'Muy grande' },
];

const BUBBLE_STYLES: Array<{ id: ChatBubbleStyle; label: string }> = [
  { id: 'theme', label: 'Del tema' },
  { id: 'light', label: 'Claro' },
  { id: 'dark', label: 'Oscuro' },
  { id: 'liveboom', label: 'LiveBoom' },
  { id: 'glass', label: 'Cristal' },
];

type Props = {
  draft: ChatAppearance;
  activeThemeId: string;
  themes: ChatTheme[];
  onChange: (patch: Partial<ChatAppearance>) => void;
  onPickBackground: (processed: ProcessedBackground) => void;
  onEditBackground: () => void;
};

/** Tarjetas de tema + ajustes. Todo modifica solo el borrador hasta pulsar «Aplicar». */
export function ChatThemeSelector({ draft, activeThemeId, themes, onChange, onPickBackground, onEditBackground }: Props) {
  useEffect(() => {
    ensureChatFonts(themes.flatMap((theme) => [theme.tokens.fontHeading]));
    ensureChatFonts(CHAT_FONT_CHOICES.map((choice) => choice.family));
  }, [themes]);

  return (
    <>
      <section className="lb-cts__section" aria-labelledby="lb-cts-themes">
        <h3 id="lb-cts-themes" className="lb-cts__section-title">
          Temas
        </h3>
        <div className="lb-cts__grid" role="radiogroup" aria-label="Temas del chat">
          {themes.map((theme) => {
            const on = theme.id === activeThemeId;
            return (
              <button
                key={theme.id}
                type="button"
                role="radio"
                aria-checked={on}
                className={`lb-cts__card ${on ? 'is-on' : ''}`}
                onClick={() => onChange({ themeId: theme.id })}
              >
                <img
                  src={theme.thumbnail}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  className="lb-cts__card-img"
                  style={{ backgroundColor: theme.tokens.background }}
                />
                <span className="lb-cts__card-body">
                  <span className="lb-cts__card-name" style={{ fontFamily: fontStack(theme.tokens.fontHeading) }}>
                    {theme.name}
                  </span>
                  <span className="lb-cts__card-demo" aria-hidden>
                    <span style={{ background: theme.tokens.bubbleIncoming, border: `1px solid ${theme.tokens.bubbleBorder}` }} />
                    <span style={{ background: theme.tokens.bubbleOutgoing }} />
                  </span>
                </span>
                {on ? (
                  <span className="lb-cts__check" aria-hidden>
                    <Check size={14} strokeWidth={3} />
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      </section>

      <section className="lb-cts__section" aria-labelledby="lb-cts-bg">
        <h3 id="lb-cts-bg" className="lb-cts__section-title">
          Mi fondo
        </h3>
        <CustomBackgroundPicker
          value={draft.customBackground}
          onPicked={onPickBackground}
          onEdit={onEditBackground}
          onRemove={() => onChange({ customBackground: null })}
        />
      </section>

      <section className="lb-cts__section" aria-labelledby="lb-cts-font">
        <h3 id="lb-cts-font" className="lb-cts__section-title">
          Fuente del chat
        </h3>
        <div className="lb-cts__chips" role="radiogroup" aria-label="Fuente del chat">
          {CHAT_FONT_CHOICES.map((choice) => (
            <button
              key={choice.id}
              type="button"
              role="radio"
              aria-checked={draft.font === choice.id}
              className={`lb-cts__chip ${draft.font === choice.id ? 'is-on' : ''}`}
              style={choice.family ? { fontFamily: fontStack(choice.family) } : undefined}
              onClick={() => onChange({ font: choice.id })}
            >
              {choice.label}
            </button>
          ))}
        </div>
      </section>

      <section className="lb-cts__section" aria-labelledby="lb-cts-size">
        <h3 id="lb-cts-size" className="lb-cts__section-title">
          Tamaño del texto
        </h3>
        <div className="lb-cts__segment" role="radiogroup" aria-label="Tamaño del texto">
          {TEXT_SIZES.map((size) => (
            <button
              key={size.id}
              type="button"
              role="radio"
              aria-checked={draft.textSize === size.id}
              className={draft.textSize === size.id ? 'is-on' : ''}
              onClick={() => onChange({ textSize: size.id })}
            >
              {size.label}
            </button>
          ))}
        </div>
      </section>

      <section className="lb-cts__section" aria-labelledby="lb-cts-bubbles">
        <h3 id="lb-cts-bubbles" className="lb-cts__section-title">
          Estilo de burbujas
        </h3>
        <div className="lb-cts__chips" role="radiogroup" aria-label="Estilo de burbujas">
          {BUBBLE_STYLES.map((style) => (
            <button
              key={style.id}
              type="button"
              role="radio"
              aria-checked={draft.bubbleStyle === style.id}
              className={`lb-cts__chip ${draft.bubbleStyle === style.id ? 'is-on' : ''}`}
              onClick={() => onChange({ bubbleStyle: style.id })}
            >
              {style.label}
            </button>
          ))}
        </div>
      </section>

      <section className="lb-cts__section">
        <button
          type="button"
          role="switch"
          aria-checked={draft.highContrast}
          className="lb-cts__toggle"
          onClick={() => onChange({ highContrast: !draft.highContrast })}
        >
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-bold">Alto contraste</span>
            <span className="lb-cts__hint lb-cts__hint--flush block">Texto y burbujas con máxima legibilidad.</span>
          </span>
          <span className={`lb-cts__switch ${draft.highContrast ? 'is-on' : ''}`} aria-hidden />
        </button>
      </section>
    </>
  );
}
