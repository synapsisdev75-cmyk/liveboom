const { AccessToken } = require('livekit-server-sdk');

function livekitEnabled() {
  return Boolean(
    process.env.LIVEKIT_URL && process.env.LIVEKIT_API_KEY && process.env.LIVEKIT_API_SECRET,
  );
}

async function createLivekitToken({ identity, name, room, canPublish }) {
  const token = new AccessToken(process.env.LIVEKIT_API_KEY, process.env.LIVEKIT_API_SECRET, {
    identity,
    name,
  });
  token.addGrant({
    roomJoin: true,
    room,
    canPublish: Boolean(canPublish),
    canSubscribe: true,
  });
  return token.toJwt();
}

module.exports = { livekitEnabled, createLivekitToken };
