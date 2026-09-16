/** Tarifas de llamadas privadas (Blast/min). Cambiar solo aquí. */
const CALL_PRICING = {
  voice: 9,
  video_720: 18,
  video_1080: 32,
};

/** Valor estimado COP por Blast ganado por el receptor/creador. */
const CREATOR_VALUE_PER_BLAST = 15;

/** Segundos conectados por debajo de este umbral ⇒ cobro 0. Empieza al contestar. */
const BILLING_GRACE_SECONDS = 5;

/**
 * @param {'voice'|'video_720'|'video_1080'|'audio'|'video'|string} type
 * @param {'720'|'1080'|string|null|undefined} quality
 */
function normalizeCallType(type, quality) {
  const t = String(type || '').toLowerCase();
  const q = String(quality || '').toLowerCase();
  if (t === 'voice' || t === 'audio') return 'voice';
  if (t === 'video_1080' || q === '1080' || q === 'video_1080') return 'video_1080';
  if (t === 'video_720' || t === 'video' || q === '720') return 'video_720';
  return 'voice';
}

function blastPerMinute(callType) {
  const key = normalizeCallType(callType);
  return Math.max(0, Math.floor(Number(CALL_PRICING[key]) || 0));
}

/**
 * Fuente de verdad de Blast debidos.
 * totalBlastDue = ceil(connectedSeconds × rate / 60) si connectedSeconds >= grace; si no, 0.
 */
function calculateBlastDue(connectedSeconds, callType) {
  const sec = Math.max(0, Math.floor(Number(connectedSeconds) || 0));
  if (sec < BILLING_GRACE_SECONDS) return 0;
  const rate = blastPerMinute(callType);
  if (rate <= 0) return 0;
  return Math.ceil((sec * rate) / 60);
}

function creatorCopForBlast(blast) {
  return Math.max(0, Math.floor(Number(blast) || 0)) * CREATOR_VALUE_PER_BLAST;
}

function estimateRemainingSeconds(walletBlast, callType) {
  const rate = blastPerMinute(callType);
  const bal = Math.max(0, Math.floor(Number(walletBlast) || 0));
  if (rate <= 0) return Infinity;
  return Math.floor((bal / rate) * 60);
}

function pricingLabel(callType) {
  const key = normalizeCallType(callType);
  if (key === 'video_1080') return 'Video Premium';
  if (key === 'video_720') return 'Videollamada privada';
  return 'Llamada privada';
}

module.exports = {
  CALL_PRICING,
  CREATOR_VALUE_PER_BLAST,
  BILLING_GRACE_SECONDS,
  normalizeCallType,
  blastPerMinute,
  calculateBlastDue,
  creatorCopForBlast,
  estimateRemainingSeconds,
  pricingLabel,
};
