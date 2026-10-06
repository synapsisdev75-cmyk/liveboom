import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Check,
  Copy,
  Globe,
  Lock,
  MapPin,
  MessageCircle,
  PenLine,
  Radio,
  RefreshCw,
  Search,
  Square,
  Users,
  X,
} from 'lucide-react';
import { useBackLayer } from '../../lib/backLayer';
import { useBodyScrollLock } from '../../lib/useBodyScrollLock';
import {
  buildLocationUrl,
  formatRemaining,
  LIVE_LOCATION_DURATIONS,
  locateErrorMessage,
  locateOnce,
  locationLinkPreview,
  LOCATION_MESSAGE_TEXT,
  whatsappShareUrl,
  type SharedLocation,
} from '../../lib/locationShare';
import { useLiveLocationShare, useNow } from '../../lib/liveLocation';
import { reverseGeocode } from '../../lib/userLocation';
import { createPost, listenFriends, sendChatMessage, type FriendChip } from '../../lib/socialFirestore';
import { useAuthStore } from '../../store/authStore';
import { UserAvatar } from '../profile/UserAvatar';

const LocationMap = lazy(() => import('./LocationMap'));

type Props = {
  open: boolean;
  onClose: () => void;
  /** pick: devuelve la ubicación elegida (chat, compositor). share: destinos para compartirla. */
  mode: 'pick' | 'share';
  initial?: SharedLocation | null;
  pickLabel?: string;
  onPick?: (loc: SharedLocation) => void | Promise<void>;
  /** Pestaña al abrir; por defecto "En tiempo real" solo si ya la estás compartiendo. */
  initialKind?: 'now' | 'live';
};

type Panel = 'none' | 'chat' | 'post';

async function labelFor(lat: number, lng: number): Promise<string> {
  try {
    const geo = await reverseGeocode(lat, lng);
    return [geo.city, geo.regionLabel].filter(Boolean).join(' · ');
  } catch {
    return '';
  }
}

