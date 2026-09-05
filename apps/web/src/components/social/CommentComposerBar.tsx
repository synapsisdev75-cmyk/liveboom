import { Camera, Image, Send, Video } from 'lucide-react';
import { forwardRef, useEffect, useRef, useState } from 'react';
import type { ComposerGif } from '../../lib/composerGifs';
import { COMMENT_EMOJI_SIZE, insertEmojiToken } from '../../lib/liveboomEmojis';
import { mediaKindFromFile } from '../../lib/mediaFile';
import { UserAvatar } from '../profile/UserAvatar';
import { CommentMediaThumb, type CommentMediaKind } from './CommentMediaThumb';
import { EmojiInput, type EmojiInputHandle } from './EmojiInput';
import { EmojiPickerButton } from './EmojiPicker';
import { FlashBoomCameraCapture } from './FlashBoomCameraCapture';
import { GifPickerSheet } from './GifPickerSheet';

const COMMENT_MEDIA_MAX_BYTES = 20 * 1024 * 1024;
const COMMENT_VIDEO_MAX_SEC = 60;

export type CommentDraftAttachment = {
  kind: CommentMediaKind;
  previewUrl: string;
  file?: File;
  gifUrl?: string;
  gifPreviewUrl?: string;
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
};

export const CommentComposerBar = forwardRef<EmojiInputHandle, Props>(function CommentComposerBar(
  {
    value,
    onChange,
    onPublish,
    disabled = false,
    busy = false,
    placeholder = 'Escribe un comentario...',
    overlay = false,
    avatarSrc,
    avatarUid,
    username,
    displayName,
  },
  ref,
) {
  const [attach, setAttach] = useState<CommentDraftAttachment | null>(null);
  const [gifOpen, setGifOpen] = useState(false);
  const [mediaMenuOpen, setMediaMenuOpen] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraMode, setCameraMode] = useState<'photo' | 'video'>('photo');
  const [localError, setLocalError] = useState<string | null>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

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

  return (
    <form
      className={`lb-comment-bar ${overlay ? 'lb-comment-bar--overlay' : ''}`}
      onClick={(event) => event.stopPropagation()}
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

        <EmojiInput
          ref={ref}
          multiline
          rows={1}
          growMode="comment"
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          disabled={disabled || busy}
          maxLength={280}
          emojiSize={COMMENT_EMOJI_SIZE}
          className="lb-comment-bar__field"
          padClassName="px-3 py-2"
          mirrorTextClassName={overlay ? 'text-white/90' : 'text-zinc-200'}
          fieldClassName="lb-comment-bar__input"
          placeholderClassName={overlay ? 'text-white/40' : 'text-zinc-500'}
          onEnterSubmit={() => {
            void publish();
          }}
        />

        <div className="lb-comment-bar__tools">
          <EmojiPickerButton
            placement="above"
            className="lb-comment-bar__emoji"
            buttonClassName={`lb-comment-bar__tool ${disabled || busy ? 'is-disabled' : ''}`}
            disabled={disabled || busy}
            onPick={(id) => {
              const handle = typeof ref === 'object' ? ref?.current : null;
              if (handle) handle.insertToken(id);
              else onChange(insertEmojiToken(value, id));
            }}
          />

          <div ref={menuRef} className="lb-comment-bar__media-wrap">
            <button
              type="button"
              className={`lb-comment-bar__tool ${mediaMenuOpen ? 'is-active' : ''}`}
              disabled={disabled || busy}
              aria-label="Foto o video"
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
                    <strong>Galería</strong>
                    <em>Foto o video</em>
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
                    <strong>Tomar foto</strong>
                    <em>Cámara del dispositivo</em>
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
                    <strong>Grabar video</strong>
                    <em>Si el dispositivo lo permite</em>
                  </span>
                </button>
              </div>
            ) : null}
          </div>

          <button
            type="button"
            className="lb-comment-bar__tool lb-comment-bar__gif"
            disabled={disabled || busy}
            aria-label="GIF"
            title="GIF"
            onClick={() => {
              setLocalError(null);
              setCameraOpen(false);
              setMediaMenuOpen(false);
              setGifOpen(true);
            }}
          >
            GIF
          </button>

          <button
            type="submit"
            className="lb-comment-bar__send"
            disabled={!canSend}
            aria-label="Enviar"
            title="Enviar"
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
      <FlashBoomCameraCapture
        open={cameraOpen}
        onClose={() => setCameraOpen(false)}
        onCapture={(file) => {
          setCameraOpen(false);
          applyFile(file);
        }}
        title={cameraMode === 'video' ? 'Grabar video' : 'Tomar foto'}
        allowPhoto
        defaultMode={cameraMode}
        maxDurationSec={COMMENT_VIDEO_MAX_SEC}
      />
    </form>
  );
});
