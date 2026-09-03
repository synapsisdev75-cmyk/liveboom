import { VideoTrack, useRoomContext, type TrackReference } from '@livekit/components-react';
import { RoomEvent } from 'livekit-client';
import { AudioLines, Mic, MicOff, Pin, UserX, Video, VideoOff } from 'lucide-react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import type { LiveAspectRatio } from '../../../lib/liveAspectRatio';
import {
  salaEqualRows,
  salaStripRows,
  type SalaBoomLayout,
  type SalaCameraAction,
} from '../../../lib/salaBoomLayout';
import { UserAvatar } from '../../profile/UserAvatar';

type Props = {
  hostRef: TrackReference;
  guests: TrackReference[];
  layout: SalaBoomLayout;
  frameAspect: LiveAspectRatio;
  mirrorHost?: boolean;
  isHost?: boolean;
  localIdentity?: string;
  pinnedIdentity?: string | null;
  /** Cámaras apagadas por el host: perfil + audio. */
  camOffIdentities?: string[];
  onControl?: (action: SalaCameraAction, identity: string) => void;
  onLeaveSelf?: () => void;
  onLayoutChange?: (layout: SalaBoomLayout) => void;
};

type Slot = {
  key: string;
  trackRef: TrackReference | null;
  label: string;
  isHost: boolean;
  identity: string;
};

function useSpeakingIds() {
  const room = useRoomContext();
  const [ids, setIds] = useState<string[]>([]);
  useEffect(() => {
    const sync = () => setIds(room.activeSpeakers.map((p) => p.identity));
    sync();
    room.on(RoomEvent.ActiveSpeakersChanged, sync);
    return () => {
      room.off(RoomEvent.ActiveSpeakersChanged, sync);
    };
  }, [room]);
  return ids;
}

function slotLabel(ref: TrackReference, isHost: boolean) {
  const name = String(ref.participant.name || ref.participant.identity || 'Invitado').replace(
    /^@/,
    '',
  );
  return isHost ? `Host ${name}` : name;
}

function toSlot(ref: TrackReference, isHost: boolean): Slot {
  return {
    key: ref.participant.identity,
    trackRef: ref,
    label: slotLabel(ref, isHost),
    isHost,
    identity: ref.participant.identity,
  };
}

function buildOccupied(
  hostRef: TrackReference,
  guests: TrackReference[],
  layout: SalaBoomLayout,
  speakingIds: string[],
  pinnedIdentity: string | null | undefined,
  camOffIdentities: string[] = [],
  identityLabels?: Map<string, string>,
): Slot[] {
  const max = layout === 'grid' ? 9 : 8;
  const people: Slot[] = [
    toSlot(hostRef, true),
    ...guests.slice(0, max - 1).map((guest) => toSlot(guest, false)),
  ];
  for (const identity of camOffIdentities) {
    if (people.some((slot) => slot.identity === identity)) continue;
    if (people.length >= max) break;
    const label = identityLabels?.get(identity) || identity;
    people.push({
      key: `camoff-${identity}`,
      trackRef: null,
      label,
      isHost: false,
      identity,
    });
  }

  if (layout === 'mosaic' && people.length > 1) {
    people.sort((a, b) => {
      if (pinnedIdentity) {
        if (a.identity === pinnedIdentity) return -1;
        if (b.identity === pinnedIdentity) return 1;
      }
      const aTalk = speakingIds.includes(a.identity) ? 1 : 0;
      const bTalk = speakingIds.includes(b.identity) ? 1 : 0;
      if (aTalk !== bTalk) return bTalk - aTalk;
      if (a.isHost !== b.isHost) return a.isHost ? -1 : 1;
      return 0;
    });
  }
  return people;
}

