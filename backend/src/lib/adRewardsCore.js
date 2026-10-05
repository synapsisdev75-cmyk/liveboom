/**
 * Gana Puntos — reglas puras (sin I/O).
 * Puntos publicitarios → BLAST ganados → retiro. Nunca se entrega BLAST directo por un anuncio.
 * El valor en pesos del punto/BLAST es interno: nunca se envía al usuario.
 */

const ACTIONS = [
  'VIEW_SHORT',
  'VIEW_FULL',
  'VIEW_LONG',
  'VISIT_PROFILE',
  'FOLLOW',
  'VIEW_FOLLOW',
  'COMMENT',
  'REGISTER',
  'DOWNLOAD_FORM',
  'PURCHASE',
];

const ACTION_KIND = {
  VIEW_SHORT: 'view',
  VIEW_FULL: 'view',
  VIEW_LONG: 'view',
  VISIT_PROFILE: 'visit',
  FOLLOW: 'follow',
  VIEW_FOLLOW: 'view_follow',
  COMMENT: 'comment',
  REGISTER: 'external',
  DOWNLOAD_FORM: 'external',
  PURCHASE: 'external',
};

const CAMPAIGN_STATUS = [
  'BORRADOR',
  'PROGRAMADA',
  'ACTIVA',
  'PAUSADA',
  'FINALIZADA',
  'AGOTADA',
  'CANCELADA',
];

const CLAIM_STATUS = {
  VALIDADO: 'VALIDADO',
  PENDIENTE: 'PENDIENTE',
  SOSPECHOSO: 'SOSPECHOSO',
  RECHAZADO: 'RECHAZADO',
};

const SURFACES = ['inicio', 'explorar', 'clips', 'flash'];

const DEFAULT_ACTIONS = {
  VIEW_SHORT: { label: 'Publicidad corta', minSeconds: 45, points: 50 },
  VIEW_FULL: { label: 'Publicidad completa', minSeconds: 60, points: 75 },
  VIEW_LONG: { label: 'Publicidad larga', minSeconds: 90, points: 100 },
  VISIT_PROFILE: { label: 'Visitar perfil o página', minSeconds: 20, points: 125 },
  FOLLOW: { label: 'Seguir o suscribirse', minSeconds: 0, points: 200 },
  VIEW_FOLLOW: { label: 'Ver y seguir', minSeconds: 45, points: 250 },
  COMMENT: { label: 'Comentario válido', minSeconds: 0, points: 300 },
  REGISTER: { label: 'Registro confirmado', minSeconds: 0, points: 500 },
  DOWNLOAD_FORM: { label: 'Descarga o formulario', minSeconds: 0, points: 750 },
  PURCHASE: { label: 'Compra o conversión', minSeconds: 0, points: 1000, minPoints: 1000, maxPoints: 5000 },
};

const DEFAULT_CONFIG = {
  enabled: true,
  pointsPerBlast: 1500,
  adIntervalMinutes: 10,
  dailyRewardLimit: 20,
  dailyFollowLimit: 5,
  followHoldHours: 72,
  maxAccountsPerDevice: 2,
  maxAccountsPerIp: 8,
  /** Interno (solo backend / Super Admin): pesos por BLAST ganado. */
  copPerEarnedBlast: 15,
  actions: DEFAULT_ACTIONS,
};

const HEARTBEAT_MIN_MS = 2500;
const HEARTBEAT_MAX_GAP_MS = 15000;
const HEARTBEAT_CREDIT_CAP_MS = 6000;
const VIEW_TOLERANCE_MS = 1500;

