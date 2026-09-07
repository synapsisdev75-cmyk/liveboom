import { Users, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import {
  SALA_BOOM_LAYOUTS,
  SALA_BOOM_LAYOUT_META,
  type SalaBoomLayout,
} from '../../../lib/salaBoomLayout';
import { VsBattleIcon } from './VsBattleIcon';

export type SalaInviteViewer = {
  identity: string;
  username: string;
  name: string;
};

export type SalaInviteHostStatus = {
  viewerId: string;
  username: string;
  phase: 'waiting' | 'connecting' | 'joined' | 'declined';
} | null;

type SalaBoomModalProps = {
  open: boolean;
  onClose: () => void;
  onInvite: (viewer: SalaInviteViewer) => void;
  viewersList: SalaInviteViewer[];
  layout: SalaBoomLayout;
  onLayoutChange: (layout: SalaBoomLayout) => void;
  inviteStatus?: SalaInviteHostStatus;
  inviteBusy?: boolean;
};

function LayoutSketch({ kind, active }: { kind: SalaBoomLayout; active: boolean }) {
  const cell = `rounded-[2px] ${active ? 'bg-cyan-300' : 'bg-zinc-500'}`;
  if (kind === 'featured') {
    return (
      <div className="grid h-10 w-14 grid-cols-3 grid-rows-4 gap-[2px]">
        <span className={`${cell} col-span-2 row-span-3`} />
        <span className={cell} />
        <span className={cell} />
        <span className={cell} />
        <span className={cell} />
        <span className={cell} />
        <span className={cell} />
        <span className={cell} />
      </div>
    );
  }
  if (kind === 'mosaic') {
    return (
      <div className="flex h-10 w-14 flex-col gap-[2px]">
        <div className="grid min-h-0 flex-[1.2] grid-cols-2 gap-[2px]">
          <span className={cell} />
          <span className={cell} />
        </div>
        <div className="grid min-h-0 flex-1 grid-cols-3 gap-[2px]">
          <span className={cell} />
          <span className={cell} />
          <span className={cell} />
        </div>
      </div>
    );
  }
  return (
    <div className="grid h-10 w-14 grid-cols-2 grid-rows-2 gap-[2px]">
      {Array.from({ length: 4 }).map((_, i) => (
        <span key={i} className={cell} />
      ))}
    </div>
  );
}

function salaInviteStatusLabel(status: SalaInviteHostStatus | undefined) {
  if (!status) return null;
  const who = `@${status.username}`;
  if (status.phase === 'waiting') return `${who}: Invitación enviada · Esperando respuesta`;
  if (status.phase === 'connecting') return `${who}: Conectando...`;
  if (status.phase === 'joined') return `${who}: En Sala 1`;
  return `${who} rechazó la invitación`;
}

/** Sala 1 — invita solo a espectadores conectados a este LIVE. */
export function SalaBoomModal({
  open,
  onClose,
  onInvite,
  viewersList,
  layout,
  onLayoutChange,
  inviteStatus,
  inviteBusy,
}: SalaBoomModalProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedId) return;
    if (!viewersList.some((viewer) => viewer.identity === selectedId)) {
      setSelectedId(null);
    }
  }, [viewersList, selectedId]);

  if (!open) return null;
  const selected = viewersList.find((viewer) => viewer.identity === selectedId) || null;
  const statusText = salaInviteStatusLabel(inviteStatus);

  return (
    <div className="pointer-events-auto absolute left-3 right-3 top-[4.5rem] z-20 max-h-[min(72dvh,32rem)] overflow-y-auto sm:left-4 sm:max-w-sm max-lg:top-[calc(max(0.75rem,env(safe-area-inset-top))+5.5rem)]">
      <div className="rounded-2xl border border-cyan-400/30 bg-zinc-950/95 p-4 shadow-xl backdrop-blur">
        <div className="flex items-center justify-between gap-2">
          <p className="flex items-center gap-2 text-sm font-bold text-cyan-200">
            <Users size={16} /> Sala 1
          </p>
          <button type="button" onClick={onClose} className="text-zinc-400 hover:text-white" aria-label="Cerrar">
            <X size={16} />
          </button>
        </div>
        <p className="mt-2 text-[11px] text-zinc-400">
          Solo puedes invitar a personas que están viendo este LIVE ahora.
        </p>

        <p className="mt-3 text-[10px] font-bold uppercase tracking-wide text-zinc-500">Diseño de sala</p>
        <div className="mt-1.5 grid grid-cols-3 gap-1.5">
          {SALA_BOOM_LAYOUTS.map((kind) => {
            const meta = SALA_BOOM_LAYOUT_META[kind];
            const active = layout === kind;
            return (
              <button
                key={kind}
                type="button"
                onClick={() => onLayoutChange(kind)}
                className={`flex flex-col items-center gap-1 rounded-xl px-1.5 py-2 text-center ${
                  active
                    ? 'bg-cyan-500/20 ring-1 ring-cyan-400/60'
                    : 'bg-black/40 ring-1 ring-white/10 hover:bg-white/5'
                }`}
              >
                <LayoutSketch kind={kind} active={active} />
                <span className={`text-[10px] font-bold ${active ? 'text-cyan-100' : 'text-zinc-300'}`}>
                  {meta.label}
                </span>
              </button>
            );
          })}
        </div>
        <p className="mt-1.5 text-[10px] text-zinc-500">{SALA_BOOM_LAYOUT_META[layout].hint}</p>
        <p className="mt-1 text-[10px] font-semibold text-cyan-300/90">
          Diseño activo: {SALA_BOOM_LAYOUT_META[layout].label} · se aplica ya en el LIVE
        </p>

        <p className="mt-3 text-[10px] font-bold uppercase tracking-wide text-zinc-500">
          Personas viendo este LIVE
        </p>
        {viewersList.length === 0 ? (
          <p className="mt-1.5 rounded-lg bg-white/5 px-3 py-2 text-[11px] text-zinc-500">
            Nadie está viendo este LIVE ahora.
          </p>
        ) : (
          <ul className="mt-1.5 max-h-44 space-y-1 overflow-y-auto">
            {viewersList.map((viewer) => {
              const handle = viewer.username || viewer.name || viewer.identity;
              const active = selectedId === viewer.identity;
              return (
                <li key={viewer.identity}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(viewer.identity)}
                    className={`flex min-h-11 w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left ${
                      active
                        ? 'bg-cyan-500/20 ring-1 ring-cyan-400/60'
                        : 'bg-white/5 ring-1 ring-white/10 hover:bg-white/10'
                    }`}
                  >
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-cyan-500/20 text-[11px] font-bold text-cyan-100">
                      {handle.slice(0, 1).toUpperCase()}
                    </span>
                    <span className="min-w-0 truncate text-xs font-semibold text-white">@{handle}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        <button
          type="button"
          disabled={!selected || inviteBusy}
          onClick={() => selected && onInvite(selected)}
          className="mt-3 min-h-11 w-full rounded-xl bg-cyan-500 px-3 py-2 text-xs font-bold text-zinc-950 disabled:opacity-40"
        >
          Invitar
        </button>
        {statusText ? (
          <p className="mt-2 text-[11px] font-semibold text-cyan-200">{statusText}</p>
        ) : null}
      </div>
    </div>
  );
}

type BatallaBoomModalProps = {
  open: boolean;
  onClose: () => void;
  inviteHandle: string;
  onInviteHandleChange: (v: string) => void;
  onInvite: (handle?: string) => void;
  liveHosts: Array<{ username: string; displayName: string }>;
  incoming: { battleId: string; fromUsername: string; fromName: string } | null;
  waitingName?: string | null;
  busy?: boolean;
  note?: string | null;
  onAccept?: () => void;
  onDecline?: () => void;
};

/** Batalla Boom — invita a otro host en LIVE. El LIVE original no se corta. */
export function BatallaBoomModal({
  open,
  onClose,
  inviteHandle,
  onInviteHandleChange,
  onInvite,
  liveHosts,
  incoming,
  waitingName,
  busy,
  note,
  onAccept,
  onDecline,
}: BatallaBoomModalProps) {
  if (!open) return null;
  return (
    <div className="pointer-events-auto absolute left-3 right-3 top-[4.5rem] z-20 sm:left-4 sm:max-w-sm max-lg:top-[calc(max(0.75rem,env(safe-area-inset-top))+5.5rem)]">
      <div className="rounded-2xl border border-fuchsia-400/30 bg-zinc-950/95 p-4 shadow-xl backdrop-blur">
        <div className="flex items-center justify-between gap-2">
          <p className="flex items-center gap-2 text-sm font-bold text-fuchsia-200">
            <VsBattleIcon size={22} /> Batalla Boom
          </p>
          <button type="button" onClick={onClose} className="text-zinc-400 hover:text-white" aria-label="Cerrar">
            <X size={16} />
          </button>
        </div>
        <p className="mt-2 text-[11px] text-zinc-400">
          1v1 en vivo, layout 50/50. Al terminar, cada quien sigue su LIVE.
        </p>

        {incoming ? (
          <div className="mt-3 rounded-xl border border-fuchsia-400/30 bg-fuchsia-500/10 p-3">
            <p className="text-xs font-semibold text-white">
              @{incoming.fromUsername} te reta a batalla
            </p>
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => onAccept?.()}
                className="flex-1 rounded-lg bg-fuchsia-500 py-2 text-[11px] font-bold text-zinc-950 disabled:opacity-50"
              >
                Aceptar
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => onDecline?.()}
                className="flex-1 rounded-lg bg-white/10 py-2 text-[11px] font-bold text-zinc-200 disabled:opacity-50"
              >
                Rechazar
              </button>
            </div>
          </div>
        ) : waitingName ? (
          <p className="mt-3 rounded-lg bg-white/5 px-3 py-2 text-[11px] text-zinc-300">
            Esperando a @{waitingName}…
          </p>
        ) : (
          <>
            <div className="mt-3 flex items-center gap-2">
              <input
                value={inviteHandle}
                onChange={(e) => onInviteHandleChange(e.target.value)}
                placeholder="@usuario en LIVE"
                className="min-w-0 flex-1 rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-xs text-white outline-none focus:border-fuchsia-500"
                list="batalla-boom-hosts"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') onInvite();
                }}
              />
              <datalist id="batalla-boom-hosts">
                {liveHosts.map((host) => (
                  <option key={host.username} value={host.username} />
                ))}
              </datalist>
              <button
                type="button"
                disabled={busy}
                onClick={() => onInvite()}
                className="shrink-0 rounded-lg bg-fuchsia-500 px-3 py-2 text-[11px] font-bold text-zinc-950 disabled:opacity-50"
              >
                Retar
              </button>
            </div>
            {liveHosts.length > 0 ? (
              <div className="mt-3">
                <p className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">En vivo ahora</p>
                <div className="mt-1.5 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                  {liveHosts.map((host) => (
                    <button
                      key={host.username}
                      type="button"
                      onClick={() => onInvite(host.username)}
                      className="flex w-14 shrink-0 flex-col items-center gap-1"
                    >
                      <span className="grid h-11 w-11 place-items-center rounded-full bg-fuchsia-500/20 text-[11px] font-bold text-fuchsia-100 ring-1 ring-white/15">
                        {(host.displayName || host.username).slice(0, 1).toUpperCase()}
                      </span>
                      <span className="w-full truncate text-center text-[9px] text-zinc-400">
                        @{host.username}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <p className="mt-3 text-[11px] text-zinc-500">No hay otros lives para retar ahora.</p>
            )}
          </>
        )}
        {note ? <p className="mt-2 text-[11px] text-fuchsia-200">{note}</p> : null}
      </div>
    </div>
  );
}
