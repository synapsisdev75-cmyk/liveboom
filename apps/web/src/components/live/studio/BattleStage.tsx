import { useEffect, useRef, useState, type CSSProperties } from 'react';
import type { ILocalVideoTrack, IRemoteAudioTrack, IRemoteVideoTrack } from 'agora-rtc-sdk-ng';
import type { LiveAspectRatio } from '../../../lib/liveAspectRatio';
import type { LiveBattle } from '../../../lib/battleFirestore';
import type { AgoraBattleRemote } from '../../../lib/agoraBattle';
import { resumeBattleRemoteAudio } from '../../../lib/agoraBattle';
import { agoraUid } from '../../../lib/agoraBattleId';
import { BATTLE_HP_MAX } from '../../../lib/battleHp';
import { BATTLE_NEON_CROWN, BATTLE_NEON_FRAME, BATTLE_NEON_VS } from '../../../lib/battleNeonAssets';
import { getUserLevelStyle } from '../../../lib/liveChatLevelStyle';
import { fetchPublicUserByUsername } from '../../../lib/profileFirestore';
import { levelFromXp } from '../../../lib/userLevels';
import { LevelAvatarFrame } from '../../profile/LevelAvatarFrame';
import { LevelInsignia } from '../../profile/LevelInsignia';
import { BattleNeonHpBar } from './BattleNeonHpBar';

type Props = {
  battle: LiveBattle;
  remotes: AgoraBattleRemote[];
  localVideo: ILocalVideoTrack | null;
  localUid: string;
  aspectRatio: LiveAspectRatio;
  isHost: boolean;
  remainingMs: number;
  onEnd: () => void;
  onRematch?: () => void;
  onDismissResult?: () => void;
  rematchBusy?: boolean;
};

