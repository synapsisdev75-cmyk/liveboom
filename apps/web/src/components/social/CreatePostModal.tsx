import { Bell, Camera, ChevronLeft, ChevronRight, Globe, Image, Lock, Music2, Paperclip, PenLine, Smile, Users, Video, Wand2, X, Zap } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { BOOM_CLIP_LABEL, FLASH_BOOM_LABEL } from '../../lib/brand';
import { createPost } from '../../lib/socialFirestore';
import { reelLifecycleHint } from '../../lib/reelLifecycle';
import { storyLifecycleHint, STORY_MAX_DURATION_SEC } from '../../lib/storyLifecycle';
import { readVideoDurationSec } from '../../lib/videoDuration';
import { MAX_CLIP_DURATION_SECONDS, BOOM_CLIP_CAPTION_MAX, FLASH_BOOM_CAPTION_MAX } from '../../lib/contentType';
import { BOOM_CLIP_MAX_DURATION_SEC } from '../../lib/videoTrim';
import { insertEmojiToken, POST_EMOJI_SIZE } from '../../lib/liveboomEmojis';
import { isVideoFile, mediaKindFromFile } from '../../lib/mediaFile';
import { useAuthStore } from '../../store/authStore';
import { EmojiPickerButton } from './EmojiPicker';
import { EmojiInput } from './EmojiInput';
import { VideoTrimEditor } from './VideoTrimEditor';
import { MusicPickerModal } from './MusicPickerModal';
import { FlashBoomCameraCapture } from './FlashBoomCameraCapture';
import type { SelectedMusicClip } from '../../lib/musicLibrary';
import { useBodyScrollLock } from '../../lib/useBodyScrollLock';
import type { SocialPost } from './SocialPostCard';
import { MediaOverlayLayer } from './MediaOverlayLayer';
import { GifPickerSheet } from './GifPickerSheet';
import { StickerPickerSheet } from './StickerPickerSheet';
import {
  canAddOverlay,
  newOverlayId,
  type MediaOverlayItem,
} from '../../lib/mediaOverlays';
import type { ComposerGif } from '../../lib/composerGifs';
import type { ComposerSticker } from '../../lib/composerStickers';

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
  const [mediaFiles, setMediaFiles] = useState<File[]>([]);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [albumUrls, setAlbumUrls] = useState<string[]>([]);
  const [previewIndex, setPreviewIndex] = useState(0);
  const [editMenuOpen, setEditMenuOpen] = useState(false);
  const videoDurationSecRef = useRef(0);
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
  const [overlays, setOverlays] = useState<MediaOverlayItem[]>([]);
  const [gifAttach, setGifAttach] = useState<ComposerGif | null>(null);
  const [gifPickerOpen, setGifPickerOpen] = useState(false);
  const [stickerPickerOpen, setStickerPickerOpen] = useState(false);
  const galleryPhotoRef = useRef<HTMLInputElement>(null);
  const galleryVideoRef = useRef<HTMLInputElement>(null);
  const galleryMixedRef = useRef<HTMLInputElement>(null);
  const mediaMenuRef = useRef<HTMLDivElement>(null);

  function closeModal() {
    if (!isInline) setOpen(false);
    onClose?.();
  }

  const albumUrlsRef = useRef<string[]>([]);
  albumUrlsRef.current = albumUrls;

  useEffect(() => {
    return () => {
      for (const url of albumUrlsRef.current) URL.revokeObjectURL(url);
    };
  }, []);

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
    for (const url of albumUrls) {
      if (url !== previewUrl) URL.revokeObjectURL(url);
    }
    setCaption('');
    setMediaFile(null);
    setMediaFiles([]);
    setPreviewUrl(null);
    setAlbumUrls([]);
    setPreviewIndex(0);
    setEditMenuOpen(false);
    videoDurationSecRef.current = 0;
    setError(null);
    setVisibility('public');
    setNotifyFriends(false);
    setComposeTab(initialTab());
    setKind(initialKind);
    setMediaMenuOpen(false);
    setTrimDraft(null);
    setSelectedMusic(null);
    setMusicPickerOpen(false);
    setOverlays([]);
    setGifAttach(null);
    setGifPickerOpen(false);
    setStickerPickerOpen(false);
  }

  function switchTab(tab: ComposeTab) {
    setComposeTab(tab);
    setError(null);
    setMediaMenuOpen(false);
    const nextMax =
      tab === 'flashboom' ? FLASH_BOOM_CAPTION_MAX : tab === 'boomclip' ? BOOM_CLIP_CAPTION_MAX : null;
    if (nextMax != null) {
      setCaption((current) => (current.length > nextMax ? current.slice(0, nextMax) : current));
    }
    if (tab === 'boomclip') {
      setKind('video');
      // Boom Clip = solo video; si había foto, limpiar
      if (mediaFile && mediaKindFromFile(mediaFile) === 'photo') {
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        for (const url of albumUrls) {
          if (url !== previewUrl) URL.revokeObjectURL(url);
        }
        setMediaFile(null);
        setMediaFiles([]);
        setAlbumUrls([]);
        setPreviewIndex(0);
        setPreviewUrl(null);
        videoDurationSecRef.current = 0;
      }
    } else if (tab === 'publication') {
      if (kind === 'video') {
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        for (const url of albumUrls) {
          if (url !== previewUrl) URL.revokeObjectURL(url);
        }
        setMediaFile(null);
        setMediaFiles([]);
        setAlbumUrls([]);
        setPreviewIndex(0);
        setPreviewUrl(null);
        videoDurationSecRef.current = 0;
        setKind('text');
      }
    }
  }

  function applyMediaFile(file: File, forcedKind?: PostKind, durationSec = 0) {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    for (const url of albumUrls) {
      if (url !== previewUrl) URL.revokeObjectURL(url);
    }
    if (gifAttach) {
      const attached = gifAttach;
      setOverlays((current) =>
        canAddOverlay(current)
          ? [
              ...current,
              {
                id: newOverlayId(),
                kind: 'gif',
                src: attached.url,
                x: 0.5,
                y: 0.5,
                scale: 1,
                rotation: 0,
              },
            ]
          : current,
      );
      setGifAttach(null);
    }
    setMediaFiles([]);
    setMediaFile(file);
    const nextUrl = URL.createObjectURL(file);
    setAlbumUrls([nextUrl]);
    setPreviewIndex(0);
    setPreviewUrl(nextUrl);
    setEditMenuOpen(false);
    videoDurationSecRef.current = durationSec > 0 ? durationSec : 0;

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

        applyMediaFile(file, 'video', durationSec);
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

  async function onMultiPhotoChange(files: FileList) {
    setError(null);
    setMediaMenuOpen(false);
    const picked = Array.from(files).filter((f) => mediaKindFromFile(f) === 'photo');
    if (picked.length === 0) {
      setError('Archivo no compatible. Usa foto (JPG, PNG).');
      return;
    }
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    for (const url of albumUrls) {
      if (url !== previewUrl) URL.revokeObjectURL(url);
    }
    const first = picked[0];
    if (!first) return;
    if (gifAttach) {
      const attached = gifAttach;
      setOverlays((current) =>
        canAddOverlay(current)
          ? [
              ...current,
              {
                id: newOverlayId(),
                kind: 'gif',
                src: attached.url,
                x: 0.5,
                y: 0.5,
                scale: 1,
                rotation: 0,
              },
            ]
          : current,
      );
      setGifAttach(null);
    }
    setMediaFiles(picked);
    setMediaFile(first);
    const urls = picked.map((file) => URL.createObjectURL(file));
    setAlbumUrls(urls);
    setPreviewIndex(0);
    setPreviewUrl(urls[0] ?? null);
    setEditMenuOpen(false);
    setKind('photo');
    videoDurationSecRef.current = 0;
    if (composeTab === 'boomclip' || composeTab === 'flashboom') {
      setComposeTab('publication');
    }
  }

  function onGalleryPhotoChange(files: FileList | null) {
    if (!files || files.length === 0) return;
    if (composeTab === 'publication' && files.length > 1) {
      void onMultiPhotoChange(files);
      return;
    }
    void onFileChange(files[0] || null, 'photo');
  }

  function onGalleryMediaChange(files: FileList | null) {
    if (!files || files.length === 0) return;
    if (composeTab === 'publication' && files.length > 1) {
      void onMultiPhotoChange(files);
      return;
    }
    void onFileChange(files[0] || null);
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

  function openGallery(mode: 'photo' | 'video' | 'any' = 'any') {
    setError(null);
    setMediaMenuOpen(false);
    if (mode === 'any') {
      const target = galleryMixedRef.current;
      if (!target) return;
      target.value = '';
      target.click();
      return;
    }
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

  function openCamera() {
    setError(null);
    setMediaMenuOpen(false);
    setCameraCaptureOpen(true);
  }

  async function onCameraCapture(file: File, durationSec?: number) {
    const detected = mediaKindFromFile(file) || 'video';
    await onFileChange(file, detected, durationSec);
  }

  const previewSrc = albumUrls[previewIndex] || previewUrl || gifAttach?.url || null;
  const hasMediaCanvas = Boolean(previewSrc);
  const slideCount = Math.max(albumUrls.length, previewSrc ? 1 : 0);
  const slideOverlays = overlays.filter((item) => (item.mediaIndex ?? 0) === previewIndex);
  const previewIsVideo = kind === 'video' && Boolean(previewUrl);

  function addOverlay(item: Omit<MediaOverlayItem, 'id' | 'x' | 'y' | 'scale' | 'rotation'> & Partial<MediaOverlayItem>) {
    if (!canAddOverlay(overlays)) {
      setError('Máximo 8 stickers o GIF sobre el contenido.');
      return;
    }
    setOverlays((current) => [
      ...current,
      {
        id: newOverlayId(),
        kind: item.kind,
        src: item.src,
        text: item.text,
        x: item.x ?? 0.5,
        y: item.y ?? 0.42 + current.length * 0.06,
        scale: item.scale ?? 1,
        rotation: item.rotation ?? 0,
        mediaIndex: previewIndex,
      },
    ]);
  }

  function setSlideOverlays(next: MediaOverlayItem[]) {
    setOverlays((current) => [
      ...current.filter((item) => (item.mediaIndex ?? 0) !== previewIndex),
      ...next.map((item) => ({ ...item, mediaIndex: previewIndex })),
    ]);
  }

  function showSlide(index: number) {
    const urls = albumUrls.length ? albumUrls : previewUrl ? [previewUrl] : [];
    if (!urls.length) return;
    const next = Math.max(0, Math.min(index, urls.length - 1));
    setPreviewIndex(next);
    setPreviewUrl(urls[next] ?? null);
    const file = mediaFiles[next] || mediaFile;
    if (file) {
      setMediaFile(file);
      const detected = mediaKindFromFile(file);
      if (detected) setKind(detected);
    }
    setEditMenuOpen(false);
  }

  function startVideoTrim() {
    if (!mediaFile || mediaKindFromFile(mediaFile) !== 'video') return;
    setEditMenuOpen(false);
    const maxSec =
      composeTab === 'flashboom'
        ? STORY_MAX_DURATION_SEC
        : composeTab === 'boomclip'
          ? MAX_CLIP_DURATION_SECONDS
          : BOOM_CLIP_MAX_DURATION_SEC;
    void readVideoDurationSec(mediaFile, maxSec)
      .then((durationSec) => {
        setTrimDraft({
          file: mediaFile,
          url: previewUrl || URL.createObjectURL(mediaFile),
          durationSec: Math.max(1, durationSec),
          maxDurationSec: maxSec,
        });
      })
      .catch(() => {
        setTrimDraft({
          file: mediaFile,
          url: previewUrl || URL.createObjectURL(mediaFile),
          durationSec: 0,
          maxDurationSec: maxSec,
        });
      });
  }

  function pickGif(gif: ComposerGif) {
    setGifPickerOpen(false);
    setError(null);
    if (hasMediaCanvas) {
      addOverlay({ kind: 'gif', src: gif.url });
      return;
    }
    if (isMediaTab) {
      setError(
        `Adjunta un video para ${isFlashBoom ? FLASH_BOOM_LABEL : BOOM_CLIP_LABEL}. El GIF se puede poner encima.`,
      );
      return;
    }
    setGifAttach(gif);
    setKind('photo');
  }

  function pickSticker(sticker: ComposerSticker) {
    setStickerPickerOpen(false);
    if (!hasMediaCanvas) {
      setError('Adjunta una foto o video para colocar stickers.');
      return;
    }
    addOverlay({
      kind: sticker.kind === 'text' ? 'text' : 'sticker',
      src: sticker.src,
      text: sticker.text,
    });
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
    } else if (kind === 'photo' && !mediaFile && mediaFiles.length === 0 && !gifAttach) {
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
          durationSec =
            videoDurationSecRef.current > 0
              ? videoDurationSecRef.current
              : await readVideoDurationSec(mediaFile);
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
        type: publishKind === 'text' && gifAttach && !uploadFile ? 'photo' : publishKind,
        caption,
        mediaFile:
          publishKind === 'text' || (publishKind === 'photo' && mediaFiles.length > 1)
            ? null
            : uploadFile,
        mediaFiles:
          publishKind === 'photo' && mediaFiles.length > 1 ? mediaFiles : undefined,
        mediaUrl: !uploadFile && gifAttach ? gifAttach.url : undefined,
        visibility: publishPostFormat === 'story' ? 'circle' : visibility,
        postFormat: publishPostFormat,
        durationSec,
        notifyFriends: visibility !== 'private' && notifyFriends && publishPostFormat !== 'story',
        musicTrackId: selectedMusic?.trackId,
        musicStartSec: selectedMusic?.startSec,
        overlays,
      });

      onCreated({
        id: created.id,
        authorUid: profile.firebaseUid,
        authorUsername: profile.handle || username,
        type: created.mediaUrl && publishKind === 'text' ? 'photo' : publishKind,
        caption: caption.trim().slice(0, captionMax ?? 2000) || null,
        mediaUrl: created.mediaUrl,
        visibility: created.visibility,
        createdAt: new Date().toISOString(),
        likes: 0,
        dislikes: 0,
        viewerReaction: null,
        postFormat: publishPostFormat || null,
        durationSec: durationSec || null,
        overlays,
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
  const captionMax = isFlashBoom ? FLASH_BOOM_CAPTION_MAX : isBoomClip ? BOOM_CLIP_CAPTION_MAX : undefined;

  const panelBody = showPanel ? (
    <>
      {!isInline && !isModalOpen ? (
        <h3 className="text-lg font-bold text-white">{modalTitle}</h3>
      ) : null}

      <input
        ref={galleryPhotoRef}
        type="file"
        accept="image/*"
        multiple={composeTab === 'publication'}
        className="hidden"
        onChange={(event) => onGalleryPhotoChange(event.target.files)}
      />
      <input
        ref={galleryVideoRef}
        type="file"
        accept="video/*"
        className="hidden"
        onChange={(event) => void onFileChange(event.target.files?.[0] || null, 'video')}
      />
      <input
        ref={galleryMixedRef}
        type="file"
        accept="image/*,video/*"
        multiple={composeTab === 'publication'}
        className="hidden"
        onChange={(event) => onGalleryMediaChange(event.target.files)}
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
          <div className={`composer-kind-tabs grid grid-cols-3 gap-1.5 ${isInline || isModalOpen ? 'mt-0' : 'mt-4'} sm:gap-2`}>
            <button
              type="button"
              onClick={() => switchTab('publication')}
              className={`composer-kind-tab composer-kind-tab--publication flex flex-col items-center justify-center gap-1 rounded-xl border px-1.5 py-2 text-[10px] font-semibold sm:px-2 sm:text-xs ${
                composeTab === 'publication' ? 'is-active' : ''
              }`}
            >
              <PenLine size={14} />
              Publicación
            </button>
            <button
              type="button"
              onClick={() => switchTab('boomclip')}
              className={`composer-kind-tab composer-kind-tab--boomclip flex flex-col items-center justify-center gap-1 rounded-xl border px-1.5 py-2 text-[10px] font-semibold sm:px-2 sm:text-xs ${
                composeTab === 'boomclip' ? 'is-active' : ''
              }`}
            >
              <Video size={14} />
              {BOOM_CLIP_LABEL}
            </button>
            <button
              type="button"
              onClick={() => switchTab('flashboom')}
              className={`composer-kind-tab composer-kind-tab--flashboom flex flex-col items-center justify-center gap-1 rounded-xl border px-1.5 py-2 text-[10px] font-semibold sm:px-2 sm:text-xs ${
                composeTab === 'flashboom' ? 'is-active' : ''
              }`}
            >
              <Zap size={14} />
              {FLASH_BOOM_LABEL}
            </button>
          </div>

          <div className="mt-3 space-y-2">
            <div className="relative min-w-0">
              <EmojiInput
                multiline
                rows={composeRows}
                value={caption}
                onChange={setCaption}
                maxLength={captionMax}
                placeholder={
                  isFlashBoom
                    ? `Descripción (opcional)`
                    : composeTab === 'boomclip'
                      ? `Descripción ${BOOM_CLIP_LABEL} (opcional)`
                      : '¿Qué quieres compartir?'
                }
                emojiSize={POST_EMOJI_SIZE}
                growToMaxScroll
                fieldClassName="publication-composer-field min-h-[4.5rem] w-full min-w-0 max-w-full rounded-xl border border-white/10 bg-black/40"
                padClassName={captionMax != null ? 'px-3 pb-7 pt-2' : 'px-3 py-2'}
                mirrorTextClassName="text-white"
              />
              {captionMax != null ? (
                <span
                  className={`pointer-events-none absolute bottom-2 right-2 text-[10px] font-semibold tabular-nums ${
                    caption.length >= captionMax ? 'text-fuchsia-300' : 'text-zinc-500'
                  }`}
                >
                  {caption.length}/{captionMax}
                </span>
              ) : null}
            </div>

            {previewSrc ? (
              <div className="relative w-full overflow-hidden rounded-2xl bg-zinc-950">
                <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
                  <img
                    src={previewSrc}
                    alt=""
                    className="h-full w-full scale-125 object-cover opacity-35 blur-2xl"
                  />
                </div>
                <div className="relative z-[1] flex min-h-[12rem] w-full items-center justify-center">
                  <div className="relative w-full">
                    {previewIsVideo ? (
                      <video
                        src={previewSrc}
                        className="mx-auto max-h-[min(52dvh,24rem)] w-full object-contain"
                        autoPlay
                        muted
                        loop
                        playsInline
                      />
                    ) : (
                      <img
                        src={previewSrc}
                        alt=""
                        className="mx-auto max-h-[min(52dvh,24rem)] w-full object-contain"
                      />
                    )}
                    <MediaOverlayLayer
                      overlays={slideOverlays}
                      editable
                      onChange={setSlideOverlays}
                    />
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setEditMenuOpen((value) => !value)}
                  className="absolute left-2 top-2 z-[6] inline-flex min-h-9 items-center gap-1 rounded-full border border-white/15 bg-black/55 px-2.5 text-[11px] font-semibold text-white backdrop-blur-sm"
                >
                  <Wand2 size={13} />
                  Editar
                </button>
                {gifAttach && !mediaFile ? (
                  <button
                    type="button"
                    onClick={() => setGifAttach(null)}
                    className="absolute right-2 top-2 z-[6] grid h-9 w-9 place-items-center rounded-full border border-white/15 bg-black/55 text-white backdrop-blur-sm"
                    aria-label="Quitar GIF"
                  >
                    <X size={14} />
                  </button>
                ) : null}
                {editMenuOpen ? (
                  <div className="absolute left-2 top-12 z-[8] min-w-[10.5rem] overflow-hidden rounded-xl border border-white/10 bg-zinc-900/95 shadow-xl backdrop-blur-md">
                    {previewIsVideo ? (
                      <button
                        type="button"
                        className="flex min-h-11 w-full items-center px-3 text-left text-xs font-semibold text-white hover:bg-white/5"
                        onClick={startVideoTrim}
                      >
                        Recortar
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="flex min-h-11 w-full items-center px-3 text-left text-xs font-semibold text-white hover:bg-white/5"
                      onClick={() => {
                        setEditMenuOpen(false);
                        setStickerPickerOpen(true);
                      }}
                    >
                      Stickers
                    </button>
                    {previewIsVideo ? (
                      <button
                        type="button"
                        className="flex min-h-11 w-full items-center gap-1.5 px-3 text-left text-xs font-semibold text-white hover:bg-white/5"
                        onClick={() => {
                          setEditMenuOpen(false);
                          setMusicPickerOpen(true);
                        }}
                      >
                        <Music2 size={12} />
                        {selectedMusic ? 'Cambiar música' : 'Añadir música'}
                      </button>
                    ) : null}
                    {selectedMusic ? (
                      <button
                        type="button"
                        className="flex min-h-11 w-full items-center px-3 text-left text-xs font-semibold text-zinc-400 hover:bg-white/5"
                        onClick={() => {
                          setSelectedMusic(null);
                          setEditMenuOpen(false);
                        }}
                      >
                        Quitar música
                      </button>
                    ) : null}
                  </div>
                ) : null}
                {slideCount > 1 ? (
                  <>
                    <button
                      type="button"
                      className={`absolute left-1 top-1/2 z-[6] grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-black/45 text-white ${
                        previewIndex <= 0 ? 'opacity-30' : ''
                      }`}
                      aria-label="Anterior"
                      onClick={() => showSlide(previewIndex - 1)}
                      disabled={previewIndex <= 0}
                    >
                      <ChevronLeft size={18} />
                    </button>
                    <button
                      type="button"
                      className={`absolute right-1 top-1/2 z-[6] grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-black/45 text-white ${
                        previewIndex >= slideCount - 1 ? 'opacity-30' : ''
                      }`}
                      aria-label="Siguiente"
                      onClick={() => showSlide(previewIndex + 1)}
                      disabled={previewIndex >= slideCount - 1}
                    >
                      <ChevronRight size={18} />
                    </button>
                    <div className="absolute inset-x-0 bottom-2 z-[6] flex justify-center gap-1.5">
                      {Array.from({ length: slideCount }).map((_, index) => (
                        <button
                          key={index}
                          type="button"
                          aria-label={`Foto ${index + 1}`}
                          onClick={() => showSlide(index)}
                          className={`h-1.5 rounded-full ${
                            index === previewIndex ? 'w-4 bg-fuchsia-400' : 'w-1.5 bg-white/40'
                          }`}
                        />
                      ))}
                    </div>
                  </>
                ) : null}
              </div>
            ) : null}

            <div ref={mediaMenuRef} className="relative flex min-w-0 flex-wrap items-center gap-1.5">
              <EmojiPickerButton
                placement="above"
                showUnicode
                onPick={(id) =>
                  setCaption((current) => {
                    const next = insertEmojiToken(current, id);
                    return captionMax != null && next.length > captionMax ? current : next;
                  })
                }
              />
              <button
                type="button"
                onClick={() => setMediaMenuOpen((value) => !value)}
                className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg border transition ${
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
                <div className="absolute bottom-full left-0 z-20 mb-1.5 w-[min(18.5rem,calc(100vw-2.5rem))] rounded-2xl bg-gradient-to-br from-cyan-400/80 to-violet-500/80 p-px shadow-[0_12px_28px_rgba(0,0,0,0.45)]">
                  <div className="overflow-hidden rounded-[15px] bg-zinc-900">
                    <button
                      type="button"
                      onClick={() => openGallery('any')}
                      className="flex min-h-14 w-full items-center gap-3 px-3.5 py-2.5 text-left transition hover:bg-white/5 active:bg-white/10"
                    >
                      <Image size={18} className="shrink-0 text-cyan-300" />
                      <span className="min-w-0">
                        <span className="block text-sm font-bold text-white">Galería</span>
                        <span className="block text-[11px] leading-snug text-zinc-500">
                          Elige fotos o videos
                        </span>
                      </span>
                    </button>
                    <div className="mx-3 h-px bg-white/10" />
                    <button
                      type="button"
                      onClick={() => openCamera()}
                      className="flex min-h-14 w-full items-center gap-3 px-3.5 py-2.5 text-left transition hover:bg-white/5 active:bg-white/10"
                    >
                      <Camera size={18} className="shrink-0 text-zinc-100" />
                      <span className="min-w-0">
                        <span className="block text-sm font-bold text-white">Cámara</span>
                        <span className="block text-[11px] leading-snug text-zinc-500">
                          Captura una foto o video
                        </span>
                      </span>
                    </button>
                  </div>
                </div>
              ) : null}
              <button
                type="button"
                onClick={() => setGifPickerOpen(true)}
                className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-lg border border-violet-400/70 px-2.5 text-[11px] font-bold text-violet-200"
                aria-label="GIF"
              >
                GIF
              </button>
              <button
                type="button"
                onClick={() => setStickerPickerOpen(true)}
                className="inline-flex min-h-11 shrink-0 items-center justify-center gap-1 rounded-lg bg-fuchsia-500 px-2.5 text-[11px] font-bold text-white"
                aria-label="Sticker"
              >
                <Smile size={14} />
                Sticker
              </button>
              {showVisibility ? (
                <div
                  className="ml-auto flex min-h-11 min-w-0 max-w-full items-center rounded-lg border border-white/10 bg-black/35 p-0.5"
                  role="group"
                  aria-label="Quién puede verlo"
                >
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
                      className={`inline-flex min-h-10 min-w-0 flex-1 items-center justify-center gap-1 rounded-md px-1.5 text-[10px] font-semibold sm:px-2 sm:text-[11px] ${
                        visibility === value
                          ? 'bg-emerald-500/20 text-emerald-300'
                          : 'text-zinc-400 hover:text-zinc-200'
                      }`}
                      aria-pressed={visibility === value}
                      title={label}
                    >
                      <Icon size={12} className="shrink-0" />
                      <span className="truncate">{label}</span>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          </div>

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
                onClick={() => openCamera()}
                className="rounded-xl border border-fuchsia-400/40 bg-fuchsia-500/10 py-2.5 text-[11px] font-semibold text-fuchsia-200"
              >
                Cámara
              </button>
            </div>
          ) : null}
        </>
      )}

      {showVisibility && visibility !== 'private' ? (
        <button
          type="button"
          onClick={() => setNotifyFriends((value) => !value)}
          className={`mt-2 inline-flex min-h-9 items-center gap-1.5 rounded-lg border px-2.5 text-[11px] font-semibold ${
            notifyFriends ? 'border-rose-500/60 bg-rose-500/10 text-rose-200' : 'border-white/10 text-zinc-400'
          }`}
        >
          <Bell size={13} />
          Notificar amigos
        </button>
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
        onCapture={(file, durationSec) => void onCameraCapture(file, durationSec)}
        title="Cámara"
        allowPhoto={composeTab !== 'boomclip'}
        defaultMode={composeTab === 'boomclip' ? 'video' : 'photo'}
        maxDurationSec={
          composeTab === 'flashboom'
            ? STORY_MAX_DURATION_SEC
            : composeTab === 'boomclip'
              ? MAX_CLIP_DURATION_SECONDS
              : 180
        }
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
      <GifPickerSheet open={gifPickerOpen} onClose={() => setGifPickerOpen(false)} onPick={pickGif} />
      <StickerPickerSheet
        open={stickerPickerOpen}
        onClose={() => setStickerPickerOpen(false)}
        onPick={pickSticker}
      />
    </>
  );
}
