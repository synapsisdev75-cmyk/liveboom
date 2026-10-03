import { Bold, CaseUpper, Check, Highlighter, Italic, Sparkles, Strikethrough, Underline } from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ComponentType } from 'react';
import { createPortal } from 'react-dom';
import {
  DEFAULT_POST_TEXT_STYLE,
  POST_TEXT_COLORS,
  POST_TEXT_FLAGS,
  POST_TEXT_FONTS,
  applyTextStyleRange,
  isDefaultPostTextStyle,
  postTextColor,
  postTextFont,
  textStyleAt,
  togglePostTextFlag,
  usePostTextFonts,
  type PostTextFlagId,
  type PostTextStyle,
  type TextStyleRange,
} from '../../lib/postTextStyle';
import { emojiTokenCovering } from '../../lib/liveboomEmojis';
import { fitPickerToViewport } from './EmojiPicker';

const FLAG_ICONS: Record<PostTextFlagId, ComponentType<{ size?: number; strokeWidth?: number }>> = {
  bold: Bold,
  italic: Italic,
  underline: Underline,
  strike: Strikethrough,
  upper: CaseUpper,
  highlight: Highlighter,
  neon: Sparkles,
};

const POPOVER_Z = 125;

type Props = {
  value: PostTextStyle | null | undefined;
  onChange: (next: PostTextStyle) => void;
  /**
   * `field`: botón dentro del campo (Publicación) y panel debajo del campo.
   * `toolbar`: botón en la barra de herramientas (chats, comentarios) y panel flotante.
   */
  variant?: 'field' | 'toolbar';
  /** Clase del botón en `toolbar` (para igualar los demás iconos de la barra). */
  buttonClassName?: string;
  disabled?: boolean;
  /**
   * Estilo por fragmento: con texto seleccionado en el campo, el panel edita solo esa parte.
   * Sin estas props el "Aa" sigue aplicando a todo el texto.
   */
  text?: string;
  getSelection?: () => { start: number; end: number } | null | undefined;
  ranges?: TextStyleRange[];
  onRangesChange?: (next: TextStyleRange[]) => void;
};

type Selection = { start: number; end: number };

/**
 * Botón "Aa": tipo de letra, color y estilos (negrita, cursiva, subrayado, tachado,
 * mayúsculas, resaltado, neón) para todo el texto o para la parte seleccionada.
 */
