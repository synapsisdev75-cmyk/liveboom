import { Camera, Image, Send, Sticker, Video } from 'lucide-react';
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import type { ComposerGif } from '../../lib/composerGifs';
import type { ComposerSticker } from '../../lib/composerStickers';
import { insertEmojiToken } from '../../lib/liveboomEmojis';
import { mediaKindFromFile } from '../../lib/mediaFile';
import { textStyleProps, type PostTextStyle, type TextStyleRange } from '../../lib/postTextStyle';
import { UserAvatar } from '../profile/UserAvatar';
import { CommentMediaThumb, type CommentMediaKind } from './CommentMediaThumb';
import { EmojiInput, type EmojiInputHandle } from './EmojiInput';
import { EmojiPickerButton } from './EmojiPicker';
import { FlashBoomCameraCapture } from './FlashBoomCameraCapture';
import { GifPickerSheet } from './GifPickerSheet';
import { StickerPickerSheet } from './StickerPickerSheet';
import { TextStyleButton } from './TextStyleButton';
import { useT } from '../../i18n';

const COMMENT_MEDIA_MAX_BYTES = 20 * 1024 * 1024;
const COMMENT_VIDEO_MAX_SEC = 60;

function scrollParentOf(el: HTMLElement): HTMLElement | null {
  let node = el.parentElement;
  while (node && node !== document.body) {
    const { overflowY } = getComputedStyle(node);
    if ((overflowY === 'auto' || overflowY === 'scroll') && node.scrollHeight > node.clientHeight) {
      return node;
    }
    node = node.parentElement;
  }
  return null;
}

export type CommentDraftAttachment = {
  kind: CommentMediaKind;
  previewUrl: string;
  file?: File;
  gifUrl?: string;
  gifPreviewUrl?: string;
  stickerUrl?: string;
};

type Props = {
  value: string;
  onChange: (value: string) => void;
  onPublish: (attachment: CommentDraftAttachment | null) => Promise<void>;
  disabled?: boolean;
  busy?: boolean;
  placeholder?: string;
  overlay?: boolean;
  avatarSrc?: string | null;
  avatarUid?: string | null;
  username?: string | null;
  displayName?: string | null;
  /** Si se pasa `onTextStyleChange`, la barra muestra el botón "Aa". */
  textStyle?: PostTextStyle | null;
  onTextStyleChange?: (style: PostTextStyle) => void;
  /** Estilo por fragmento seleccionado (requiere `ref` al campo). */
  textStyleRanges?: TextStyleRange[];
  onTextStyleRangesChange?: (ranges: TextStyleRange[]) => void;
};

