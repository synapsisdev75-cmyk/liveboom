import { Radio, Flag } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { Link, useNavigate } from 'react-router-dom';
import { InAppFeedbackModal } from '../legal/InAppFeedbackModal';
import { UserAvatar } from '../profile/UserAvatar';
import { useBackLayer } from '../../lib/backLayer';
import {
  announcePlazaLiveReply,
  listenAuthorLive,
  listenCreatorClosing,
  listenExploreViewers,
  listenPlazaMessages,
  notifyCreatorPeopleWaiting,
  notifyCreatorPlazaMessage,
  publishExploreHeat,
  sendPlazaMessage,
  startExploreHeartbeat,
  type PlazaMessage,
  type PlazaViewer,
} from '../../lib/explorePresence';
import { useAuthStore } from '../../store/authStore';

const PREVIEW_MS = 20_000;

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
  const [threadOpen, setThreadOpen] = useState(autoOpenThread);
  const [messages, setMessages] = useState<PlazaMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [goingLive, setGoingLive] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportContext, setReportContext] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const arrivedRef = useRef<Map<string, number>>(new Map());
  const seededRef = useRef(false);
  const logRef = useRef<HTMLDivElement>(null);
  const autoOpenRef = useRef(autoOpenThread);
  autoOpenRef.current = autoOpenThread;

  useBackLayer(threadOpen, () => setThreadOpen(false));

  useEffect(() => {
    setThreadOpen(autoOpenRef.current);
    setDraft('');
    setViewers([]);
    setPresenceReady(false);
    setMessages([]);
    arrivedRef.current = new Map();
    seededRef.current = false;
  }, [postId]);

  useEffect(() => {
    if (autoOpenThread) setThreadOpen(true);
  }, [autoOpenThread]);

  useEffect(() => {
    setPresenceReady(false);
    return listenExploreViewers(postId, (people) => {
      setViewers(people);
      setPresenceReady(true);
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
    if (!presenceReady || !profile?.firebaseUid || !authorUid) return;
    if (liveOpen || viewers.length < 2) return;
    void notifyCreatorPeopleWaiting({ postId, authorUid, count: viewers.length });
  }, [presenceReady, profile?.firebaseUid, authorUid, liveOpen, viewers.length, postId]);

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
  const countLabel = viewers.length === 1 ? '1 en este video' : `${viewers.length} en este video`;
  const isAuthor = Boolean(profile?.firebaseUid && authorUid && profile.firebaseUid === authorUid);
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

  async function submitThread(event: FormEvent) {
    event.preventDefault();
    if (!profile?.firebaseUid || !profile.handle || sending) return;
    const text = draft.trim();
    if (!text) return;
    setSending(true);
    try {
      await sendPlazaMessage(postId, {
        uid: profile.firebaseUid,
        username: profile.handle,
        displayName: profile.displayName || profile.handle,
        avatarUrl: profile.avatarUrl,
      }, text);
      setDraft('');
      void notifyCreatorPlazaMessage({
        postId,
        authorUid,
        fromUid: profile.firebaseUid,
        fromName: profile.displayName || profile.handle,
        text,
        count: viewers.length,
      });
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
                  <span className="line-clamp-2 break-words text-white/90">{message.text}</span>
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
          <button
            type="button"
            className="lb-explore-plaza__count inline-flex min-h-11 items-center rounded-full border border-white/20 bg-black/55 px-3 text-xs font-semibold text-white backdrop-blur-md"
            onClick={() => setThreadOpen(true)}
            aria-expanded={threadOpen}
          >
            {countLabel}
          </button>
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
          aria-label="Plaza de este video"
        >
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="lb-explore-plaza__title text-sm font-bold text-white">Plaza</p>
            <div className="flex items-center gap-1">
              <button
                type="button"
                className="lb-explore-plaza__flag inline-flex min-h-11 min-w-11 items-center justify-center rounded-full text-amber-100"
                aria-label="Reportar plaza"
                onClick={() =>
                  openReport(`Plaza del video ${postId}. Autor @${authorUsername} (${authorUid}).`)
                }
              >
                <Flag size={16} />
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
              <p className="lb-explore-plaza__muted mb-1.5 text-[11px] text-white/70">Responde a tu plaza</p>
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
              <p className="lb-explore-plaza__muted text-xs text-white/70">Nadie ha escrito en este video todavía.</p>
            ) : (
              messages.map((message) =>
                isLiveReply(message) ? (
                <div key={message.id} className="rounded-xl border border-rose-400/40 bg-rose-500/15 p-2">
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
                <div key={message.id} className="flex items-start gap-2">
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
                    <p className="lb-explore-plaza__text text-sm leading-snug text-white">{message.text}</p>
                  </div>
                  <button
                    type="button"
                    className="lb-explore-plaza__flag inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center text-amber-100"
                    aria-label="Reportar mensaje"
                    onClick={() =>
                      openReport(
                        `Mensaje de plaza ${message.id} en el video ${postId}, de @${message.username} (${message.fromUid}): ${message.text}`,
                      )
                    }
                  >
                    <Flag size={14} />
                  </button>
                </div>
                ),
              )
            )}
          </div>
          {profile?.firebaseUid ? (
            <form className="mt-2 flex items-center gap-2" onSubmit={(event) => void submitThread(event)}>
              <input
                value={draft}
                onChange={(event) => setDraft(event.target.value.slice(0, 280))}
                placeholder="Escribe en la plaza"
                maxLength={280}
                className="lb-explore-plaza__input min-h-11 min-w-0 flex-1 rounded-full border border-white/15 bg-black/40 px-3 text-sm text-white outline-none"
              />
              <button
                type="submit"
                disabled={sending || !draft.trim()}
                className="lb-explore-plaza__send inline-flex min-h-11 items-center rounded-full bg-white px-3 text-xs font-bold text-black disabled:opacity-40"
              >
                Enviar
              </button>
            </form>
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

      <InAppFeedbackModal
        open={reportOpen}
        context={reportContext}
        onClose={() => setReportOpen(false)}
      />
    </>
  );
}