function pickFeatured(slots: Slot[], pinnedIdentity: string | null | undefined) {
  if (slots.length <= 1) return { featured: slots[0] ?? null, rest: [] as Slot[] };
  const idx = pinnedIdentity ? slots.findIndex((slot) => slot.identity === pinnedIdentity) : 0;
  const at = idx >= 0 ? idx : 0;
  const featured = slots[at];
  const rest = slots.filter((_, i) => i !== at);
  return { featured, rest };
}

function FlexRow({
  slots,
  startIndex,
  tile,
}: {
  slots: Slot[];
  startIndex: number;
  tile: (slot: Slot, index: number) => ReactNode;
}) {
  return (
    <div className="flex min-h-0 min-w-0 flex-1 gap-0.5">
      {slots.map((slot, i) => (
        <div key={slot.key} className="min-h-0 min-w-0 flex-1">
          {tile(slot, startIndex + i)}
        </div>
      ))}
    </div>
  );
}

function PackedStage({
  slots,
  frameAspect,
  tile,
}: {
  slots: Slot[];
  frameAspect: LiveAspectRatio;
  tile: (slot: Slot, index: number) => ReactNode;
}) {
  const rows = salaEqualRows(slots.length, frameAspect);
  let offset = 0;
  return (
    <div className="absolute inset-0 z-[1] flex min-h-0 flex-col gap-0.5 bg-black">
      {rows.map((size, rowIdx) => {
        const chunk = slots.slice(offset, offset + size);
        const start = offset;
        offset += size;
        return <FlexRow key={`r-${rowIdx}-${size}`} slots={chunk} startIndex={start} tile={tile} />;
      })}
    </div>
  );
}

