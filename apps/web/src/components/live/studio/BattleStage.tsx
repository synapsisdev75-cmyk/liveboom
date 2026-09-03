import { useEffect, useRef, useState } from 'react';
import type { ILocalVideoTrack, IRemoteAudioTrack, IRemoteVideoTrack } from 'agora-rtc-sdk-ng';
import type { LiveAspectRatio } from '../../../lib/liveAspectRatio';
import type { LiveBattle } from '../../../lib/battleFirestore';
import type { AgoraBattleRemote } from '../../../lib/agoraBattle';
import { resumeBattleRemoteAudio } from '../../../lib/agoraBattle';
import { agoraUid } from '../../../lib/agoraBattleId';
import { VsBattleIcon } from './VsBattleIcon';

type Props = {
  battle: LiveBattle;
  remotes: AgoraBattleRemote[];
  localVideo: ILocalVideoTrack | null;
  localUid: string;
  aspectRatio: LiveAspectRatio;
  isHost: boolean;
  remainingMs: number;
  onEnd: () => void;
};

function Tile({
  track,
  name,
  score,
  side,
}: {
  track: IRemoteVideoTrack | ILocalVideoTrack | null;
  name: string;
  score: number;
  side: 'a' | 'b';
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || !track) return;
    track.play(el, { fit: 'cover' });
  }, [track]);
  return (
    <div className="relative min-h-0 min-w-0 flex-1 overflow-hidden bg-zinc-950">
      <div ref={ref} className="absolute inset-0 [&_video]:h-full [&_video]:w-full [&_video]:object-cover" />
      {!track ? (
        <div className="absolute inset-0 grid place-items-center text-xs text-zinc-500">Esperando cámara…</div>
      ) : null}
      <div
        className={`absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-2 pb-2 pt-6 ${
          side === 'a' ? 'text-cyan-100' : 'text-fuchsia-100'
        }`}
      >
        <p className="truncate text-xs font-bold">@{name}</p>
        <p className="text-lg font-black tabular-nums">{score.toLocaleString('es-CO')}</p>
      </div>
    </div>
  );
}

function formatRemain(ms: number) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/** Batalla Boom 50/50 sobre el LIVE (Agora). Al cerrar, el LIVE de LiveKit sigue. */
export function BattleStage({
  battle,
  remotes,
  localVideo,
  localUid,
  aspectRatio,
  isHost,
  remainingMs: remainingProp,
  onEnd,
}: Props) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 400);
    return () => window.clearInterval(timer);
  }, [battle.id]);

  // Asegura audio de ambos hosts (Agora); LiveKit RoomAudio se apaga en batalla.
  useEffect(() => {
    remotes.forEach((remote) => {
      const audio = remote.audioTrack as IRemoteAudioTrack | null;
      if (!audio) return;
      try {
        audio.setVolume(100);
        audio.play();
      } catch {
        // ignore
      }
    });
    resumeBattleRemoteAudio();
  }, [remotes, battle.id]);

  const remainingMs = remainingProp || Math.max(0, battle.endsAtMs - now);
  const myUid = agoraUid(localUid);
  const uidA = agoraUid(battle.hostAUid);
  const uidB = agoraUid(battle.hostBUid);
  const trackFor = (uid: number) => {
    if (uid === myUid) return localVideo;
    return remotes.find((item) => item.uid === uid)?.videoTrack ?? null;
  };
  const portrait = aspectRatio === '9:16';

  return (
    <div className="absolute inset-0 z-[6] flex min-h-0 flex-col bg-black">
      <div
        className={`relative min-h-0 flex-1 ${portrait ? 'flex flex-col' : 'flex flex-row'} gap-0.5`}
      >
        <Tile
          track={trackFor(uidA)}
          name={battle.hostAUsername}
          score={battle.scoreA}
          side="a"
        />
        <Tile
          track={trackFor(uidB)}
          name={battle.hostBUsername}
          score={battle.scoreB}
          side="b"
        />
        <div className="pointer-events-none absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2">
          <VsBattleIcon size={56} className="drop-shadow-[0_0_18px_rgba(168,85,247,0.65)]" />
        </div>
      </div>
      <div className="pointer-events-auto flex items-center justify-between gap-2 bg-zinc-950/90 px-3 py-2">
        <p className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase text-fuchsia-200">
          <VsBattleIcon size={18} /> Batalla Boom
        </p>
        <p className="text-sm font-black tabular-nums text-white">{formatRemain(remainingMs)}</p>
        {isHost ? (
          <button
            type="button"
            onClick={onEnd}
            className="rounded-full bg-white/10 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-white/20"
          >
            Terminar
          </button>
        ) : (
          <span className="text-[10px] text-zinc-500">LIVE original sigue al terminar</span>
        )}
      </div>
    </div>
  );
}
