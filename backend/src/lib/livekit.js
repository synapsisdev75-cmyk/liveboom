const { AccessToken, RoomServiceClient } = require('livekit-server-sdk');

function livekitEnabled() {
  return Boolean(
    process.env.LIVEKIT_URL && process.env.LIVEKIT_API_KEY && process.env.LIVEKIT_API_SECRET,
  );
}

function livekitHttpHost() {
  const raw = String(process.env.LIVEKIT_URL || '').trim();
  if (!raw) return '';
  return raw.replace(/^wss:/i, 'https:').replace(/^ws:/i, 'http:');
}

function roomService() {
  const host = livekitHttpHost();
  const apiKey = String(process.env.LIVEKIT_API_KEY || '').trim();
  const apiSecret = String(process.env.LIVEKIT_API_SECRET || '').trim();
  if (!host || !apiKey || !apiSecret) return null;
  return new RoomServiceClient(host, apiKey, apiSecret);
}

async function createLivekitToken({ identity, name, room, canPublish }) {
  const apiKey = String(process.env.LIVEKIT_API_KEY || '').trim();
  const apiSecret = String(process.env.LIVEKIT_API_SECRET || '').trim();
  const token = new AccessToken(apiKey, apiSecret, {
    identity: String(identity),
    name: String(name || identity),
  });
  token.addGrant({
    roomJoin: true,
    room: String(room),
    canPublish: Boolean(canPublish),
    canSubscribe: true,
    canPublishData: true,
  });
  return token.toJwt();
}

async function listActiveLiveRooms() {
  const svc = roomService();
  if (!svc) return [];
  try {
    const rooms = await svc.listRooms();
    return (rooms || [])
      .filter((room) => Number(room.numParticipants || 0) > 0)
      .map((room) => ({
        username: String(room.name || ''),
        uid: String(room.name || ''),
        displayName: String(room.name || ''),
        avatarUrl: null,
        title: `Live de ${room.name}`,
        startedAt: room.creationTime
          ? new Date(Number(room.creationTime) * 1000).toISOString()
          : new Date().toISOString(),
        viewers: Number(room.numParticipants || 0),
      }))
      .filter((item) => item.username);
  } catch (error) {
    console.warn('[livekit] listRooms:', error.message);
    return [];
  }
}

module.exports = {
  livekitEnabled,
  createLivekitToken,
  listActiveLiveRooms,
  livekitHttpHost,
};
