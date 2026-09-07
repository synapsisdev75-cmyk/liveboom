const { AccessToken, RoomServiceClient } = require('livekit-server-sdk');

function normalizeLiveKitUrl(raw) {
  let url = String(raw || '')
    .trim()
    .replace(/^['"]+|['"]+$/g, '')
    .replace(/\/+$/, '');
  if (!url) return '';
  if (/^https:/i.test(url)) url = url.replace(/^https:/i, 'wss:');
  else if (/^http:/i.test(url)) url = url.replace(/^http:/i, 'ws:');
  else if (!/^wss?:\/\//i.test(url)) url = `wss://${url}`;
  return url;
}

function livekitMissing() {
  const missing = [];
  if (!normalizeLiveKitUrl(process.env.LIVEKIT_URL)) missing.push('LIVEKIT_URL');
  if (!String(process.env.LIVEKIT_API_KEY || '').trim()) missing.push('LIVEKIT_API_KEY');
  if (!String(process.env.LIVEKIT_API_SECRET || '').trim()) missing.push('LIVEKIT_API_SECRET');
  return missing;
}

function livekitEnabled() {
  return livekitMissing().length === 0;
}

function livekitConfigError() {
  const missing = livekitMissing();
  return {
    error: 'LiveKit no está configurado en el API',
    code: 'LIVEKIT_NOT_CONFIGURED',
    stage: 'config',
    missing,
  };
}

function publicLiveKitUrl() {
  return normalizeLiveKitUrl(process.env.LIVEKIT_URL);
}

function livekitHttpHost() {
  const raw = publicLiveKitUrl();
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

async function ensureCallRoom(roomName) {
  const svc = roomService();
  if (!svc) return;
  try {
    await svc.createRoom({
      name: String(roomName),
      // Evita que LiveKit cierre la sala mientras uno llama y el otro aún no entra.
      emptyTimeout: 1800,
      departureTimeout: 60,
      maxParticipants: 4,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error || '');
    const code = error && typeof error === 'object' ? error.status || error.code : '';
    if (/already|exist/i.test(msg)) return;
    if (/unauthor|invalid|forbidden|401|403/i.test(`${msg} ${code}`)) {
      console.error('[ERROR]', { name: 'LiveKitRoomAuth', message: msg, status: code || null });
      throw error;
    }
    console.warn('[livekit] createRoom:', msg);
  }
}

async function createLivekitToken({ identity, name, room, canPublish, ensureRoom = false }) {
  const apiKey = String(process.env.LIVEKIT_API_KEY || '').trim();
  const apiSecret = String(process.env.LIVEKIT_API_SECRET || '').trim();
  if (ensureRoom) {
    await ensureCallRoom(room);
  }
  const token = new AccessToken(apiKey, apiSecret, {
    identity: String(identity),
    name: String(name || identity),
    ttl: '6h',
  });
  token.addGrant({
    roomJoin: true,
    roomCreate: true,
    room: String(room),
    canPublish: Boolean(canPublish),
    canSubscribe: true,
    canPublishData: true,
  });
  const jwt = await token.toJwt();
  if (typeof jwt !== 'string' || jwt.split('.').length < 3) {
    throw new Error('LiveKit toJwt no devolvió un JWT');
  }
  console.info('[CallConnect] tokenGenerated', {
    identity: String(identity),
    roomName: String(room),
    canPublish: Boolean(canPublish),
    tokenGenerated: true,
    liveKitUrlPresent: Boolean(publicLiveKitUrl()),
  });
  return jwt;
}

async function listActiveLiveRooms() {
  const svc = roomService();
  if (!svc) return [];
  try {
    const rooms = await svc.listRooms();
    return (rooms || [])
      .filter((room) => Number(room.numParticipants || 0) > 0)
      // Llamadas privadas P2P (dm_*) nunca van al feed de Lives.
      .filter((room) => !/^dm[_-]/i.test(String(room.name || '')))
      .map((room) => ({
        username: String(room.name || ''),
        uid: String(room.name || ''),
        displayName: String(room.name || ''),
        avatarUrl: null,
        title: `Live de ${room.name}`,
        startedAt: room.creationTime
          ? new Date(Number(room.creationTime) * 1000).toISOString()
          : new Date().toISOString(),
        viewers: Number(room.numParticipants || 0) - 1,
      }))
      .filter((item) => item.username);
  } catch (error) {
    console.warn('[livekit] listRooms:', error.message);
    return [];
  }
}

module.exports = {
  livekitEnabled,
  livekitMissing,
  livekitConfigError,
  createLivekitToken,
  ensureCallRoom,
  listActiveLiveRooms,
  livekitHttpHost,
  publicLiveKitUrl,
  normalizeLiveKitUrl,
};
