const { RtcTokenBuilder, RtcRole } = require('agora-token');

const CHANNEL_RE = /^lb_b[a-z0-9]+$/i;

function agoraAppId() {
  return String(process.env.AGORA_APP_ID || process.env.VITE_AGORA_APP_ID || '').trim();
}

function agoraCertificate() {
  return String(process.env.AGORA_APP_CERTIFICATE || '').trim();
}

function agoraEnabled() {
  return Boolean(agoraAppId() && agoraCertificate());
}

/** Mismo hash que el cliente: uid numérico de Agora (1..2^31-2). */
function agoraUid(firebaseUid) {
  const s = String(firebaseUid || '');
  let h = 2166136261;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) % 2147483646 || 1;
}

function isBattleChannel(channel) {
  return CHANNEL_RE.test(String(channel || '').trim());
}

function buildRtcToken({ channel, uid, publisher, expireSec = 3600 }) {
  const appId = agoraAppId();
  const cert = agoraCertificate();
  if (!appId || !cert) {
    throw new Error('Agora no está configurado (AGORA_APP_ID / AGORA_APP_CERTIFICATE)');
  }
  const room = String(channel || '').trim();
  if (!isBattleChannel(room)) {
    throw new Error('Canal de batalla inválido');
  }
  const numericUid = Number(uid);
  if (!Number.isFinite(numericUid) || numericUid <= 0) {
    throw new Error('uid de Agora inválido');
  }
  const role = publisher ? RtcRole.PUBLISHER : RtcRole.SUBSCRIBER;
  const expire = Math.max(60, Math.min(Number(expireSec) || 3600, 24 * 3600));
  // agora-token 2.x: tokenExpire = segundos de vida.
  const token = RtcTokenBuilder.buildTokenWithUid(appId, cert, room, numericUid, role, expire, expire);
  return {
    token,
    appId,
    channel: room,
    uid: numericUid,
    role: publisher ? 'publisher' : 'subscriber',
    expireSec: expire,
  };
}

module.exports = {
  agoraEnabled,
  agoraAppId,
  agoraUid,
  isBattleChannel,
  buildRtcToken,
  RtcRole,
};