export const CommentComposerBar = forwardRef<EmojiInputHandle, Props>(function CommentComposerBar(
  {
    value,
    onChange,
    onPublish,
    disabled = false,
    busy = false,
  placeholder,
  overlay = false,
    avatarSrc,
    avatarUid,
    username,
    displayName,
    textStyle,
    onTextStyleChange,
    textStyleRanges,
    onTextStyleRangesChange,
  },
  ref,
) {
  const t = useT();
  const resolvedPlaceholder = placeholder ?? t('comments.write');
  const [attach, setAttach] = useState<CommentDraftAttachment | null>(null);
  const [gifOpen, setGifOpen] = useState(false);
  const [stickerOpen, setStickerOpen] = useState(false);
  const [mediaMenuOpen, setMediaMenuOpen] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraMode, setCameraMode] = useState<'photo' | 'video'>('photo');
  const [localError, setLocalError] = useState<string | null>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const keyboardSettleRef = useRef<(() => void) | null>(null);
  const inputRef = useRef<EmojiInputHandle>(null);

  useImperativeHandle(
    ref,
    () => ({
      focus: () => inputRef.current?.focus(),
      insertToken: (id: string) => inputRef.current?.insertToken(id),
      insertText: (text: string) => inputRef.current?.insertText?.(text),
      getSelection: () => inputRef.current?.getSelection() ?? { start: value.length, end: value.length },
    }),
    [value.length],
  );

  useEffect(() => () => keyboardSettleRef.current?.(), []);

  /**
   * Táctil: al abrir el teclado, esperar a que termine de cambiar el viewport
   * y llevar la barra a la vista con scroll suave (sin saltos en cadena).
   */
  function settleAboveKeyboard() {
    if (!window.matchMedia('(pointer: coarse)').matches) return;
    keyboardSettleRef.current?.();
    const vv = window.visualViewport;
    let timer = 0;
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      cleanup();
      const form = formRef.current;
      if (!form || !form.contains(document.activeElement)) return;
      const rect = form.getBoundingClientRect();
      const top = (vv?.offsetTop ?? 0) + 12;
      const bottom = (vv?.offsetTop ?? 0) + (vv?.height ?? window.innerHeight) - 12;
      const delta = rect.bottom > bottom ? rect.bottom - bottom : rect.top < top ? rect.top - top : 0;
      if (Math.abs(delta) < 2) return;
      const scroller = scrollParentOf(form);
      scroller?.scrollBy({ top: delta, behavior: 'smooth' });
    };
    const onResize = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(finish, 160);
    };
    const cap = window.setTimeout(finish, 700);
    function cleanup() {
      window.clearTimeout(timer);
      window.clearTimeout(cap);
      vv?.removeEventListener('resize', onResize);
      keyboardSettleRef.current = null;
    }
    vv?.addEventListener('resize', onResize);
    keyboardSettleRef.current = cleanup;
  }

  useEffect(() => {
    return () => {
      if (attach?.previewUrl.startsWith('blob:')) URL.revokeObjectURL(attach.previewUrl);
    };
  }, [attach]);

  useEffect(() => {
    if (!mediaMenuOpen) return;
    function onDoc(event: PointerEvent) {
      const target = event.target as Node;
      if (menuRef.current?.contains(target)) return;
      setMediaMenuOpen(false);
    }
    document.addEventListener('pointerdown', onDoc);
    return () => document.removeEventListener('pointerdown', onDoc);
  }, [mediaMenuOpen]);

  function replaceAttach(next: CommentDraftAttachment | null) {
    setAttach((prev) => {
      if (prev?.previewUrl.startsWith('blob:') && prev.previewUrl !== next?.previewUrl) {
        URL.revokeObjectURL(prev.previewUrl);
      }
      return next;
    });
    setLocalError(null);
  }

  function applyFile(file: File | null | undefined) {
    if (!file) return;
    const kind = mediaKindFromFile(file);
    if (!kind) {
      setLocalError('Solo se permiten foto o video.');
      return;
    }
    if (file.size > COMMENT_MEDIA_MAX_BYTES) {
      setLocalError('El archivo debe pesar menos de 20 MB.');
      return;
    }
    replaceAttach({
      kind: kind === 'video' ? 'video' : 'image',
      previewUrl: URL.createObjectURL(file),
      file,
    });
  }

  function pickGif(gif: ComposerGif) {
    replaceAttach({
      kind: 'gif',
      previewUrl: gif.preview || gif.url,
      gifUrl: gif.url,
      gifPreviewUrl: gif.preview || gif.url,
    });
    setGifOpen(false);
  }

  function pickSticker(sticker: ComposerSticker) {
    setStickerOpen(false);
    if (sticker.kind === 'text') {
      const text = sticker.text?.trim();
      if (!text) return;
      const input = inputRef.current;
      if (input?.insertText) {
        input.insertText(text);
        return;
      }
      const next = value && !/\s$/.test(value) ? `${value} ${text}` : `${value}${text}`;
      if (next.length <= 280) onChange(next);
      return;
    }
    if (!sticker.src) return;
    replaceAttach({ kind: 'sticker', previewUrl: sticker.src, stickerUrl: sticker.src });
  }

  async function publish() {
    if (disabled || busy) return;
    if (!value.trim() && !attach) return;
    setLocalError(null);
    try {
      await onPublish(attach);
      replaceAttach(null);
    } catch {
      /* el padre muestra el error de publicación */
    }
  }

  const canSend = !disabled && !busy && Boolean(value.trim() || attach);
  const showAvatar = Boolean(avatarUid || avatarSrc);
  const draftStyle = onTextStyleChange ? textStyle : null;
  const draftRanges = onTextStyleChange ? textStyleRanges : undefined;
  const styled = textStyleProps(draftStyle, draftRanges);

  return (
    <form
      ref={formRef}
      className={`lb-comment-bar ${overlay ? 'lb-comment-bar--overlay' : ''}`}
      onClick={(event) => event.stopPropagation()}
      onFocus={(event) => {
        const target = event.target as HTMLElement;
        if (target.tagName === 'TEXTAREA' || target.tagName === 'INPUT') settleAboveKeyboard();
      }}
      onSubmit={(event) => {
        event.preventDefault();
        event.stopPropagation();
        void publish();
      }}
    >
      <div className="lb-comment-bar__row">
      {showAvatar ? (
        <UserAvatar
          src={avatarSrc}
          uid={avatarUid}
          username={username}
          displayName={displayName}
          size={32}
          className="lb-comment-bar__avatar"
        />
      ) : null}

      <div className="lb-comment-bar__capsule">
        {attach ? (
          <div className="lb-comment-bar__preview">
            <CommentMediaThumb
              url={attach.gifUrl || attach.previewUrl}
              previewUrl={attach.kind === 'gif' ? undefined : attach.previewUrl}
              kind={attach.kind}
              size="composer"
              removable
              onRemove={() => replaceAttach(null)}
            />
          </div>
        ) : null}

        <div className={`contents ${styled.className}`} style={styled.style}>
        <EmojiInput
          ref={inputRef}
          multiline
          rows={1}
          growMode="comment"
          value={value}
          onChange={onChange}
          placeholder={resolvedPlaceholder}
          disabled={disabled || busy}
          maxLength={280}
          emojiSize={18}
          mirrorTextStyle={draftStyle}
          mirrorTextStyleRanges={draftRanges}
          className="lb-comment-bar__field"
          padClassName="px-3 py-2"
          mirrorTextClassName={overlay ? 'text-white/90' : 'lb-comment-bar__value'}
          fieldClassName="lb-comment-bar__input"
          placeholderClassName={overlay ? 'text-white/40' : 'lb-comment-bar__placeholder'}
          onEnterSubmit={() => {
            void publish();
          }}
        />
        </div>

        <div className="lb-comment-bar__tools">
          {onTextStyleChange ? (
            <TextStyleButton
              variant="toolbar"
              value={textStyle}
              onChange={onTextStyleChange}
              disabled={disabled || busy}
              buttonClassName={`lb-comment-bar__tool ${disabled || busy ? 'is-disabled' : ''}`}
              text={value}
              getSelection={() => inputRef.current?.getSelection()}
              ranges={textStyleRanges}
              onRangesChange={onTextStyleRangesChange}
            />
          ) : null}
          <EmojiPickerButton
            placement="above"
            className="lb-comment-bar__emoji"
            buttonClassName={`lb-comment-bar__tool ${disabled || busy ? 'is-disabled' : ''}`}
            disabled={disabled || busy}
            onPick={(id) => {
              const handle = inputRef.current;
              if (handle) handle.insertToken(id);
              else onChange(insertEmojiToken(value, id));
            }}
          />

          <div ref={menuRef} className="lb-comment-bar__media-wrap">
            <button
              type="button"
              className={`lb-comment-bar__tool ${mediaMenuOpen ? 'is-active' : ''}`}
              disabled={disabled || busy}
              aria-label={t('comments.photoOrVideo')}
              aria-expanded={mediaMenuOpen}
              title="Cámara o galería"
              onClick={() => {
                setLocalError(null);
                setMediaMenuOpen((open) => !open);
              }}
            >
              <Camera size={18} />
            </button>
            {mediaMenuOpen ? (
              <div className="lb-comment-bar__menu" role="menu">
                <button
                  type="button"
                  role="menuitem"
                  className="lb-comment-bar__menu-item"
                  onClick={() => {
                    setMediaMenuOpen(false);
                    const input = galleryRef.current;
                    if (!input) return;
                    input.value = '';
                    input.click();
                  }}
                >
                  <Image size={16} />
                  <span>
                    <strong>{t('comments.gallery')}</strong>
                    <em>{t('comments.photoOrVideo')}</em>
                  </span>
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="lb-comment-bar__menu-item"
                  onClick={() => {
                    setMediaMenuOpen(false);
                    setGifOpen(false);
                    setCameraMode('photo');
                    setCameraOpen(true);
                  }}
                >
                  <Camera size={16} />
                  <span>
                    <strong>{t('comments.takePhoto')}</strong>
                    <em>{t('comments.takePhotoHint')}</em>
                  </span>
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="lb-comment-bar__menu-item"
                  onClick={() => {
                    setMediaMenuOpen(false);
                    setGifOpen(false);
                    setCameraMode('video');
                    setCameraOpen(true);
                  }}
                >
                  <Video size={16} />
                  <span>
                    <strong>{t('comments.recordVideo')}</strong>
                    <em>{t('comments.recordVideoHint')}</em>
                  </span>
                </button>
              </div>
            ) : null}
          </div>

          <button
            type="button"
            className="lb-comment-bar__tool lb-comment-bar__gif"
            disabled={disabled || busy}
            aria-label={t('common.gif')}
            title={t('common.gif')}
            onClick={() => {
              setLocalError(null);
              setCameraOpen(false);
              setMediaMenuOpen(false);
              setStickerOpen(false);
              setGifOpen(true);
            }}
          >
            GIF
          </button>

          <button
            type="button"
            className={`lb-comment-bar__tool ${stickerOpen ? 'is-active' : ''}`}
            disabled={disabled || busy}
            aria-label="Stickers"
            title="Stickers"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              setLocalError(null);
              setCameraOpen(false);
              setMediaMenuOpen(false);
              setGifOpen(false);
              setStickerOpen(true);
            }}
          >
            <Sticker size={18} />
          </button>

          <button
            type="submit"
            className="lb-comment-bar__send"
            disabled={!canSend}
            aria-label={t('comments.send')}
            title={t('comments.send')}
          >
            <Send size={16} />
          </button>
        </div>
      </div>
      </div>

      <input
        ref={galleryRef}
        type="file"
        accept="image/*,video/*,.heic,.heif,.mp4,.mov,.webm"
        className="hidden"
        tabIndex={-1}
        onChange={(event) => {
          applyFile(event.target.files?.[0]);
          event.target.value = '';
        }}
      />

      {localError ? <p className="lb-comment-bar__error">{localError}</p> : null}

      <GifPickerSheet open={gifOpen} onClose={() => setGifOpen(false)} onPick={pickGif} />
      <StickerPickerSheet open={stickerOpen} onClose={() => setStickerOpen(false)} onPick={pickSticker} />
      <FlashBoomCameraCapture
        open={cameraOpen}
        onClose={() => setCameraOpen(false)}
        onCapture={(file) => {
          setCameraOpen(false);
          applyFile(file);
        }}
        title={cameraMode === 'video' ? t('comments.recordVideo') : t('comments.takePhoto')}
        allowPhoto
        defaultMode={cameraMode}
        maxDurationSec={COMMENT_VIDEO_MAX_SEC}
      />
    </form>
  );
});