export function LocationShareModal({
  open,
  onClose,
  mode,
  initial = null,
  pickLabel = 'Enviar ubicación',
  onPick,
  initialKind,
}: Props) {
  const profile = useAuthStore((state) => state.profile);
  const [loc, setLoc] = useState<SharedLocation | null>(initial);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [panel, setPanel] = useState<Panel>('none');
  const [copied, setCopied] = useState(false);
  const [friends, setFriends] = useState<FriendChip[]>([]);
  const [query, setQuery] = useState('');
  const [sentTo, setSentTo] = useState<Record<string, 'sending' | 'sent' | 'error'>>({});
  const [caption, setCaption] = useState('');
  const [visibility, setVisibility] = useState<'public' | 'friends' | 'private'>('friends');
  const [posted, setPosted] = useState(false);
  const [kind, setKind] = useState<'now' | 'live'>('now');
  const [liveMinutes, setLiveMinutes] = useState<number>(60);
  const liveShareId = useLiveLocationShare((state) => state.shareId);
  const liveLat = useLiveLocationShare((state) => state.lat);
  const liveLng = useLiveLocationShare((state) => state.lng);
  const liveAccuracy = useLiveLocationShare((state) => state.accuracy);
  const liveLabel = useLiveLocationShare((state) => state.label);
  const liveOwner = useLiveLocationShare((state) => state.ownerUid);
  const liveExpiresAt = useLiveLocationShare((state) => state.expiresAtMs);
  const liveUntilOff = useLiveLocationShare((state) => state.untilOff);
  const liveStarting = useLiveLocationShare((state) => state.starting);
  const liveError = useLiveLocationShare((state) => state.error);
  const startLive = useLiveLocationShare((state) => state.start);
  const stopLive = useLiveLocationShare((state) => state.stop);
  const liveActive = Boolean(liveShareId);
  const now = useNow(open && liveActive);
  const liveLoc: SharedLocation | null =
    liveShareId && liveLat !== null && liveLng !== null
      ? {
          lat: liveLat,
          lng: liveLng,
          accuracy: liveAccuracy,
          label: liveLabel,
          liveId: liveShareId,
          uid: liveOwner || profile?.firebaseUid,
          handle: profile?.handle,
        }
      : null;
  const shareLoc = kind === 'live' ? liveLoc : loc;
  const mapPerson = (target: SharedLocation) => ({
    uid: target.uid,
    handle: target.handle,
    avatarUrl: target.uid && target.uid === profile?.firebaseUid ? profile?.avatarUrl : null,
    displayName: target.uid && target.uid === profile?.firebaseUid ? profile?.displayName : null,
  });

  useBodyScrollLock(open);
  useBackLayer(open, onClose);

  useEffect(() => {
    if (!open) return;
    setLoc(initial);
    setError('');
    setBusy(false);
    setPanel('none');
    setCopied(false);
    setQuery('');
    setSentTo({});
    setCaption('');
    setPosted(false);
    setKind(initialKind ?? (!initial && useLiveLocationShare.getState().shareId ? 'live' : 'now'));
    // Solo al abrir: `initial` cambia con cada movimiento en vivo y no debe reiniciar el panel.
  }, [open]);

  useEffect(() => {
    if (!open || panel !== 'chat' || !profile?.firebaseUid) return;
    return listenFriends(profile.firebaseUid, setFriends);
  }, [open, panel, profile?.firebaseUid]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const shareUrl = useMemo(() => (shareLoc ? buildLocationUrl(shareLoc) : ''), [shareLoc]);
  const filteredFriends = useMemo(() => {
    const q = query.trim().toLowerCase().replace(/^@/, '');
    if (!q) return friends;
    return friends.filter((f) => f.username.toLowerCase().includes(q) || f.displayName.toLowerCase().includes(q));
  }, [friends, query]);

  async function locate() {
    setLocating(true);
    setError('');
    try {
      const pos = await locateOnce();
      setLoc({
        lat: pos.lat,
        lng: pos.lng,
        accuracy: pos.accuracy,
        label: '',
        uid: profile?.firebaseUid,
        handle: profile?.handle,
      });
      const label = await labelFor(pos.lat, pos.lng);
      setLoc((current) => (current && current.lat === pos.lat && current.lng === pos.lng ? { ...current, label } : current));
    } catch (code) {
      setError(locateErrorMessage(code));
    } finally {
      setLocating(false);
    }
  }

  async function beginLive() {
    setError('');
    await startLive(liveMinutes);
  }

  async function confirmPick() {
    if (!onPick) return;
    let target = shareLoc;
    if (kind === 'live' && !target) {
      setBusy(true);
      target = await startLive(liveMinutes);
      setBusy(false);
    }
    if (!target) return;
    setBusy(true);
    try {
      await onPick(target);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo compartir la ubicación');
    } finally {
      setBusy(false);
    }
  }

  async function sendToFriend(friend: FriendChip) {
    if (!profile || !shareLoc) return;
    setSentTo((s) => ({ ...s, [friend.uid]: 'sending' }));
    try {
      await sendChatMessage(
        {
          firebaseUid: profile.firebaseUid,
          handle: profile.handle,
          displayName: profile.displayName,
          avatarUrl: profile.avatarUrl,
        },
        friend,
        LOCATION_MESSAGE_TEXT,
        { linkUrl: shareUrl },
      );
      setSentTo((s) => ({ ...s, [friend.uid]: 'sent' }));
    } catch {
      setSentTo((s) => ({ ...s, [friend.uid]: 'error' }));
    }
  }

  async function publish() {
    if (!profile || !shareLoc) return;
    setBusy(true);
    setError('');
    try {
      await createPost({
        authorUid: profile.firebaseUid,
        username: profile.handle,
        authorDisplayName: profile.displayName,
        type: 'text',
        caption: caption.trim(),
        visibility,
        linkPreview: locationLinkPreview(shareLoc),
      });
      setPosted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo publicar');
    } finally {
      setBusy(false);
    }
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setError('No se pudo copiar el enlace');
    }
  }

  if (!open || typeof document === 'undefined') return null;

  const destBtn =
    'flex min-h-[4.25rem] flex-col items-center justify-center gap-1 rounded-xl border px-1 text-[11px] font-semibold transition';
  const destIdle = 'border-[color:var(--border-default)] bg-[color:var(--surface-primary)] text-[color:var(--text-primary)] hover:border-[#22d3ee]/50';
  const destOn = 'border-[#22d3ee]/60 bg-[#22d3ee]/12 text-[color:var(--text-primary)]';

  return createPortal(
    <div
      className="fixed inset-0 z-[140] flex items-end justify-center bg-[rgba(0,0,0,0.55)] p-0 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Compartir ubicación"
        onClick={(event) => event.stopPropagation()}
        className="flex max-h-[min(92dvh,46rem)] w-full flex-col overflow-hidden rounded-t-3xl border border-[color:var(--border-default)] bg-[color:var(--bg-elevated)] text-[color:var(--text-primary)] shadow-[var(--shadow-modal)] sm:max-w-md sm:rounded-3xl"
        style={{ paddingBottom: 'var(--lb-safe-bottom, 0px)' }}
      >
        <div className="flex items-center justify-between gap-3 border-b border-[color:var(--border-soft)] px-4 py-3">
          <h2 className="flex items-center gap-2 text-base font-bold">
            <MapPin size={18} className="text-[#06b6d4]" />
            Compartir ubicación
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="grid h-10 w-10 place-items-center rounded-full text-[color:var(--text-muted)] hover:bg-[color:var(--surface-hover)]"
          >
            <X size={18} />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4">
          <div
            className="grid grid-cols-2 gap-1 rounded-xl border border-[color:var(--border-default)] bg-[color:var(--surface-primary)] p-1"
            role="tablist"
            aria-label="Tipo de ubicación"
          >
            <button
              type="button"
              role="tab"
              aria-selected={kind === 'now'}
              onClick={() => {
                setKind('now');
                setPanel('none');
              }}
              className={`inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg text-xs font-bold transition ${
                kind === 'now' ? 'bg-[#22d3ee]/15 text-[color:var(--text-primary)]' : 'text-[color:var(--text-muted)]'
              }`}
            >
              <MapPin size={14} className="text-[#06b6d4]" />
              Ubicación actual
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={kind === 'live'}
              onClick={() => {
                setKind('live');
                setPanel('none');
              }}
              className={`inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg text-xs font-bold transition ${
                kind === 'live' ? 'bg-[#ef4444]/15 text-[color:var(--text-primary)]' : 'text-[color:var(--text-muted)]'
              }`}
            >
              <Radio size={14} className={`text-[#ef4444] ${liveActive ? 'animate-pulse' : ''}`} />
              En tiempo real
            </button>
          </div>

          {kind === 'live' ? (
            liveActive ? (
              <div className="overflow-hidden rounded-2xl border border-[#ef4444]/40">
                {liveLoc ? (
                  <Suspense fallback={<div className="h-48 w-full animate-pulse bg-[color:var(--surface-primary)]" />}>
                    <LocationMap
                      lat={liveLoc.lat}
                      lng={liveLoc.lng}
                      accuracy={liveLoc.accuracy}
                      zoom={16}
                      variant="scene"
                      person={mapPerson(liveLoc)}
                      live
                      className="h-48 w-full"
                    />
                  </Suspense>
                ) : (
                  <div className="grid h-48 w-full place-items-center bg-[color:var(--surface-primary)] text-xs text-[color:var(--text-muted)]">
                    Buscando tu posición…
                  </div>
                )}
                <div className="flex items-center gap-2 bg-[color:var(--surface-secondary)] px-3 py-2.5">
                  <span className="h-2.5 w-2.5 shrink-0 animate-pulse rounded-full bg-[#ef4444]" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">Compartiendo ubicación en tiempo real</p>
                    <p className="text-[11px] text-[color:var(--text-muted)]">
                      {liveUntilOff ? 'Hasta que la desactives' : `Termina en ${formatRemaining(liveExpiresAt - now)}`} ·
                      mantén LiveBoom abierto
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void stopLive()}
                    className="inline-flex min-h-11 shrink-0 items-center gap-1 rounded-lg bg-[#ef4444] px-3 text-[11px] font-black uppercase text-[#ffffff]"
                  >
                    <Square size={12} />
                    Dejar de compartir
                  </button>
                </div>
              </div>
            ) : (
              <div className="rounded-2xl border border-[#ef4444]/30 bg-[#ef4444]/8 p-4">
                <div className="flex items-start gap-3">
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[#ef4444]/15 text-[#ef4444]" aria-hidden>
                    <Radio size={20} />
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-bold">Ubicación en tiempo real</p>
                    <p className="mt-0.5 text-xs leading-relaxed text-[color:var(--text-muted)]">
                      Quien reciba el enlace verá cómo te mueves en el mapa, con tu foto de perfil, mientras LiveBoom esté
                      abierto. Puedes detenerla cuando quieras.
                    </p>
                  </div>
                </div>
                <p className="mt-3 text-[11px] font-semibold text-[color:var(--text-muted)]">Durante</p>
                <div className="mt-1.5 grid grid-cols-2 gap-1.5 sm:grid-cols-4" role="group" aria-label="Duración">
                  {LIVE_LOCATION_DURATIONS.map((item) => (
                    <button
                      key={item.minutes}
                      type="button"
                      onClick={() => setLiveMinutes(item.minutes)}
                      className={`inline-flex min-h-10 items-center justify-center rounded-lg border text-xs font-semibold ${
                        liveMinutes === item.minutes ? destOn : destIdle
                      }`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
                {mode === 'share' ? (
                  <button
                    type="button"
                    onClick={() => void beginLive()}
                    disabled={liveStarting}
                    className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#ef4444] to-[#ec4899] px-4 text-sm font-bold text-[#ffffff] disabled:opacity-60"
                  >
                    <Radio size={16} />
                    {liveStarting ? 'Iniciando…' : 'Iniciar ubicación en tiempo real'}
                  </button>
                ) : null}
              </div>
            )
          ) : !loc ? (
            <div className="rounded-2xl border border-[#22d3ee]/30 bg-[#22d3ee]/8 p-4 text-center">
              <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-[#22d3ee]/15 text-2xl" aria-hidden>
                📍
              </span>
              <p className="mt-3 text-sm font-bold">¿Quieres compartir tu ubicación?</p>
              <p className="mt-1 text-xs leading-relaxed text-[color:var(--text-muted)]">
                Tu navegador te pedirá permiso. Solo se comparte el punto que tú decidas enviar; puedes revisarlo antes.
              </p>
              <button
                type="button"
                onClick={() => void locate()}
                disabled={locating}
                className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#22d3ee] to-[#a78bfa] px-4 text-sm font-bold text-[#0b0f19] disabled:opacity-60"
              >
                <MapPin size={16} />
                {locating ? 'Obteniendo ubicación…' : 'Usar mi ubicación actual'}
              </button>
            </div>
          ) : (
              <div className="overflow-hidden rounded-2xl border border-[color:var(--border-default)]">
                <Suspense fallback={<div className="h-48 w-full animate-pulse bg-[color:var(--surface-primary)]" />}>
                  <LocationMap
                    lat={loc.lat}
                    lng={loc.lng}
                    accuracy={loc.accuracy}
                    zoom={16}
                    variant="scene"
                    person={mapPerson(loc)}
                    className="h-48 w-full"
                  />
                </Suspense>
                <div className="flex items-center gap-2 bg-[color:var(--surface-secondary)] px-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{loc.label || 'Mi ubicación'}</p>
                    <p className="text-[11px] text-[color:var(--text-muted)]">
                      {loc.accuracy ? `Precisión aproximada ±${Math.round(loc.accuracy)} m` : 'Ubicación seleccionada'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void locate()}
                    disabled={locating}
                    className="inline-flex min-h-10 shrink-0 items-center gap-1 rounded-lg border border-[color:var(--border-default)] px-2.5 text-[11px] font-semibold disabled:opacity-60"
                  >
                    <RefreshCw size={13} className={locating ? 'animate-spin' : ''} />
                    Actualizar
                  </button>
                </div>
              </div>
          )}

              {mode === 'pick' ? (
                kind === 'live' || loc ? (
                <button
                  type="button"
                  onClick={() => void confirmPick()}
                  disabled={busy || locating || liveStarting}
                  className={`inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl px-4 text-sm font-bold disabled:opacity-60 ${
                    kind === 'live'
                      ? 'bg-gradient-to-r from-[#ef4444] to-[#ec4899] text-[#ffffff]'
                      : 'bg-gradient-to-r from-[#22d3ee] to-[#a78bfa] text-[#0b0f19]'
                  }`}
                >
                  {kind === 'live' ? <Radio size={16} /> : <MapPin size={16} />}
                  {busy || liveStarting
                    ? 'Enviando…'
                    : kind === 'live'
                      ? liveActive
                        ? 'Enviar ubicación en tiempo real'
                        : 'Iniciar y enviar en tiempo real'
                      : pickLabel}
                </button>
                ) : null
              ) : shareLoc ? (
                <>
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => setPanel((p) => (p === 'chat' ? 'none' : 'chat'))}
                      className={`${destBtn} ${panel === 'chat' ? destOn : destIdle}`}
                    >
                      <MessageCircle size={18} className="text-[#06b6d4]" />
                      Chat
                    </button>
                    <button
                      type="button"
                      onClick={() => setPanel((p) => (p === 'post' ? 'none' : 'post'))}
                      className={`${destBtn} ${panel === 'post' ? destOn : destIdle}`}
                    >
                      <PenLine size={18} className="text-[#a78bfa]" />
                      Publicar
                    </button>
                    <button type="button" onClick={() => void copyLink()} className={`${destBtn} ${destIdle}`}>
                      {copied ? <Check size={18} className="text-[#22c55e]" /> : <Copy size={18} className="text-[#f59e0b]" />}
                      {copied ? 'Copiado' : 'Copiar'}
                    </button>
                  </div>
                  <a
                    href={whatsappShareUrl(
                      kind === 'live' ? 'Mi ubicación en tiempo real' : shareLoc.label || 'Mi ubicación',
                      shareUrl,
                    )}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#25d366] px-4 text-sm font-bold text-[#06210f]"
                  >
                    Enviar por WhatsApp
                  </a>

                  {panel === 'chat' ? (
                    <div className="rounded-2xl border border-[color:var(--border-default)] bg-[color:var(--surface-primary)] p-2">
                      <label className="flex min-h-10 items-center gap-2 rounded-xl bg-[color:var(--surface-secondary)] px-3">
                        <Search size={14} className="text-[color:var(--text-muted)]" />
                        <input
                          value={query}
                          onChange={(event) => setQuery(event.target.value)}
                          placeholder="Buscar amigo…"
                          className="min-w-0 flex-1 bg-transparent text-sm text-[color:var(--text-primary)] outline-none"
                        />
                      </label>
                      <ul className="mt-2 max-h-56 space-y-1 overflow-y-auto">
                        {filteredFriends.length === 0 ? (
                          <li className="px-2 py-4 text-center text-xs text-[color:var(--text-muted)]">
                            {friends.length ? 'Sin resultados' : 'Aún no tienes amigos para enviar mensajes.'}
                          </li>
                        ) : (
                          filteredFriends.map((friend) => {
                            const state = sentTo[friend.uid];
                            return (
                              <li key={friend.uid} className="flex min-h-12 items-center gap-2.5 rounded-xl px-2 py-1.5">
                                <UserAvatar
                                  src={friend.avatarUrl}
                                  uid={friend.uid}
                                  username={friend.username}
                                  displayName={friend.displayName}
                                  size={36}
                                />
                                <span className="min-w-0 flex-1">
                                  <span className="block truncate text-sm font-semibold">{friend.displayName || friend.username}</span>
                                  <span className="block truncate text-[11px] text-[color:var(--text-muted)]">@{friend.username}</span>
                                </span>
                                <button
                                  type="button"
                                  disabled={state === 'sending' || state === 'sent'}
                                  onClick={() => void sendToFriend(friend)}
                                  className={`inline-flex min-h-9 shrink-0 items-center gap-1 rounded-lg px-3 text-[11px] font-bold ${
                                    state === 'sent'
                                      ? 'bg-[#22c55e]/15 text-[#16a34a]'
                                      : state === 'error'
                                        ? 'bg-[#ef4444]/15 text-[#dc2626]'
                                        : 'bg-gradient-to-r from-[#22d3ee] to-[#a78bfa] text-[#0b0f19]'
                                  }`}
                                >
                                  {state === 'sent' ? (
                                    <>
                                      <Check size={12} /> Enviado
                                    </>
                                  ) : state === 'sending' ? (
                                    'Enviando…'
                                  ) : state === 'error' ? (
                                    'Reintentar'
                                  ) : (
                                    'Enviar'
                                  )}
                                </button>
                              </li>
                            );
                          })
                        )}
                      </ul>
                    </div>
                  ) : null}

                  {panel === 'post' ? (
                    <div className="space-y-2 rounded-2xl border border-[color:var(--border-default)] bg-[color:var(--surface-primary)] p-3">
                      {posted ? (
                        <p className="flex items-center justify-center gap-1.5 py-3 text-sm font-bold text-[#16a34a]">
                          <Check size={16} /> Publicado en tu perfil
                        </p>
                      ) : (
                        <>
                          <textarea
                            value={caption}
                            onChange={(event) => setCaption(event.target.value.slice(0, 500))}
                            rows={2}
                            placeholder="Escribe algo sobre este lugar (opcional)"
                            className="w-full resize-none rounded-xl border border-[color:var(--border-default)] bg-[color:var(--surface-secondary)] px-3 py-2 text-sm text-[color:var(--text-primary)] outline-none focus:border-[#22d3ee]/60"
                          />
                          <div className="grid grid-cols-3 gap-1.5" role="group" aria-label="Quién puede verlo">
                            {(
                              [
                                ['public', Globe, 'Público'],
                                ['friends', Users, 'Amigos'],
                                ['private', Lock, 'Solo yo'],
                              ] as const
                            ).map(([value, Icon, label]) => (
                              <button
                                key={value}
                                type="button"
                                onClick={() => setVisibility(value)}
                                className={`inline-flex min-h-10 items-center justify-center gap-1 rounded-lg border text-[11px] font-semibold ${
                                  visibility === value ? destOn : destIdle
                                }`}
                              >
                                <Icon size={13} />
                                {label}
                              </button>
                            ))}
                          </div>
                          <button
                            type="button"
                            onClick={() => void publish()}
                            disabled={busy}
                            className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#a78bfa] to-[#ec4899] px-4 text-sm font-bold text-[#ffffff] disabled:opacity-60"
                          >
                            <PenLine size={15} />
                            {busy ? 'Publicando…' : 'Publicar ubicación'}
                          </button>
                        </>
                      )}
                    </div>
                  ) : null}
                </>
              ) : null}
          {error || (kind === 'live' && liveError) ? (
            <p className="text-xs leading-relaxed text-[#ef4444]">{error || liveError}</p>
          ) : null}
        </div>
      </div>
    </div>,
    document.body,
  );
}
