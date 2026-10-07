import { Radio, Info, MessagesSquare, Reply, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useNavigate } from 'react-router-dom';
import { create } from 'zustand';
import { InAppFeedbackModal } from '../legal/InAppFeedbackModal';
import { UserAvatar } from '../profile/UserAvatar';
import { CommentComposerBar, type CommentDraftAttachment } from '../social/CommentComposerBar';
import { ReelGiftControls } from './ReelGiftControls';
import { CommentMediaThumb } from '../social/CommentMediaThumb';
import { CommentMediaViewer, type CommentMediaViewerItem } from '../social/CommentMediaViewer';
import { EmojiText } from '../social/EmojiText';
import type { EmojiInputHandle } from '../social/EmojiInput';
import { StyledText } from '../social/StyledText';
import { useBackLayer } from '../../lib/backLayer';
import { COMMENT_EMOJI_SIZE } from '../../lib/liveboomEmojis';
import {
  textStyleProps,
  useTextStyleFontsIn,
  useTextStyleRangesDraft,
  type PostTextStyle,
} from '../../lib/postTextStyle';
import type { PostCommentMedia } from '../../lib/socialFirestore';
import { uploadUserMedia } from '../../lib/storage';
import {
  announcePlazaLiveReply,
  listenAuthorLive,
  listenCreatorClosing,
  listenExploreViewers,
  listenPlazaMessages,
  notifyCreatorPlazaMessage,
  plazaMediaLabel,
  publishExploreHeat,
  sendPlazaMessage,
  startExploreHeartbeat,
  type PlazaMessage,
  type PlazaReplyRef,
  type PlazaViewer,
} from '../../lib/explorePresence';
import { useAuthStore } from '../../store/authStore';

const PREVIEW_MS = 20_000;

/** Chat del video activo: lo abre la barra lateral y lo muestra la plaza. */
const usePlazaUi = create<{ postId: string | null; viewers: number; open: boolean }>(() => ({
  postId: null,
  viewers: 0,
  open: false,
}));

function viewersLabel(count: number) {
  return count === 1 ? '1 en este video' : `${count} en este video`;
}

/** Botón "Chat del video" de la barra lateral de Explorar. */
export function ExplorePlazaRailButton({ postId }: { postId: string }) {
  const open = usePlazaUi((state) => state.open && state.postId === postId);
  const viewers = usePlazaUi((state) => (state.postId === postId ? state.viewers : 0));
  return (
    <div className="relative flex flex-col items-center gap-[var(--lb-action-gap,0.2rem)]">
      <div className="relative">
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            usePlazaUi.setState({ postId, open: !open });
          }}
          className={`lb-action-rail__btn grid place-items-center rounded-full shadow-lg backdrop-blur-sm transition ${
            open ? 'bg-cyan-500 text-zinc-950' : 'bg-black/55 text-white'
          }`}
          aria-label={viewers > 0 ? `Chat del video, ${viewersLabel(viewers)}` : 'Chat del video'}
          aria-expanded={open}
        >
          <MessagesSquare className="lb-action-rail__icon" size={20} aria-hidden />
        </button>
        {viewers > 1 ? (
          <span
            className="pointer-events-none absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-fuchsia-500 px-1 text-[9px] font-black tabular-nums text-white ring-2 ring-black/60"
            aria-hidden
          >
            {viewers}
          </span>
        ) : null}
      </div>
      <span className="lb-action-rail__label max-w-[4.5rem] text-center font-bold leading-tight text-white drop-shadow">
        Chat del video
      </span>
    </div>
  );
}

type Props = {
  postId: string;
  authorUid: string;
  authorUsername: string;
  /** Llegó desde una notificación de plaza: abrir el chat de una vez. */
  autoOpenThread?: boolean;
};

