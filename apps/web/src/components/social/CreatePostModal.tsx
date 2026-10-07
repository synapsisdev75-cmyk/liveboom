import { useBackLayer } from '../../lib/backLayer';
import { Bell, Camera, ChevronLeft, ChevronRight, Globe, Image, LayoutGrid, Lock, MapPin, Music2, Paperclip, PenLine, Plus, Redo2, Smile, Trash2, Undo2, Users, Video, Wand2, X, Zap } from 'lucide-react';
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { createPortal } from 'react-dom';
import { BOOM_CLIP_LABEL, FLASH_BOOM_LABEL } from '../../lib/brand';
import { createPost, updatePost } from '../../lib/socialFirestore';
import { reelLifecycleHint } from '../../lib/reelLifecycle';
import { storyLifecycleHint, STORY_MAX_DURATION_SEC } from '../../lib/storyLifecycle';
import {
  extractFirstHttpUrl,
  fetchLinkPreview,
  isSamePreviewUrl,
  type LinkPreviewData,
} from '../../lib/linkPreview';
import { LinkPreviewCard } from './LinkPreviewCard';
import { LocationShareModal } from '../location/LocationShareModal';
import { locationLinkPreview, parseLocationUrl } from '../../lib/locationShare';
import { readVideoDurationSec } from '../../lib/videoDuration';
import { MAX_CLIP_DURATION_SECONDS, BOOM_CLIP_CAPTION_MAX, FLASH_BOOM_CAPTION_MAX } from '../../lib/contentType';
import { POST_EMOJI_SIZE } from '../../lib/liveboomEmojis';
import { isVideoFile, mediaKindFromFile, fileFromMediaUrl } from '../../lib/mediaFile';
import { isUploadCanceled, prefetchImageForUpload, uploadUserMedia } from '../../lib/storage';
import {
  detachPublishJob,
  finishPublishJob,
  publishStageLabel,
  startPublishJob,
  updatePublishJob,
  usePublishProgressStore,
} from '../../lib/publishProgress';
import '../global/publishProgress.css';
import { useAuthStore } from '../../store/authStore';
import { EmojiPickerButton } from './EmojiPicker';
import { EmojiInput, type EmojiInputHandle } from './EmojiInput';
import { TextStyleButton } from './TextStyleButton';
import {
  DEFAULT_POST_TEXT_STYLE,
  parsePostTextStyle,
  textStyleProps,
  textStyleRangesForTrimmed,
  useTextStyleRangesDraft,
  type PostTextStyle,
} from '../../lib/postTextStyle';
import { VideoTrimEditor } from './VideoTrimEditor';
import { PhotoCropEditor } from './PhotoCropEditor';
import { MusicPickerModal } from './MusicPickerModal';
import { FlashBoomCameraCapture } from './FlashBoomCameraCapture';
import type { SelectedMusicClip } from '../../lib/musicLibrary';
import { useBodyScrollLock } from '../../lib/useBodyScrollLock';
import type { SocialPost } from './SocialPostCard';
import { MediaOverlayLayer } from './MediaOverlayLayer';
import { GifPickerSheet } from './GifPickerSheet';
import { StickerPickerSheet } from './StickerPickerSheet';
import { CollageMakerSheet } from './CollageMakerSheet';
import { PhotoEditPanel } from './PhotoEditPanel';
import {
  canAddOverlay,
  newOverlayId,
  type MediaOverlayItem,
} from '../../lib/mediaOverlays';
import type { ComposerGif } from '../../lib/composerGifs';
import type { ComposerSticker } from '../../lib/composerStickers';
import { postPhotoUrls } from '../../lib/mediaFrame';
import { PUBLICATION_ALBUM_MAX } from '../../lib/publicationMedia';
import {
  bakePhotoEdit,
  clampPan,
  cropAspectRatio,
  DEFAULT_PHOTO_EDIT,
  isDefaultPhotoEdit,
  photoCssFilter,
  type PhotoEditValues,
} from '../../lib/photoEdit';
import {
  clearReconstructionDraft,
  getReconstructionDraft,
  readReconstructionSessionMeta,
  setReconstructionDraft,
  subscribeReconstructionDraft,
} from '../../lib/reconstruction3d/draftStore';
import { reconstructionPreviewFile, renderOrbitVideo } from '../../lib/reconstruction3d/orbitRender';
import { threeDReconstructionService } from '../../lib/reconstruction3d/service';
import { DEFAULT_RECONSTRUCTION_EDIT, type ReconstructionDraft } from '../../lib/reconstruction3d/types';
import { Reconstruction3DViewer } from './Reconstruction3DViewer';
import { Reconstruction3DBadge } from './Reconstruction3DBadge';

type PostComposerMode = 'create' | 'edit';

function revokeLocalUrl(url: string | null | undefined) {
  if (url?.startsWith('blob:')) URL.revokeObjectURL(url);
}

