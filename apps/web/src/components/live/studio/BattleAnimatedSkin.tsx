import { useEffect, useMemo, useRef, useState } from 'react';
import {
  BATTLE_SKIN_MP4,
  BATTLE_SKIN_STILL,
  battleEnergyBand,
  detectBattleFxLite,
  preloadBattleSkinAssets,
  type BattleSkinPerformance,
  type BattleSkinStatus,
} from '../../../lib/battleAnimatedSkin';

type Leader = 'a' | 'b' | 'tie';

type Props = {
  battleStatus: BattleSkinStatus;
  host1Score: number;
  host2Score: number;
  portrait?: boolean;
  multiplierHost1?: number;
  multiplierHost2?: number;
  performanceMode?: BattleSkinPerformance;
};

const LEADER_COOLDOWN_MS = 2800;
const SPARK_MS = 420;

/**
 * Piel visual de Batalla Boom (Magnific).
 * pointer-events: none. No sustituye videos, scores, chat ni controles.
 */
export function BattleAnimatedSkin({
  battleStatus,
  host1Score,
  host2Score,
  portrait = false,
  multiplierHost1 = 1,
  multiplierHost2 = 1,
  performanceMode = 'auto',
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const lastLeader = useRef<Leader>('tie');
  const lastPulseAt = useRef(0);
  const lastTotal = useRef(host1Score + host2Score);
  const [failed, setFailed] = useState(false);
  const [liteForced, setLiteForced] = useState(false);
  const [leaderPulse, setLeaderPulse] = useState<Leader | null>(null);
  const [spark, setSpark] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);

  const lite = useMemo(() => {
    if (performanceMode === 'lite') return true;
    if (performanceMode === 'full') return false;
    return liteForced || detectBattleFxLite();
  }, [liteForced, performanceMode]);

  useEffect(() => {
    if (battleStatus === 'idle') return;
    preloadBattleSkinAssets();
  }, [battleStatus]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => setReducedMotion(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  useEffect(() => {
    setLiteForced(detectBattleFxLite());
  }, []);

  useEffect(() => {
    const node = videoRef.current;
    if (!node) return;
    if (battleStatus === 'finished' || battleStatus === 'idle') {
      node.pause();
      return;
    }
    const play = node.play();
    if (play) void play.catch(() => undefined);
  }, [battleStatus, failed, lite, reducedMotion]);

  useEffect(() => {
    const a = Math.max(0, host1Score);
    const b = Math.max(0, host2Score);
    const next: Leader = a === b ? 'tie' : a > b ? 'a' : 'b';
    const prev = lastLeader.current;
    lastLeader.current = next;
    if (prev === next || next === 'tie') return;
    const now = Date.now();
    if (now - lastPulseAt.current < LEADER_COOLDOWN_MS) return;
    lastPulseAt.current = now;
    setLeaderPulse(next);
    const id = window.setTimeout(() => setLeaderPulse(null), 700);
    return () => window.clearTimeout(id);
  }, [host1Score, host2Score]);

  useEffect(() => {
    const total = Math.max(0, host1Score) + Math.max(0, host2Score);
    if (total > lastTotal.current) {
      setSpark(true);
      const id = window.setTimeout(() => setSpark(false), SPARK_MS);
      lastTotal.current = total;
      return () => window.clearTimeout(id);
    }
    lastTotal.current = total;
  }, [host1Score, host2Score]);

  if (battleStatus === 'idle') return null;

  const band = battleEnergyBand(host1Score, host2Score);
  const total = Math.max(0, host1Score) + Math.max(0, host2Score);
  const pctA = total <= 0 ? 50 : (Math.max(0, host1Score) / total) * 100;
  const pctB = 100 - pctA;
  const showVideo = !lite && !reducedMotion && !failed && battleStatus !== 'countdown';
  const statusClass =
    battleStatus === 'countdown'
      ? ' is-countdown'
      : battleStatus === 'finished'
        ? ' is-finished'
        : ' is-active';

  return (
    <div
      className={`lb-battle-skin${statusClass}${portrait ? ' is-portrait' : ''}${lite || reducedMotion ? ' is-lite' : ''}${spark ? ' is-spark' : ''}${leaderPulse === 'a' ? ' is-lead-a' : ''}${leaderPulse === 'b' ? ' is-lead-b' : ''}`}
      data-energy={band}
      data-mult-a={Math.max(1, Math.floor(multiplierHost1))}
      data-mult-b={Math.max(1, Math.floor(multiplierHost2))}
      aria-hidden
    >
      <div className="lb-battle-skin__ambient" />
      {showVideo ? (
        <video
          ref={videoRef}
          className="lb-battle-skin__video"
          autoPlay
          muted
          loop
          playsInline
          preload="metadata"
          onError={() => setFailed(true)}
        >
          <source src={BATTLE_SKIN_MP4} type="video/mp4" />
        </video>
      ) : (
        <div
          className="lb-battle-skin__still"
          style={{ backgroundImage: `url(${BATTLE_SKIN_STILL})` }}
        />
      )}
      <div className="lb-battle-skin__frame lb-battle-skin__frame--a" />
      <div className="lb-battle-skin__frame lb-battle-skin__frame--b" />
      <div className="lb-battle-skin__vs" />
      <div className="lb-battle-skin__meter">
        <span className="lb-battle-skin__meter-a" style={{ width: `${pctA}%` }} />
        <span className="lb-battle-skin__meter-b" style={{ width: `${pctB}%` }} />
      </div>
    </div>
  );
}
