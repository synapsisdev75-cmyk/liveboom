import { Bell, Camera, Globe, Image, Lock, Music2, Paperclip, PenLine, Users, Video, X, Zap } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { BOOM_CLIP_LABEL, FLASH_BOOM_LABEL } from '../../lib/brand';
import { createPost } from '../../lib/socialFirestore';
import { reelLifecycleHint } from '../../lib/reelLifecycle';
import { storyLifecycleHint, STORY_MAX_DURATION_SEC } from '../../lib/storyLifecycle';
import { readVideoDurationSec } from '../../lib/videoDuration';
import { MAX_CLIP_DURATION_SECONDS } from '../../lib/contentType';
import { BOOM_CLIP_MAX_DURATION_SEC } from '../../lib/videoTrim';
import { useVideoAspect } from '../../lib/videoAspect';
import { insertEmojiToken, POST_EMOJI_SIZE } from '../../lib/liveboomEmojis';
import { isVideoFile, mediaKindFromFile } from '../../lib/mediaFile';
import { useAuthStore } from '../../store/authStore';
import { EmojiPickerButton } from './EmojiPicker';
import { EmojiInput } from './EmojiInput';
import { VideoTrimEditor } from './VideoTrimEditor';
import { MusicPickerModal } from './MusicPickerModal';
import { FlashBoomCameraCapture } from './FlashBoomCameraCapture';
import { findMusicTrack, type SelectedMusicClip } from '../../lib/musicLibrary';
import { useBodyScrollLock } from '../../lib/useBodyScrollLock';
import type { SocialPost } from './SocialPostCard';

type Props = {
  username: string;
  onCreated: (post: SocialPost) => void;
  autoOpen?: boolean;
  /** Oculta el botón "Nueva publicación" (p. ej. abrir desde Inicio). */
  hideTrigger?: boolean;
  /** En perfil: compositor fijo en el timeline, sin modal ni scroll interno. */
  variant?: 'modal' | 'inline';
  onClose?: () => void;
  /** Preselecciona Flash Boom (historia 24 h). */
  defaultVideoMode?: 'story' | 'post';
  /** Tipo inicial al abrir desde Crear. */
  defaultKind?: PostKind;
};

type PostKind = 'photo' | 'video' | 'text';
type Visibility = 'public' | 'friends' | 'private';
type ComposeTab = 'publication' | 'boomclip' | 'flashboom';

