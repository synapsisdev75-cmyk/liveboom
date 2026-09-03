import { LocalVideoTrack, Track } from 'livekit-client';
import { useEffect, useState, type MutableRefObject } from 'react';
import type { Room } from 'livekit-client';
import {
  acceptBattle,
  createBattleInvite,
  creditBattleGift,
  declineBattle,
  endBattle,
  listenLiveBattle,
  listenRoomBattleState,
  type IncomingBattle,
  type LiveBattle,
} from '../../../lib/battleFirestore';
import {
  disconnectBattle,
  joinBattleChannel,
  resumeBattleRemoteAudio,
  type AgoraBattleRemote,
} from '../../../lib/agoraBattle';
import type { ILocalAudioTrack, ILocalVideoTrack } from 'agora-rtc-sdk-ng';
import { fetchPublicUserByUsername } from '../../../lib/profileFirestore';
import { roomKey } from '../../../lib/roomKey';

type Args = {
  roomName: string;
  isHost: boolean;
  firebaseUid: string;
  displayName: string;
  handle: string;
  room: Room;
  cameraTrackRef: MutableRefObject<LocalVideoTrack | null>;
  onActiveChange?: (active: boolean) => void;
};

export function useAgoraBattle({
  roomName,
  isHost,
  firebaseUid,
  displayName,
  handle,
  room,
  cameraTrackRef,
  onActiveChange,
}: Args) {
  const [roomState, setRoomState] = useState<{ battleId: string | null; incoming: IncomingBattle | null }>({
    battleId: null,
    incoming: null,
  });
  const [battle, setBattle] = useState<LiveBattle | null>(null);
  const [remotes, setRemotes] = useState<AgoraBattleRemote[]>([]);
  const [localVideo, setLocalVideo] = useState<ILocalVideoTrack | null>(null);
  const [localAudio, setLocalAudio] = useState<ILocalAudioTrack | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => listenRoomBattleState(roomName, setRoomState), [roomName]);

  useEffect(() => {
    const watchId = roomState.battleId || roomState.incoming?.battleId;
    if (!watchId) {
      setBattle(null);
      return;
    }
    return listenLiveBattle(watchId, setBattle);
  }, [roomState.battleId, roomState.incoming?.battleId]);

  const liveBattle = battle?.status === 'live' ? battle : null;

  useEffect(() => {
    onActiveChange?.(Boolean(liveBattle));
  }, [liveBattle, onActiveChange]);

  useEffect(() => {
    if (!liveBattle || !firebaseUid) {
      void disconnectBattle();
      setLocalVideo(null);
      setLocalAudio(null);
      setRemotes([]);
      return;
    }
    let cancelled = false;

    void (async () => {
      let cam: MediaStreamTrack | null = null;
      let mic: MediaStreamTrack | null = null;
      // Ambos hosts de la batalla publican A/V; espectadores solo escuchan/ven.
      const asPublisher =
        isHost ||
        firebaseUid === liveBattle.hostAUid ||
        firebaseUid === liveBattle.hostBUid;
      if (asPublisher) {
        for (let i = 0; i < 25 && !cancelled; i += 1) {
          cam = cameraTrackRef.current?.mediaStreamTrack ?? null;
          if (cam && cam.readyState === 'live') break;
          await new Promise((resolve) => window.setTimeout(resolve, 200));
        }
        const micPub = Array.from(room.localParticipant.audioTrackPublications.values()).find(
          (item) => item.source === Track.Source.Microphone,
        );
        mic =
          micPub?.track && 'mediaStreamTrack' in micPub.track
            ? micPub.track.mediaStreamTrack
            : null;
        if (!mic || mic.readyState !== 'live') {
          try {
            await room.localParticipant.setMicrophoneEnabled(true);
            const again = Array.from(room.localParticipant.audioTrackPublications.values()).find(
              (item) => item.source === Track.Source.Microphone,
            );
            mic =
              again?.track && 'mediaStreamTrack' in again.track
                ? again.track.mediaStreamTrack
                : null;
          } catch {
            // Agora creará mic propio como fallback
          }
        }
      }
      if (cancelled) return;
      try {
        const result = await joinBattleChannel({
          channel: liveBattle.channel,
          battleId: liveBattle.id,
          firebaseUid,
          asHost: asPublisher,
          cameraTrack: cam,
          micTrack: mic,
          onRemotes: (users) => {
            if (!cancelled) setRemotes(users);
          },
        });
        if (!cancelled) {
          setLocalVideo(result.localVideo);
          setLocalAudio(result.localAudio);
          resumeBattleRemoteAudio();
        }
      } catch (error) {
        console.error('[battle] join', error);
        if (!cancelled) {
          setNote(error instanceof Error ? error.message : 'No se pudo entrar a la batalla');
        }
      }
    })();

    return () => {
      cancelled = true;
      void disconnectBattle();
      setLocalVideo(null);
      setLocalAudio(null);
    };
  }, [
    liveBattle?.id,
    liveBattle?.channel,
    liveBattle?.hostAUid,
    liveBattle?.hostBUid,
    firebaseUid,
    isHost,
    room,
    cameraTrackRef,
  ]);

  useEffect(() => {
    if (!liveBattle) return;
    const unlock = () => resumeBattleRemoteAudio();
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
    const timer = window.setInterval(() => resumeBattleRemoteAudio(), 2500);
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
      window.clearInterval(timer);
    };
  }, [liveBattle?.id]);

  useEffect(() => {
    return () => {
      void disconnectBattle();
    };
  }, []);

  useEffect(() => {
    if (!isHost || !liveBattle?.endsAtMs) return;
    const ms = liveBattle.endsAtMs - Date.now();
    if (ms <= 0) {
      void endBattle(liveBattle.id).catch(() => undefined);
      return;
    }
    const timer = window.setTimeout(() => {
      void endBattle(liveBattle.id).catch(() => undefined);
    }, ms + 250);
    return () => window.clearTimeout(timer);
  }, [isHost, liveBattle?.id, liveBattle?.endsAtMs]);

  async function invite(opponentHandle: string) {
    const guestHandle = opponentHandle.trim().replace(/^@/, '');
    if (!guestHandle || !isHost) return;
    setBusy(true);
    setNote(null);
    try {
      const guest = await fetchPublicUserByUsername(guestHandle);
      if (!guest?.firebaseUid) throw new Error(`No se encontró @${guestHandle}`);
      if (roomKey(guestHandle) === roomKey(roomName)) throw new Error('No puedes retarte a ti mismo');
      await createBattleInvite({
        hostAUid: firebaseUid,
        hostAUsername: roomName,
        hostAName: displayName || handle || roomName,
        hostBUid: guest.firebaseUid,
        hostBUsername: guestHandle,
        hostBName: guest.displayName || guestHandle,
      });
      setNote(`Reto enviado a @${guestHandle}`);
    } catch (error) {
      setNote(error instanceof Error ? error.message : 'No se pudo invitar');
    } finally {
      setBusy(false);
    }
  }

  async function accept(battleId = roomState.incoming?.battleId) {
    if (!battleId || !firebaseUid) return;
    setBusy(true);
    setNote(null);
    try {
      await acceptBattle(battleId, firebaseUid);
    } catch (error) {
      setNote(error instanceof Error ? error.message : 'No se pudo aceptar');
    } finally {
      setBusy(false);
    }
  }

  async function decline(battleId = roomState.incoming?.battleId) {
    if (!battleId) return;
    await declineBattle(battleId).catch(() => undefined);
  }

  async function stop() {
    const id = liveBattle?.id || roomState.battleId;
    if (id) await endBattle(id).catch(() => undefined);
    await disconnectBattle();
  }

  return {
    battle,
    liveBattle,
    incoming: roomState.incoming,
    remotes,
    localVideo,
    localAudio,
    busy,
    note,
    invite,
    accept,
    decline,
    stop,
    creditGift: (coins: number) => void creditBattleGift(roomName, coins).catch(() => undefined),
  };
}
