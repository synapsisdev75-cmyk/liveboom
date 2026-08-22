import { AccessToken } from 'livekit-server-sdk';
import type { Env } from '../env.js';

export function livekitEnabled(env: Env): boolean {
  return Boolean(env.LIVEKIT_URL && env.LIVEKIT_API_KEY && env.LIVEKIT_API_SECRET);
}

export async function createViewerToken(
  env: Env,
  roomName: string,
  identity: string,
  name: string,
): Promise<string> {
  const token = new AccessToken(env.LIVEKIT_API_KEY, env.LIVEKIT_API_SECRET, {
    identity,
    name,
  });
  token.addGrant({ roomJoin: true, room: roomName, canPublish: false, canSubscribe: true });
  return token.toJwt();
}
