import { Bell, Camera, ChevronLeft, ChevronRight, Globe, Image, Lock, Music2, Paperclip, PenLine, Plus, Redo2, Smile, Trash2, Undo2, Users, Video, Wand2, X, Zap } from 'lucide-react';
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { createPortal } from 'react-dom';
import { BOOM_CLIP_LABEL, FLASH_BOOM_LABEL } from '../../lib/brand';
import { createPost, updatePost } from '../../lib/socialFirestore';
import { reelLifecycleHint } from '../../lib/reelLifecycle';
import { storyLifecycleHint, STORY_MAX_DURATION_SEC } from '../../lib/storyLifecycle';
import { readVideoDurationSec } from '../../lib/videoDuration';
import { MAX_CLIP_DURATION_SECONDS, BOOM_CLIP_CAPTION_MAX, FLASH_BOOM_CAPTION_MAX } from '../../lib/contentType';
import { BOOM_CLIP_MAX_DURATION_SEC } from '../../lib/videoTrim';
import { insertEmojiToken, POST_EMOJI_SIZE } from '../../lib/liveboomEmojis';
import { isVideoFile, mediaKindFromFile, fileFromMediaUrl } from '../../lib/mediaFile';
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
import { PhotoEditPanel } from './PhotoEditPanel';
import {
  canAddOverlay,
  newOverlayId,
  type MediaOverlayItem,
} from '../../lib/mediaOverlays';
import type { ComposerGif } from '../../lib/composerGifs';
import type { ComposerSticker } from '../../lib/composerStickers';
import { postPhotoUrls } from '../../lib/mediaFrame';
import {
  bakePhotoEdit,
  clampPan,
  cropAspectRatio,
  DEFAULT_PHOTO_EDIT,
  isDefaultPhotoEdit,
  photoCssFilter,
  type PhotoEditValues,
} from '../../lib/photoEdit';

type PostComposerMode = 'create' | 'edit';

function revokeLocalUrl(url: string | null | undefined) {
  if (url?.startsWith('blob:')) URL.revokeObjectURL(url);
}