export function CreatePostModal({
  username,
  onCreated,
  autoOpen = false,
  hideTrigger = false,
  variant = 'modal',
  onClose,
  defaultVideoMode,
  defaultKind,
}: Props) {
  const profile = useAuthStore((state) => state.profile);
  const isInline = variant === 'inline';

  function initialTab(): ComposeTab {
    if (defaultVideoMode === 'story') return 'flashboom';
    if (defaultVideoMode === 'post' || defaultKind === 'video') return 'boomclip';
    return 'publication';
  }

  const initialKind: PostKind =
    defaultKind ?? (defaultVideoMode === 'post' ? 'video' : defaultVideoMode === 'story' ? 'video' : 'text');

  const [open, setOpen] = useState(autoOpen || isInline);
  const [composeTab, setComposeTab] = useState<ComposeTab>(initialTab());
  const isFlashBoom = composeTab === 'flashboom';
  const isBoomClip = composeTab === 'boomclip';
  const isMediaTab = isBoomClip || isFlashBoom;
  const [kind, setKind] = useState<PostKind>(initialKind);
  const [visibility, setVisibility] = useState<Visibility>('public');
  const [notifyFriends, setNotifyFriends] = useState(false);
  const [caption, setCaption] = useState('');
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mediaMenuOpen, setMediaMenuOpen] = useState(false);
  const [trimDraft, setTrimDraft] = useState<{
    file: File;
    url: string;
    durationSec: number;
    maxDurationSec: number;
    forcedKind?: PostKind;
  } | null>(null);
  const [cameraCaptureOpen, setCameraCaptureOpen] = useState(false);
  const [musicPickerOpen, setMusicPickerOpen] = useState(false);
  const [selectedMusic, setSelectedMusic] = useState<SelectedMusicClip | null>(null);
  const galleryPhotoRef = useRef<HTMLInputElement>(null);
  const galleryVideoRef = useRef<HTMLInputElement>(null);
  const cameraPhotoRef = useRef<HTMLInputElement>(null);
  const cameraVideoRef = useRef<HTMLInputElement>(null);
  const mediaMenuRef = useRef<HTMLDivElement>(null);
  const previewAspect = useVideoAspect(kind === 'video' ? previewUrl : null);

  function closeModal() {
    if (!isInline) setOpen(false);
    onClose?.();
  }

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  useEffect(() => {
    if (autoOpen) setOpen(true);
  }, [autoOpen]);

  useEffect(() => {
    if (defaultKind === 'photo') {
      setComposeTab('publication');
      setKind('photo');
    } else if (defaultKind === 'text') {
      setComposeTab('publication');
      setKind('text');
    }
    if (defaultVideoMode === 'post') {
      setComposeTab('boomclip');
      setKind('video');
    }
    if (defaultVideoMode === 'story') {
      setComposeTab('flashboom');
      setKind('video');
    }
  }, [defaultKind, defaultVideoMode]);

  useEffect(() => {
    if (!mediaMenuOpen) return;
    function onPointerDown(event: MouseEvent) {
      if (!mediaMenuRef.current?.contains(event.target as Node)) {
        setMediaMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [mediaMenuOpen]);

  function reset() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setCaption('');
    setMediaFile(null);
    setPreviewUrl(null);
    setError(null);
    setVisibility('public');
    setNotifyFriends(false);
    setComposeTab(initialTab());
    setKind(initialKind);
    setMediaMenuOpen(false);
    setTrimDraft(null);
    setSelectedMusic(null);
    setMusicPickerOpen(false);
  }

  function switchTab(tab: ComposeTab) {
    setComposeTab(tab);
    setError(null);
    setMediaMenuOpen(false);
    if (tab === 'boomclip') {
      setKind('video');
      // Boom Clip = solo video; si había foto, limpiar
      if (mediaFile && mediaKindFromFile(mediaFile) === 'photo') {
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        setMediaFile(null);
        setPreviewUrl(null);
      }
    } else if (tab === 'publication') {
      if (kind === 'video') {
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        setMediaFile(null);
        setPreviewUrl(null);
        setKind('text');
      }
    }
  }

  function applyMediaFile(file: File, forcedKind?: PostKind) {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setMediaFile(file);
    setPreviewUrl(URL.createObjectURL(file));

    const detected = mediaKindFromFile(file);
    if (detected === 'video' || forcedKind === 'video') {
      setKind('video');
    } else {
      setKind('photo');
      if (composeTab === 'boomclip') {
        // Fotos no son Boom Clip → Publicación
        setComposeTab('publication');
        setError('Las fotos van como Publicación. Boom Clip es solo video (máx. 90 s).');
      } else if (composeTab !== 'flashboom') {
        setComposeTab('publication');
      }
    }
  }

  async function onFileChange(
    file: File | null,
    forcedKind?: PostKind,
    knownDurationSec?: number,
  ) {
    if (!file) return;
    setError(null);
    setMediaMenuOpen(false);

    const detected = mediaKindFromFile(file);
    if (!detected) {
      setError('Archivo no compatible. Usa foto (JPG, PNG) o video (MP4, MOV, WebM).');
      return;
    }

    if (detected === 'video' || forcedKind === 'video' || isVideoFile(file)) {
      try {
        const durationSec = await readVideoDurationSec(
          file,
          knownDurationSec && knownDurationSec > 0 ? knownDurationSec : 0,
        );
        // Solo Flash Boom / Boom Clip obligan a recortar; Publicación acepta video largo
        const clipCapSec =
          composeTab === 'flashboom'
            ? STORY_MAX_DURATION_SEC
            : composeTab === 'boomclip'
              ? MAX_CLIP_DURATION_SECONDS
              : 0;
        const needsEditor = clipCapSec > 0 && durationSec > clipCapSec;

        if (needsEditor) {
          if (previewUrl) URL.revokeObjectURL(previewUrl);
          setTrimDraft({
            file,
            url: URL.createObjectURL(file),
            durationSec,
            maxDurationSec: clipCapSec,
          });
          if (isMediaTab) {
            setKind('video');
          }
          return;
        }

        applyMediaFile(file, 'video');
      } catch (err) {
        if (isVideoFile(file) && file.size > 800) {
          applyMediaFile(file, 'video');
          return;
        }
        setError(err instanceof Error ? err.message : 'No se pudo leer el video');
      }
      return;
    }

    applyMediaFile(file, forcedKind || 'photo');
  }

  function cancelTrim() {
    if (trimDraft?.url) URL.revokeObjectURL(trimDraft.url);
    setTrimDraft(null);
  }

  function acceptTrim(file: File) {
    if (trimDraft?.url) URL.revokeObjectURL(trimDraft.url);
    setTrimDraft(null);
    applyMediaFile(file);
  }

  function openGallery(mode: 'photo' | 'video') {
    setError(null);
    setMediaMenuOpen(false);
    if (mode === 'video') {
      setKind('video');
    } else {
      setKind('photo');
      if (composeTab === 'boomclip') {
        setComposeTab('publication');
        setError('Las fotos van como Publicación. Boom Clip es solo video (máx. 90 s).');
      } else if (composeTab !== 'flashboom') {
        setComposeTab('publication');
      }
    }
    const target = mode === 'video' ? galleryVideoRef.current : galleryPhotoRef.current;
    if (!target) return;
    target.value = '';
    target.click();
  }

  function openCamera(mode: 'photo' | 'video') {
    setError(null);
    setMediaMenuOpen(false);
    if (mode === 'video') {
      setKind('video');
      if (composeTab === 'flashboom') {
        setCameraCaptureOpen(true);
        return;
      }
    } else {
      setKind('photo');
      if (composeTab === 'boomclip') {
        setComposeTab('publication');
        setError('Las fotos van como Publicación. Boom Clip es solo video (máx. 90 s).');
      } else if (composeTab !== 'flashboom') {
        setComposeTab('publication');
      }
    }
    const target = mode === 'video' ? cameraVideoRef.current : cameraPhotoRef.current;
    if (!target) {
      setError('No se pudo abrir la cámara en este dispositivo.');
      return;
    }
    target.value = '';
    target.click();
  }

  async function onCameraCapture(file: File, durationSec?: number) {
    await onFileChange(file, 'video', durationSec);
  }

  async function publish() {
    if (!profile) {
      setError('Inicia sesión para publicar.');
      return;
    }
    if (isMediaTab) {
      if (!mediaFile) {
        setError(`Elige una foto o video para tu ${isFlashBoom ? FLASH_BOOM_LABEL : BOOM_CLIP_LABEL}.`);
        return;
      }
    } else if (kind === 'photo' && !mediaFile) {
      setError('Elige una foto, un video o escribe un post de texto.');
      return;
    }

    setBusy(true);
    setError(null);
    try {
      let durationSec = 0;
      const publishKind = kind;
      if (isBoomClip && publishKind !== 'video') {
        setError(`${BOOM_CLIP_LABEL} solo admite video (máx. ${MAX_CLIP_DURATION_SECONDS} s).`);
        return;
      }
      const publishPostFormat = isFlashBoom ? 'story' : isBoomClip ? 'post' : undefined;

      if (publishKind === 'video' && mediaFile) {
        try {
          durationSec = await readVideoDurationSec(mediaFile);
        } catch {
          if (mediaFile.size > 800) durationSec = 1;
          else throw new Error('No se pudo leer la duración del video');
        }
        if (isFlashBoom && durationSec > STORY_MAX_DURATION_SEC) {
          setError(`${FLASH_BOOM_LABEL} debe durar máximo ${STORY_MAX_DURATION_SEC} segundos.`);
          return;
        }
        if (isBoomClip && durationSec > MAX_CLIP_DURATION_SECONDS) {
          setError(
            `${BOOM_CLIP_LABEL} puede durar hasta ${MAX_CLIP_DURATION_SECONDS} segundos. Puedes publicarlo como Publicación.`,
          );
          setBusy(false);
          return;
        }
        if (durationSec < 1 && mediaFile.size > 800) {
          durationSec = 1;
        }
        if (durationSec < 1) {
          setError('El video debe durar al menos 1 segundo.');
          return;
        }
      }

      let uploadFile = mediaFile;
      if (publishKind === 'video' && uploadFile && selectedMusic) {
        setError(null);
        const { mergeVideoWithMusicClip } = await import('../../lib/audioTrim');
        uploadFile = await mergeVideoWithMusicClip(
          uploadFile,
          selectedMusic.trackId,
          selectedMusic.startSec,
          selectedMusic.clipSec,
        );
      }

      const created = await createPost({
        authorUid: profile.firebaseUid,
        username: profile.handle || username,
        authorDisplayName: profile.displayName,
        type: publishKind,
        caption,
        mediaFile: publishKind === 'text' ? null : uploadFile,
        visibility: publishPostFormat === 'story' ? 'circle' : visibility,
        postFormat: publishPostFormat,
        durationSec,
        notifyFriends: visibility !== 'private' && notifyFriends && publishPostFormat !== 'story',
        musicTrackId: selectedMusic?.trackId,
        musicStartSec: selectedMusic?.startSec,
      });

      onCreated({
        id: created.id,
        authorUid: profile.firebaseUid,
        authorUsername: profile.handle || username,
        type: publishKind,
        caption: caption.trim() || null,
        mediaUrl: created.mediaUrl,
        visibility: created.visibility,
        createdAt: new Date().toISOString(),
        likes: 0,
        dislikes: 0,
        viewerReaction: null,
        postFormat: publishPostFormat || null,
        durationSec: durationSec || null,
      });
      reset();
      closeModal();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo publicar');
    } finally {
      setBusy(false);
    }
  }

  const showVisibility = !isFlashBoom && (composeTab === 'publication' || composeTab === 'boomclip');
  const showPanel = isInline || open;
  const isModalOpen = showPanel && !isInline;
  useBodyScrollLock(isModalOpen || cameraCaptureOpen);
  const modalTitle =
    isFlashBoom ? FLASH_BOOM_LABEL : isBoomClip ? BOOM_CLIP_LABEL : 'Nueva publicación';
  const composeRows = isInline ? 2 : isFlashBoom ? 2 : 3;
  const composeHeight = isInline ? 'h-20' : isFlashBoom ? 'h-16' : 'h-24';

  const panelBody = showPanel ? (
    <>
      {!isInline && !isModalOpen ? (
        <h3 className="text-lg font-bold text-white">{modalTitle}</h3>
      ) : null}

      <input
        ref={galleryPhotoRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(event) => onFileChange(event.target.files?.[0] || null, 'photo')}
      />
      <input
        ref={galleryVideoRef}
        type="file"
        accept="video/*"
        className="hidden"
        onChange={(event) => void onFileChange(event.target.files?.[0] || null, 'video')}
      />
      <input
        ref={cameraPhotoRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(event) => void onFileChange(event.target.files?.[0] || null, 'photo')}
      />
      <input
        ref={cameraVideoRef}
        type="file"
        accept="video/*"
        capture="user"
        className="hidden"
        onChange={(event) => void onFileChange(event.target.files?.[0] || null, 'video')}
      />

      {trimDraft && !isModalOpen ? (
        <VideoTrimEditor
          file={trimDraft.file}
          previewUrl={trimDraft.url}
          durationSec={trimDraft.durationSec}
          maxDurationSec={trimDraft.maxDurationSec}
          title={
            isMediaTab && kind === 'video'
              ? `Editar ${isFlashBoom ? FLASH_BOOM_LABEL : BOOM_CLIP_LABEL}`
              : 'Editar video'
          }
          onCancel={cancelTrim}
          onSave={acceptTrim}
        />
      ) : trimDraft && isModalOpen ? null : (
        <>
          <div className={`grid grid-cols-3 gap-1.5 ${isInline || isModalOpen ? 'mt-0' : 'mt-4'} sm:gap-2`}>
            <button
              type="button"
              onClick={() => switchTab('publication')}
              className={`flex flex-col items-center justify-center gap-1 rounded-xl border px-1.5 py-2 text-[10px] font-semibold sm:px-2 sm:text-xs ${
                composeTab === 'publication'
                  ? 'border-cyan-400 bg-cyan-400/10 text-cyan-300'
                  : 'border-white/10 text-zinc-400'
              }`}
            >
              <PenLine size={14} />
              Publicación
            </button>
            <button
              type="button"
              onClick={() => switchTab('boomclip')}
              className={`flex flex-col items-center justify-center gap-1 rounded-xl border px-1.5 py-2 text-[10px] font-semibold sm:px-2 sm:text-xs ${
                composeTab === 'boomclip'
                  ? 'border-cyan-400 bg-cyan-400/10 text-cyan-300'
                  : 'border-white/10 text-zinc-400'
              }`}
            >
              <Video size={14} />
              {BOOM_CLIP_LABEL}
            </button>
            <button
              type="button"
              onClick={() => switchTab('flashboom')}
              className={`flex flex-col items-center justify-center gap-1 rounded-xl border px-1.5 py-2 text-[10px] font-semibold sm:px-2 sm:text-xs ${
                composeTab === 'flashboom'
                  ? 'border-fuchsia-400 bg-fuchsia-500/10 text-fuchsia-200'
                  : 'border-white/10 text-zinc-400'
              }`}
            >
              <Zap size={14} />
              {FLASH_BOOM_LABEL}
            </button>
          </div>

          <div className="mt-3 space-y-2">
            <EmojiInput
              multiline
              rows={composeRows}
              value={caption}
              onChange={setCaption}
              placeholder={
                isFlashBoom
                  ? `Descripción (opcional)`
                  : composeTab === 'boomclip'
                    ? `Descripción ${BOOM_CLIP_LABEL} (opcional)`
                    : '¿Qué quieres compartir?'
              }
              emojiSize={POST_EMOJI_SIZE}
              fieldClassName={`${composeHeight} w-full rounded-xl border border-white/10 bg-black/40`}
              padClassName="px-3 py-2"
              mirrorTextClassName="text-white"
            />
            <div ref={mediaMenuRef} className="relative flex items-center gap-1">
              <EmojiPickerButton
                placement="above"
                onPick={(id) => setCaption((c) => insertEmojiToken(c, id))}
              />
              <button
                type="button"
                onClick={() => setMediaMenuOpen((value) => !value)}
                className={`grid h-9 w-9 place-items-center rounded-lg border transition ${
                  mediaMenuOpen
                    ? 'border-cyan-400 bg-cyan-500/15 text-cyan-200'
                    : 'border-white/15 bg-zinc-900/80 text-zinc-300 hover:border-cyan-400/40'
                }`}
                aria-label="Adjuntar foto o video"
                aria-expanded={mediaMenuOpen}
              >
                <Paperclip size={16} />
              </button>
              {mediaMenuOpen ? (
                <div className="absolute bottom-full left-0 z-10 mb-1.5 min-w-[12rem] overflow-hidden rounded-xl border border-white/10 bg-zinc-900 shadow-xl">
                  {!isBoomClip ? (
                    <>
                      <button
                        type="button"
                        onClick={() => openGallery('photo')}
                        className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-xs font-semibold text-zinc-200 hover:bg-white/5"
                      >
                        <Image size={14} className="text-cyan-300" />
                        Fotos · galería
                      </button>
                      <button
                        type="button"
                        onClick={() => openCamera('photo')}
                        className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-xs font-semibold text-zinc-200 hover:bg-white/5"
                      >
                        <Camera size={14} className="text-cyan-300" />
                        Fotos · cámara
                      </button>
                    </>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => openGallery('video')}
                    className={`flex w-full items-center gap-2 px-3 py-2.5 text-left text-xs font-semibold text-zinc-200 hover:bg-white/5 ${
                      isBoomClip ? '' : 'border-t border-white/10'
                    }`}
                  >
                    <Video size={14} className="text-fuchsia-300" />
                    Videos · galería
                  </button>
                  <button
                    type="button"
                    onClick={() => openCamera('video')}
                    className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-xs font-semibold text-zinc-200 hover:bg-white/5"
                  >
                    <Camera size={14} className="text-fuchsia-300" />
                    Videos · cámara
                  </button>
                </div>
              ) : null}
            </div>
          </div>

          {mediaFile ? (
            <div className="mt-3 rounded-xl border border-white/15 p-2.5">
              <p className="text-xs text-cyan-300">
                Archivo listo ✓ {mediaFile.name}
              </p>
              {previewUrl && kind === 'photo' ? (
                <img src={previewUrl} alt="" className="mx-auto mt-2 max-h-28 rounded-lg object-contain" />
              ) : null}
              {previewUrl && kind === 'video' ? (
                <video
                  src={previewUrl}
                  className={`mx-auto mt-2 max-h-28 w-full rounded-lg object-contain ${previewAspect.maxWidthClass}`}
                  autoPlay
                  muted
                  loop
                  playsInline
                />
              ) : null}
              {kind === 'video' ? (
                <div className="mt-2 flex flex-wrap gap-3">
                  <button
                    type="button"
                    className="text-xs font-semibold text-fuchsia-300"
                    onClick={() => {
                      if (!mediaFile) return;
                      void readVideoDurationSec(mediaFile, BOOM_CLIP_MAX_DURATION_SEC)
                        .then((durationSec) => {
                          setTrimDraft({
                            file: mediaFile,
                            url: previewUrl || URL.createObjectURL(mediaFile),
                            durationSec: Math.max(1, durationSec),
                            maxDurationSec: BOOM_CLIP_MAX_DURATION_SEC,
                          });
                        })
                        .catch(() => {
                          setTrimDraft({
                            file: mediaFile,
                            url: previewUrl || URL.createObjectURL(mediaFile),
                            durationSec: 0,
                            maxDurationSec: BOOM_CLIP_MAX_DURATION_SEC,
                          });
                        });
                    }}
                  >
                    Editar recorte
                  </button>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 text-xs font-semibold text-cyan-300"
                    onClick={() => setMusicPickerOpen(true)}
                  >
                    <Music2 size={12} />
                    {selectedMusic
                      ? `Música: ${findMusicTrack(selectedMusic.trackId)?.title ?? 'Elegida'}`
                      : 'Añadir música'}
                  </button>
                  {selectedMusic ? (
                    <button
                      type="button"
                      className="text-xs font-semibold text-zinc-500"
                      onClick={() => setSelectedMusic(null)}
                    >
                      Quitar música
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}

          {!isInline && composeTab === 'boomclip' ? (
            <p className="mt-2 text-[10px] leading-snug text-zinc-500">{reelLifecycleHint()}</p>
          ) : null}
          {!isInline && !isModalOpen && isFlashBoom ? (
            <p className="mt-2 text-[10px] leading-snug text-zinc-500">{storyLifecycleHint()}</p>
          ) : null}

          {isFlashBoom && isModalOpen ? (
            <div className="mt-3 grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => openGallery('photo')}
                className="rounded-xl border border-white/10 py-2.5 text-[11px] font-semibold text-zinc-200 hover:border-cyan-400/40"
              >
                Foto
              </button>
              <button
                type="button"
                onClick={() => openGallery('video')}
                className="rounded-xl border border-white/10 py-2.5 text-[11px] font-semibold text-zinc-200 hover:border-fuchsia-400/40"
              >
                Video
              </button>
              <button
                type="button"
                onClick={() => setCameraCaptureOpen(true)}
                className="rounded-xl border border-fuchsia-400/40 bg-fuchsia-500/10 py-2.5 text-[11px] font-semibold text-fuchsia-200"
              >
                Cámara
              </button>
            </div>
          ) : null}
        </>
      )}

      {showVisibility ? (
        <>
          <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-zinc-500">Quién puede verlo</p>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {(
              [
                ['public', Globe, 'Público'],
                ['friends', Users, 'Amigos'],
                ['private', Lock, 'Privado'],
              ] as const
            ).map(([value, Icon, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => {
                  setVisibility(value);
                  if (value === 'friends') setNotifyFriends(true);
                  if (value === 'private') setNotifyFriends(false);
                }}
                className={`rounded-xl border px-2 py-2 text-[11px] font-semibold ${
                  visibility === value
                    ? 'border-emerald-400 bg-emerald-500/10 text-emerald-300'
                    : 'border-white/10 text-zinc-400'
                }`}
              >
                <Icon size={14} className="mx-auto mb-1" />
                {label}
              </button>
            ))}
          </div>
          {visibility !== 'private' ? (
            <button
              type="button"
              onClick={() => setNotifyFriends((value) => !value)}
              className={`mt-3 flex w-full items-center gap-2 rounded-xl border px-3 py-2 text-left text-xs ${
                notifyFriends ? 'border-rose-500/60 bg-rose-500/10 text-rose-200' : 'border-white/10 text-zinc-400'
              }`}
            >
              <Bell size={14} />
              Notificar amigos
            </button>
          ) : null}
        </>
      ) : null}

      {error && !isModalOpen ? (
        <div className="mt-2 space-y-2">
          <p className="text-sm text-fuchsia-400">{error}</p>
          {isBoomClip && error.includes('Publicación') && mediaFile ? (
            <button
              type="button"
              onClick={() => {
                setComposeTab('publication');
                setError(null);
              }}
              className="text-xs font-semibold text-cyan-400 hover:underline"
            >
              Publicar como publicación
            </button>
          ) : null}
        </div>
      ) : null}
      {!isModalOpen ? (
        <div className={`mt-3 flex justify-end gap-2 ${isInline ? '' : 'pb-[max(0.5rem,env(safe-area-inset-bottom))]'}`}>
          {!isInline ? (
            <button type="button" onClick={closeModal} className="px-4 py-2 text-sm text-zinc-400">
              Cancelar
            </button>
          ) : null}
          <button
            type="button"
            disabled={busy}
            onClick={() => void publish()}
            className="rounded-full bg-cyan-500 px-5 py-2 text-sm font-bold text-zinc-950 disabled:opacity-60"
          >
            {busy ? 'Subiendo…' : 'Publicar'}
          </button>
        </div>
      ) : null}
    </>
  ) : null;

  const modalFooter = isModalOpen && !trimDraft ? (
    <div className="shrink-0 border-t border-white/10 bg-zinc-950 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      {isFlashBoom ? (
        <p className="mb-2 text-center text-[10px] text-zinc-500">{storyLifecycleHint()}</p>
      ) : null}
      {error ? (
        <div className="mb-2 space-y-2">
          <p className="text-sm text-fuchsia-400">{error}</p>
          {isBoomClip && error.includes('Publicación') && mediaFile ? (
            <button
              type="button"
              onClick={() => {
                setComposeTab('publication');
                setError(null);
              }}
              className="text-xs font-semibold text-cyan-400 hover:underline"
            >
              Publicar como publicación
            </button>
          ) : null}
        </div>
      ) : null}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={closeModal} className="px-4 py-2 text-sm text-zinc-400">
          Cancelar
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void publish()}
          className="rounded-full bg-cyan-500 px-5 py-2 text-sm font-bold text-zinc-950 disabled:opacity-60"
        >
          {busy ? 'Subiendo…' : 'Publicar'}
        </button>
      </div>
    </div>
  ) : null;

  const modalOverlay =
    isModalOpen && !trimDraft ? (
      <div
        className="fixed inset-0 z-[100] flex items-end justify-center overscroll-none bg-black/80 backdrop-blur-sm sm:items-center sm:p-4"
        onClick={(event) => {
          if (event.target === event.currentTarget) closeModal();
        }}
      >
        <div
          className="flex w-full max-w-lg flex-col overflow-hidden rounded-t-3xl border border-white/10 bg-zinc-950 shadow-2xl sm:rounded-3xl"
          style={{
            maxHeight:
              'min(92dvh, calc(100dvh - env(safe-area-inset-top) - env(safe-area-inset-bottom) - 0.5rem))',
          }}
          onClick={(event) => event.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-labelledby="create-post-title"
        >
          <div className="flex shrink-0 items-center justify-between border-b border-white/10 px-4 py-3">
            <h3 id="create-post-title" className="text-base font-bold text-white">
              {modalTitle}
            </h3>
            <button
              type="button"
              onClick={closeModal}
              className="grid h-9 w-9 place-items-center rounded-full bg-white/10 text-white"
              aria-label="Cerrar"
            >
              <X size={18} />
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3">{panelBody}</div>
          {modalFooter}
        </div>
      </div>
    ) : null;

  return (
    <>
      {!hideTrigger && !isInline ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded-full bg-gradient-to-r from-cyan-500 to-fuchsia-500 px-4 py-2 text-sm font-bold text-zinc-950"
        >
          Nueva publicación
        </button>
      ) : null}
      {isInline ? (
        <section id="post-composer" className="mb-3 rounded-2xl border border-white/10 bg-zinc-950/80 p-3">
          {panelBody}
        </section>
      ) : null}
      {typeof document !== 'undefined' && modalOverlay ? createPortal(modalOverlay, document.body) : modalOverlay}
      {trimDraft && isModalOpen ? (
        <VideoTrimEditor
          file={trimDraft.file}
          previewUrl={trimDraft.url}
          durationSec={trimDraft.durationSec}
          maxDurationSec={trimDraft.maxDurationSec}
          title={
            isMediaTab && kind === 'video'
              ? `Editar ${isFlashBoom ? FLASH_BOOM_LABEL : BOOM_CLIP_LABEL}`
              : 'Editar video'
          }
          onCancel={cancelTrim}
          onSave={acceptTrim}
        />
      ) : null}
      <FlashBoomCameraCapture
        open={cameraCaptureOpen}
        onClose={() => setCameraCaptureOpen(false)}
        onCapture={(file) => void onCameraCapture(file)}
      />
      {musicPickerOpen ? (
        <MusicPickerModal
          initial={selectedMusic}
          onCancel={() => setMusicPickerOpen(false)}
          onConfirm={(clip) => {
            setSelectedMusic(clip);
            setMusicPickerOpen(false);
          }}
        />
      ) : null}
    </>
  );
}