const PUBLICATION_VIDEO_MAX = 3;

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
  /** Archivos / texto recibidos desde el menú Compartir del sistema. */
  seedFiles?: File[] | null;
  seedCaption?: string | null;
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
  seedFiles = null,
  seedCaption = null,
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
  const [textStyle, setTextStyle] = useState<PostTextStyle>(DEFAULT_POST_TEXT_STYLE);
  const [textStyleRanges, setTextStyleRanges] = useTextStyleRangesDraft(caption);
  const [publishJobId, setPublishJobId] = useState<string | null>(null);
  const publishJob = usePublishProgressStore((state) =>
    publishJobId ? (state.jobs.find((job) => job.id === publishJobId) ?? null) : null,
  );
  const publishAbortRef = useRef<AbortController | null>(null);
  const publishJobIdRef = useRef<string | null>(null);
  publishJobIdRef.current = publishJobId;
  // Si el compositor se cierra o se navega mientras publica, la subida sigue y su progreso
  // pasa al indicador flotante global.
  useEffect(
    () => () => {
      if (publishJobIdRef.current) detachPublishJob(publishJobIdRef.current);
    },
    [],
  );
  const captionInputRef = useRef<EmojiInputHandle>(null);
  const [linkPreview, setLinkPreview] = useState<LinkPreviewData | null>(null);
  const [linkPreviewBusy, setLinkPreviewBusy] = useState(false);
  const [locationPickerOpen, setLocationPickerOpen] = useState(false);
  const linkPreviewReqRef = useRef(0);
  const seedAppliedRef = useRef(false);
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [mediaFiles, setMediaFiles] = useState<Array<File | null>>([]);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [albumUrls, setAlbumUrls] = useState<string[]>([]);
  const [previewIndex, setPreviewIndex] = useState(0);
  /** Publicación: videos 2 y 3 (el 1 es `mediaFile` / `previewUrl`, con recorte, música y stickers). */
  const [extraVideos, setExtraVideos] = useState<Array<{ url: string; file: File | null }>>([]);
  const [videoSlide, setVideoSlide] = useState(0);
  const [editMenuOpen, setEditMenuOpen] = useState(false);
  const videoDurationSecRef = useRef(0);
  const mediaPickGenRef = useRef(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mediaMenuOpen, setMediaMenuOpen] = useState(false);
  const [mediaMenuBelow, setMediaMenuBelow] = useState(false);
  const mediaMenuPanelRef = useRef<HTMLDivElement>(null);
  const [trimDraft, setTrimDraft] = useState<{
    file: File;
    url: string;
    durationSec: number;
    maxDurationSec: number;
    forcedKind?: PostKind;
  } | null>(null);
  /** Recorte obligatorio antes de que una foto entre al composer (una a una si son varias). */
  const [cropSession, setCropSession] = useState<{
    files: File[];
    index: number;
    done: File[];
    resolve: (files: File[]) => void;
  } | null>(null);
  const [cameraCaptureOpen, setCameraCaptureOpen] = useState(false);
  const [cameraAppend, setCameraAppend] = useState(false);
  const [addMoreOpen, setAddMoreOpen] = useState(false);
  const [musicPickerOpen, setMusicPickerOpen] = useState(false);
  const [selectedMusic, setSelectedMusic] = useState<SelectedMusicClip | null>(null);
  const [overlays, setOverlays] = useState<MediaOverlayItem[]>([]);
  const [gifAttach, setGifAttach] = useState<ComposerGif | null>(null);
  const [gifPickerOpen, setGifPickerOpen] = useState(false);
  const [stickerPickerOpen, setStickerPickerOpen] = useState(false);
  const [collageOpen, setCollageOpen] = useState(false);
  const [reconstruction, setReconstruction] = useState<ReconstructionDraft | null>(getReconstructionDraft());
  const [photoEditOpen, setPhotoEditOpen] = useState(false);
  const [photoEdits, setPhotoEdits] = useState<Record<number, PhotoEditValues>>({});
  const [previewNatural, setPreviewNatural] = useState<{ src: string; width: number; height: number } | null>(null);
  const [editHistory, setEditHistory] = useState<PhotoEditValues[]>([DEFAULT_PHOTO_EDIT]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const [editBusy, setEditBusy] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);
  const editBaselineRef = useRef('');
  const galleryPhotoRef = useRef<HTMLInputElement>(null);
  const galleryVideoRef = useRef<HTMLInputElement>(null);
  const galleryExtraVideoRef = useRef<HTMLInputElement>(null);
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
      textStyle,
      textStyleRanges,
      visibility,
      kind,
      notifyFriends,
      albumUrls,
      previewUrl,
      gif: gifAttach?.url || null,
      overlays,
      photoEdits,
      extraVideos: extraVideos.map((item) => item.url),
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
        extraVideos.length ||
        gifAttach ||
        overlays.length ||
        selectedMusic,
    );
  }

  /** Cerrar mientras publica: la subida continúa y se ve en el indicador flotante. */
  function continueInBackground() {
    if (publishJobIdRef.current) detachPublishJob(publishJobIdRef.current);
    closeModal();
  }

  function requestClose() {
    if (isInline) return;
    if (busy && publishJobIdRef.current) {
      continueInBackground();
      return;
    }
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
    const cached = readReconstructionSessionMeta();
    if (cached?.id && cached.result && !getReconstructionDraft()) {
      setReconstructionDraft({
        id: cached.id,
        userId: profile?.firebaseUid || cached.userId || '',
        kind: cached.kind || 'object',
        status: cached.status || 'ready',
        progress: 100,
        stage: '',
        captures: [],
        missingSlots: [],
        result: cached.result,
        edit: cached.edit || { ...DEFAULT_RECONSTRUCTION_EDIT },
        motion: cached.motion || 'orbit',
        error: null,
        personConsent: Boolean(cached.personConsent),
        createdAt: cached.createdAt || Date.now(),
        updatedAt: cached.updatedAt || Date.now(),
      } as ReconstructionDraft);
    }
    return subscribeReconstructionDraft(setReconstruction);
  }, [profile?.firebaseUid]);

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
    const nextExtraVideos =
      post.type === 'video' && !post.postFormat && post.mediaUrls && post.mediaUrls.length > 1
        ? post.mediaUrls.slice(1, PUBLICATION_VIDEO_MAX).filter(Boolean)
        : [];
    setExtraVideos(nextExtraVideos.map((url) => ({ url, file: null })));
    setVideoSlide(0);
    setComposeTab('publication');
    setCaption(post.caption || '');
    setTextStyle(post.textStyle ?? DEFAULT_POST_TEXT_STYLE);
    setTextStyleRanges(post.textStyleRanges ?? [], post.caption || '');
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
      textStyle: post.textStyle ?? DEFAULT_POST_TEXT_STYLE,
      textStyleRanges: post.textStyleRanges ?? [],
      visibility: vis,
      kind: nextKind,
      notifyFriends: false,
      albumUrls: nextAlbum,
      previewUrl: nextPreview,
      gif: nextGif,
      overlays: post.overlays || [],
      photoEdits: {},
      extraVideos: nextExtraVideos,
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

  useEffect(() => {
    if (!mediaMenuOpen) return;
    mediaMenuPanelRef.current?.scrollIntoView({ block: 'nearest' });
  }, [mediaMenuOpen, mediaMenuBelow]);

  function toggleMediaMenu() {
    if (mediaMenuOpen) {
      setMediaMenuOpen(false);
      return;
    }
    const row = mediaMenuRef.current;
    if (row) {
      const scroller = row.closest('.overflow-y-auto');
      const limitTop = scroller ? scroller.getBoundingClientRect().top : 0;
      const spaceAbove = row.getBoundingClientRect().top - limitTop;
      const menuHeight = composeTab === 'publication' ? 190 : 130;
      setMediaMenuBelow(spaceAbove < menuHeight);
    }
    setMediaMenuOpen(true);
  }

  function reset() {
    const trimUrl = trimDraft?.url;
    const trimShared = Boolean(trimUrl && (trimUrl === previewUrl || albumUrls.includes(trimUrl)));
    revokeLocalUrl(previewUrl);
    for (const url of albumUrls) {
      if (url !== previewUrl) revokeLocalUrl(url);
    }
    if (trimUrl && !trimShared) revokeLocalUrl(trimUrl);
    clearExtraVideos();
    mediaPickGenRef.current += 1;
    setCaption('');
    setTextStyle(DEFAULT_POST_TEXT_STYLE);
    setTextStyleRanges([], '');
    setLinkPreview(null);
    setLinkPreviewBusy(false);
    linkPreviewReqRef.current += 1;
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
    if (tab === 'boomclip' && file && mediaKindFromFile(file) === 'photo' && reconstruction?.status !== 'ready') {
      setError(
        `${BOOM_CLIP_LABEL} solo permite video. Si deseas publicar aquí, cambia el archivo o vuelve a Publicación.`,
      );
    } else {
      setError(null);
    }
  }

  useEffect(() => {
    if (kind !== 'video' && extraVideos.length) clearExtraVideos();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind]);

  function clearExtraVideos() {
    for (const item of extraVideos) revokeLocalUrl(item.url);
    setExtraVideos([]);
    setVideoSlide(0);
  }

  function addExtraVideos(files: readonly File[], replace = false) {
    const videos = files.filter((file) => mediaKindFromFile(file) === 'video' || isVideoFile(file));
    if (!videos.length) {
      if (!replace) setError('Archivo no compatible. Usa video (MP4, MOV, WebM).');
      return;
    }
    const baseCount = replace ? 0 : extraVideos.length;
    const room = PUBLICATION_VIDEO_MAX - 1 - baseCount;
    if (room <= 0) {
      setError(`Puedes añadir hasta ${PUBLICATION_VIDEO_MAX} videos en una publicación.`);
      return;
    }
    const accepted = videos.slice(0, room);
    setError(
      videos.length > accepted.length
        ? `Se usaron ${accepted.length + (replace ? 1 : 0)}. Máximo ${PUBLICATION_VIDEO_MAX} videos.`
        : null,
    );
    if (replace) for (const item of extraVideos) revokeLocalUrl(item.url);
    const added = accepted.map((file) => ({ url: URL.createObjectURL(file), file }));
    setExtraVideos((current) => [...(replace ? [] : current), ...added].slice(0, PUBLICATION_VIDEO_MAX - 1));
    setVideoSlide(replace ? 0 : baseCount + 1);
  }

  function onGalleryVideoChange(files: FileList | readonly File[] | null) {
    const list = Array.from(files || []);
    const first = list[0];
    if (!first) return;
    void onFileChange(first, 'video');
    if (composeTab === 'publication' && list.length > 1) addExtraVideos(list.slice(1), true);
  }

  function openExtraVideoGallery() {
    setError(null);
    const target = galleryExtraVideoRef.current;
    if (!target) return;
    target.value = '';
    target.click();
  }

  function removeExtraVideo(index: number) {
    const item = extraVideos[index];
    if (item) revokeLocalUrl(item.url);
    setExtraVideos((current) => current.filter((_, itemIndex) => itemIndex !== index));
    setVideoSlide(0);
  }

  /** Al quitar el video 1, el siguiente pasa a ser el principal (sin stickers/música del anterior). */
  function promoteExtraVideo() {
    const [next, ...rest] = extraVideos;
    if (!next) return false;
    setExtraVideos(rest);
    setVideoSlide(0);
    setOverlays([]);
    setSelectedMusic(null);
    setEditMenuOpen(false);
    if (next.file) {
      revokeLocalUrl(next.url);
      void onFileChange(next.file, 'video');
      return true;
    }
    mediaPickGenRef.current += 1;
    revokeLocalUrl(previewUrl);
    setTrimDraft(null);
    setMediaFile(null);
    setMediaFiles([]);
    setAlbumUrls([next.url]);
    setPreviewIndex(0);
    setPreviewUrl(next.url);
    videoDurationSecRef.current = 0;
    setKind('video');
    setError(null);
    return true;
  }

  function removeAttachedMedia() {
    mediaPickGenRef.current += 1;
    const trimUrl = trimDraft?.url;
    const trimShared = Boolean(trimUrl && (trimUrl === previewUrl || albumUrls.includes(trimUrl)));
    revokeLocalUrl(previewUrl);
    for (const url of albumUrls) {
      if (url !== previewUrl) revokeLocalUrl(url);
    }
    if (trimUrl && !trimShared) revokeLocalUrl(trimUrl);
    clearExtraVideos();
    setTrimDraft(null);
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

  function applyMediaFile(file: File, forcedKind?: PostKind, durationSec = 0, existingUrl?: string) {
    const detected = mediaKindFromFile(file);
    if (composeTab === 'boomclip' && detected === 'photo' && forcedKind !== 'video') {
      setError(
        `${BOOM_CLIP_LABEL} solo permite video. Si deseas publicar aquí, cambia el archivo o vuelve a Publicación.`,
      );
    }
    if (previewUrl && previewUrl !== existingUrl) revokeLocalUrl(previewUrl);
    for (const url of albumUrls) {
      if (url !== previewUrl && url !== existingUrl) revokeLocalUrl(url);
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
    const nextUrl =
      existingUrl?.startsWith('blob:') || existingUrl?.startsWith('http')
        ? existingUrl
        : URL.createObjectURL(file);
    const staleTrimUrl = trimDraft?.url;
    if (staleTrimUrl && staleTrimUrl !== nextUrl && staleTrimUrl !== existingUrl) {
      revokeLocalUrl(staleTrimUrl);
    }
    setTrimDraft(null);
    setMediaFile(file);
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
      setMediaFiles([]);
      setKind('video');
    } else {
      setMediaFiles([file]);
      setKind('photo');
      prefetchImageForUpload(file);
    }
  }

  async function onFileChange(
    file: File | null,
    forcedKind?: PostKind,
    knownDurationSec?: number,
  ) {
    if (!file) return;
    const pickId = ++mediaPickGenRef.current;
    setError(null);
    setMediaMenuOpen(false);

    const detected = mediaKindFromFile(file);
    if (!detected) {
      setError('Archivo no compatible. Usa foto (JPG, PNG) o video (MP4, MOV, WebM).');
      return;
    }

    if (detected === 'video' || forcedKind === 'video' || isVideoFile(file)) {
      const localUrl = URL.createObjectURL(file);
      applyMediaFile(file, 'video', knownDurationSec && knownDurationSec > 0 ? knownDurationSec : 0, localUrl);
      void (async () => {
        try {
          const durationSec =
            knownDurationSec && knownDurationSec > 0
              ? knownDurationSec
              : await readVideoDurationSec(file, 0);
          if (pickId !== mediaPickGenRef.current) return;
          videoDurationSecRef.current = durationSec;
          const clipCapSec =
            composeTab === 'flashboom'
              ? STORY_MAX_DURATION_SEC
              : composeTab === 'boomclip'
                ? MAX_CLIP_DURATION_SECONDS
                : 0;
          if (clipCapSec > 0 && durationSec > clipCapSec) {
            setTrimDraft({
              file,
              url: localUrl,
              durationSec,
              maxDurationSec: clipCapSec,
            });
            if (isMediaTab) setKind('video');
          }
        } catch (err) {
          if (pickId !== mediaPickGenRef.current) return;
          if (isVideoFile(file) && file.size > 800) return;
          setError(err instanceof Error ? err.message : 'No se pudo leer el video');
        }
      })();
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

  useEffect(() => {
    if (!open) {
      seedAppliedRef.current = false;
      return;
    }
    if (seedAppliedRef.current) return;
    if (!seedFiles?.length && !seedCaption) return;
    seedAppliedRef.current = true;
    if (seedCaption) setCaption((current) => current || seedCaption);
    if (!seedFiles?.length) {
      if (seedCaption) setKind('text');
      return;
    }
    const photos = seedFiles.filter((file) => mediaKindFromFile(file) === 'photo');
    const videos = seedFiles.filter((file) => mediaKindFromFile(file) === 'video' || isVideoFile(file));
    if (videos[0]) {
      void onFileChange(videos[0], 'video');
      return;
    }
    if (photos.length > 0) {
      void cropPhotosFirst(photos).then((cropped) => {
        if (cropped.length > 1) appendAlbumPhotos(cropped);
        else if (cropped[0]) void onFileChange(cropped[0], 'photo');
      });
      return;
    }
    const audio = seedFiles.find((file) => String(file.type || '').startsWith('audio/'));
    if (audio) {
      setKind('text');
      setCaption((current) => current || `🎵 ${audio.name}`);
    }
    // Seed del sistema (Galería / Compartir).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, seedFiles, seedCaption]);

  useEffect(() => {
    if (!open) return;
    if (linkPreview && parseLocationUrl(linkPreview.url)) return;
    const url = extractFirstHttpUrl(caption);
    if (!url) {
      setLinkPreview(null);
      setLinkPreviewBusy(false);
      return;
    }
    if (linkPreview?.url && isSamePreviewUrl(linkPreview.url, url)) return;
    const reqId = ++linkPreviewReqRef.current;
    setLinkPreviewBusy(true);
    const timer = window.setTimeout(() => {
      void fetchLinkPreview(url, caption)
        .then((preview) => {
          if (reqId !== linkPreviewReqRef.current) return;
          setLinkPreview(preview);
        })
        .catch(() => {
          if (reqId !== linkPreviewReqRef.current) return;
          setLinkPreview(null);
        })
        .finally(() => {
          if (reqId !== linkPreviewReqRef.current) return;
          setLinkPreviewBusy(false);
        });
    }, 450);
    return () => window.clearTimeout(timer);
  }, [caption, open, linkPreview?.url]);

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

  function isCroppablePhoto(file: File) {
    return mediaKindFromFile(file) === 'photo' && file.type !== 'image/gif';
  }

  /** Paso 1 obligatorio: cada foto pasa por el recorte; videos y GIF siguen igual. */
  function cropPhotosFirst(files: readonly File[]): Promise<File[]> {
    const list = [...files];
    const first = composeTab === 'boomclip' ? -1 : list.findIndex(isCroppablePhoto);
    if (first < 0) return Promise.resolve(list);
    return new Promise((resolve) => {
      setCropSession({ files: list, index: first, done: list.slice(0, first), resolve });
    });
  }

  function advanceCrop(result: File) {
    const session = cropSession;
    if (!session) return;
    const done = [...session.done, result];
    let index = session.index + 1;
    while (index < session.files.length && !isCroppablePhoto(session.files[index]!)) {
      done.push(session.files[index]!);
      index += 1;
    }
    if (index >= session.files.length) {
      setCropSession(null);
      session.resolve(done);
      return;
    }
    setCropSession({ ...session, index, done });
  }

  function gatePhotos(files: FileList | null, next: (files: File[]) => void) {
    if (!files || files.length === 0) return;
    void cropPhotosFirst(Array.from(files)).then(next);
  }

  async function onMultiPhotoChange(files: FileList | readonly File[]) {
    setError(null);
    setMediaMenuOpen(false);
    if (composeTab === 'boomclip') {
      setError(
        `${BOOM_CLIP_LABEL} solo permite video. Si deseas publicar aquí, cambia el archivo o vuelve a Publicación.`,
      );
      return;
    }
    const picked = Array.from(files)
      .filter((f) => mediaKindFromFile(f) === 'photo')
      .slice(0, PUBLICATION_ALBUM_MAX);
    if (picked.length === 0) {
      setError('Archivo no compatible. Usa foto (JPG, PNG).');
      return;
    }
    if (files.length > PUBLICATION_ALBUM_MAX) {
      setError(`Se usaron las primeras ${PUBLICATION_ALBUM_MAX} fotos.`);
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
    picked.forEach((file) => prefetchImageForUpload(file));
  }

  function onGalleryPhotoChange(files: FileList | readonly File[] | null) {
    if (!files || files.length === 0) return;
    if (
      composeTab === 'publication' &&
      kind === 'photo' &&
      (albumUrls.length > 0 || Boolean(mediaFile))
    ) {
      appendAlbumPhotos(files);
      return;
    }
    if (composeTab === 'publication' && files.length > 1) {
      void onMultiPhotoChange(files);
      return;
    }
    void onFileChange(files[0] || null, 'photo');
  }

  function onGalleryMediaChange(files: FileList | readonly File[] | null) {
    if (!files || files.length === 0) return;
    const photos = Array.from(files).filter((file) => mediaKindFromFile(file) === 'photo');
    const hasVideo = Array.from(files).some((file) => mediaKindFromFile(file) === 'video');
    if (
      composeTab === 'publication' &&
      !hasVideo &&
      photos.length > 0 &&
      kind === 'photo' &&
      (albumUrls.length > 0 || Boolean(mediaFile))
    ) {
      appendAlbumPhotos(files);
      return;
    }
    if (composeTab === 'publication' && files.length > 1 && hasVideo && photos.length === 0) {
      onGalleryVideoChange(files);
      return;
    }
    if (composeTab === 'publication' && files.length > 1) {
      void onMultiPhotoChange(files);
      return;
    }
    void onFileChange(files[0] || null);
  }

  function cancelTrim() {
    const draft = trimDraft;
    setTrimDraft(null);
    if (draft?.url && draft.url !== previewUrl && !albumUrls.includes(draft.url)) {
      revokeLocalUrl(draft.url);
    }
  }

  function acceptTrim(file: File, durationSec?: number) {
    const draft = trimDraft;
    setTrimDraft(null);
    applyMediaFile(file, 'video', durationSec && durationSec > 0 ? durationSec : 0);
    if (draft?.url && draft.url !== previewUrl && !albumUrls.includes(draft.url)) {
      revokeLocalUrl(draft.url);
    }
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
    setAddMoreOpen(false);
    setCameraAppend(false);
    setCameraCaptureOpen(true);
  }

  function openAddGallery() {
    setError(null);
    setAddMoreOpen(false);
    const target = galleryAppendRef.current;
    if (!target) return;
    target.value = '';
    target.click();
  }

  function openAddCamera() {
    setError(null);
    setAddMoreOpen(false);
    setCameraAppend(true);
    setCameraCaptureOpen(true);
  }

  async function onCameraCapture(captured: File, durationSec?: number) {
    const file = isCroppablePhoto(captured) ? (await cropPhotosFirst([captured]))[0] ?? captured : captured;
    if (cameraAppend) {
      setCameraAppend(false);
      if ((mediaKindFromFile(file) || 'photo') === 'photo') {
        appendAlbumPhotos([file]);
        return;
      }
    }
    const detected = mediaKindFromFile(file) || 'video';
    await onFileChange(file, detected, durationSec);
  }

  const previewSrc = albumUrls[previewIndex] || previewUrl || gifAttach?.url || null;
  const hasMediaCanvas = Boolean(previewSrc);
  const slideCount = Math.max(albumUrls.length, previewSrc ? 1 : 0);
  const slideOverlays = overlays.filter((item) => (item.mediaIndex ?? 0) === previewIndex);
  const previewIsVideo = kind === 'video' && Boolean(previewUrl);
  const showVideoSet = composeTab === 'publication' && previewIsVideo;
  const stageExtraVideo = showVideoSet && videoSlide > 0 ? extraVideos[videoSlide - 1] ?? null : null;
  const currentEdit = photoEdits[previewIndex] ?? DEFAULT_PHOTO_EDIT;
  const photoStageOpen =
    photoEditOpen && !previewIsVideo && Boolean(mediaFile || gifAttach || (previewSrc && kind !== 'video'));
  const cropRatio = cropAspectRatio(currentEdit.crop);
  const previewNaturalSize = previewNatural && previewNatural.src === previewSrc ? previewNatural : null;
  const previewQuarterTurn = Math.abs(currentEdit.rotate % 180) === 90;
  /** Proporción de la foto tal como se publicará (recorte + giro), base de los stickers. */
  const publishAspect = previewIsVideo
    ? null
    : cropRatio ??
      (previewNaturalSize
        ? previewQuarterTurn
          ? previewNaturalSize.height / previewNaturalSize.width
          : previewNaturalSize.width / previewNaturalSize.height
        : null);

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
      prefetchImageForUpload(baked);
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

  function appendAlbumPhotos(files: FileList | readonly File[] | null) {
    if (!files || files.length === 0) return;
    if (composeTab !== 'publication') return;
    const picked = Array.from(files).filter((file) => mediaKindFromFile(file) === 'photo');
    if (picked.length === 0) {
      setError('Archivo no compatible. Usa foto (JPG, PNG).');
      return;
    }
    if (!mediaFile && mediaFiles.length === 0 && albumUrls.length === 0) {
      void onMultiPhotoChange(files);
      return;
    }
    const currentUrls = albumUrls.length ? albumUrls : previewUrl ? [previewUrl] : [];
    const room = PUBLICATION_ALBUM_MAX - currentUrls.length;
    if (room <= 0) {
      setError(`Puedes añadir hasta ${PUBLICATION_ALBUM_MAX} fotos en una publicación.`);
      return;
    }
    const accepted = picked.slice(0, room);
    if (picked.length > accepted.length) {
      setError(`Se añadieron ${accepted.length}. Máximo ${PUBLICATION_ALBUM_MAX} fotos.`);
    } else {
      setError(null);
    }
    const urls = accepted.map((file) => URL.createObjectURL(file));
    setMediaFiles((current) => {
      const base =
        current.length >= currentUrls.length
          ? current.slice(0, currentUrls.length)
          : [
              ...current,
              ...Array.from({ length: Math.max(0, currentUrls.length - current.length) }, () => null),
            ];
      if (!base[0] && mediaFile) base[0] = mediaFile;
      return [...base, ...accepted];
    });
    setAlbumUrls([...currentUrls, ...urls]);
    setKind('photo');
    const nextIndex = currentUrls.length;
    setPreviewIndex(nextIndex);
    setPreviewUrl(urls[0] ?? null);
    setMediaFile(accepted[0] ?? mediaFile);
    accepted.forEach((file) => prefetchImageForUpload(file));
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
      const pickId = mediaPickGenRef.current;
      let file = mediaFile;
      if (!file || mediaKindFromFile(file) !== 'video') {
        if (kind !== 'video' || !previewUrl) return;
        try {
          file = await fileFromMediaUrl(previewUrl, 'clip.mp4');
          if (pickId !== mediaPickGenRef.current) return;
          setMediaFile(file);
        } catch {
          setError('No se pudo cargar el video original para recortar.');
          return;
        }
      }
      const known = videoDurationSecRef.current;
      const maxSec =
        composeTab === 'flashboom'
          ? STORY_MAX_DURATION_SEC
          : composeTab === 'boomclip'
            ? MAX_CLIP_DURATION_SECONDS
            : known > 0
              ? known
              : 60 * 60;
      const sharedUrl = previewUrl?.startsWith('blob:') ? previewUrl : undefined;
      const url = sharedUrl || URL.createObjectURL(file);
      setTrimDraft({
        file,
        url,
        durationSec: known > 0 ? known : 0,
        maxDurationSec: maxSec,
      });
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
      scale: sticker.scale,
    });
  }

  async function publish() {
    if (!profile) {
      setError('Inicia sesión para publicar.');
      return;
    }
    if (isMediaTab) {
      if (!mediaFile && !(isEditMode && previewUrl) && reconstruction?.status !== 'ready') {
        setError(`Elige una foto o video para tu ${isFlashBoom ? FLASH_BOOM_LABEL : BOOM_CLIP_LABEL}.`);
      return;
    }
    } else if (
      kind === 'photo' &&
      !mediaFile &&
      !mediaFiles.some(Boolean) &&
      !gifAttach &&
      !albumUrls.length &&
      !previewUrl &&
      reconstruction?.status !== 'ready'
    ) {
      setError('Elige una foto, un video o escribe un post de texto.');
      return;
    }

    setBusy(true);
    setError(null);
    const controller = new AbortController();
    publishAbortRef.current = controller;
    const { signal } = controller;
    const jobId = startPublishJob(
      isFlashBoom ? FLASH_BOOM_LABEL : isBoomClip ? BOOM_CLIP_LABEL : isEditMode ? 'Editar publicación' : 'Publicación',
      () => controller.abort(),
    );
    publishJobIdRef.current = jobId;
    setPublishJobId(jobId);
    let jobResult: 'done' | 'error' | 'canceled' = 'error';
    let jobMessage: string | undefined;
    const throwIfCanceled = () => {
      if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
    };
    const onUploadProgress = (fraction: number) => {
      updatePublishJob(jobId, fraction >= 1 ? 'processing' : 'uploading', fraction * 100);
    };
    try {
      let durationSec = 0;
      const reconReady = reconstruction?.status === 'ready' && Boolean(reconstruction.result);
      let publishKind = reconReady ? (isBoomClip || isFlashBoom ? 'video' : 'photo') : kind;
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
      let reconstructionPayload = reconReady && reconstruction?.result ? reconstruction.result : undefined;
      if (reconReady && reconstruction?.result) {
        let frames = reconstruction.result.frameUrls;
        if (reconstruction.captures.some((item) => !item.remoteUrl) || frames.some((url) => url.startsWith('blob:'))) {
          try {
            const uploaded = await threeDReconstructionService.uploadCaptureImages(
              profile.firebaseUid,
              reconstruction.id,
              reconstruction.captures,
            );
            frames = uploaded.map((item) => item.remoteUrl || '').filter((url) => url.startsWith('http'));
          } catch {
            const fallback = await Promise.all(
              reconstruction.captures.map((item, index) =>
                uploadUserMedia(
                  profile.firebaseUid,
                  item.file,
                  `recon3d_${index + 1}.jpg`,
                  visibility,
                  'publication',
                ),
              ),
            );
            frames = fallback.map((item) => item.url);
          }
        }
        const httpFrames = frames.filter((url) => url.startsWith('http'));
        if (isBoomClip || isFlashBoom) {
          durationSec = isFlashBoom ? 4 : 8;
          uploadFile = await renderOrbitVideo({
            frameUrls: httpFrames.length ? httpFrames : reconstruction.result.frameUrls,
            durationSec,
            aspect: '9:16',
            motion: reconstruction.motion,
            edit: reconstruction.edit,
          });
        } else {
          const previewSrc = reconstruction.result.previewUrl || reconstruction.result.frameUrls[0];
          if (!previewSrc) throw new Error('La reconstrucción no tiene vista previa.');
          uploadFile = await reconstructionPreviewFile(previewSrc);
        }
        reconstructionPayload = {
          ...reconstruction.result,
          frameUrls: httpFrames,
          previewUrl:
            reconstruction.result.previewUrl && reconstruction.result.previewUrl.startsWith('http')
              ? reconstruction.result.previewUrl
              : httpFrames[0] || null,
          motion: reconstruction.motion,
          edit: reconstruction.edit,
          captureCount: httpFrames.length || reconstruction.result.frameUrls.length,
        };
      }
      const displayUrls = albumUrls.length ? albumUrls : previewUrl ? [previewUrl] : [];
      let albumForUpload: File[] = [];
      if (!reconReady && publishKind === 'photo' && displayUrls.length > 1) {
        albumForUpload = [];
        for (let index = 0; index < displayUrls.length; index += 1) {
          let file =
            mediaFiles[index] ||
            (index === 0 ? mediaFile || uploadFile : null) ||
            null;
          if (!file && displayUrls[index]) {
            file = await fileFromMediaUrl(displayUrls[index] as string, `photo_${index + 1}.jpg`);
          }
          if (!file) continue;
          const edit = photoEdits[index] ?? DEFAULT_PHOTO_EDIT;
          if (mediaKindFromFile(file) === 'photo' && !isDefaultPhotoEdit(edit)) {
            file = await bakePhotoEdit(file, edit);
          }
          albumForUpload.push(file);
        }
      } else if (!reconReady && publishKind === 'photo' && uploadFile && mediaKindFromFile(uploadFile) === 'photo') {
        const edit = photoEdits[previewIndex] ?? currentEdit;
        if (!isDefaultPhotoEdit(edit)) {
          uploadFile = await bakePhotoEdit(uploadFile, edit);
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

      throwIfCanceled();
      // Videos largos / música: moov al inicio para que Explorar arranque sin esperar el archivo
      // entero. Si el MP4 ya viene así, no se procesa de nuevo (sin pasadas ni copias extra).
      if (publishKind === 'video' && uploadFile) {
        try {
          const { remuxVideoFastStart, needsFastStartRemux } = await import('../../lib/videoTrim');
          if (await needsFastStartRemux(uploadFile, durationSec)) {
            uploadFile = await remuxVideoFastStart(uploadFile, signal, (p) =>
              updatePublishJob(jobId, 'preparing', p * 100),
            );
          }
        } catch {
          /* Si el remux falla, se publica el original. */
        }
      }
      throwIfCanceled();
      const extraVideoUploads: File[] = [];
      const extraVideoSlots: Array<{ file?: File; url?: string }> = [];
      if (publishKind === 'video' && !isBoomClip && !isFlashBoom && !reconReady && extraVideos.length) {
        for (const item of extraVideos.slice(0, PUBLICATION_VIDEO_MAX - 1)) {
          if (!item.file) {
            if (/^https?:\/\//i.test(item.url)) extraVideoSlots.push({ url: item.url });
            continue;
          }
          let extraFile: File = item.file;
          let extraDurationSec = 0;
          try {
            extraDurationSec = await readVideoDurationSec(extraFile);
          } catch {
            extraDurationSec = extraFile.size > 800 ? 1 : 0;
          }
          if (extraDurationSec < 1 && extraFile.size <= 800) {
            throw new Error('Cada video debe durar al menos 1 segundo.');
          }
          try {
            const { remuxVideoFastStart, needsFastStartRemux } = await import('../../lib/videoTrim');
            if (await needsFastStartRemux(extraFile, extraDurationSec)) {
              extraFile = await remuxVideoFastStart(extraFile, signal, (p) =>
                updatePublishJob(jobId, 'preparing', p * 100),
              );
            }
          } catch {
            /* Si el remux falla, se publica el original. */
          }
          throwIfCanceled();
          extraVideoUploads.push(extraFile);
          extraVideoSlots.push({ file: extraFile });
        }
      }
      updatePublishJob(jobId, uploadFile || albumForUpload.length ? 'uploading' : 'processing', 0);

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
          if (mediaSlots.length) mediaSlots = [...mediaSlots, ...extraVideoSlots];
        }
        const savedType =
          publishKind === 'text' && gifAttach && !mediaSlots.length ? 'photo' : publishKind;
        throwIfCanceled();
        updatePublishJob(jobId, 'processing');
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
          textStyle,
          textStyleRanges,
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
          textStyle: parsePostTextStyle(textStyle),
          textStyleRanges: textStyleRangesForTrimmed(caption, textStyleRanges, 2000),
          edited: true,
          updatedAt: new Date().toISOString(),
        });
        jobResult = 'done';
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
        extraVideoFiles: extraVideoUploads.length ? extraVideoUploads : undefined,
        mediaUrl: !uploadFile && gifAttach ? gifAttach.url : undefined,
        visibility,
        postFormat: publishPostFormat,
        durationSec,
        notifyFriends: visibility !== 'private' && notifyFriends,
        musicTrackId: selectedMusic?.trackId,
        musicStartSec: selectedMusic?.startSec,
        overlays,
        reconstruction3d: reconstructionPayload,
        linkPreview,
        textStyle,
        textStyleRanges,
        onUploadProgress,
        signal,
      });
      jobResult = 'done';

      onCreated?.({
        id: created.id,
        authorUid: profile.firebaseUid,
        authorUsername: profile.handle || username,
        type: created.mediaUrl && publishKind === 'text' ? 'photo' : publishKind,
        caption: caption.trim().slice(0, captionMax ?? 2000) || null,
        mediaUrl: created.mediaUrl,
        mediaUrls: created.mediaUrls,
        visibility: created.visibility,
        createdAt: created.createdAt || new Date().toISOString(),
        likes: 0,
        dislikes: 0,
        viewerReaction: null,
        postFormat: publishPostFormat || null,
        durationSec: durationSec || null,
        storyExpiresAtMs: created.storyExpiresAtMs ?? null,
        overlays,
        reconstruction3d: reconstructionPayload,
        linkPreview,
        textStyle: parsePostTextStyle(textStyle),
        textStyleRanges: textStyleRangesForTrimmed(caption, textStyleRanges, captionMax ?? 2000),
      });
      if (reconReady) clearReconstructionDraft();
      reset();
      closeModal();
    } catch (err) {
      if (signal.aborted || isUploadCanceled(err)) {
        jobResult = 'canceled';
        setError('Subida cancelada. Tu contenido sigue aquí para intentarlo de nuevo.');
      } else {
        jobMessage = err instanceof Error ? err.message : 'No se pudo publicar';
        setError(jobMessage);
      }
    } finally {
      finishPublishJob(jobId, jobResult, jobMessage);
      if (publishAbortRef.current === controller) publishAbortRef.current = null;
      publishJobIdRef.current = null;
      setPublishJobId(null);
      setBusy(false);
    }
  }

  const showVisibility = true;
  const showPanel = isInline || open;
  const isModalOpen = showPanel && !isInline;
  useBodyScrollLock(isModalOpen || cameraCaptureOpen);
  useBackLayer(isModalOpen, () => (discardOpen ? setDiscardOpen(false) : requestClose()));
  const modalTitle = isEditMode
    ? 'Editar publicación'
    : isFlashBoom
      ? FLASH_BOOM_LABEL
      : isBoomClip
        ? BOOM_CLIP_LABEL
        : 'Nueva publicación';
  const submitLabel = busy
    ? publishJob
      ? publishStageLabel(publishJob)
      : isEditMode
        ? 'Guardando…'
        : 'Preparando…'
    : isEditMode
      ? 'Guardar cambios'
      : 'Publicar';
  const publishProgress =
    busy && publishJob ? (
      <div className="lb-publish-inline mb-2" role="status" aria-live="polite">
        <div className="lb-publish-inline__row">
          <span>{publishStageLabel(publishJob)}</span>
        </div>
        {publishJob.stage === 'uploading' || publishJob.pct != null ? (
          <span className="lb-publish-progress__bar" aria-hidden>
            <span style={{ width: `${publishJob.pct ?? 0}%` }} />
          </span>
        ) : null}
        <div className="lb-publish-inline__actions">
          <button
            type="button"
            className="lb-publish-inline__btn"
            onClick={() => publishAbortRef.current?.abort()}
          >
            Cancelar subida
          </button>
          {!isInline ? (
            <button type="button" className="lb-publish-inline__btn" onClick={continueInBackground}>
              Seguir usando la app
            </button>
          ) : null}
        </div>
      </div>
    ) : null;
  const composeRows = 1;
  const composerTextStyle = textStyleProps(textStyle, textStyleRanges);
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
        onChange={(event) => gatePhotos(event.target.files, onGalleryPhotoChange)}
      />
      <input
        ref={galleryVideoRef}
        type="file"
        accept="video/*"
        multiple={composeTab === 'publication'}
        className="hidden"
        onChange={(event) => onGalleryVideoChange(event.target.files)}
      />
      <input
        ref={galleryExtraVideoRef}
        type="file"
        accept="video/*"
        multiple
        className="hidden"
        onChange={(event) => {
          addExtraVideos(Array.from(event.target.files || []));
          event.target.value = '';
        }}
      />
      <input
        ref={galleryMixedRef}
        type="file"
        accept={composeTab === 'boomclip' ? 'video/*' : 'image/*,video/*'}
        multiple={composeTab === 'publication'}
        className="hidden"
        onChange={(event) => gatePhotos(event.target.files, onGalleryMediaChange)}
      />
      <input
        ref={galleryAppendRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(event) => {
          gatePhotos(event.target.files, appendAlbumPhotos);
          event.target.value = '';
        }}
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
          productLabel={isFlashBoom ? FLASH_BOOM_LABEL : isBoomClip ? BOOM_CLIP_LABEL : 'Publicación'}
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
              <div className={`min-w-0 ${composerTextStyle.className}`} style={composerTextStyle.style}>
                <EmojiInput
                  ref={captionInputRef}
                  multiline
                  rows={composeRows}
                  value={caption}
                  onChange={setCaption}
                  maxLength={captionMax}
                  mirrorTextStyle={textStyle}
                  mirrorTextStyleRanges={textStyleRanges}
                  placeholder={
                    isFlashBoom
                      ? `Descripción (opcional)`
                      : composeTab === 'boomclip'
                        ? `Descripción ${BOOM_CLIP_LABEL} (opcional)`
                        : '¿Qué quieres compartir?'
                  }
                  emojiSize={POST_EMOJI_SIZE}
                  growToMaxScroll
                  fieldClassName="publication-composer-field w-full min-w-0 max-w-full rounded-xl"
                  padClassName="py-2 pl-3 pr-[3.75rem]"
                  mirrorTextClassName="publication-composer-text"
                  placeholderClassName="publication-composer-placeholder"
                />
              </div>
              <TextStyleButton
                value={textStyle}
                onChange={setTextStyle}
                text={caption}
                getSelection={() => captionInputRef.current?.getSelection()}
                ranges={textStyleRanges}
                onRangesChange={setTextStyleRanges}
              />
              {captionMax != null ? (
                <p
                  className={`pointer-events-none mt-1 pr-1 text-right text-[10px] font-semibold leading-none tabular-nums ${
                    caption.length >= captionMax ? 'text-fuchsia-300' : 'text-zinc-500'
                  }`}
                >
                  {caption.length}/{captionMax}
                </p>
              ) : null}
            </div>

            {linkPreviewBusy ? (
              <p className="px-1 text-[11px] text-zinc-500">Buscando carátula del enlace…</p>
            ) : null}
            {linkPreview ? (
              <LinkPreviewCard preview={linkPreview} onDismiss={() => setLinkPreview(null)} />
            ) : null}

            {reconstruction?.status === 'ready' && reconstruction.result ? (
              <div className="lb-recon3d-composer">
                <div className="flex items-center justify-between gap-2 px-3 py-2">
                  <Reconstruction3DBadge />
                  <span className="text-[11px] text-zinc-400">
                    Se mantiene al cambiar Publicación, Boom Clip o Flash Boom
                  </span>
                </div>
                <Reconstruction3DViewer payload={reconstruction.result} edit={reconstruction.edit} compact />
              </div>
            ) : null}

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
                      onPointerDown={onStagePointerDown}
                      onPointerMove={onStagePointerMove}
                      onPointerUp={onStagePointerUp}
                      onPointerCancel={onStagePointerUp}
                    >
                      <div
                        className={`relative min-h-0 overflow-hidden ${
                          publishAspect
                            ? 'lb-composer-photo-frame mx-auto shadow-[0_0_0_1px_rgba(255,255,255,0.22),0_8px_28px_rgba(0,0,0,0.45)]'
                            : 'max-h-full w-full'
                        }`}
                        style={
                          publishAspect
                            ? {
                                aspectRatio: String(publishAspect),
                                width: `min(100%, calc(min(56dvh, 28rem) * ${publishAspect.toFixed(4)}))`,
                              }
                            : undefined
                        }
                      >
                        {previewIsVideo ? (
                          <video
                            key={stageExtraVideo?.url || previewSrc || undefined}
                            src={stageExtraVideo?.url || previewSrc || undefined}
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
                            onLoad={(event) => {
                              const img = event.currentTarget;
                              const src = img.getAttribute('src');
                              if (!src || img.naturalWidth <= 0 || img.naturalHeight <= 0) return;
                              setPreviewNatural({ src, width: img.naturalWidth, height: img.naturalHeight });
                            }}
                            className={
                              !publishAspect
                                ? 'mx-auto max-h-[min(56dvh,28rem)] w-full select-none object-contain'
                                : previewQuarterTurn
                                  ? 'absolute left-1/2 top-1/2 max-w-none select-none object-cover'
                                  : 'absolute inset-0 h-full w-full select-none object-cover'
                            }
                            style={{
                              filter: photoCssFilter(currentEdit),
                              ...(publishAspect && previewQuarterTurn
                                ? {
                                    width: `${(100 / publishAspect).toFixed(4)}%`,
                                    height: `${(publishAspect * 100).toFixed(4)}%`,
                                  }
                                : null),
                              transform: `${publishAspect && previewQuarterTurn ? 'translate(-50%, -50%) ' : ''}translate(${
                                currentEdit.panX
                              }%, ${currentEdit.panY}%) scale(${currentEdit.zoom / 100}) rotate(${currentEdit.rotate}deg)`,
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
                        {stageExtraVideo ? null : (
                        <MediaOverlayLayer
                          overlays={slideOverlays}
                          editable
                          onChange={setSlideOverlays}
                        />
                        )}
                      </div>
                    </div>
                    <div className="absolute left-2 top-2 z-[6] flex max-w-[calc(100%-5.5rem)] flex-wrap items-center gap-1">
                      {stageExtraVideo ? null : (
                <button
                  type="button"
                        onClick={() => openGallery(composeTab === 'boomclip' ? 'video' : 'any')}
                        className="inline-flex min-h-9 items-center rounded-full border border-white/15 bg-black/55 px-2.5 text-[11px] font-semibold text-white backdrop-blur-sm"
                      >
                        Cambiar
                      </button>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          if (stageExtraVideo) {
                            removeExtraVideo(videoSlide - 1);
                            return;
                          }
                          if (showVideoSet && promoteExtraVideo()) return;
                          if (slideCount > 1) removeCurrentSlide();
                          else removeAttachedMedia();
                        }}
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
                      {stageExtraVideo ? null : (
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
                      )}
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
                    {editMenuOpen && previewIsVideo && !stageExtraVideo ? (
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
                    <div>
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
                      {slideCount < PUBLICATION_ALBUM_MAX ? (
                      <button
                        type="button"
                        onClick={() => setAddMoreOpen((open) => !open)}
                        aria-expanded={addMoreOpen}
                        aria-label="Agregar foto"
                        className="flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-xl border border-dashed border-white/25 text-[9px] font-semibold text-zinc-400"
                      >
                        <Plus size={14} />
                        Agregar
                      </button>
                      ) : null}
                </div>
                      {addMoreOpen && slideCount < PUBLICATION_ALBUM_MAX ? (
                        <div className="mt-2 flex gap-2">
                          <button
                            type="button"
                            onClick={openAddCamera}
                            className="inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-xl border border-white/15 bg-white/5 px-3 text-xs font-semibold text-white"
                          >
                            <Camera size={15} />
                            Cámara
                          </button>
                          <button
                            type="button"
                            onClick={openAddGallery}
                            className="inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-xl border border-white/15 bg-white/5 px-3 text-xs font-semibold text-white"
                          >
                            <Image size={15} />
                            Galería
                          </button>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                  {showVideoSet ? (
                    <div className="flex items-center gap-2 overflow-x-auto pb-1">
                      {[previewSrc, ...extraVideos.map((item) => item.url)].map((url, index) =>
                        url ? (
                          <button
                            key={`${url}-${index}`}
                            type="button"
                            onClick={() => {
                              setEditMenuOpen(false);
                              setVideoSlide(index);
                            }}
                            aria-label={`Video ${index + 1}`}
                            aria-pressed={index === videoSlide}
                            className={`relative h-14 w-14 shrink-0 overflow-hidden rounded-xl border bg-black ${
                              index === videoSlide ? 'border-fuchsia-400' : 'border-white/15'
                            }`}
                          >
                            <video
                              src={`${url}#t=0.1`}
                              muted
                              playsInline
                              preload="metadata"
                              className="pointer-events-none h-full w-full object-cover"
                            />
                            <span className="absolute bottom-0.5 left-0.5 rounded bg-black/65 px-1 text-[9px] font-bold text-white">
                              {index + 1}
                            </span>
                          </button>
                        ) : null,
                      )}
                      {1 + extraVideos.length < PUBLICATION_VIDEO_MAX ? (
                        <button
                          type="button"
                          onClick={openExtraVideoGallery}
                          aria-label="Agregar video"
                          className="flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-xl border border-dashed border-white/25 text-[9px] font-semibold text-zinc-400"
                        >
                          <Plus size={14} />
                          Video
                        </button>
                      ) : null}
                      <span className="shrink-0 text-[10px] font-semibold text-zinc-500">
                        {1 + extraVideos.length}/{PUBLICATION_VIDEO_MAX}
                      </span>
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
                onPick={(id) => captionInputRef.current?.insertToken(id)}
              />
                        <button
                          type="button"
                onClick={toggleMediaMenu}
                className={`lb-composer-attach inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center gap-1 rounded-lg border px-2 transition ${
                  mediaMenuOpen ? 'is-open' : ''
                }`}
                aria-label="Adjuntar foto o video"
                aria-expanded={mediaMenuOpen}
              >
                <Paperclip size={16} />
                <span className="hidden text-[11px] font-semibold sm:inline">Adjuntar</span>
                        </button>
              {mediaMenuOpen ? (
                <div
                  ref={mediaMenuPanelRef}
                  className={`lb-composer-attach-menu absolute left-0 z-20 w-[min(18.5rem,calc(100vw-2.5rem))] rounded-2xl p-px ${
                    mediaMenuBelow ? 'top-full mt-1.5' : 'bottom-full mb-1.5'
                  }`}
                >
                  <div className="lb-composer-attach-menu__inner overflow-hidden rounded-[15px]">
                    <button
                      type="button"
                      onClick={() => openGallery('any')}
                      className="flex min-h-14 w-full items-center gap-3 px-3.5 py-2.5 text-left transition hover:bg-white/5 active:bg-white/10"
                    >
                      <Image size={18} className="shrink-0 text-cyan-300" />
                      <span className="min-w-0">
                        <span className="lb-composer-attach-menu__title block text-sm font-bold">Galería</span>
                        <span className="lb-composer-attach-menu__sub block text-[11px] leading-snug">
                          Elige fotos o videos
                      </span>
                      </span>
                    </button>
                    <div className="lb-composer-attach-menu__rule mx-3 h-px" />
                    <button
                      type="button"
                      onClick={() => openCamera()}
                      className="flex min-h-14 w-full items-center gap-3 px-3.5 py-2.5 text-left transition hover:bg-white/5 active:bg-white/10"
                    >
                      <Camera size={18} className="shrink-0 text-zinc-100" />
                      <span className="min-w-0">
                        <span className="lb-composer-attach-menu__title block text-sm font-bold">Cámara</span>
                        <span className="lb-composer-attach-menu__sub block text-[11px] leading-snug">
                          Captura una foto o video
                        </span>
                      </span>
                    </button>
                    {composeTab === 'publication' ? (
                      <>
                        <div className="lb-composer-attach-menu__rule mx-3 h-px" />
                        <button
                          type="button"
                          onClick={() => {
                            setMediaMenuOpen(false);
                            setLocationPickerOpen(true);
                          }}
                          className="flex min-h-14 w-full items-center gap-3 px-3.5 py-2.5 text-left transition hover:bg-white/5 active:bg-white/10"
                        >
                          <MapPin size={18} className="shrink-0 text-cyan-300" />
                          <span className="min-w-0">
                            <span className="lb-composer-attach-menu__title block text-sm font-bold">Ubicación</span>
                            <span className="lb-composer-attach-menu__sub block text-[11px] leading-snug">
                              Comparte un mapa con tu ubicación
                            </span>
                          </span>
                        </button>
                      </>
                    ) : null}
                  </div>
                </div>
                ) : null}
              <button
                type="button"
                onClick={() => setGifPickerOpen(true)}
                className="lb-composer-gif inline-flex min-h-11 shrink-0 items-center justify-center rounded-lg px-2.5 text-[11px] font-bold"
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
              {composeTab !== 'boomclip' ? (
                <button
                  type="button"
                  onClick={() => {
                    setMediaMenuOpen(false);
                    setCollageOpen(true);
                  }}
                  className="inline-flex min-h-11 shrink-0 items-center justify-center gap-1 rounded-lg bg-gradient-to-r from-amber-400 to-orange-500 px-2.5 text-[11px] font-bold text-zinc-950"
                  aria-label="Collage"
                >
                  <LayoutGrid size={14} />
                  Collage
                </button>
              ) : null}
              {showVisibility ? (
                <div
                  className="lb-composer-privacy ml-auto flex min-h-11 min-w-0 max-w-full items-center rounded-lg p-0.5"
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
                      className={`lb-composer-privacy__opt inline-flex min-h-10 min-w-0 flex-1 items-center justify-center gap-1 rounded-md px-1.5 text-[10px] font-semibold sm:px-2 sm:text-[11px] ${
                        visibility === value ? 'is-active' : ''
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
      {!isModalOpen ? <div className="mt-3">{publishProgress}</div> : null}
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
    <div className="lb-composer-modal__foot shrink-0 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      {isFlashBoom ? (
        <p className="lb-composer-hint mb-2 text-center text-[10px]">{storyLifecycleHint()}</p>
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
      {publishProgress}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={requestClose} className="lb-composer-cancel px-4 py-2 text-sm">
          {busy ? 'Ocultar' : 'Cancelar'}
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
        className="lb-composer-overlay fixed inset-0 z-[100] flex items-end justify-center overscroll-none sm:items-center sm:p-4"
        onClick={(event) => {
          if (event.target === event.currentTarget) requestClose();
        }}
      >
        <div
          className="lb-composer-modal relative flex w-full flex-col overflow-hidden rounded-t-3xl sm:rounded-3xl"
          style={{
            maxHeight:
              'min(92dvh, calc(100dvh - env(safe-area-inset-top) - env(safe-area-inset-bottom) - 0.5rem))',
          }}
          onClick={(event) => event.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-labelledby="create-post-title"
        >
          <div className="lb-composer-modal__head flex shrink-0 items-center justify-between px-4 py-3">
            <h3 id="create-post-title" className="lb-composer-modal__title text-base font-bold">
              {modalTitle}
            </h3>
            <button
              type="button"
              onClick={requestClose}
              className="lb-composer-modal__close grid h-9 w-9 place-items-center rounded-full"
              aria-label="Cerrar"
            >
              <X size={18} />
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3">{panelBody}</div>
          {modalFooter}
          {discardOpen ? (
            <div className="lb-composer-discard absolute inset-0 z-[20] flex items-center justify-center p-4">
              <div className="lb-composer-discard__card w-full max-w-sm rounded-2xl p-4">
                <p className="lb-composer-discard__title text-sm font-bold">
                  {isEditMode ? '¿Descartar cambios?' : '¿Descartar el borrador?'}
                </p>
                <p className="lb-composer-discard__sub mt-1.5 text-xs leading-relaxed">
                  {isEditMode
                    ? 'Si sales ahora, la publicación original se mantiene igual.'
                    : 'Si sales ahora se perderán el archivo, el texto y las ediciones de esta publicación.'}
                </p>
                <div className="mt-4 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setDiscardOpen(false)}
                    className="lb-composer-cancel min-h-11 rounded-full px-4 text-sm"
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
          productLabel={isFlashBoom ? FLASH_BOOM_LABEL : isBoomClip ? BOOM_CLIP_LABEL : 'Publicación'}
          onCancel={cancelTrim}
          onSave={acceptTrim}
        />
      ) : null}
      {cropSession && cropSession.files[cropSession.index] ? (
        <PhotoCropEditor
          key={`${cropSession.index}-${cropSession.files.length}`}
          file={cropSession.files[cropSession.index]!}
          progressLabel={
            cropSession.files.filter(isCroppablePhoto).length > 1
              ? `Foto ${cropSession.files.slice(0, cropSession.index + 1).filter(isCroppablePhoto).length} de ${
                  cropSession.files.filter(isCroppablePhoto).length
                }`
              : undefined
          }
          onConfirm={advanceCrop}
          onCancel={() => advanceCrop(cropSession.files[cropSession.index]!)}
        />
      ) : null}
      <FlashBoomCameraCapture
        open={cameraCaptureOpen}
        onClose={() => {
          setCameraCaptureOpen(false);
          setCameraAppend(false);
        }}
        onCapture={(file, durationSec) => void onCameraCapture(file, durationSec)}
        title="Cámara"
        allowPhoto={composeTab !== 'boomclip'}
        allowVideo={!cameraAppend}
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
      <LocationShareModal
        open={locationPickerOpen}
        onClose={() => setLocationPickerOpen(false)}
        mode="pick"
        pickLabel="Adjuntar a la publicación"
        onPick={(loc) => {
          linkPreviewReqRef.current += 1;
          setLinkPreviewBusy(false);
          setLinkPreview(locationLinkPreview(loc));
        }}
      />
      <StickerPickerSheet
        open={stickerPickerOpen}
        onClose={() => setStickerPickerOpen(false)}
        onPick={pickSticker}
      />
      <CollageMakerSheet
        open={collageOpen}
        onClose={() => setCollageOpen(false)}
        initialFiles={
          kind === 'photo'
            ? (mediaFiles.length ? mediaFiles : [mediaFile]).filter((file): file is File => Boolean(file))
            : []
        }
        defaultAspect={composeTab === 'flashboom' ? '9:16' : '4:5'}
        onApply={(file) => {
          setCollageOpen(false);
          if (composeTab === 'boomclip') return;
          applyMediaFile(file, 'photo');
        }}
      />
    </>
  );
}
