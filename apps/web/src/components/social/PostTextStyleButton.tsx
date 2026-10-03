import { Check } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import {
  DEFAULT_POST_TEXT_STYLE,
  POST_TEXT_COLORS,
  POST_TEXT_FONTS,
  isDefaultPostTextStyle,
  postTextColor,
  postTextFont,
  usePostTextFonts,
  type PostTextStyle,
} from '../../lib/postTextStyle';

/**
 * Botón "Aa" del compositor de Publicación: elige tipo de letra y color del texto.
 * Va justo después del campo, dentro de un contenedor `position: relative`;
 * el panel se abre debajo del campo.
 */
export function PostTextStyleButton({
  value,
  onChange,
}: {
  value: PostTextStyle;
  onChange: (next: PostTextStyle) => void;
}) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const font = postTextFont(value.font);
  const color = postTextColor(value.color);
  const styled = !isDefaultPostTextStyle(value);
  usePostTextFonts(open || font.family != null);

  useEffect(() => {
    if (open) panelRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [open]);

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

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        title="Tipo de letra y color"
        aria-label="Tipo de letra y color"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className={`lb-post-textstyle__btn${styled ? ' is-on' : ''}`}
      >
        <span
          className={`lb-post-textstyle__glyph${color.value ? '' : ' is-auto'}`}
          style={{ fontFamily: font.family ?? undefined, color: color.value ?? undefined }}
        >
          Aa
        </span>
        {color.value ? (
          <span className="lb-post-textstyle__dot" style={{ background: color.value }} aria-hidden />
        ) : null}
      </button>

      {open ? (
        <div ref={panelRef} role="dialog" aria-label="Estilo del texto" className="lb-post-textstyle__panel">
          <p className="lb-post-textstyle__title">Tipo de letra</p>
          <div className="lb-post-textstyle__fonts">
            {POST_TEXT_FONTS.map((item) => {
              const active = item.id === font.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => onChange({ ...value, font: item.id })}
                  className={`lb-post-textstyle__font${active ? ' is-active' : ''}`}
                >
                  <span
                    className="lb-post-textstyle__font-sample"
                    style={{ fontFamily: item.family ?? undefined, color: color.value ?? undefined }}
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
              const active = item.id === color.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  title={item.label}
                  aria-label={item.label}
                  aria-pressed={active}
                  onClick={() => onChange({ ...value, color: item.id })}
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
              disabled={!styled}
              onClick={() => onChange(DEFAULT_POST_TEXT_STYLE)}
              className="lb-post-textstyle__reset"
            >
              Restablecer
            </button>
            <button type="button" onClick={() => setOpen(false)} className="lb-post-textstyle__done">
              Listo
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