type Props = {
  username: string;
  onCreated?: (post: SocialPost) => void;
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
  /** create = publicar nuevo; edit = actualizar el mismo postId. */
  mode?: PostComposerMode;
  /** Publicación a editar. Requiere mode="edit". */
  editPost?: SocialPost | null;
  onUpdated?: (post: SocialPost) => void;
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
  mode = 'create',
  editPost = null,
  onUpdated,
}: Props) {
  const profile = useAuthStore((state) => state.profile);
  const isInline = variant === 'inline';
  const isEditMode = mode === 'edit' && Boolean(editPost?.id);

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
  const [mediaFiles, setMediaFiles] = useState<Array<File | null>>([]);
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
  const [photoEditOpen, setPhotoEditOpen] = useState(false);
  const [photoEdits, setPhotoEdits] = useState<Record<number, PhotoEditValues>>({});
  const [editHistory, setEditHistory] = useState<PhotoEditValues[]>([DEFAULT_PHOTO_EDIT]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const [editBusy, setEditBusy] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);
  const editBaselineRef = useRef('');
  const galleryPhotoRef = useRef<HTMLInputElement>(null);
  const galleryVideoRef = useRef<HTMLInputElement>(null);
  const galleryMixedRef = useRef<HTMLInputElement>(null);
  const galleryAppendRef = useRef<HTMLInputElement>(null);
  const mediaMenuRef = useRef<HTMLDivElement>(null);
  const panDragRef = useRef<{
    pointerId: number;
    x: number;
    y: number;
    panX: number;
    panY: number;
  } | null>(null);

  function snapshotDraft() {
    return JSON.stringify({
      caption,
      visibility,
      kind,
      notifyFriends,
      albumUrls,
      previewUrl,
      gif: gifAttach?.url || null,
      overlays,
      photoEdits,
    });
  }

  function closeModal() {
    if (!isInline) setOpen(false);
    setDiscardOpen(false);
    onClose?.();
  }

  function hasDraft() {
    if (isEditMode) return snapshotDraft() !== editBaselineRef.current;
    return Boolean(
      caption.trim() ||
        mediaFile ||
        mediaFiles.length ||
        gifAttach ||
        overlays.length ||
        selectedMusic,
    );
  }

  function requestClose() {
    if (isInline) return;
    if (hasDraft()) {
      setDiscardOpen(true);
      return;
    }
    reset();
    closeModal();
  }

  function confirmDiscard() {
    reset();
    closeModal();
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
    if (!isEditMode || !editPost) return;
    const post = editPost;
    const vis: Visibility =
      post.visibility === 'friends' || post.visibility === 'private' ? post.visibility : 'public';
    const urls = postPhotoUrls(post);
    const gifUrl =
      post.type === 'photo' &&
      urls.length <= 1 &&
      post.mediaUrl &&
      (/\.gif(\?|$)/i.test(post.mediaUrl) || /giphy\.com|tenor\.com/i.test(post.mediaUrl))
        ? post.mediaUrl
        : null;
    let nextKind: PostKind = 'text';
    let nextAlbum: string[] = [];
    let nextPreview: string | null = null;
    let nextGif: string | null = null;
    setComposeTab('publication');
    setCaption(post.caption || '');
    setVisibility(vis);
    setNotifyFriends(false);
    setOverlays(post.overlays || []);
    setPhotoEdits({});
    setEditHistory([DEFAULT_PHOTO_EDIT]);
    setHistoryIndex(0);
    setMediaFile(null);
    setMediaFiles([]);
    setError(null);
    setPreviewIndex(0);
    if (post.type === 'video' && post.mediaUrl) {
      nextKind = 'video';
      nextPreview = post.mediaUrl;
      setKind('video');
      setPreviewUrl(post.mediaUrl);
      setAlbumUrls([]);
      setGifAttach(null);
      videoDurationSecRef.current = Number(post.durationSec) || 0;
    } else if (gifUrl) {
      nextKind = 'photo';
      nextGif = gifUrl;
      setKind('photo');
      setGifAttach({ id: post.id, title: 'GIF', url: gifUrl, preview: gifUrl });
      setPreviewUrl(null);
      setAlbumUrls([]);
    } else if (post.type === 'photo' && urls.length) {
      nextKind = 'photo';
      nextAlbum = urls;
      nextPreview = urls[0] ?? null;
      setKind('photo');
      setAlbumUrls(urls);
      setPreviewUrl(urls[0] ?? null);
      setGifAttach(null);
    } else {
      setKind('text');
      setPreviewUrl(null);
      setAlbumUrls([]);
      setGifAttach(null);
    }
    editBaselineRef.current = JSON.stringify({
      caption: post.caption || '',
      visibility: vis,
      kind: nextKind,
      notifyFriends: false,
      albumUrls: nextAlbum,
      previewUrl: nextPreview,
      gif: nextGif,
      overlays: post.overlays || [],
      photoEdits: {},
    });
  }, [isEditMode, editPost?.id]);

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
    revokeLocalUrl(previewUrl);
    for (const url of albumUrls) {
      if (url !== previewUrl) revokeLocalUrl(url);
    }
    setCaption('');
    setMediaFile(null);
    setMediaFiles([]);
    setPreviewUrl(null);
    setAlbumUrls([]);
    setPreviewIndex(0);
    setEditMenuOpen(false);
    setPhotoEditOpen(false);
    setPhotoEdits({});
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
    setPhotoEditOpen(false);
    setPhotoEdits({});
    setEditHistory([DEFAULT_PHOTO_EDIT]);
    setHistoryIndex(0);
    setEditBusy(false);
    setDiscardOpen(false);
  }

  function switchTab(tab: ComposeTab) {
    if (isEditMode) return;
    setComposeTab(tab);
    setMediaMenuOpen(false);
    const file = mediaFiles[previewIndex] || mediaFile;
    if (file) {
      const detected = mediaKindFromFile(file);
      if (detected) setKind(detected);
    }
    if (tab === 'boomclip' && file && mediaKindFromFile(file) === 'photo') {
      setError(
        `${BOOM_CLIP_LABEL} solo permite video. Si deseas publicar aquí, cambia el archivo o vuelve a Publicación.`,
      );
    } else {
      setError(null);
    }
  }

  function removeAttachedMedia() {
    revokeLocalUrl(previewUrl);
    for (const url of albumUrls) {
      if (url !== previewUrl) revokeLocalUrl(url);
    }
    setMediaFile(null);
    setMediaFiles([]);
    setAlbumUrls([]);
    setPreviewIndex(0);
    setPreviewUrl(null);
    setOverlays([]);
    setGifAttach(null);
    setPhotoEditOpen(false);
    setPhotoEdits({});
    setEditHistory([DEFAULT_PHOTO_EDIT]);
    setHistoryIndex(0);
    setSelectedMusic(null);
    setEditMenuOpen(false);
    videoDurationSecRef.current = 0;
    setKind('text');
    setError(null);
  }

  function removeCurrentSlide() {
    const urls = albumUrls.length ? albumUrls : previewUrl ? [previewUrl] : [];
    if (urls.length <= 1) {
      removeAttachedMedia();
      return;
    }
    const index = previewIndex;
    revokeLocalUrl(urls[index]);
    const nextAlbum = urls.filter((_, itemIndex) => itemIndex !== index);
    const sourceFiles = mediaFiles.length ? mediaFiles : mediaFile ? [mediaFile] : [];
    const nextFiles = nextAlbum.map((_, itemIndex) => {
      const from = itemIndex >= index ? itemIndex + 1 : itemIndex;
      return sourceFiles[from] ?? null;
    });
    const nextEdits: Record<number, PhotoEditValues> = {};
    for (const [key, value] of Object.entries(photoEdits)) {
      const from = Number(key);
      if (!Number.isFinite(from) || from === index) continue;
      nextEdits[from > index ? from - 1 : from] = value;
    }
    const nextIndex = Math.min(index, nextAlbum.length - 1);
    setAlbumUrls(nextAlbum);
    setMediaFiles(nextFiles);
    setMediaFile(nextFiles[nextIndex] || null);
    setPreviewIndex(nextIndex);
    setPreviewUrl(nextAlbum[nextIndex] ?? null);
    setPhotoEdits(nextEdits);
    setOverlays((current) =>
      current
        .filter((item) => (item.mediaIndex ?? 0) !== index)
        .map((item) => {
          const mediaIndex = item.mediaIndex ?? 0;
          return mediaIndex > index ? { ...item, mediaIndex: mediaIndex - 1 } : item;
        }),
    );
    setError(null);
  }

  function applyMediaFile(file: File, forcedKind?: PostKind, durationSec = 0) {
    const detected = mediaKindFromFile(file);
    if (composeTab === 'boomclip' && detected === 'photo' && forcedKind !== 'video') {
      setError(
        `${BOOM_CLIP_LABEL} solo permite video. Si deseas publicar aquí, cambia el archivo o vuelve a Publicación.`,
      );
    }
    revokeLocalUrl(previewUrl);
    for (const url of albumUrls) {
      if (url !== previewUrl) revokeLocalUrl(url);
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
    setPhotoEditOpen(false);
    setPhotoEdits({});
    setEditHistory([DEFAULT_PHOTO_EDIT]);
    setHistoryIndex(0);
    videoDurationSecRef.current = durationSec > 0 ? durationSec : 0;

    if (detected === 'video' || forcedKind === 'video') {
      setKind('video');
    } else {
      setKind('photo');
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

    if (
      composeTab === 'publication' &&
      detected === 'photo' &&
      albumUrls.length > 1
    ) {
      replaceCurrentSlide(file);
      return;
    }
    applyMediaFile(file, forcedKind || 'photo');
  }

  function replaceCurrentSlide(file: File) {
    const index = previewIndex;
    const detected = mediaKindFromFile(file);
    if (detected !== 'photo' || albumUrls.length <= 1) {
      applyMediaFile(file, detected || undefined);
      return;
    }
    const nextUrl = URL.createObjectURL(file);
    const previous = albumUrls[index];
    revokeLocalUrl(previous);
    const nextAlbum = [...albumUrls];
    nextAlbum[index] = nextUrl;
    const aligned = (
      mediaFiles.length
        ? [...mediaFiles]
        : mediaFile
          ? [mediaFile]
          : []
    ) as Array<File | null>;
    while (aligned.length < nextAlbum.length) aligned.push(null);
    aligned[index] = file;
    setAlbumUrls(nextAlbum);
    setMediaFiles(aligned);
    setMediaFile(file);
    setPreviewUrl(nextUrl);
    setKind('photo');
    setPhotoEdits((current) => ({ ...current, [index]: DEFAULT_PHOTO_EDIT }));
    setEditMenuOpen(false);
    setError(null);
  }

  async function onMultiPhotoChange(files: FileList) {
    setError(null);
    setMediaMenuOpen(false);
    if (composeTab === 'boomclip') {
      setError(
        `${BOOM_CLIP_LABEL} solo permite video. Si deseas publicar aquí, cambia el archivo o vuelve a Publicación.`,
      );
      return;
    }
    const picked = Array.from(files).filter((f) => mediaKindFromFile(f) === 'photo');
    if (picked.length === 0) {
      setError('Archivo no compatible. Usa foto (JPG, PNG).');
      return;
    }
    revokeLocalUrl(previewUrl);
    for (const url of albumUrls) {
      if (url !== previewUrl) revokeLocalUrl(url);
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
    setPhotoEditOpen(false);
    setPhotoEdits({});
    setKind('photo');
    videoDurationSecRef.current = 0;
    if (composeTab === 'flashboom') {
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
      if (composeTab === 'boomclip') {
        setError(
          `${BOOM_CLIP_LABEL} solo permite video. Si deseas publicar aquí, cambia el archivo o vuelve a Publicación.`,
        );
        return;
      }
      setKind('photo');
      if (composeTab !== 'flashboom') {
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
  const currentEdit = photoEdits[previewIndex] ?? DEFAULT_PHOTO_EDIT;
  const photoStageOpen =
    photoEditOpen && !previewIsVideo && Boolean(mediaFile || gifAttach || (previewSrc && kind !== 'video'));
  const cropRatio = cropAspectRatio(currentEdit.crop);

  function setCurrentEdit(next: PhotoEditValues, recordHistory = false) {
    const clamped = clampPan(next);
    setPhotoEdits((current) => ({ ...current, [previewIndex]: clamped }));
    if (recordHistory) {
      setEditHistory((history) => {
        const trimmed = history.slice(0, historyIndex + 1);
        const last = trimmed[trimmed.length - 1];
        if (last && JSON.stringify(last) === JSON.stringify(clamped)) return trimmed;
        const stacked = [...trimmed, clamped].slice(-20);
        setHistoryIndex(stacked.length - 1);
        return stacked;
      });
    }
  }

  function undoEdit() {
    if (historyIndex <= 0) return;
    const nextIndex = historyIndex - 1;
    const next = editHistory[nextIndex];
    if (!next) return;
    setHistoryIndex(nextIndex);
    setPhotoEdits((current) => ({ ...current, [previewIndex]: next }));
  }

  function redoEdit() {
    if (historyIndex >= editHistory.length - 1) return;
    const nextIndex = historyIndex + 1;
    const next = editHistory[nextIndex];
    if (!next) return;
    setHistoryIndex(nextIndex);
    setPhotoEdits((current) => ({ ...current, [previewIndex]: next }));
  }

  async function applyCurrentPhotoEdit() {
    let file = mediaFiles[previewIndex] || mediaFile;
    if ((!file || mediaKindFromFile(file) !== 'photo') && previewSrc && kind !== 'video') {
      try {
        file = await fileFromMediaUrl(previewSrc, 'photo.jpg');
      } catch {
        setPhotoEditOpen(false);
        setError('No se pudo editar esta foto. Cambia el archivo e inténtalo de nuevo.');
        return;
      }
    }
    if (!file || mediaKindFromFile(file) !== 'photo') {
      setPhotoEditOpen(false);
      return;
    }
    if (isDefaultPhotoEdit(currentEdit)) {
      setPhotoEditOpen(false);
      return;
    }
    setEditBusy(true);
    setError(null);
    try {
      const baked = await bakePhotoEdit(file, currentEdit);
      const nextUrl = URL.createObjectURL(baked);
      const urls = albumUrls.length ? [...albumUrls] : previewUrl ? [previewUrl] : [];
      const previous = urls[previewIndex];
      if (previous?.startsWith('blob:')) URL.revokeObjectURL(previous);
      urls[previewIndex] = nextUrl;
      setAlbumUrls(urls);
      setPreviewUrl(nextUrl);
      const nextFiles = (urls.length ? urls : [nextUrl]).map((_, index) =>
        index === previewIndex ? baked : mediaFiles[index] ?? null,
      );
      setMediaFiles(nextFiles);
      setMediaFile(baked);
      setCurrentEdit(DEFAULT_PHOTO_EDIT);
      setEditHistory([DEFAULT_PHOTO_EDIT]);
      setHistoryIndex(0);
      setPhotoEditOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo aplicar la edición.');
    } finally {
      setEditBusy(false);
    }
  }

  function onStagePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (!photoStageOpen) return;
    if ((event.target as HTMLElement).closest('[data-overlay-item]')) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    panDragRef.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      panX: currentEdit.panX,
      panY: currentEdit.panY,
    };
  }

  function onStagePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = panDragRef.current;
    if (!drag || event.pointerId !== drag.pointerId) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const damp = 0.28;
    const dx = ((event.clientX - drag.x) / Math.max(1, rect.width)) * 100 * damp;
    const dy = ((event.clientY - drag.y) / Math.max(1, rect.height)) * 100 * damp;
    setCurrentEdit({ ...currentEdit, panX: drag.panX + dx, panY: drag.panY + dy });
  }

  function onStagePointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    if (panDragRef.current?.pointerId === event.pointerId) {
      panDragRef.current = null;
    }
  }

  function appendAlbumPhotos(files: FileList | null) {
    if (!files || files.length === 0) return;
    if (composeTab !== 'publication') return;
    const picked = Array.from(files).filter((file) => mediaKindFromFile(file) === 'photo');
    if (picked.length === 0) {
      setError('Archivo no compatible. Usa foto (JPG, PNG).');
      return;
    }
    const urls = picked.map((file) => URL.createObjectURL(file));
    if (!mediaFile && mediaFiles.length === 0 && albumUrls.length === 0) {
      void onMultiPhotoChange(files);
      return;
    }
    setMediaFiles((current) => {
      const aligned =
        albumUrls.length > current.length
          ? [...current, ...Array.from({ length: albumUrls.length - current.length }, () => null)]
          : current.length
            ? current
            : mediaFile
              ? [mediaFile]
              : [];
      return [...aligned, ...picked];
    });
    setAlbumUrls((current) => [...current, ...urls]);
    setKind('photo');
  }

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
    const slideEdit = photoEdits[next] ?? DEFAULT_PHOTO_EDIT;
    setEditHistory([slideEdit]);
    setHistoryIndex(0);
  }

  function startVideoTrim() {
    setEditMenuOpen(false);
    void (async () => {
      let file = mediaFile;
      if (!file || mediaKindFromFile(file) !== 'video') {
        if (kind !== 'video' || !previewUrl) return;
        try {
          file = await fileFromMediaUrl(previewUrl, 'clip.mp4');
          setMediaFile(file);
        } catch {
          setError('No se pudo cargar el video original para recortar.');
          return;
        }
      }
      const maxSec =
        composeTab === 'flashboom'
          ? STORY_MAX_DURATION_SEC
          : composeTab === 'boomclip'
            ? MAX_CLIP_DURATION_SECONDS
            : BOOM_CLIP_MAX_DURATION_SEC;
      try {
        const durationSec = await readVideoDurationSec(file, maxSec);
        setTrimDraft({
          file,
          url: previewUrl?.startsWith('blob:') ? previewUrl : URL.createObjectURL(file),
          durationSec: Math.max(1, durationSec),
          maxDurationSec: maxSec,
        });
      } catch {
        setTrimDraft({
          file,
          url: previewUrl?.startsWith('blob:') ? previewUrl : URL.createObjectURL(file),
          durationSec: 0,
          maxDurationSec: maxSec,
        });
      }
    })();
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
      if (!mediaFile && !(isEditMode && previewUrl)) {
        setError(`Elige una foto o video para tu ${isFlashBoom ? FLASH_BOOM_LABEL : BOOM_CLIP_LABEL}.`);
        return;
      }
    } else if (
      kind === 'photo' &&
      !mediaFile &&
      !mediaFiles.some(Boolean) &&
      !gifAttach &&
      !albumUrls.length &&
      !previewUrl
    ) {
      setError('Elige una foto, un video o escribe un post de texto.');
      return;
    }

    setBusy(true);
    setError(null);
    try {
      let durationSec = 0;
      const publishKind = kind;
      if (isBoomClip && publishKind !== 'video') {
        setError(
          `${BOOM_CLIP_LABEL} solo permite video. Si deseas publicar aquí, cambia el archivo o vuelve a Publicación.`,
        );
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
      const createFiles = mediaFiles.filter((file): file is File => Boolean(file));
      let albumForUpload = createFiles;
      if (publishKind === 'photo') {
        if (createFiles.length > 1) {
          albumForUpload = await Promise.all(
            createFiles.map(async (file, index) => {
              const edit = photoEdits[index] ?? DEFAULT_PHOTO_EDIT;
              if (mediaKindFromFile(file) !== 'photo' || isDefaultPhotoEdit(edit)) return file;
              return bakePhotoEdit(file, edit);
            }),
          );
        } else if (uploadFile && mediaKindFromFile(uploadFile) === 'photo') {
          const edit = photoEdits[previewIndex] ?? currentEdit;
          if (!isDefaultPhotoEdit(edit)) {
            uploadFile = await bakePhotoEdit(uploadFile, edit);
          }
        }
      }
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

      if (isEditMode && editPost?.id) {
        const displayUrls = albumUrls.length ? albumUrls : previewUrl ? [previewUrl] : [];
        let mediaSlots: Array<{ file?: File | Blob | null; url?: string | null }> = [];
        if (publishKind === 'photo' && displayUrls.length) {
          mediaSlots = await Promise.all(
            displayUrls.map(async (url, index) => {
              let file = mediaFiles[index] || (displayUrls.length === 1 ? uploadFile : null) || null;
              const edit = photoEdits[index] ?? DEFAULT_PHOTO_EDIT;
              if (file && mediaKindFromFile(file) === 'photo' && !isDefaultPhotoEdit(edit)) {
                file = await bakePhotoEdit(file, edit);
              } else if (!file && !isDefaultPhotoEdit(edit) && /^https?:/i.test(url)) {
                const remote = await fileFromMediaUrl(url, 'photo.jpg');
                file = await bakePhotoEdit(remote, edit);
              }
              return file ? { file } : { url };
            }),
          );
        } else if (publishKind === 'video') {
          mediaSlots = uploadFile ? [{ file: uploadFile }] : previewUrl ? [{ url: previewUrl }] : [];
        }
        const savedType =
          publishKind === 'text' && gifAttach && !mediaSlots.length ? 'photo' : publishKind;
        const saved = await updatePost({
          postId: editPost.id,
          authorUid: profile.firebaseUid,
          username: profile.handle || username,
          authorDisplayName: profile.displayName,
          type: savedType === 'text' && !mediaSlots.length && !gifAttach ? 'text' : savedType,
          caption,
          visibility,
          mediaSlots: savedType === 'text' && !gifAttach ? [] : mediaSlots,
          mediaUrl: !mediaSlots.length && gifAttach ? gifAttach.url : undefined,
          overlays,
          durationSec,
          notifyFriends: visibility !== 'private' && notifyFriends,
        });
        onUpdated?.({
          ...editPost,
          id: editPost.id,
          authorUid: editPost.authorUid,
          createdAt: editPost.createdAt,
          type: saved.type,
          caption: saved.caption,
          mediaUrl: saved.mediaUrl,
          mediaUrls: saved.mediaUrls,
          visibility: saved.visibility,
          overlays,
          durationSec: saved.type === 'video' ? durationSec || editPost.durationSec : editPost.durationSec,
          edited: true,
          updatedAt: new Date().toISOString(),
        });
        reset();
        closeModal();
        return;
      }

      const created = await createPost({
        authorUid: profile.firebaseUid,
        username: profile.handle || username,
        authorDisplayName: profile.displayName,
        type: publishKind === 'text' && gifAttach && !uploadFile ? 'photo' : publishKind,
        caption,
        mediaFile:
          publishKind === 'text' || (publishKind === 'photo' && albumForUpload.length > 1)
            ? null
            : uploadFile,
        mediaFiles:
          publishKind === 'photo' && albumForUpload.length > 1 ? albumForUpload : undefined,
        mediaUrl: !uploadFile && gifAttach ? gifAttach.url : undefined,
        visibility,
        postFormat: publishPostFormat,
        durationSec,
        notifyFriends: visibility !== 'private' && notifyFriends,
        musicTrackId: selectedMusic?.trackId,
        musicStartSec: selectedMusic?.startSec,
        overlays,
      });

      onCreated?.({
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

  const showVisibility = true;
  const showPanel = isInline || open;
  const isModalOpen = showPanel && !isInline;
  useBodyScrollLock(isModalOpen || cameraCaptureOpen);
  const modalTitle = isEditMode
    ? 'Editar publicación'
    : isFlashBoom
      ? FLASH_BOOM_LABEL
      : isBoomClip
        ? BOOM_CLIP_LABEL
        : 'Nueva publicación';
  const submitLabel = isEditMode
    ? busy
      ? 'Guardando…'
      : 'Guardar cambios'
    : busy
      ? 'Subiendo…'
      : 'Publicar';
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
        accept={composeTab === 'boomclip' ? 'video/*' : 'image/*,video/*'}
        multiple={composeTab === 'publication'}
        className="hidden"
        onChange={(event) => onGalleryMediaChange(event.target.files)}
      />
      <input
        ref={galleryAppendRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(event) => appendAlbumPhotos(event.target.files)}
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
          <div className={`composer-kind-tabs ${isInline || isModalOpen ? 'mt-0' : 'mt-3'}`}>
            <button
              type="button"
              onClick={() => switchTab('publication')}
              className={`composer-kind-tab composer-kind-tab--publication ${
                composeTab === 'publication' ? 'is-active' : ''
              }`}
            >
              <PenLine size={12} />
              <span>Publicación</span>
            </button>
            {!isEditMode ? (
              <>
            <button
              type="button"
              onClick={() => switchTab('boomclip')}
              className={`composer-kind-tab composer-kind-tab--boomclip ${
                composeTab === 'boomclip' ? 'is-active' : ''
              }`}
            >
              <Video size={12} />
              <span>{BOOM_CLIP_LABEL}</span>
            </button>
            <button
              type="button"
              onClick={() => switchTab('flashboom')}
              className={`composer-kind-tab composer-kind-tab--flashboom ${
                composeTab === 'flashboom' ? 'is-active' : ''
              }`}
            >
              <Zap size={12} />
              <span>{FLASH_BOOM_LABEL}</span>
            </button>
              </>
            ) : null}
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
              <div
                className={`grid gap-3 ${
                  photoStageOpen ? 'min-[900px]:grid-cols-[minmax(0,1fr)_minmax(15rem,18.5rem)]' : ''
                }`}
              >
                <div className="min-w-0 space-y-2">
                  <div className="relative w-full overflow-hidden rounded-2xl bg-zinc-950">
                    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
                      <img
                        src={previewSrc}
                        alt=""
                        className="h-full w-full scale-125 object-cover opacity-35 blur-2xl"
                      />
                    </div>
                    <div
                      className={`lb-composer-stage relative z-[1] flex w-full items-center justify-center ${
                        photoStageOpen ? 'cursor-grab touch-none active:cursor-grabbing' : ''
                      }`}
                      style={cropRatio ? { aspectRatio: String(cropRatio) } : undefined}
                      onPointerDown={onStagePointerDown}
                      onPointerMove={onStagePointerMove}
                      onPointerUp={onStagePointerUp}
                      onPointerCancel={onStagePointerUp}
                    >
                      <div className="relative max-h-full min-h-0 w-full overflow-hidden">
                        {previewIsVideo ? (
                          <video
                            src={previewSrc}
                            className="mx-auto max-h-[min(56dvh,28rem)] w-full object-contain"
                            autoPlay
                            muted
                            loop
                            playsInline
                          />
                        ) : (
                          <img
                            src={previewSrc}
                            alt=""
                            draggable={false}
                            className="mx-auto max-h-[min(56dvh,28rem)] w-full select-none object-contain"
                            style={{
                              filter: photoCssFilter(currentEdit),
                              transform: `translate(${currentEdit.panX}%, ${currentEdit.panY}%) scale(${
                                currentEdit.zoom / 100
                              }) rotate(${currentEdit.rotate}deg)`,
                              transformOrigin: 'center center',
                            }}
                          />
                        )}
                        {currentEdit.vignette > 0 && !previewIsVideo ? (
                          <div
                            className="pointer-events-none absolute inset-0"
                            style={{
                              background: `radial-gradient(circle, transparent 42%, rgba(0,0,0,${
                                currentEdit.vignette / 140
                              }) 100%)`,
                            }}
                          />
                        ) : null}
                        <MediaOverlayLayer
                          overlays={slideOverlays}
                          editable
                          onChange={setSlideOverlays}
                        />
                      </div>
                    </div>
                    <div className="absolute left-2 top-2 z-[6] flex max-w-[calc(100%-5.5rem)] flex-wrap items-center gap-1">
                      <button
                        type="button"
                        onClick={() => openGallery(composeTab === 'boomclip' ? 'video' : 'any')}
                        className="inline-flex min-h-9 items-center rounded-full border border-white/15 bg-black/55 px-2.5 text-[11px] font-semibold text-white backdrop-blur-sm"
                      >
                        Cambiar
                      </button>
                      <button
                        type="button"
                        onClick={() => (slideCount > 1 ? removeCurrentSlide() : removeAttachedMedia())}
                        className="inline-flex min-h-9 items-center gap-1 rounded-full border border-rose-400/40 bg-black/55 px-2.5 text-[11px] font-semibold text-rose-200 backdrop-blur-sm"
                      >
                        <Trash2 size={12} />
                        Eliminar
                      </button>
                    </div>
                    <div className="absolute right-2 top-2 z-[6] flex items-center gap-1">
                      {photoStageOpen ? (
                        <>
                          <button
                            type="button"
                            onClick={undoEdit}
                            disabled={historyIndex <= 0}
                            className="grid h-9 w-9 place-items-center rounded-full border border-white/15 bg-black/55 text-white disabled:opacity-35"
                            aria-label="Deshacer"
                          >
                            <Undo2 size={14} />
                          </button>
                          <button
                            type="button"
                            onClick={redoEdit}
                            disabled={historyIndex >= editHistory.length - 1}
                            className="grid h-9 w-9 place-items-center rounded-full border border-white/15 bg-black/55 text-white disabled:opacity-35"
                            aria-label="Rehacer"
                          >
                            <Redo2 size={14} />
                          </button>
                        </>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => {
                          if (previewIsVideo) {
                            setEditMenuOpen((value) => !value);
                            return;
                          }
                          setEditMenuOpen(false);
                          setPhotoEditOpen((value) => !value);
                        }}
                        className="inline-flex min-h-9 items-center gap-1 rounded-full border border-white/15 bg-black/55 px-2.5 text-[11px] font-semibold text-white backdrop-blur-sm"
                      >
                        <Wand2 size={13} />
                        Editar
                      </button>
                    </div>
                    {gifAttach && !mediaFile ? (
                      <button
                        type="button"
                        onClick={() => setGifAttach(null)}
                        className="absolute right-2 bottom-2 z-[6] grid h-9 w-9 place-items-center rounded-full border border-white/15 bg-black/55 text-white backdrop-blur-sm"
                        aria-label="Quitar GIF"
                      >
                        <X size={14} />
                      </button>
                    ) : null}
                    {editMenuOpen && previewIsVideo ? (
                      <div className="absolute right-2 top-12 z-[8] min-w-[10.5rem] overflow-hidden rounded-xl border border-white/10 bg-zinc-900/95 shadow-xl backdrop-blur-md">
                        <button
                          type="button"
                          className="flex min-h-11 w-full items-center px-3 text-left text-xs font-semibold text-white hover:bg-white/5"
                          onClick={startVideoTrim}
                        >
                          Recortar
                        </button>
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
                        <p className="pointer-events-none absolute inset-x-0 bottom-2 z-[6] text-center text-[11px] font-semibold text-white/80">
                          {previewIndex + 1}/{slideCount}
                        </p>
                      </>
                    ) : null}
                  </div>
                  {composeTab === 'publication' && !previewIsVideo ? (
                    <div className="flex gap-2 overflow-x-auto pb-1">
                      {(albumUrls.length ? albumUrls : previewSrc ? [previewSrc] : []).map((url, index) => (
                        <button
                          key={`${url}-${index}`}
                          type="button"
                          onClick={() => showSlide(index)}
                          className={`h-14 w-14 shrink-0 overflow-hidden rounded-xl border ${
                            index === previewIndex ? 'border-fuchsia-400' : 'border-white/15'
                          }`}
                        >
                          <img src={url} alt="" className="h-full w-full object-cover" />
                        </button>
                      ))}
                      <button
                        type="button"
                        onClick={() => {
                          const target = galleryAppendRef.current;
                          if (!target) return;
                          target.value = '';
                          target.click();
                        }}
                        className="flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-xl border border-dashed border-white/25 text-[9px] font-semibold text-zinc-400"
                      >
                        <Plus size={14} />
                        Agregar
                      </button>
                    </div>
                  ) : null}
                </div>
                {photoStageOpen ? (
                  <PhotoEditPanel
                    value={currentEdit}
                    onChange={(next) => setCurrentEdit(next, true)}
                    onReset={() => {
                      setCurrentEdit(DEFAULT_PHOTO_EDIT, true);
                      setEditHistory([DEFAULT_PHOTO_EDIT]);
                      setHistoryIndex(0);
                    }}
                    onApply={() => void applyCurrentPhotoEdit()}
                    applying={editBusy}
                  />
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
                className={`inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center gap-1 rounded-lg border px-2 transition ${
                  mediaMenuOpen
                    ? 'border-cyan-400 bg-cyan-500/15 text-cyan-200'
                    : 'border-white/15 bg-zinc-900/80 text-zinc-300 hover:border-cyan-400/40'
                }`}
                aria-label="Adjuntar foto o video"
                aria-expanded={mediaMenuOpen}
              >
                <Paperclip size={16} />
                <span className="hidden text-[11px] font-semibold sm:inline">Adjuntar</span>
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

        </>
      )}

      {showVisibility && visibility !== 'private' ? (
        <button
          type="button"
          onClick={() => setNotifyFriends((value) => !value)}
          className={`lb-notify-friends-btn ${notifyFriends ? 'is-active' : ''}`}
          aria-pressed={notifyFriends}
        >
          <span className="lb-notify-friends-btn__bell" aria-hidden>
            <Bell size={13} />
          </span>
          <span>Notificar amigos</span>
          {notifyFriends ? <span className="lb-notify-friends-btn__dot" aria-hidden /> : null}
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
            <button type="button" onClick={requestClose} className="px-4 py-2 text-sm text-zinc-400">
              Cancelar
            </button>
          ) : null}
          <button
            type="button"
            disabled={busy}
            onClick={() => void publish()}
            className="rounded-full bg-cyan-500 px-5 py-2 text-sm font-bold text-zinc-950 disabled:opacity-60"
          >
            {submitLabel}
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
        <button type="button" onClick={requestClose} className="px-4 py-2 text-sm text-zinc-400">
          Cancelar
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void publish()}
          className="rounded-full bg-cyan-500 px-5 py-2 text-sm font-bold text-zinc-950 disabled:opacity-60"
        >
          {submitLabel}
        </button>
      </div>
    </div>
  ) : null;

  const modalOverlay =
    isModalOpen && !trimDraft ? (
      <div
        className="fixed inset-0 z-[100] flex items-end justify-center overscroll-none bg-black/80 backdrop-blur-sm sm:items-center sm:p-4"
        onClick={(event) => {
          if (event.target === event.currentTarget) requestClose();
        }}
      >
        <div
          className="lb-composer-modal relative flex w-full flex-col overflow-hidden rounded-t-3xl border border-white/10 bg-zinc-950 shadow-2xl sm:rounded-3xl"
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
              onClick={requestClose}
              className="grid h-9 w-9 place-items-center rounded-full bg-white/10 text-white"
              aria-label="Cerrar"
            >
              <X size={18} />
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3">{panelBody}</div>
          {modalFooter}
          {discardOpen ? (
            <div className="absolute inset-0 z-[20] flex items-center justify-center bg-black/70 p-4">
              <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-zinc-900 p-4 shadow-2xl">
                <p className="text-sm font-bold text-white">
                  {isEditMode ? '¿Descartar cambios?' : '¿Descartar el borrador?'}
                </p>
                <p className="mt-1.5 text-xs leading-relaxed text-zinc-400">
                  {isEditMode
                    ? 'Si sales ahora, la publicación original se mantiene igual.'
                    : 'Si sales ahora se perderán el archivo, el texto y las ediciones de esta publicación.'}
                </p>
                <div className="mt-4 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setDiscardOpen(false)}
                    className="min-h-11 rounded-full px-4 text-sm text-zinc-300"
                  >
                    Seguir editando
                  </button>
                  <button
                    type="button"
                    onClick={confirmDiscard}
                    className="min-h-11 rounded-full bg-rose-500 px-4 text-sm font-bold text-white"
                  >
                    Descartar
                  </button>
                </div>
              </div>
            </div>
          ) : null}
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