export function ExplorePlaza({ postId, authorUid, authorUsername, autoOpenThread = false }: Props) {
  const navigate = useNavigate();
  const profile = useAuthStore((state) => state.profile);
  const [viewers, setViewers] = useState<PlazaViewer[]>([]);
  const [presenceReady, setPresenceReady] = useState(false);
  const [liveOpen, setLiveOpen] = useState(false);
  const [closingNote, setClosingNote] = useState('');
  const threadOpen = usePlazaUi((state) => state.open && state.postId === postId);
  const setThreadOpen = useCallback((open: boolean) => usePlazaUi.setState({ postId, open }), [postId]);
  const [messages, setMessages] = useState<PlazaMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [textStyle, setTextStyle] = useState<PostTextStyle | null>(null);
  const [textStyleRanges, setTextStyleRanges] = useTextStyleRangesDraft(draft);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [mediaViewer, setMediaViewer] = useState<CommentMediaViewerItem | null>(null);
  const closeMediaViewer = useCallback(() => setMediaViewer(null), []);
  const [goingLive, setGoingLive] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportContext, setReportContext] = useState<string | null>(null);
  const [replyTo, setReplyTo] = useState<PlazaReplyRef | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const arrivedRef = useRef<Map<string, number>>(new Map());
  const seededRef = useRef(false);
  const logRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<EmojiInputHandle>(null);

  useEffect(() => setReplyTo(null), [postId]);

  function startReply(message: PlazaMessage) {
    setReplyTo({
      id: message.id,
      name: message.displayName || message.username,
      text: message.text || `[${plazaMediaLabel(message.mediaType)}]`,
    });
    composerRef.current?.focus();
  }
  const autoOpenRef = useRef(autoOpenThread);
  autoOpenRef.current = autoOpenThread;

  useBackLayer(threadOpen, () => setThreadOpen(false));

  useEffect(() => () => usePlazaUi.setState({ postId: null, viewers: 0, open: false }), []);

  useEffect(() => {
    usePlazaUi.setState({ postId, viewers: 0, open: autoOpenRef.current });
    setDraft('');
    setSendError(null);
    setViewers([]);
    setPresenceReady(false);
    setMessages([]);
    arrivedRef.current = new Map();
    seededRef.current = false;
  }, [postId]);

  useEffect(() => {
    if (autoOpenThread) setThreadOpen(true);
  }, [autoOpenThread, setThreadOpen]);

  useEffect(() => {
    setPresenceReady(false);
    return listenExploreViewers(postId, (people) => {
      setViewers(people);
      setPresenceReady(true);
      usePlazaUi.setState({ postId, viewers: people.length });
    });
  }, [postId]);

  useEffect(() => {
    if (!profile?.firebaseUid || !profile.handle) return;
    return startExploreHeartbeat(postId, {
      uid: profile.firebaseUid,
      username: profile.handle,
      displayName: profile.displayName || profile.handle,
      avatarUrl: profile.avatarUrl,
    });
  }, [postId, profile?.firebaseUid, profile?.handle, profile?.displayName, profile?.avatarUrl]);

  useEffect(() => {
    if (!profile?.firebaseUid || !presenceReady) return;
    publishExploreHeat(postId, viewers.length);
  }, [postId, profile?.firebaseUid, viewers.length, presenceReady]);

  useEffect(() => listenAuthorLive(authorUsername, setLiveOpen), [authorUsername]);
  useEffect(() => listenCreatorClosing(authorUsername, setClosingNote), [authorUsername]);

  useEffect(() => {
    if (!profile?.firebaseUid) return;
    return listenPlazaMessages(postId, (list) => {
      const arrived = arrivedRef.current;
      const at = seededRef.current ? Date.now() : 0;
      for (const message of list) {
        if (!arrived.has(message.id)) arrived.set(message.id, at);
      }
      seededRef.current = true;
      setMessages(list);
    });
  }, [postId, profile?.firebaseUid]);

  useEffect(() => {
    const latest = Math.max(0, ...Array.from(arrivedRef.current.values()));
    setNow(Date.now());
    if (Date.now() - latest >= PREVIEW_MS) return;
    const timer = window.setInterval(() => {
      const at = Date.now();
      setNow(at);
      if (at - latest >= PREVIEW_MS) window.clearInterval(timer);
    }, 4000);
    return () => window.clearInterval(timer);
  }, [messages]);

  useEffect(() => {
    if (!threadOpen) return;
    const log = logRef.current;
    if (log) log.scrollTop = log.scrollHeight;
  }, [threadOpen, messages.length]);

  const others = viewers.filter((viewer) => viewer.uid !== profile?.firebaseUid);
  const shown = [...others, ...viewers.filter((viewer) => viewer.uid === profile?.firebaseUid)].slice(0, 3);
  const isAuthor = Boolean(profile?.firebaseUid && authorUid && profile.firebaseUid === authorUid);
  useTextStyleFontsIn(messages);
  const previews = threadOpen
    ? []
    : messages
        .filter((message) => {
          const at = arrivedRef.current.get(message.id) || 0;
          return at > 0 && now - at < PREVIEW_MS;
        })
        .slice(-2);

  function isLiveReply(message: PlazaMessage) {
    return message.kind === 'live_reply' && Boolean(authorUid) && message.fromUid === authorUid;
  }

  async function replyInLive() {
    if (!profile?.firebaseUid || !profile.handle || goingLive) return;
    setGoingLive(true);
    try {
      await announcePlazaLiveReply(postId, {
        uid: profile.firebaseUid,
        username: profile.handle,
        displayName: profile.displayName || profile.handle,
        avatarUrl: profile.avatarUrl,
      }).catch(() => undefined);
      setThreadOpen(false);
      navigate('/transmitir');
    } finally {
      setGoingLive(false);
    }
  }

  function openMessage(viewer: PlazaViewer) {
    if (!viewer.username || viewer.uid === profile?.firebaseUid) return;
    navigate(`/mensajes?con=${encodeURIComponent(viewer.username)}`);
  }

  function openReport(context: string) {
    setReportContext(context);
    setReportOpen(true);
  }

  async function publishThread(attachment: CommentDraftAttachment | null) {
    if (!profile?.firebaseUid || !profile.handle || sending) return;
    const text = draft;
    if (!text.trim() && !attachment) return;
    setSending(true);
    setSendError(null);
    try {
      let media: PostCommentMedia | null = null;
      if (attachment?.kind === 'gif' && attachment.gifUrl) {
        media = {
          mediaUrl: attachment.gifUrl,
          mediaType: 'gif',
          mediaPreviewUrl: attachment.gifPreviewUrl || attachment.previewUrl,
        };
      } else if (attachment?.kind === 'sticker' && attachment.stickerUrl) {
        media = { mediaUrl: attachment.stickerUrl, mediaType: 'sticker' };
      } else if (attachment?.file) {
        const uploaded = await uploadUserMedia(
          profile.firebaseUid,
          attachment.file,
          attachment.file.name,
          'public',
          'publication',
        );
        media = { mediaUrl: uploaded.url, mediaType: attachment.kind === 'video' ? 'video' : 'image' };
      }
      await sendPlazaMessage(
        postId,
        {
          uid: profile.firebaseUid,
          username: profile.handle,
          displayName: profile.displayName || profile.handle,
          avatarUrl: profile.avatarUrl,
        },
        text,
        'text',
        { media, textStyle, textStyleRanges, replyTo },
      );
      setDraft('');
      setReplyTo(null);
      void notifyCreatorPlazaMessage({
        postId,
        authorUid,
        fromUid: profile.firebaseUid,
        fromName: profile.displayName || profile.handle,
        text: text.trim() || `[${plazaMediaLabel(media?.mediaType ?? null)}]`,
        count: viewers.length,
      });
    } catch (err) {
      setSendError(err instanceof Error ? err.message : 'No se pudo enviar el mensaje');
      throw err;
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      <div className="lb-explore-plaza pointer-events-none absolute inset-x-0 bottom-0 z-[34] flex flex-col items-end gap-1.5 pl-[max(0.65rem,var(--lb-safe-left))] pr-[max(0.65rem,var(--lb-safe-right))]">
        {closingNote ? (
          <p className="lb-explore-plaza__closing pointer-events-none max-w-[min(100%,20rem)] rounded-2xl bg-black/55 px-3 py-1.5 text-xs font-medium leading-snug text-white backdrop-blur-md">
            {closingNote}
          </p>
        ) : null}
        {previews.length > 0 ? (
          <div className="lb-explore-plaza__previews flex max-w-[min(100%,17rem)] flex-col items-end gap-1" aria-live="polite">
            {previews.map((message) => (
              <button
                key={message.id}
                type="button"
                className={`pointer-events-auto flex min-h-11 max-w-full items-center gap-2 rounded-2xl px-2.5 py-1.5 text-left backdrop-blur-md ${
                  isLiveReply(message) ? 'bg-rose-500/80' : 'bg-black/55'
                }`}
                onClick={(event) => {
                  event.stopPropagation();
                  setThreadOpen(true);
                }}
              >
                <UserAvatar
                  src={message.avatarUrl}
                  uid={message.fromUid}
                  username={message.username}
                  displayName={message.displayName}
                  size={22}
                />
                <span className="min-w-0 text-xs leading-snug text-white">
                  <span className="font-semibold">{message.displayName || message.username}</span>{' '}
                  <span className="line-clamp-2 break-words text-white/90">
                    {message.text ? (
                      <EmojiText text={message.text} size={16} />
                    ) : (
                      plazaMediaLabel(message.mediaType)
                    )}
                  </span>
                </span>
              </button>
            ))}
          </div>
        ) : null}
        <div className="lb-explore-plaza__bar pointer-events-auto flex max-w-[min(100%,18rem)] flex-wrap items-center justify-end gap-1.5">
          {shown.map((viewer) => (
            <button
              key={viewer.uid}
              type="button"
              className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-full"
              aria-label={
                viewer.uid === profile?.firebaseUid
                  ? 'Tú en este video'
                  : `Mensaje a ${viewer.displayName || viewer.username}`
              }
              onClick={(event) => {
                event.stopPropagation();
                openMessage(viewer);
              }}
            >
              <UserAvatar
                src={viewer.avatarUrl}
                uid={viewer.uid}
                username={viewer.username}
                displayName={viewer.displayName}
                size={28}
              />
            </button>
          ))}
          {liveOpen && authorUsername ? (
            <Link
              to={`/stream/${encodeURIComponent(authorUsername)}`}
              state={{ fromExplore: postId, fromExploreAuthorUid: authorUid }}
              className="inline-flex min-h-11 items-center gap-1 rounded-full bg-rose-500/90 px-3 text-xs font-bold text-white"
            >
              <Radio size={14} aria-hidden />
              En vivo
            </Link>
          ) : null}
        </div>
      </div>

      {threadOpen && typeof document !== 'undefined'
        ? createPortal(
        <div
          className="lb-explore-plaza__sheet pointer-events-auto"
          role="dialog"
          aria-label="Chat del video"
        >
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="lb-explore-plaza__title text-sm font-bold text-white">Chat del video</p>
            <div className="flex items-center gap-1">
              <button
                type="button"
                className="lb-explore-plaza__flag inline-flex min-h-11 min-w-11 items-center justify-center rounded-full text-white/80"
                aria-label="Reportar chat del video"
                title="Reportar chat del video"
                onClick={() =>
                  openReport(`Plaza del video ${postId}. Autor @${authorUsername} (${authorUid}).`)
                }
              >
                <Info size={18} />
              </button>
              <button
                type="button"
                className="lb-explore-plaza__close inline-flex min-h-11 items-center rounded-full px-3 text-xs font-semibold text-white/80"
                onClick={() => setThreadOpen(false)}
              >
                Cerrar
              </button>
            </div>
          </div>
          {isAuthor ? (
            <div className="lb-explore-plaza__author mb-2 rounded-xl border border-white/10 bg-white/[0.04] p-2">
              <p className="lb-explore-plaza__muted mb-1.5 text-[11px] text-white/70">Responde al chat de tu video</p>
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  disabled={goingLive}
                  onClick={() => void replyInLive()}
                  className="inline-flex min-h-11 flex-1 items-center justify-center gap-1 rounded-full bg-rose-500 px-3 text-xs font-bold text-white disabled:opacity-50"
                >
                  <Radio size={14} aria-hidden />
                  Responder en LIVE
                </button>
                <p className="lb-explore-plaza__muted flex min-h-11 flex-1 items-center justify-center text-center text-[11px] text-white/60">
                  o escribe abajo en el chat
                </p>
              </div>
            </div>
          ) : null}
          <div ref={logRef} className="lb-explore-plaza__log min-h-0 flex-1 space-y-2 overflow-y-auto">
            {messages.length === 0 ? (
              <p className="lb-explore-plaza__muted text-xs text-white/70">No hay mensajes recientes. Cada mensaje se borra a los 3 minutos.</p>
            ) : (
              messages.map((message) =>
                isLiveReply(message) ? (
                <div
                  key={message.id}
                  className={`lb-explore-plaza__msg rounded-xl border border-rose-400/40 bg-rose-500/15 p-2 ${
                    message.leaving ? 'is-leaving' : ''
                  }`}
                >
                  <p className="lb-explore-plaza__live-label flex items-center gap-1 text-[11px] font-bold text-rose-200">
                    <Radio size={12} aria-hidden />
                    {message.displayName || message.username} responde en LIVE
                  </p>
                  <p className="lb-explore-plaza__text mt-0.5 text-sm leading-snug text-white">{message.text}</p>
                  {liveOpen && authorUsername ? (
                    <Link
                      to={`/stream/${encodeURIComponent(authorUsername)}`}
                      state={{ fromExplore: postId, fromExploreAuthorUid: authorUid }}
                      className="mt-1.5 inline-flex min-h-11 items-center gap-1 rounded-full bg-rose-500 px-3 text-xs font-bold text-white"
                    >
                      <Radio size={14} aria-hidden />
                      Ver LIVE
                    </Link>
                  ) : (
                    <p className="lb-explore-plaza__muted mt-1 text-[11px] text-white/60">Preparando el LIVE…</p>
                  )}
                </div>
                ) : (
                <div
                  key={message.id}
                  className={`lb-explore-plaza__msg flex items-start gap-2 ${message.leaving ? 'is-leaving' : ''}`}
                >
                  <button
                    type="button"
                    className="mt-0.5 shrink-0 rounded-full"
                    aria-label={`Mensaje a ${message.displayName || message.username}`}
                    onClick={() =>
                      openMessage({
                        uid: message.fromUid,
                        username: message.username,
                        displayName: message.displayName,
                        avatarUrl: message.avatarUrl,
                      })
                    }
                  >
                    <UserAvatar
                      src={message.avatarUrl}
                      uid={message.fromUid}
                      username={message.username}
                      displayName={message.displayName}
                      size={28}
                    />
                  </button>
                  <div className="min-w-0 flex-1">
                    <p className="lb-explore-plaza__name truncate text-[11px] font-semibold text-white/80">
                      {message.displayName || message.username}
                    </p>
                    {message.replyTo ? (
                      <p className="lb-explore-plaza__quote mt-0.5 line-clamp-2 border-l-2 border-cyan-300/70 pl-2 text-[11px] leading-snug text-white/75">
                        <span className="font-semibold">{message.replyTo.name}</span>
                        {message.replyTo.text ? (
                          <>
                            {': '}
                            <EmojiText text={message.replyTo.text} size={14} />
                          </>
                        ) : null}
                      </p>
                    ) : null}
                    {message.text ? (
                      <p
                        className={`lb-explore-plaza__text break-words text-sm leading-snug text-white ${
                          textStyleProps(message.textStyle, message.textStyleRanges).className
                        }`}
                        style={textStyleProps(message.textStyle, message.textStyleRanges).style}
                      >
                        <StyledText
                          text={message.text}
                          textStyle={message.textStyle}
                          textStyleRanges={message.textStyleRanges}
                          size={COMMENT_EMOJI_SIZE}
                        />
                      </p>
                    ) : null}
                    {message.mediaUrl && message.mediaType ? (
                      <div className="mt-1.5 min-w-0 max-w-full">
                        <CommentMediaThumb
                          url={message.mediaUrl}
                          previewUrl={message.mediaType === 'gif' ? null : message.mediaPreviewUrl}
                          kind={message.mediaType}
                          size="thread"
                          inlinePlay
                          onOpen={() =>
                            setMediaViewer({
                              url: message.mediaUrl!,
                              kind: message.mediaType!,
                              previewUrl: message.mediaPreviewUrl,
                            })
                          }
                        />
                      </div>
                    ) : null}
                    {profile?.firebaseUid && message.fromUid !== profile.firebaseUid ? (
                      <button
                        type="button"
                        className="lb-explore-plaza__reply -mb-2 -ml-2 inline-flex min-h-11 items-center gap-1 rounded-full px-2 text-[11px] font-semibold text-cyan-200"
                        aria-label={`Responder a ${message.displayName || message.username}`}
                        onClick={() => startReply(message)}
                      >
                        <Reply size={13} aria-hidden />
                        Responder
                      </button>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    className="lb-explore-plaza__flag inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center text-white/70"
                    aria-label="Reportar mensaje"
                    title="Reportar mensaje"
                    onClick={() =>
                      openReport(
                        `Mensaje de plaza ${message.id} en el video ${postId}, de @${message.username} (${message.fromUid}): ${message.text}`,
                      )
                    }
                  >
                    <Info size={15} />
                  </button>
                </div>
                ),
              )
            )}
          </div>
          {profile?.firebaseUid ? (
            <div className="lb-explore-plaza__composer mt-2 min-w-0">
              {sendError ? <p className="lb-explore-plaza__error mb-1 text-[11px] text-rose-300">{sendError}</p> : null}
              {replyTo ? (
                <div className="lb-explore-plaza__replying mb-1 flex min-w-0 items-center gap-2 rounded-xl border-l-2 border-cyan-300 bg-black/45 pl-2.5">
                  <p className="min-w-0 flex-1 truncate py-1 text-[11px] leading-snug text-white/85">
                    <span className="font-semibold text-cyan-200">Respondiendo a {replyTo.name}</span>
                    {replyTo.text ? (
                      <>
                        {': '}
                        <EmojiText text={replyTo.text} size={14} />
                      </>
                    ) : null}
                  </p>
                  <button
                    type="button"
                    className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center text-white/75"
                    aria-label="Cancelar respuesta"
                    title="Cancelar respuesta"
                    onClick={() => setReplyTo(null)}
                  >
                    <X size={16} />
                  </button>
                </div>
              ) : null}
              <CommentComposerBar
                ref={composerRef}
                value={draft}
                onChange={setDraft}
                onPublish={publishThread}
                busy={sending}
                placeholder="Escribe un mensaje"
                textStyle={textStyle}
                onTextStyleChange={setTextStyle}
                textStyleRanges={textStyleRanges}
                onTextStyleRangesChange={setTextStyleRanges}
                mediaMode="videoNote"
                extraTool={
                  authorUsername ? (
                    <ReelGiftControls
                      tool
                      authorUsername={authorUsername}
                      authorUid={authorUid}
                      postId={postId}
                      layoutContext="boom_clip"
                    />
                  ) : null
                }
              />
            </div>
          ) : (
            <Link
              to="/login"
              className="lb-explore-plaza__login mt-2 inline-flex min-h-11 items-center text-sm font-semibold text-cyan-200"
            >
              Inicia sesión para hablar
            </Link>
          )}
        </div>,
            document.body,
          )
        : null}

      <CommentMediaViewer item={mediaViewer} onClose={closeMediaViewer} />

      <InAppFeedbackModal
        open={reportOpen}
        context={reportContext}
        onClose={() => setReportOpen(false)}
      />
    </>
  );
}