function Tile({
  slot,
  index,
  speaking,
  mirror,
  isHostView,
  isSelf,
  pinned,
  camOff,
  onControl,
  onLeaveSelf,
}: {
  slot: Slot;
  index: number;
  speaking: boolean;
  mirror: boolean;
  isHostView?: boolean;
  isSelf?: boolean;
  pinned?: boolean;
  camOff?: boolean;
  onControl?: (action: SalaCameraAction, identity: string) => void;
  onLeaveSelf?: () => void;
}) {
  const camOn = !camOff && slot.trackRef ? !slot.trackRef.publication?.isMuted : false;
  const micOn = Boolean(slot.trackRef?.participant.isMicrophoneEnabled);
  const label = (slot.label || '').replace(/^Host\s+/i, '');
  return (
    <div
      className={`relative h-full min-h-0 min-w-0 overflow-hidden bg-zinc-950 ${
        speaking ? 'ring-2 ring-cyan-400/80' : 'ring-1 ring-white/15'
      }`}
    >
      {slot.trackRef && camOn ? (
        <VideoTrack
          trackRef={slot.trackRef}
          className={`h-full w-full [&_video]:h-full [&_video]:w-full [&_video]:object-cover ${
            mirror ? 'lb-live-mirror-on' : '[&_video]:!transform-none'
          }`}
        />
      ) : (
        <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-gradient-to-b from-zinc-900 to-zinc-950 px-2 text-center">
          <UserAvatar
            uid={slot.identity}
            username={label}
            displayName={label}
            size={64}
            ringClassName="ring-2 ring-white/25"
          />
          <p className="max-w-full truncate text-xs font-bold text-white">{label || index + 1}</p>
          <p className="text-[10px] font-semibold text-zinc-400">
            {camOff ? 'Solo audio · Perfil' : 'Sin cámara'}
          </p>
        </div>
      )}
      {slot.isHost ? (
        <span className="absolute left-1 top-1 rounded bg-fuchsia-500 px-1 py-px text-[8px] font-black uppercase text-white">
          Host
        </span>
      ) : camOff ? (
        <span className="absolute left-1 top-1 rounded bg-amber-500/90 px-1 py-px text-[8px] font-black uppercase text-zinc-950">
          Audio
        </span>
      ) : (
        <span className="absolute left-1 top-1 rounded bg-black/60 px-1 py-px text-[9px] font-bold text-white">
          {index + 1}
        </span>
      )}
      {speaking && !(isSelf && !slot.isHost) ? (
        <span className="absolute right-1 top-1 grid h-5 w-5 place-items-center rounded bg-cyan-500 text-zinc-950">
          <AudioLines size={11} strokeWidth={2.5} />
        </span>
      ) : null}
      {slot.label && camOn ? (
        <p className="pointer-events-none absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/80 to-transparent px-1.5 pb-1 pt-4 text-[10px] font-semibold text-white">
          {slot.label}
        </p>
      ) : null}

      {/* Controles solo para quien inició el LIVE. */}
      {isHostView && slot.identity && onControl ? (
        <div className="absolute right-1 bottom-7 z-10 flex max-w-[calc(100%-0.5rem)] flex-wrap justify-end gap-0.5">
          <button
            type="button"
            className={`grid h-8 w-8 place-items-center rounded-full text-white lg:h-7 lg:w-7 ${
              pinned ? 'bg-cyan-500 text-zinc-950' : 'bg-black/70'
            }`}
            title={pinned ? 'Quitar pin' : 'Fijar en grande'}
            onClick={(e) => {
              e.stopPropagation();
              onControl('pin', slot.identity);
            }}
          >
            <Pin size={12} />
          </button>
          {!slot.isHost ? (
            <>
              <button
                type="button"
                className={`grid h-8 w-8 place-items-center rounded-full text-white lg:h-7 lg:w-7 ${
                  camOff || !camOn ? 'bg-amber-500/90 text-zinc-950' : 'bg-black/70'
                }`}
                title={
                  camOn
                    ? 'Apagar cámara (solo audio + perfil)'
                    : 'Encender cámara'
                }
                onClick={(e) => {
                  e.stopPropagation();
                  onControl(camOn ? 'mute_cam' : 'unmute_cam', slot.identity);
                }}
              >
                {camOn ? <Video size={12} /> : <VideoOff size={12} />}
              </button>
              <button
                type="button"
                className="grid h-8 w-8 place-items-center rounded-full bg-black/70 text-white lg:h-7 lg:w-7"
                title={micOn ? 'Silenciar mic' : 'Activar mic'}
                onClick={(e) => {
                  e.stopPropagation();
                  onControl(micOn ? 'mute_mic' : 'unmute_mic', slot.identity);
                }}
              >
                {micOn ? <Mic size={12} /> : <MicOff size={12} />}
              </button>
              <button
                type="button"
                className="grid h-8 w-8 place-items-center rounded-full bg-rose-600/90 text-white lg:h-7 lg:w-7"
                title="Expulsar de la transmisión"
                onClick={(e) => {
                  e.stopPropagation();
                  onControl('kick', slot.identity);
                }}
              >
                <UserX size={12} />
              </button>
            </>
          ) : null}
        </div>
      ) : null}

      {isSelf && !slot.isHost && onLeaveSelf ? (
        <button
          type="button"
          className="absolute right-1 top-1 z-10 rounded-full bg-black/70 px-2 py-1 text-[9px] font-bold text-white"
          onClick={(e) => {
            e.stopPropagation();
            onLeaveSelf();
          }}
        >
          Salir
        </button>
      ) : null}
    </div>
  );
}

