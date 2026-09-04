import {
  forwardRef,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  type ChangeEvent,
  type ComponentPropsWithoutRef,
  type TextareaHTMLAttributes,
} from 'react';
import { EmojiText } from './EmojiText';

type BaseProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  maxLength?: number;
  emojiSize?: number;
  className?: string;
  fieldClassName?: string;
  mirrorTextClassName?: string;
  placeholderClassName?: string;
  /** Padding interno del espejo y del campo */
  padClassName?: string;
  /**
   * Publicación: el cuadro crece hasta un máximo y luego hace scroll interno.
   * Default false = comportamiento anterior (comentarios, Boom Clip, Flash Boom).
   */
  growToMaxScroll?: boolean;
};

type InputProps = BaseProps &
  Omit<ComponentPropsWithoutRef<'input'>, 'value' | 'onChange' | 'className'> & {
    multiline?: false;
  };

type TextareaProps = BaseProps &
  Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'value' | 'onChange' | 'className'> & {
    multiline: true;
    rows?: number;
  };

export type EmojiInputHandle = {
  focus: () => void;
};

const inputInner =
  'relative z-[1] w-full min-w-0 border-0 bg-transparent text-sm text-transparent caret-white outline-none [-webkit-text-fill-color:transparent] selection:bg-cyan-500/25 disabled:opacity-60';

function publicationComposerMaxPx() {
  const viewH = window.visualViewport?.height ?? window.innerHeight;
  const landscape = window.matchMedia('(orientation: landscape)').matches;
  const shortPhone = landscape && viewH < 560;
  if (shortPhone) return Math.min(viewH * 0.34, 10 * 16);
  return Math.min(viewH * 0.38, 18 * 16);
}

function publicationComposerMinPx() {
  return Math.min(5 * 16, (window.visualViewport?.height ?? window.innerHeight) * 0.18);
}

/** Input/textarea con espejo: muestra iconos en lugar de :shortcode: mientras escribes. */
export const EmojiInput = forwardRef<EmojiInputHandle, InputProps | TextareaProps>(
  function EmojiInput(props, ref) {
    const {
      value,
      onChange,
      placeholder = '',
      disabled,
      maxLength,
      emojiSize = 20,
      className = '',
      fieldClassName = '',
      mirrorTextClassName = 'text-white',
      placeholderClassName = 'text-zinc-500',
      padClassName = 'px-3 py-2',
      growToMaxScroll = false,
      multiline,
      ...rest
    } = props;

    const fieldRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);
    const mirrorRef = useRef<HTMLDivElement>(null);

    useImperativeHandle(ref, () => ({
      focus: () => fieldRef.current?.focus(),
    }));

    useLayoutEffect(() => {
      if (!growToMaxScroll || !multiline) return;
      const field = fieldRef.current;
      if (!field || !(field instanceof HTMLTextAreaElement)) return;

      const applySize = () => {
        const cap = publicationComposerMaxPx();
        const minH = publicationComposerMinPx();
        field.style.height = 'auto';
        const next = Math.min(Math.max(field.scrollHeight, minH), cap);
        field.style.height = `${next}px`;
        field.style.maxHeight = `${cap}px`;
        field.style.overflowY = field.scrollHeight > cap + 1 ? 'auto' : 'hidden';
        const atEnd = field.selectionStart >= value.length;
        if (atEnd) field.scrollTop = field.scrollHeight;
        const mirror = mirrorRef.current;
        if (mirror) mirror.scrollTop = field.scrollTop;
      };

      applySize();
      const onResize = () => applySize();
      window.addEventListener('resize', onResize);
      window.addEventListener('orientationchange', onResize);
      window.visualViewport?.addEventListener('resize', onResize);
      return () => {
        window.removeEventListener('resize', onResize);
        window.removeEventListener('orientationchange', onResize);
        window.visualViewport?.removeEventListener('resize', onResize);
      };
    }, [value, growToMaxScroll, multiline]);

    const mirror = value ? (
      <EmojiText text={value} size={emojiSize} className={mirrorTextClassName} />
    ) : (
      <span className={placeholderClassName}>{placeholder}</span>
    );

    const mirrorShell = `pointer-events-none absolute inset-0 z-0 overflow-hidden text-sm leading-relaxed ${padClassName}`;

    if (multiline) {
      const { rows = 3, ...textareaRest } = rest as TextareaHTMLAttributes<HTMLTextAreaElement>;
      return (
        <div className={`relative min-w-0 ${className}`}>
          <div className={`relative min-w-0 ${fieldClassName}`}>
            <div
              ref={mirrorRef}
              aria-hidden
              className={`${mirrorShell} whitespace-pre-wrap break-words ${
                growToMaxScroll ? 'overflow-y-auto' : 'overflow-hidden'
              }`}
            >
              {mirror}
            </div>
            <textarea
              {...textareaRest}
              ref={(el) => {
                fieldRef.current = el;
              }}
              value={value}
              rows={rows}
              disabled={disabled}
              maxLength={maxLength}
              placeholder=""
              onScroll={
                growToMaxScroll
                  ? (event) => {
                      const mirrorEl = mirrorRef.current;
                      if (mirrorEl) mirrorEl.scrollTop = event.currentTarget.scrollTop;
                    }
                  : undefined
              }
              onChange={(event: ChangeEvent<HTMLTextAreaElement>) => onChange(event.target.value)}
              className={`${inputInner} resize-none leading-relaxed ${padClassName} ${
                growToMaxScroll ? 'publication-composer-field min-h-[4.5rem] overflow-y-auto' : ''
              }`}
            />
          </div>
        </div>
      );
    }

    return (
      <div className={`relative min-w-0 flex-1 ${className}`}>
        <div className={`relative min-w-0 ${fieldClassName}`}>
          <div aria-hidden className={`${mirrorShell} flex items-center whitespace-pre`}>
            {mirror}
          </div>
          <input
            ref={(el) => {
              fieldRef.current = el;
            }}
            type="text"
            value={value}
            disabled={disabled}
            maxLength={maxLength}
            placeholder=""
            onChange={(event: ChangeEvent<HTMLInputElement>) => onChange(event.target.value)}
            className={`${inputInner} min-h-10 ${padClassName}`}
            {...(rest as ComponentPropsWithoutRef<'input'>)}
          />
        </div>
      </div>
    );
  },
);
