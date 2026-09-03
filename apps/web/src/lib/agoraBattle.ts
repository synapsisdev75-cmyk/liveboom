import type {
  IAgoraRTCClient,
  ILocalAudioTrack,
  ILocalVideoTrack,
  IRemoteAudioTrack,
  IRemoteVideoTrack,
  IAgoraRTCRemoteUser,
} from 'agora-rtc-sdk-ng';
import { api } from './api';
import { AGORA_APP_ID, agoraUid } from './agoraBattleId';

export type AgoraBattleRemote = {
  uid: number;
  videoTrack: IRemoteVideoTrack | ILocalVideoTrack | null;
  audioTrack: IRemoteAudioTrack | ILocalAudioTrack | null;
  local: boolean;
};

type TokenRes = {
  token: string;
  appId: string;
  channel: string;
  uid: number;
};

type Session = {
  client: IAgoraRTCClient;
  localVideo: ILocalVideoTrack | null;
  localAudio: ILocalAudioTrack | null;
  clones: MediaStreamTrack[];
};

let session: Session | null = null;

function playRemoteAudio(user: IAgoraRTCRemoteUser) {
  const track = user.audioTrack;
  if (!track) return;
  try {
    track.setVolume(100);
    track.play();
  } catch (error) {
    console.warn('[battle] audio play', error);
  }
}

function playAllRemoteAudio(client: IAgoraRTCClient) {
  for (const user of client.remoteUsers) {
    if (user.hasAudio || user.audioTrack) playRemoteAudio(user);
  }
}

export async function disconnectBattle() {
  const current = session;
  session = null;
  if (!current) return;
  try {
    current.client.removeAllListeners();
    if (current.localVideo || current.localAudio) {
      await current.client
        .unpublish(
          [current.localVideo, current.localAudio].filter(Boolean) as (
            | ILocalVideoTrack
            | ILocalAudioTrack
          )[],
        )
        .catch(() => undefined);
    }
    // Solo cierra tracks de Agora / clones — no toca LiveKit.
    current.localVideo?.stop();
    current.localVideo?.close();
    current.localAudio?.stop();
    current.localAudio?.close();
    current.clones.forEach((track) => {
      try {
        track.stop();
      } catch {
        // ignore
      }
    });
    await current.client.leave();
  } catch (error) {
    console.warn('[battle] leave', error);
  }
}

export async function joinBattleChannel(input: {
  channel: string;
  battleId: string;
  firebaseUid: string;
  asHost: boolean;
  cameraTrack?: MediaStreamTrack | null;
  micTrack?: MediaStreamTrack | null;
  onRemotes: (users: AgoraBattleRemote[]) => void;
}): Promise<{ localVideo: ILocalVideoTrack | null; localAudio: ILocalAudioTrack | null }> {
  await disconnectBattle();
  const AgoraRTC = (await import('agora-rtc-sdk-ng')).default;
  AgoraRTC.setLogLevel(3);

  const minted = await api<TokenRes>('/api/battle/token', {
    method: 'POST',
    body: JSON.stringify({
      battleId: input.battleId,
      channel: input.channel,
      asHost: input.asHost,
    }),
  });

  const client = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' });
  const uid = minted.uid || agoraUid(input.firebaseUid);

  const emit = () => {
    const remotes: AgoraBattleRemote[] = client.remoteUsers.map((user) => ({
      uid: Number(user.uid),
      videoTrack: user.videoTrack ?? null,
      audioTrack: user.audioTrack ?? null,
      local: false,
    }));
    input.onRemotes(remotes);
    playAllRemoteAudio(client);
  };

  client.on('user-published', async (user, mediaType) => {
    try {
      await client.subscribe(user, mediaType);
      if (mediaType === 'audio') playRemoteAudio(user);
      emit();
    } catch (error) {
      console.warn('[battle] subscribe', mediaType, error);
    }
  });
  client.on('user-unpublished', () => emit());
  client.on('user-left', () => emit());
  client.on('user-joined', () => emit());

  await client.join(minted.appId || AGORA_APP_ID, minted.channel, minted.token, uid);

  // Usuarios que ya estaban en el canal (el otro host / espectadores llegan después).
  for (const user of client.remoteUsers) {
    try {
      if (user.hasAudio) {
        await client.subscribe(user, 'audio');
        playRemoteAudio(user);
      }
      if (user.hasVideo) {
        await client.subscribe(user, 'video');
      }
    } catch (error) {
      console.warn('[battle] subscribe existing', error);
    }
  }

  const clones: MediaStreamTrack[] = [];
  let localVideo: ILocalVideoTrack | null = null;
  let localAudio: ILocalAudioTrack | null = null;

  if (input.asHost) {
    if (input.cameraTrack && input.cameraTrack.readyState === 'live') {
      const clone = input.cameraTrack.clone();
      clones.push(clone);
      localVideo = AgoraRTC.createCustomVideoTrack({ mediaStreamTrack: clone });
    } else {
      localVideo = await AgoraRTC.createCameraVideoTrack({ facingMode: 'user' });
    }
    if (input.micTrack && input.micTrack.readyState === 'live') {
      const clone = input.micTrack.clone();
      clones.push(clone);
      localAudio = AgoraRTC.createCustomAudioTrack({
        mediaStreamTrack: clone,
      });
    } else {
      localAudio = await AgoraRTC.createMicrophoneAudioTrack({
        AEC: true,
        ANS: true,
      });
    }
    await client.publish(
      [localVideo, localAudio].filter(Boolean) as (ILocalVideoTrack | ILocalAudioTrack)[],
    );
  }

  session = { client, localVideo, localAudio, clones };
  emit();
  // Reintento suave por políticas de autoplay del navegador
  window.setTimeout(() => playAllRemoteAudio(client), 400);
  window.setTimeout(() => playAllRemoteAudio(client), 1200);

  return { localVideo, localAudio };
}

/** Fuerza reproducir audios remotos (p. ej. tras gesto del usuario). */
export function resumeBattleRemoteAudio() {
  if (!session?.client) return;
  playAllRemoteAudio(session.client);
}