/** Escenario Sala Boom: grilla, destacado o mosaico según ocupantes reales. */
export function SalaBoomStage({
  hostRef,
  guests,
  layout,
  frameAspect,
  mirrorHost = false,
  isHost = false,
  localIdentity,
  pinnedIdentity,
  camOffIdentities = [],
  onControl,
  onLeaveSelf,
  onLayoutChange: _onLayoutChange,
}: Props) {
  const speakingIds = useSpeakingIds();
  const room = useRoomContext();
  const camOffSet = useMemo(() => new Set(camOffIdentities), [camOffIdentities]);
  const identityLabels = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of room.remoteParticipants.values()) {
      map.set(p.identity, String(p.name || p.identity).replace(/^@/, ''));
    }
    const local = room.localParticipant;
    map.set(local.identity, String(local.name || local.identity).replace(/^@/, ''));
    return map;
  }, [room, guests, camOffIdentities]);
  const slots = useMemo(
    () =>
      buildOccupied(
        hostRef,
        guests,
        layout,
        speakingIds,
        pinnedIdentity,
        camOffIdentities,
        identityLabels,
      ),
    [hostRef, guests, layout, speakingIds, pinnedIdentity, camOffIdentities, identityLabels],
  );

  const tile = (slot: Slot, index: number) => (
    <Tile
      key={slot.key}
      slot={slot}
      index={index}
      speaking={speakingIds.includes(slot.identity)}
      mirror={slot.isHost && mirrorHost}
      isHostView={isHost}
      isSelf={Boolean(localIdentity && slot.identity === localIdentity)}
      pinned={Boolean(pinnedIdentity && slot.identity === pinnedIdentity)}
      camOff={camOffSet.has(slot.identity)}
      onControl={onControl}
      onLeaveSelf={onLeaveSelf}
    />
  );

  let stage: ReactNode;

  if (layout === 'featured') {
    const { featured, rest } = pickFeatured(slots, pinnedIdentity);
    if (!featured) {
      stage = null;
    } else if (rest.length === 0) {
      stage = (
        <div className="absolute inset-0 z-[1] min-h-0 bg-black">{tile(featured, 0)}</div>
      );
    } else {
      const portrait = frameAspect === '9:16';
      stage = (
        <div
          className={`absolute inset-0 z-[1] min-h-0 gap-0.5 bg-black ${
            portrait ? 'flex flex-col' : 'flex flex-row'
          }`}
        >
          <div className={`min-h-0 min-w-0 ${portrait ? 'flex-[1.7]' : 'flex-[2.1]'}`}>
            {tile(featured, 0)}
          </div>
          <div
            className={`flex min-h-0 min-w-0 flex-col gap-0.5 ${
              portrait ? 'flex-[0.9]' : 'w-[min(32%,14rem)]'
            }`}
          >
            {(() => {
              const rows = portrait ? salaStripRows(rest.length) : salaEqualRows(rest.length, '9:16');
              let offset = 0;
              return rows.map((size, rowIdx) => {
                const chunk = rest.slice(offset, offset + size);
                const start = offset + 1;
                offset += size;
                return (
                  <FlexRow key={`f-${rowIdx}-${size}`} slots={chunk} startIndex={start} tile={tile} />
                );
              });
            })()}
          </div>
        </div>
      );
    }
  } else if (layout === 'mosaic') {
    if (slots.length <= 2) {
      stage = <PackedStage slots={slots} frameAspect={frameAspect} tile={tile} />;
    } else {
      const large = slots[0];
      const rest = slots.slice(1);
      if (!large) {
        stage = <PackedStage slots={slots} frameAspect={frameAspect} tile={tile} />;
      } else {
      const portrait = frameAspect === '9:16';
      const restRows = salaEqualRows(rest.length, portrait ? '9:16' : '16:9');
      let offset = 0;
      stage = (
        <div className="absolute inset-0 z-[1] flex min-h-0 flex-col gap-0.5 bg-black">
          <div className="min-h-0 min-w-0 flex-[1.55]">{tile(large, 0)}</div>
          <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-0.5">
            {restRows.map((size, rowIdx) => {
              const chunk = rest.slice(offset, offset + size);
              const start = offset + 1;
              offset += size;
              return (
                <FlexRow key={`m-${rowIdx}-${size}`} slots={chunk} startIndex={start} tile={tile} />
              );
            })}
          </div>
        </div>
      );
      }
    }
  } else {
    stage = <PackedStage slots={slots} frameAspect={frameAspect} tile={tile} />;
  }

  return <>{stage}</>;
}