function int(value, fallback, min, max) {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function text(value, max = 500) {
  return String(value ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .trim()
    .slice(0, max);
}

function normalizeAction(id, raw) {
  const base = DEFAULT_ACTIONS[id];
  const src = raw && typeof raw === 'object' ? raw : {};
  const out = {
    label: text(src.label, 60) || base.label,
    minSeconds: int(src.minSeconds, base.minSeconds, 0, 600),
    points: int(src.points, base.points, 1, 100000),
    enabled: src.enabled !== false,
  };
  if (id === 'PURCHASE') {
    out.minPoints = int(src.minPoints, base.minPoints, 1, 100000);
    out.maxPoints = int(src.maxPoints, base.maxPoints, out.minPoints, 100000);
    out.points = Math.min(out.maxPoints, Math.max(out.minPoints, out.points));
  }
  return out;
}

function normalizeConfig(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const actionsSrc = src.actions && typeof src.actions === 'object' ? src.actions : {};
  const actions = {};
  for (const id of ACTIONS) actions[id] = normalizeAction(id, actionsSrc[id]);
  const dailyRewardLimit = int(src.dailyRewardLimit, DEFAULT_CONFIG.dailyRewardLimit, 1, 30);
  return {
    enabled: src.enabled !== false,
    pointsPerBlast: int(src.pointsPerBlast, DEFAULT_CONFIG.pointsPerBlast, 1, 1_000_000),
    adIntervalMinutes: int(src.adIntervalMinutes, DEFAULT_CONFIG.adIntervalMinutes, 1, 240),
    dailyRewardLimit,
    dailyFollowLimit: int(src.dailyFollowLimit, DEFAULT_CONFIG.dailyFollowLimit, 1, dailyRewardLimit),
    followHoldHours: int(src.followHoldHours, DEFAULT_CONFIG.followHoldHours, 1, 720),
    maxAccountsPerDevice: int(src.maxAccountsPerDevice, DEFAULT_CONFIG.maxAccountsPerDevice, 1, 20),
    maxAccountsPerIp: int(src.maxAccountsPerIp, DEFAULT_CONFIG.maxAccountsPerIp, 1, 200),
    copPerEarnedBlast: int(src.copPerEarnedBlast, DEFAULT_CONFIG.copPerEarnedBlast, 0, 1_000_000),
    actions,
    latestPublishedAtMs: int(src.latestPublishedAtMs, 0, 0, Number.MAX_SAFE_INTEGER),
  };
}

function isUrl(value) {
  return /^https:\/\/[^\s]+$/i.test(String(value || ''));
}

function parseMs(value) {
  if (value == null || value === '') return 0;
  if (typeof value === 'number') return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
  const t = Date.parse(String(value));
  return Number.isFinite(t) ? t : 0;
}

function list(value, max = 20, itemMax = 40) {
  const raw = Array.isArray(value) ? value : String(value || '').split(',');
  return [...new Set(raw.map((v) => text(v, itemMax).toLowerCase()).filter(Boolean))].slice(0, max);
}

/**
 * Valida el formulario de campaña del Super Admin.
 * @returns {{ ok: true, campaign: object } | { ok: false, error: string }}
 */
function normalizeCampaignInput(raw, config) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const cfg = normalizeConfig(config);
  const actionType = ACTIONS.includes(src.actionType) ? src.actionType : null;
  if (!actionType) return { ok: false, error: 'Tipo de acción inválido.' };
  const action = cfg.actions[actionType];
  const name = text(src.name, 90);
  if (!name) return { ok: false, error: 'La campaña necesita un nombre.' };
  const advertiser = text(src.advertiser, 90);
  if (!advertiser) return { ok: false, error: 'Indica el anunciante.' };

  const imageUrl = text(src.imageUrl, 1200);
  const videoUrl = text(src.videoUrl, 1200);
  const linkUrl = text(src.linkUrl, 1200);
  if (imageUrl && !isUrl(imageUrl)) return { ok: false, error: 'La imagen debe ser un enlace https.' };
  if (videoUrl && !isUrl(videoUrl)) return { ok: false, error: 'El video debe ser un enlace https.' };
  if (linkUrl && !isUrl(linkUrl)) return { ok: false, error: 'El enlace debe empezar por https://' };
  if (!imageUrl && !videoUrl) return { ok: false, error: 'Agrega una imagen o un video.' };

  const kind = ACTION_KIND[actionType];
  const advertiserUsername = text(src.advertiserUsername, 40).replace(/^@/, '').toLowerCase();
  const advertiserUid = text(src.advertiserUid, 128);
  if ((kind === 'follow' || kind === 'view_follow' || kind === 'visit') && !advertiserUid) {
    return { ok: false, error: 'Esta acción necesita la cuenta LiveBoom del anunciante.' };
  }
  if (kind === 'external' && !linkUrl) {
    return { ok: false, error: 'Registro, descarga o compra necesitan el enlace del anunciante.' };
  }

  let points = int(src.points, action.points, 1, 100000);
  if (actionType === 'PURCHASE') {
    points = Math.min(action.maxPoints, Math.max(action.minPoints, points));
  }
  const minSecondsFloor = kind === 'view' || kind === 'view_follow' || kind === 'visit' ? 5 : 0;
  const minSeconds = int(src.minSeconds, action.minSeconds, minSecondsFloor, 600);

  const startAtMs = parseMs(src.startAtMs ?? src.startAt);
  const endAtMs = parseMs(src.endAtMs ?? src.endAt);
  if (endAtMs && startAtMs && endAtMs <= startAtMs) {
    return { ok: false, error: 'La fecha final debe ser posterior al inicio.' };
  }
  const budgetPoints = int(src.budgetPoints, 0, 0, 1_000_000_000);
  if (budgetPoints < points) return { ok: false, error: 'El presupuesto no alcanza ni para una recompensa.' };

  const status = CAMPAIGN_STATUS.includes(src.status) ? src.status : 'BORRADOR';
  const surfaces = list(src.surfaces, SURFACES.length).filter((s) => SURFACES.includes(s));
  const ageMin = int(src.ageMin, 18, 18, 100);
  const ageMax = int(src.ageMax, 100, ageMin, 100);
  const gender = ['todos', 'mujer', 'hombre', 'otro'].includes(src.gender) ? src.gender : 'todos';
  const allowRecurrence = Boolean(src.allowRecurrence);

  return {
    ok: true,
    campaign: {
      name,
      advertiser,
      advertiserUsername,
      advertiserUid,
      description: text(src.description, 600),
      ctaLabel: text(src.ctaLabel, 30),
      imageUrl,
      videoUrl,
      linkUrl,
      actionType,
      points,
      minSeconds,
      startAtMs,
      endAtMs,
      budgetPoints,
      maxActions: int(src.maxActions, 0, 0, 10_000_000),
      maxParticipationsPerUser: allowRecurrence ? int(src.maxParticipationsPerUser, 1, 1, 50) : 1,
      allowRecurrence,
      frequencyMinutes: int(src.frequencyMinutes, cfg.adIntervalMinutes, 1, 10080),
      country: text(src.country, 60).toLowerCase(),
      city: text(src.city, 60).toLowerCase(),
      ageMin,
      ageMax,
      gender,
      interests: list(src.interests),
      surfaces: surfaces.length ? surfaces : [...SURFACES],
      status,
      autoPublish: src.autoPublish !== false,
    },
  };
}

function remainingBudget(campaign) {
  const c = campaign || {};
  return (
    int(c.budgetPoints, 0, 0, Number.MAX_SAFE_INTEGER) -
    int(c.awardedPoints, 0, 0, Number.MAX_SAFE_INTEGER) -
    int(c.reservedPoints, 0, 0, Number.MAX_SAFE_INTEGER)
  );
}

function isExhausted(campaign) {
  const c = campaign || {};
  const points = int(c.points, 1, 1, Number.MAX_SAFE_INTEGER);
  if (remainingBudget(c) < points) return true;
  const maxActions = int(c.maxActions, 0, 0, Number.MAX_SAFE_INTEGER);
  const actions = int(c.actionsCount, 0, 0, Number.MAX_SAFE_INTEGER);
  return maxActions > 0 && actions >= maxActions;
}

/** Estado real según fechas, presupuesto y cupos (el guardado puede quedar desfasado). */
function effectiveStatus(campaign, nowMs = Date.now()) {
  const c = campaign || {};
  const stored = CAMPAIGN_STATUS.includes(c.status) ? c.status : 'BORRADOR';
  if (['BORRADOR', 'PAUSADA', 'CANCELADA', 'FINALIZADA', 'AGOTADA'].includes(stored)) return stored;
  if (c.endAtMs && nowMs > c.endAtMs) return 'FINALIZADA';
  if (isExhausted(c)) return 'AGOTADA';
  if (c.startAtMs && nowMs < c.startAtMs) return 'PROGRAMADA';
  if (stored === 'PROGRAMADA') return c.autoPublish === false ? 'PROGRAMADA' : 'ACTIVA';
  return 'ACTIVA';
}

function ageFromBirthDate(birthDate, nowMs = Date.now()) {
  const t = Date.parse(String(birthDate || ''));
  if (!Number.isFinite(t)) return null;
  const birth = new Date(t);
  const now = new Date(nowMs);
  let age = now.getUTCFullYear() - birth.getUTCFullYear();
  const m = now.getUTCMonth() - birth.getUTCMonth();
  if (m < 0 || (m === 0 && now.getUTCDate() < birth.getUTCDate())) age -= 1;
  return age >= 0 && age < 130 ? age : null;
}

function normText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

/** Segmentación: un dato desconocido del usuario no lo excluye. */
function matchesTargeting(campaign, user, nowMs = Date.now()) {
  const c = campaign || {};
  const u = user || {};
  const geo = u.geo && typeof u.geo === 'object' ? u.geo : {};
  if (c.country) {
    const country = normText(geo.country || geo.countryCode);
    if (country && !country.includes(normText(c.country)) && normText(c.country) !== country) return false;
  }
  if (c.city) {
    const city = normText(geo.city);
    if (city && !city.includes(normText(c.city))) return false;
  }
  const age = ageFromBirthDate(u.birthDate, nowMs);
  if (age != null && (age < int(c.ageMin, 18, 0, 130) || age > int(c.ageMax, 100, 0, 130))) return false;
  if (c.gender && c.gender !== 'todos') {
    const gender = normText(u.gender);
    if (gender && gender !== c.gender) return false;
  }
  const interests = Array.isArray(c.interests) ? c.interests : [];
  if (interests.length) {
    const own = [
      ...(Array.isArray(u.interests) ? u.interests : []),
      u.category || '',
    ]
      .map(normText)
      .filter(Boolean);
    if (own.length && !own.some((i) => interests.some((t) => i.includes(normText(t))))) return false;
  }
  return true;
}

/** Día calendario en Colombia (UTC-5, sin horario de verano). */
function dayKey(nowMs = Date.now()) {
  return new Date(nowMs - 5 * 60 * 60 * 1000).toISOString().slice(0, 10).replace(/-/g, '');
}

function computeConversion(availablePoints, pointsPerBlast) {
  const points = int(availablePoints, 0, 0, Number.MAX_SAFE_INTEGER);
  const rate = int(pointsPerBlast, DEFAULT_CONFIG.pointsPerBlast, 1, Number.MAX_SAFE_INTEGER);
  const blast = Math.floor(points / rate);
  const used = blast * rate;
  return { blast, used, remaining: points - used };
}

/**
 * Suma tiempo visible del lado del servidor a partir de latidos.
 * Huecos largos (pestaña oculta, pantalla bloqueada, sin red) no cuentan.
 */
function applyHeartbeat(session, { nowMs, visible }) {
  const s = { ...session };
  const last = int(s.lastBeatMs, s.startedAtMs || nowMs, 0, Number.MAX_SAFE_INTEGER);
  const delta = nowMs - last;
  const signals = new Set(Array.isArray(s.signals) ? s.signals : []);
  if (delta < HEARTBEAT_MIN_MS) {
    s.fastBeats = int(s.fastBeats, 0, 0, 1e6) + 1;
    if (s.fastBeats >= 5) signals.add('FAST_BEATS');
    s.signals = [...signals];
    return { session: s, creditedMs: 0, ignored: true };
  }
  let creditedMs = 0;
  if (visible !== false && delta <= HEARTBEAT_MAX_GAP_MS) {
    creditedMs = Math.min(delta, HEARTBEAT_CREDIT_CAP_MS);
  }
  s.visibleMs = int(s.visibleMs, 0, 0, Number.MAX_SAFE_INTEGER) + creditedMs;
  s.beats = int(s.beats, 0, 0, 1e6) + 1;
  s.lastBeatMs = nowMs;
  s.signals = [...signals];
  return { session: s, creditedMs, ignored: false };
}

function evaluateViewSession(session, { nowMs, minSeconds }) {
  const s = session || {};
  const needMs = int(minSeconds, 0, 0, 3600) * 1000;
  const elapsedMs = nowMs - int(s.startedAtMs, nowMs, 0, Number.MAX_SAFE_INTEGER);
  const visibleMs = int(s.visibleMs, 0, 0, Number.MAX_SAFE_INTEGER);
  const ok = elapsedMs >= needMs && visibleMs + VIEW_TOLERANCE_MS >= needMs;
  const remainingSeconds = ok ? 0 : Math.max(1, Math.ceil((needMs - Math.min(visibleMs + VIEW_TOLERANCE_MS, elapsedMs)) / 1000));
  return { ok, elapsedMs, visibleMs, remainingSeconds };
}

/** Señales del cliente que no se pueden falsificar a favor del usuario: solo suman sospecha. */
function clientSignals(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const out = [];
  if (src.webdriver === true) out.push('AUTOMATION');
  if (src.emulator === true) out.push('EMULATOR_SUSPECT');
  const rate = Number(src.playbackRate);
  if (Number.isFinite(rate) && rate > 1.05) out.push('ACCELERATED_PLAYBACK');
  if (src.seekedForward === true) out.push('SEEK_FORWARD');
  if (src.clockSkew === true) out.push('CLOCK_MANIPULATION');
  return out;
}

/** Una señal deja la recompensa en auditoría; nunca bloquea sola de forma irreversible. */
function claimStatusFor(signals, { holdForFollow = false } = {}) {
  const list = Array.isArray(signals) ? signals.filter(Boolean) : [];
  if (list.length) return CLAIM_STATUS.SOSPECHOSO;
  return holdForFollow ? CLAIM_STATUS.PENDIENTE : CLAIM_STATUS.VALIDADO;
}

const EMOJI_RE = /\p{Extended_Pictographic}/gu;

function normalizeCommentText(value) {
  return normText(value)
    .replace(EMOJI_RE, '')
    .replace(/[^a-z0-9ñ ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Comentario válido: no vacío, sin spam de emojis, con texto real y no automatizado.
 * Duplicados y textos masivos se revisan contra Firestore en el servicio.
 */
function validateComment(raw) {
  const value = String(raw ?? '').trim();
  if (!value) return { ok: false, error: 'Escribe un comentario.' };
  if (value.length > 400) return { ok: false, error: 'El comentario es demasiado largo.' };
  const emojis = (value.match(EMOJI_RE) || []).length;
  const norm = normalizeCommentText(value);
  const letters = (norm.match(/[a-zñ]/g) || []).length;
  const words = norm.split(' ').filter((w) => w.length >= 2);
  if (letters < 8 || words.length < 3) {
    return { ok: false, error: 'Escribe un comentario real de al menos 3 palabras.' };
  }
  if (emojis > 0 && emojis * 2 > letters) return { ok: false, error: 'Demasiados emojis.' };
  if (/(.)\1{5,}/.test(norm.replace(/\s/g, ''))) return { ok: false, error: 'El comentario parece spam.' };
  const unique = new Set(words);
  if (unique.size * 2 < words.length) return { ok: false, error: 'El comentario repite las mismas palabras.' };
  if (/https?:\/\/|www\./i.test(value)) return { ok: false, error: 'Los comentarios no pueden incluir enlaces.' };
  return { ok: true, text: value, norm };
}

/** Lo que ve el usuario: sin presupuesto, costos ni valores internos. */
function publicCampaign(campaign, config) {
  const c = campaign || {};
  const cfg = normalizeConfig(config);
  const action = cfg.actions[c.actionType] || DEFAULT_ACTIONS.VIEW_SHORT;
  return {
    id: c.id,
    name: c.name,
    advertiser: c.advertiser,
    advertiserUsername: c.advertiserUsername || '',
    advertiserUid: c.advertiserUid || '',
    description: c.description || '',
    ctaLabel: c.ctaLabel || '',
    imageUrl: c.imageUrl || '',
    videoUrl: c.videoUrl || '',
    linkUrl: c.linkUrl || '',
    actionType: c.actionType,
    actionKind: ACTION_KIND[c.actionType] || 'view',
    actionLabel: action.label,
    points: int(c.points, action.points, 1, 100000),
    minSeconds: int(c.minSeconds, action.minSeconds, 0, 600),
  };
}

module.exports = {
  ACTIONS,
  ACTION_KIND,
  CAMPAIGN_STATUS,
  CLAIM_STATUS,
  SURFACES,
  DEFAULT_CONFIG,
  HEARTBEAT_MIN_MS,
  normalizeConfig,
  normalizeCampaignInput,
  remainingBudget,
  isExhausted,
  effectiveStatus,
  ageFromBirthDate,
  matchesTargeting,
  dayKey,
  computeConversion,
  applyHeartbeat,
  evaluateViewSession,
  clientSignals,
  claimStatusFor,
  normalizeCommentText,
  validateComment,
  publicCampaign,
};