function Tile({
  track,
  name,
  side,
  leading,
  levelXp,
  levelTitle,
}: {
  track: IRemoteVideoTrack | ILocalVideoTrack | null;
  name: string;
  side: 'a' | 'b';
  leading: boolean;
  levelXp: number;
  levelTitle: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const style = getUserLevelStyle(levelXp);
  useEffect(() => {
    const el = ref.current;
    if (!el || !track) return;
    track.play(el, { fit: 'cover' });
  }, [track]);

  return (
    <div
      className={`lb-battle-neon-tile relative min-h-0 min-w-0 flex-1 overflow-hidden bg-zinc-950${
        side === 'a' ? ' is-a' : ' is-b'
      }${leading ? ' is-leading' : ''}`}
      style={
        {
          '--lb-tile-glow': style.glow,
          '--lb-tile-primary': style.primaryColor,
        } as CSSProperties
      }
    >
      <div ref={ref} className="absolute inset-0 [&_video]:h-full [&_video]:w-full [&_video]:object-cover" />
      {!track ? (
        <div className="absolute inset-0 z-[21] grid place-items-center text-xs text-zinc-500">Esperando cámara…</div>
      ) : null}

      <img src={BATTLE_NEON_FRAME} alt="" draggable={false} className="lb-battle-neon-tile__frame" aria-hidden />

      {leading ? (
        <img src={BATTLE_NEON_CROWN} alt="" draggable={false} className="lb-battle-neon-tile__crown" aria-hidden />
      ) : null}

      <div className="lb-battle-neon-tile__info">
        <p className="lb-battle-neon-tile__name">@{name}</p>
        <p className="lb-battle-neon-tile__level" style={{ color: style.primaryColor }}>
          {levelTitle}
        </p>
      </div>
    </div>
  );
}

/** Perfil + marco + insignia en el HUD central (como la ref Batalla Boom). */
function BattleHudFighter({
  side,
  username,
  avatarUrl,
  levelXp,
}: {
  side: 'a' | 'b';
  username: string;
  avatarUrl: string | null;
  levelXp: number;
}) {
  const info = levelFromXp(levelXp);
  const style = getUserLevelStyle(levelXp);
  return (
    <div
      className={`lb-battle-neon-hud__fighter${side === 'b' ? ' is-b' : ' is-a'}`}
      style={{ '--lb-fighter-glow': style.glow, '--lb-fighter-primary': style.primaryColor } as CSSProperties}
    >
      <span className="lb-battle-neon-hud__nivel">NIVEL {info.level}</span>
      <LevelAvatarFrame
        levelXp={levelXp}
        avatarUrl={avatarUrl}
        fallbackLetter={username}
        size="sm"
        className="lb-battle-neon-hud__avatar"
      />
      <div className="lb-battle-neon-hud__insignia">
        <LevelInsignia
          levelXp={levelXp}
          className="!mx-auto"
          previewSize={{
            mobile: { width: 28, height: 28 },
            desktop: { width: 34, height: 34 },
          }}
        />
      </div>
      <p className="lb-battle-neon-hud__title" style={{ color: style.primaryColor }}>
        {style.title}
      </p>
      <p className="lb-battle-neon-hud__range">{info.rangeLabel}</p>
    </div>
  );
}

function formatRemain(ms: number) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function resultCopy(battle: LiveBattle, localUid: string) {
  const side =
    localUid === battle.hostAUid ? 'a' : localUid === battle.hostBUid ? 'b' : null;
  if (battle.winnerSide === 'draw') {
    return { title: 'Empate', sub: 'Misma vida al finalizar', showRematch: true };
  }
  if (battle.endReason === 'ko') {
    if (side && battle.winnerSide === side) {
      return { title: 'Win', sub: 'K.O. — rival sin vida', showRematch: false };
    }
    if (side) {
      return { title: 'Game Over', sub: 'Te quedaste sin vida', showRematch: false };
    }
    const winner =
      battle.winnerSide === 'a' ? battle.hostAUsername : battle.hostBUsername;
    return { title: 'Ganador', sub: `@${winner}`, showRematch: false };
  }
  if (side && battle.winnerSide === side) {
    return { title: 'Win', sub: 'Más vida al terminar el tiempo', showRematch: false };
  }
  if (side && battle.winnerSide && battle.winnerSide !== side) {
    return { title: 'Game Over', sub: 'El rival terminó con más vida', showRematch: false };
  }
  const winner =
    battle.winnerSide === 'a'
      ? battle.hostAUsername
      : battle.winnerSide === 'b'
        ? battle.hostBUsername
        : null;
  return {
    title: winner ? 'Ganador' : 'Fin',
    sub: winner ? `@${winner}` : 'Batalla finalizada',
    showRematch: false,
  };
}

/** Batalla Boom 50/50 — HUD central con VS, barras y marcos de perfil. */
export function BattleStage({
  battle,
  remotes,
  localVideo,
  localUid,
  aspectRatio,
  isHost,
  remainingMs: remainingProp,
  onEnd,
  onRematch,
  onDismissResult,
  rematchBusy,
}: Props) {
  const [now, setNow] = useState(Date.now());
  const [xpA, setXpA] = useState(0);
  const [xpB, setXpB] = useState(0);
  const [avatarA, setAvatarA] = useState<string | null>(null);
  const [avatarB, setAvatarB] = useState<string | null>(null);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 400);
    return () => window.clearInterval(timer);
  }, [battle.id]);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      fetchPublicUserByUsername(battle.hostAUsername),
      fetchPublicUserByUsername(battle.hostBUsername),
    ]).then(([a, b]) => {
      if (cancelled) return;
      setXpA(Math.max(0, Number(a?.levelXp) || 0));
      setXpB(Math.max(0, Number(b?.levelXp) || 0));
      setAvatarA(a?.avatarUrl || null);
      setAvatarB(b?.avatarUrl || null);
    });
    return () => {
      cancelled = true;
    };
  }, [battle.hostAUsername, battle.hostBUsername, battle.id]);

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

  const remainingMs =
    battle.status === 'ended' ? 0 : remainingProp || Math.max(0, battle.endsAtMs - now);
  const myUid = agoraUid(localUid);
  const uidA = agoraUid(battle.hostAUid);
  const uidB = agoraUid(battle.hostBUid);
  const trackFor = (uid: number) => {
    if (battle.status === 'ended') return null;
    if (uid === myUid) return localVideo;
    return remotes.find((item) => item.uid === uid)?.videoTrack ?? null;
  };
  const portrait = aspectRatio === '9:16';
  const result = battle.status === 'ended' ? resultCopy(battle, localUid) : null;
  const canRematch =
    Boolean(result?.showRematch || battle.winnerSide === 'draw') &&
    Boolean(onRematch) &&
    (localUid === battle.hostAUid || localUid === battle.hostBUid);

  const hpA = Math.min(BATTLE_HP_MAX, Math.max(0, battle.hpA));
  const hpB = Math.min(BATTLE_HP_MAX, Math.max(0, battle.hpB));
  const leadingA = hpA > hpB;
  const leadingB = hpB > hpA;
  const styleA = getUserLevelStyle(xpA);
  const styleB = getUserLevelStyle(xpB);

  const centerHud = (
    <div className="lb-battle-neon-hud pointer-events-none" aria-label="Marcador Batalla Boom">
      <div className="lb-battle-neon-hud__bars">
        <BattleHudFighter
          side="a"
          username={battle.hostAUsername}
          avatarUrl={avatarA}
          levelXp={xpA}
        />
        <BattleNeonHpBar
          hp={hpA}
          levelXp={xpA}
          side="a"
          showPct
          className="lb-battle-neon-hud__bar"
        />
        <img src={BATTLE_NEON_VS} alt="VS" draggable={false} className="lb-battle-neon-hud__vs" />
        <BattleNeonHpBar
          hp={hpB}
          levelXp={xpB}
          side="b"
          showPct
          className="lb-battle-neon-hud__bar"
        />
        <BattleHudFighter
          side="b"
          username={battle.hostBUsername}
          avatarUrl={avatarB}
          levelXp={xpB}
        />
      </div>
    </div>
  );

  return (
    <div className="lb-battle-neon-stage absolute inset-0 z-[6] flex min-h-0 flex-col bg-black">
      <div
        className={`lb-battle-neon-stage__grid relative z-[10] min-h-0 flex-1 ${
          portrait ? 'is-portrait' : 'is-landscape'
        }`}
      >
        <Tile
          track={trackFor(uidA)}
          name={battle.hostAUsername}
          side="a"
          leading={leadingA}
          levelXp={xpA}
          levelTitle={styleA.title}
        />
        {portrait ? centerHud : null}
        <Tile
          track={trackFor(uidB)}
          name={battle.hostBUsername}
          side="b"
          leading={leadingB}
          levelXp={xpB}
          levelTitle={styleB.title}
        />
        {!portrait ? centerHud : null}

        {result ? (
          <div className="pointer-events-auto absolute inset-0 z-[40] grid place-items-center bg-black/60 p-4 backdrop-blur-[2px]">
            <div className="w-full max-w-xs rounded-2xl border border-fuchsia-400/40 bg-zinc-950/95 p-4 text-center shadow-[0_0_28px_rgba(192,38,211,0.35)]">
              <img src={BATTLE_NEON_VS} alt="" className="mx-auto mb-2 h-12 w-auto object-contain" draggable={false} />
              <p className="text-2xl font-black uppercase tracking-wide text-fuchsia-100">{result.title}</p>
              <p className="mt-1 text-xs text-zinc-300">{result.sub}</p>
              <p className="mt-3 text-[11px] tabular-nums text-zinc-400">
                @{battle.hostAUsername} {Math.round(hpA)}% · @{battle.hostBUsername} {Math.round(hpB)}%
              </p>
              <div className="mt-4 flex flex-col gap-2">
                {canRematch ? (
                  <button
                    type="button"
                    disabled={rematchBusy}
                    onClick={() => onRematch?.()}
                    className="min-h-11 rounded-xl bg-fuchsia-500 py-2.5 text-xs font-bold text-zinc-950 disabled:opacity-50"
                  >
                    Revancha
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => onDismissResult?.() || onEnd()}
                  className="min-h-11 rounded-xl bg-white/10 py-2.5 text-xs font-bold text-white hover:bg-white/15"
                >
                  Cerrar
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>

      <div className="pointer-events-auto relative z-[30] flex items-center justify-between gap-2 bg-zinc-950/90 px-3 py-2">
        <p className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase text-fuchsia-200">
          <img src={BATTLE_NEON_VS} alt="" className="h-5 w-auto object-contain" draggable={false} />
          Batalla Boom
        </p>
        <p className="text-sm font-black tabular-nums text-white">
          {battle.status === 'ended' ? 'Fin' : formatRemain(remainingMs)}
        </p>
        {isHost && battle.status === 'live' ? (
          <button
            type="button"
            onClick={onEnd}
            className="min-h-11 rounded-full bg-white/10 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-white/20"
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
