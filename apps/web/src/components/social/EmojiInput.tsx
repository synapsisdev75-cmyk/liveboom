import {
  forwardRef,
  useImperativeHandle,
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
      multiline,
      ...rest
    } = props;

    const fieldRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);

    useImperativeHandle(ref, () => ({
      focus: () => fieldRef.current?.focus(),
    }));

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
            <div aria-hidden className={`${mirrorShell} whitespace-pre-wrap break-words`}>
              {mirror}
            </div>
            <textarea
              ref={(el) => {
                fieldRef.current = el;
              }}
              value={value}
              rows={rows}
              disabled={disabled}
              maxLength={maxLength}
              placeholder=""
              onChange={(event: ChangeEvent<HTMLTextAreaElement>) => onChange(event.target.value)}
              className={`${inputInner} resize-none leading-relaxed ${padClassName}`}
              {...textareaRest}
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