export function TextStyleButton({
  value: rawValue,
  onChange,
  variant = 'field',
  buttonClassName = '',
  disabled = false,
  text = '',
  getSelection,
  ranges = [],
  onRangesChange,
}: Props) {
  const value = rawValue ?? DEFAULT_POST_TEXT_STYLE;
  const [open, setOpen] = useState(false);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [coords, setCoords] = useState<{ left: number; top: number; width: number; maxHeight: number } | null>(
    null,
  );
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const font = postTextFont(value.font);
  const color = postTextColor(value.color);
  const styled = !isDefaultPostTextStyle(value) || ranges.length > 0;
  const floating = variant === 'toolbar';
  usePostTextFonts(open || font.family != null);

  /** Selección del campo ajustada para no partir un emoji; null = sin selección (todo el texto). */
  const readSelection = (): Selection | null => {
    if (!getSelection || !onRangesChange) return null;
    const live = getSelection();
    if (!live || live.end <= live.start) return null;
    const start = emojiTokenCovering(text, live.start)?.start ?? live.start;
    const end = Math.min(emojiTokenCovering(text, live.end)?.end ?? live.end, text.length);
    return end > start ? { start, end } : null;
  };

  const activeSelection = open && selection && selection.end <= text.length ? selection : null;
  const current = activeSelection ? textStyleAt(ranges, activeSelection.start, value) : value;
  const currentFont = postTextFont(current.font);
  const currentColor = postTextColor(current.color);
  const canReset = activeSelection
    ? ranges.some((range) => range.start < activeSelection.end && range.end > activeSelection.start)
    : styled;

  function apply(next: PostTextStyle) {
    const target = readSelection() ?? activeSelection;
    if (target && onRangesChange) {
      if (target !== activeSelection) setSelection(target);
      onRangesChange(applyTextStyleRange(ranges, target.start, target.end, next, value));
      return;
    }
    onChange(next);
  }

  function reset() {
    if (activeSelection && onRangesChange) {
      onRangesChange(applyTextStyleRange(ranges, activeSelection.start, activeSelection.end, value, value));
      return;
    }
    onChange(DEFAULT_POST_TEXT_STYLE);
    if (ranges.length) onRangesChange?.([]);
  }

  function toggle() {
    if (!open) setSelection(readSelection());
    setOpen(!open);
  }

  const updatePosition = useCallback(() => {
    const trigger = buttonRef.current;
    const panel = panelRef.current;
    if (!trigger || !panel) return;
    const prevMax = panel.style.maxHeight;
    panel.style.maxHeight = 'none';
    const naturalW = panel.offsetWidth;
    const naturalH = panel.offsetHeight;
    panel.style.maxHeight = prevMax;
    const next = fitPickerToViewport(trigger.getBoundingClientRect(), naturalW, naturalH, 'above');
    setCoords((prev) =>
      prev &&
      prev.left === next.left &&
      prev.top === next.top &&
      prev.width === next.width &&
      prev.maxHeight === next.maxHeight
        ? prev
        : { left: next.left, top: next.top, width: next.width, maxHeight: next.maxHeight },
    );
  }, []);

  useLayoutEffect(() => {
    if (!open || !floating) {
      setCoords(null);
      return;
    }
    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    window.visualViewport?.addEventListener('resize', updatePosition);
    window.visualViewport?.addEventListener('scroll', updatePosition);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
      window.visualViewport?.removeEventListener('resize', updatePosition);
      window.visualViewport?.removeEventListener('scroll', updatePosition);
    };
  }, [open, floating, updatePosition]);

  useEffect(() => {
    if (open && !floating) panelRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [open, floating]);

  useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (buttonRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      setOpen(false);
      buttonRef.current?.focus();
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    window.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('keydown', onKeyDown, true);
    };
  }, [open]);

  const panelBody = (
    <>
      <p className="lb-post-textstyle__title">{activeSelection ? 'Estilo de la selección' : 'Estilo'}</p>
      <div className="lb-post-textstyle__flags">
        {POST_TEXT_FLAGS.map((flag) => {
          const Icon = FLAG_ICONS[flag.id];
          const active = Boolean(current[flag.id]);
          return (
            <button
              key={flag.id}
              type="button"
              title={flag.label}
              aria-label={flag.label}
              aria-pressed={active}
              onClick={() => apply(togglePostTextFlag(current, flag.id))}
              className={`lb-post-textstyle__flag lb-post-textstyle__flag--${flag.id}${active ? ' is-active' : ''}`}
            >
              <Icon size={17} strokeWidth={2.4} />
            </button>
          );
        })}
      </div>

      <p className="lb-post-textstyle__title">Tipo de letra</p>
      <div className="lb-post-textstyle__fonts">
        {POST_TEXT_FONTS.map((item) => {
          const active = item.id === currentFont.id;
          return (
            <button
              key={item.id}
              type="button"
              aria-pressed={active}
              onClick={() => apply({ ...current, font: item.id })}
              className={`lb-post-textstyle__font${active ? ' is-active' : ''}`}
            >
              <span
                className="lb-post-textstyle__font-sample"
                style={{ fontFamily: item.family ?? undefined, color: currentColor.value ?? undefined }}
              >
                Aa
              </span>
              <span className="lb-post-textstyle__font-name">{item.label}</span>
            </button>
          );
        })}
      </div>

      <p className="lb-post-textstyle__title">Color</p>
      <div className="lb-post-textstyle__colors">
        {POST_TEXT_COLORS.map((item) => {
          const active = item.id === currentColor.id;
          return (
            <button
              key={item.id}
              type="button"
              title={item.label}
              aria-label={item.label}
              aria-pressed={active}
              onClick={() => apply({ ...current, color: item.id })}
              className={`lb-post-textstyle__swatch${item.value ? '' : ' is-auto'}${active ? ' is-active' : ''}`}
              style={item.value ? { background: item.value } : undefined}
            >
              {active ? <Check size={14} strokeWidth={3} aria-hidden /> : null}
            </button>
          );
        })}
      </div>

      <div className="lb-post-textstyle__foot">
        <button
          type="button"
          disabled={!canReset}
          onClick={reset}
          className="lb-post-textstyle__reset"
        >
          Restablecer
        </button>
        <button type="button" onClick={() => setOpen(false)} className="lb-post-textstyle__done">
          Listo
        </button>
      </div>
    </>
  );

  const glyph = (
    <span
      className={`lb-post-textstyle__glyph${color.value ? '' : ' is-auto'}`}
      style={{
        fontFamily: font.family ?? undefined,
        color: color.value ?? undefined,
        fontStyle: value.italic ? 'italic' : undefined,
        fontWeight: value.bold ? 900 : undefined,
        textDecorationLine:
          [value.underline ? 'underline' : '', value.strike ? 'line-through' : ''].filter(Boolean).join(' ') ||
          undefined,
      }}
    >
      Aa
    </span>
  );

  if (floating) {
    return (
      <>
        <button
          ref={buttonRef}
          type="button"
          title="Estilo del texto"
          aria-label="Estilo del texto"
          aria-haspopup="dialog"
          aria-expanded={open}
          disabled={disabled}
          onMouseDown={(event) => event.preventDefault()}
          onClick={toggle}
          className={`lb-ts-trigger ${buttonClassName}${styled ? ' is-on' : ''}${open ? ' is-active' : ''}`}
        >
          {glyph}
          {color.value ? (
            <span className="lb-post-textstyle__dot" style={{ background: color.value }} aria-hidden />
          ) : null}
        </button>
        {open && typeof document !== 'undefined'
          ? createPortal(
              <div
                ref={panelRef}
                role="dialog"
                aria-label="Estilo del texto"
                className="lb-post-textstyle__panel lb-post-textstyle__panel--floating"
                style={{
                  position: 'fixed',
                  top: coords?.top ?? 0,
                  left: coords?.left ?? 0,
                  width: coords?.width,
                  maxHeight: coords?.maxHeight,
                  zIndex: POPOVER_Z,
                  visibility: coords ? 'visible' : 'hidden',
                }}
                onMouseDown={(event) => event.preventDefault()}
                onPointerDown={(event) => event.stopPropagation()}
                onClick={(event) => event.stopPropagation()}
                onKeyDown={(event) => event.stopPropagation()}
              >
                {panelBody}
              </div>,
              document.body,
            )
          : null}
      </>
    );
  }

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        title="Estilo del texto"
        aria-label="Estilo del texto"
        aria-haspopup="dialog"
        aria-expanded={open}
        disabled={disabled}
        onClick={toggle}
        className={`lb-post-textstyle__btn${styled ? ' is-on' : ''}`}
      >
        {glyph}
        {color.value ? (
          <span className="lb-post-textstyle__dot" style={{ background: color.value }} aria-hidden />
        ) : null}
      </button>

      {open ? (
        <div ref={panelRef} role="dialog" aria-label="Estilo del texto" className="lb-post-textstyle__panel">
          {panelBody}
        </div>
      ) : null}
    </>
  );
}
