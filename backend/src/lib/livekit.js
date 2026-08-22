const { AccessToken } = require('livekit-server-sdk');

function livekitEnabled() {
  return Boolean(
    process.env.LIVEKIT_URL && process.env.LIVEKIT_API_KEY && process.env.LIVEKIT_API_SECRET,
  );
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

module.exports = { livekitEnabled, createLivekitToken };
