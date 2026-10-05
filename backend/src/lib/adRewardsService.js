/**
 * Gana Puntos — persistencia y transacciones (Firestore Admin).
 * Los BLAST solo entran a la billetera por walletService.creditEarned (bucket EARNED).
 */

const crypto = require('crypto');
const { FieldValue } = require('firebase-admin/firestore');
const { getAdminDb } = require('./firestoreAdmin');
const core = require('./adRewardsCore');

const COL = {
  campaigns: 'adRewardCampaigns',
  wallets: 'adRewardWallets',
  claims: 'adRewardClaims',
  sessions: 'adRewardSessions',
  daily: 'adRewardDaily',
  devices: 'adRewardDevices',
  ips: 'adRewardIps',
  impressions: 'adRewardImpressions',
  participations: 'adRewardParticipations',
  conversions: 'adRewardConversions',
  comments: 'adRewardComments',
  leads: 'adRewardLeads',
  stats: 'adRewardStats',
};
const CONFIG_DOC = 'config/adRewards';
const ORIGIN = 'RECOMPENSA PUBLICITARIA';
const SESSION_MAX_AGE_MS = 30 * 60 * 1000;
const LEAD_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const RAPID_CLAIM_MS = 10_000;

class RewardError extends Error {
  constructor(code, message, status = 400, extra = {}) {
    super(message);
    this.code = code;
    this.status = status;
    this.extra = extra;
  }
}

function db() {
  return getAdminDb();
}

function hash(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex').slice(0, 40);
}

function inc(n) {
  return FieldValue.increment(n);
}

let configCache = { at: 0, value: null };

async function loadConfig({ fresh = false } = {}) {
  if (!fresh && configCache.value && Date.now() - configCache.at < 30_000) return configCache.value;
  const snap = await db().doc(CONFIG_DOC).get();
  const value = core.normalizeConfig(snap.exists ? snap.data() : {});
  configCache = { at: Date.now(), value };
  return value;
}

async function saveConfig(patch, actor) {
  const current = await loadConfig({ fresh: true });
  const next = core.normalizeConfig({ ...current, ...(patch || {}), latestPublishedAtMs: current.latestPublishedAtMs });
  await db()
    .doc(CONFIG_DOC)
    .set({ ...next, updatedAtMs: Date.now(), updatedBy: actor || null }, { merge: true });
  configCache = { at: 0, value: null };
  return next;
}

async function announceNewCampaigns() {
  await db().doc(CONFIG_DOC).set({ latestPublishedAtMs: Date.now() }, { merge: true });
  configCache = { at: 0, value: null };
}

function campaignFromSnap(snap) {
  return snap.exists ? { id: snap.id, ...snap.data() } : null;
}

const KIND_STAT = {
  view: ['viewsCompleted'],
  visit: ['visits'],
  follow: ['follows'],
  view_follow: ['viewsCompleted', 'follows'],
  comment: ['comments'],
};
const EXTERNAL_STAT = { REGISTER: 'registrations', DOWNLOAD_FORM: 'downloads', PURCHASE: 'conversions' };

function validatedStatFields(actionType, visibleMs) {
  const kind = core.ACTION_KIND[actionType];
  const keys = kind === 'external' ? [EXTERNAL_STAT[actionType]] : KIND_STAT[kind] || [];
  const out = {};
  for (const key of keys) out[`stats.${key}`] = inc(1);
  if (visibleMs > 0) out['stats.totalViewMs'] = inc(Math.floor(visibleMs));
  return out;
}

function adminCampaignView(c, config, nowMs = Date.now()) {
  const cfg = config || core.normalizeConfig({});
  const awarded = Number(c.awardedPoints) || 0;
  const reserved = Number(c.reservedPoints) || 0;
  const stats = c.stats || {};
  const completed = Number(stats.viewsCompleted) || 0;
  return {
    ...c,
    webhookSecret: undefined,
    hasWebhookSecret: Boolean(c.webhookSecret),
    effectiveStatus: core.effectiveStatus(c, nowMs),
    remainingPoints: Math.max(0, core.remainingBudget(c)),
    awardedPoints: awarded,
    reservedPoints: reserved,
    internalCostCop: Math.round(((awarded + reserved) / cfg.pointsPerBlast) * cfg.copPerEarnedBlast),
    budgetCostCop: Math.round(((Number(c.budgetPoints) || 0) / cfg.pointsPerBlast) * cfg.copPerEarnedBlast),
    avgViewSeconds: completed ? Math.round((Number(stats.totalViewMs) || 0) / completed / 1000) : 0,
  };
}

// ── Campañas (Super Admin) ──────────────────────────────────────────────────

async function listCampaignsAdmin() {
  const cfg = await loadConfig();
  const snap = await db().collection(COL.campaigns).orderBy('createdAtMs', 'desc').limit(300).get();
  const now = Date.now();
  return snap.docs.map((d) => adminCampaignView({ id: d.id, ...d.data() }, cfg, now));
}

async function createCampaign(input, actor) {
  const cfg = await loadConfig();
  const parsed = core.normalizeCampaignInput(input, cfg);
  if (!parsed.ok) throw new RewardError('INVALID', parsed.error);
  const now = Date.now();
  const ref = db().collection(COL.campaigns).doc();
  const doc = {
    ...parsed.campaign,
    awardedPoints: 0,
    reservedPoints: 0,
    actionsCount: 0,
    stats: {},
    webhookSecret: crypto.randomBytes(24).toString('hex'),
    createdAtMs: now,
    updatedAtMs: now,
    createdBy: actor || null,
  };
  const active = core.effectiveStatus(doc, now) === 'ACTIVA';
  if (active) doc.announcedAtMs = now;
  await ref.set(doc);
  if (active) await announceNewCampaigns();
  return adminCampaignView({ id: ref.id, ...doc }, cfg, now);
}

async function updateCampaign(id, input, actor) {
  const cfg = await loadConfig();
  const ref = db().collection(COL.campaigns).doc(String(id));
  const snap = await ref.get();
  const current = campaignFromSnap(snap);
  if (!current) throw new RewardError('NOT_FOUND', 'Campaña no encontrada.', 404);
  const parsed = core.normalizeCampaignInput({ ...current, ...input }, cfg);
  if (!parsed.ok) throw new RewardError('INVALID', parsed.error);
  const committed = (Number(current.awardedPoints) || 0) + (Number(current.reservedPoints) || 0);
  if (parsed.campaign.budgetPoints < committed) {
    throw new RewardError('INVALID', `El presupuesto no puede ser menor a lo ya comprometido (${committed} puntos).`);
  }
  const now = Date.now();
  const patch = { ...parsed.campaign, updatedAtMs: now, updatedBy: actor || null };
  const merged = { ...current, ...patch };
  const announce = core.effectiveStatus(merged, now) === 'ACTIVA' && !current.announcedAtMs;
  if (announce) patch.announcedAtMs = now;
  await ref.update(patch);
  if (announce) await announceNewCampaigns();
  return adminCampaignView({ ...merged, ...patch }, cfg, now);
}

async function setCampaignStatus(id, status, actor) {
  if (!core.CAMPAIGN_STATUS.includes(status)) throw new RewardError('INVALID', 'Estado inválido.');
  const cfg = await loadConfig();
  const ref = db().collection(COL.campaigns).doc(String(id));
  const snap = await ref.get();
  const current = campaignFromSnap(snap);
  if (!current) throw new RewardError('NOT_FOUND', 'Campaña no encontrada.', 404);
  if (status === 'ACTIVA' && core.isExhausted(current)) {
    throw new RewardError('EXHAUSTED', 'La campaña no tiene presupuesto o cupo. Súbele el presupuesto primero.');
  }
  const now = Date.now();
  const patch = { status, updatedAtMs: now, updatedBy: actor || null };
  const merged = { ...current, ...patch };
  const announce = core.effectiveStatus(merged, now) === 'ACTIVA' && !current.announcedAtMs;
  if (announce) patch.announcedAtMs = now;
  await ref.update(patch);
  if (announce) await announceNewCampaigns();
  return adminCampaignView({ ...merged, ...patch }, cfg, now);
}

async function rotateWebhookSecret(id) {
  const ref = db().collection(COL.campaigns).doc(String(id));
  const secret = crypto.randomBytes(24).toString('hex');
  await ref.update({ webhookSecret: secret, updatedAtMs: Date.now() });
  return secret;
}

async function revealWebhookSecret(id) {
  const snap = await db().collection(COL.campaigns).doc(String(id)).get();
  if (!snap.exists) throw new RewardError('NOT_FOUND', 'Campaña no encontrada.', 404);
  return String(snap.data().webhookSecret || '');
}

// ── Elegibilidad ────────────────────────────────────────────────────────────

let activeCache = { at: 0, list: [] };

async function listLiveCampaigns() {
  if (Date.now() - activeCache.at < 20_000) return activeCache.list;
  const snap = await db()
    .collection(COL.campaigns)
    .where('status', 'in', ['ACTIVA', 'PROGRAMADA'])
    .limit(200)
    .get();
  const now = Date.now();
  const list = snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((c) => core.effectiveStatus(c, now) === 'ACTIVA');
  activeCache = { at: Date.now(), list };
  return list;
}

function dropActiveCache() {
  activeCache = { at: 0, list: [] };
}

async function userTargetingProfile(uid) {
  const snap = await db().collection('users').doc(uid).get();
  const data = snap.exists ? snap.data() || {} : {};
  return {
    geo: data.geo || null,
    birthDate: data.birthDate || null,
    gender: data.gender || null,
    interests: Array.isArray(data.interests) ? data.interests : [],
    category: data.category || null,
  };
}

async function readDaily(uid) {
  const snap = await db().collection(COL.daily).doc(`${uid}_${core.dayKey()}`).get();
  const d = snap.exists ? snap.data() || {} : {};
  return { rewards: Number(d.rewards) || 0, follows: Number(d.follows) || 0 };
}

async function eligibleCampaigns(uid, { surface = null } = {}) {
  const cfg = await loadConfig();
  if (!cfg.enabled) return { cfg, list: [], daily: { rewards: 0, follows: 0 } };
  const [campaigns, profile, daily] = await Promise.all([
    listLiveCampaigns(),
    userTargetingProfile(uid),
    readDaily(uid),
  ]);
  if (daily.rewards >= cfg.dailyRewardLimit) return { cfg, list: [], daily };
  const now = Date.now();
  const candidates = campaigns.filter((c) => {
    if (c.advertiserUid && c.advertiserUid === uid) return false;
    if (surface && Array.isArray(c.surfaces) && c.surfaces.length && !c.surfaces.includes(surface)) return false;
    const kind = core.ACTION_KIND[c.actionType];
    if ((kind === 'follow' || kind === 'view_follow') && daily.follows >= cfg.dailyFollowLimit) return false;
    if (cfg.actions[c.actionType]?.enabled === false) return false;
    return core.matchesTargeting(c, profile, now);
  });
  if (!candidates.length) return { cfg, list: [], daily };
  const partRefs = candidates.map((c) => db().collection(COL.participations).doc(`${c.id}_${uid}`));
  const impRefs = candidates.map((c) => db().collection(COL.impressions).doc(`${uid}_${c.id}`));
  const snaps = await db().getAll(...partRefs, ...impRefs);
  const list = [];
  candidates.forEach((c, i) => {
    const part = snaps[i].exists ? snaps[i].data() : {};
    const imp = snaps[candidates.length + i].exists ? snaps[candidates.length + i].data() : {};
    const max = c.allowRecurrence ? Number(c.maxParticipationsPerUser) || 1 : 1;
    if ((Number(part.count) || 0) >= max) return;
    list.push({ campaign: c, lastShownAtMs: Number(imp.lastShownAtMs) || 0 });
  });
  return { cfg, list, daily };
}

async function nextFeedCampaign(uid, surface) {
  const safeSurface = core.SURFACES.includes(surface) ? surface : 'inicio';
  const { cfg, list } = await eligibleCampaigns(uid, { surface: safeSurface });
  const now = Date.now();
  const fresh = list.filter(({ campaign, lastShownAtMs }) => {
    const gapMs = (Number(campaign.frequencyMinutes) || cfg.adIntervalMinutes) * 60_000;
    return !lastShownAtMs || now - lastShownAtMs >= gapMs;
  });
  if (!fresh.length) return { campaign: null, intervalMinutes: cfg.adIntervalMinutes };
  fresh.sort((a, b) => a.lastShownAtMs - b.lastShownAtMs || Math.random() - 0.5);
  const pick = fresh[0].campaign;
  const batch = db().batch();
  batch.set(
    db().collection(COL.impressions).doc(`${uid}_${pick.id}`),
    { uid, campaignId: pick.id, lastShownAtMs: now, count: inc(1), surface: safeSurface },
    { merge: true },
  );
  batch.update(db().collection(COL.campaigns).doc(pick.id), { 'stats.impressions': inc(1) });
  await batch.commit();
  return { campaign: core.publicCampaign(pick, cfg), intervalMinutes: cfg.adIntervalMinutes };
}

async function availableCampaigns(uid) {
  const { cfg, list, daily } = await eligibleCampaigns(uid);
  return {
    campaigns: list.slice(0, 30).map(({ campaign }) => core.publicCampaign(campaign, cfg)),
    limitReached: daily.rewards >= cfg.dailyRewardLimit,
  };
}

async function recordClick(uid, campaignId) {
  const day = core.dayKey();
  const impRef = db().collection(COL.impressions).doc(`${uid}_${campaignId}`);
  const snap = await impRef.get();
  if (snap.exists && snap.data().clickedDay === day) return;
  const batch = db().batch();
  batch.set(impRef, { uid, campaignId, clickedDay: day }, { merge: true });
  batch.update(db().collection(COL.campaigns).doc(String(campaignId)), { 'stats.clicks': inc(1) });
  await batch.commit().catch(() => undefined);
}

// ── Otorgar puntos (transacción única) ──────────────────────────────────────

/**
 * Verifica campaña activa, presupuesto, cupo, límites diarios y una sola participación
 * antes de acreditar. Agota la campaña automáticamente cuando ya no alcanza.
 */
async function award({
  uid,
  campaignId,
  kinds,
  signals = [],
  hold = false,
  deviceId = '',
  ip = '',
  sessionRef = null,
  checkSession = null,
  meta = {},
  extraWrites = null,
}) {
  const cfg = await loadConfig();
  if (!cfg.enabled) throw new RewardError('DISABLED', 'Gana Puntos está en pausa.', 409);
  const now = Date.now();
  const day = core.dayKey(now);
  const store = db();
  const campaignRef = store.collection(COL.campaigns).doc(String(campaignId));
  const partRef = store.collection(COL.participations).doc(`${campaignId}_${uid}`);
  const dailyRef = store.collection(COL.daily).doc(`${uid}_${day}`);
  const walletRef = store.collection(COL.wallets).doc(uid);
  const deviceRef = deviceId ? store.collection(COL.devices).doc(hash(deviceId)) : null;
  const ipRef = ip ? store.collection(COL.ips).doc(hash(`${day}:${ip}`)) : null;

  const result = await store.runTransaction(async (tx) => {
    const refs = [campaignRef, partRef, dailyRef, walletRef];
    if (deviceRef) refs.push(deviceRef);
    if (ipRef) refs.push(ipRef);
    if (sessionRef) refs.push(sessionRef);
    const snaps = await tx.getAll(...refs);
    const [campaignSnap, partSnap, dailySnap, walletSnap] = snaps;
    let cursor = 4;
    const deviceSnap = deviceRef ? snaps[cursor++] : null;
    const ipSnap = ipRef ? snaps[cursor++] : null;
    const sessionSnap = sessionRef ? snaps[cursor++] : null;

    const campaign = campaignFromSnap(campaignSnap);
    if (!campaign) throw new RewardError('NOT_FOUND', 'Campaña no encontrada.', 404);
    const status = core.effectiveStatus(campaign, now);
    if (status === 'AGOTADA') throw new RewardError('EXHAUSTED', 'Esta campaña ya entregó todas sus recompensas.', 409);
    if (status !== 'ACTIVA') throw new RewardError('UNAVAILABLE', 'Esta campaña no está disponible ahora.', 409);
    const kind = core.ACTION_KIND[campaign.actionType];
    if (!kinds.includes(kind)) throw new RewardError('WRONG_ACTION', 'Esta campaña pide otra acción.', 400);
    if (campaign.advertiserUid && campaign.advertiserUid === uid) {
      throw new RewardError('OWN_CAMPAIGN', 'No puedes ganar puntos con tu propia campaña.', 403);
    }

    const allSignals = new Set(signals);
    let visibleMs = 0;
    let sessionPatch = null;
    if (sessionRef) {
      const session = sessionSnap && sessionSnap.exists ? sessionSnap.data() : null;
      if (!session || session.uid !== uid || session.campaignId !== campaign.id) {
        throw new RewardError('SESSION', 'Sesión de visualización no válida.', 400);
      }
      if (session.status !== 'open') throw new RewardError('SESSION', 'Esta visualización ya terminó.', 409);
      const checked = checkSession(session, campaign, now);
      if (!checked.ok) {
        throw new RewardError('TIME_NOT_REACHED', checked.error, 409, { remainingSeconds: checked.remainingSeconds });
      }
      visibleMs = checked.visibleMs;
      (checked.session.signals || []).forEach((s) => allSignals.add(s));
      sessionPatch = { ...checked.session, status: 'completed', completedAtMs: now };
    }

    const part = partSnap.exists ? partSnap.data() : {};
    const maxPart = campaign.allowRecurrence ? Number(campaign.maxParticipationsPerUser) || 1 : 1;
    if ((Number(part.count) || 0) >= maxPart) {
      throw new RewardError('ALREADY_CLAIMED', 'Ya recibiste esta recompensa.', 409);
    }
    const daily = dailySnap.exists ? dailySnap.data() : {};
    if ((Number(daily.rewards) || 0) >= cfg.dailyRewardLimit) {
      throw new RewardError('DAILY_LIMIT', 'Alcanzaste el límite diario de recompensas. Vuelve mañana.', 429);
    }
    const followKind = kind === 'follow' || kind === 'view_follow';
    if (followKind && (Number(daily.follows) || 0) >= cfg.dailyFollowLimit) {
      throw new RewardError('DAILY_FOLLOW_LIMIT', 'Alcanzaste el límite diario de seguimientos con recompensa.', 429);
    }
    if (daily.lastClaimAtMs && now - Number(daily.lastClaimAtMs) < RAPID_CLAIM_MS) allSignals.add('RAPID_CLAIMS');
    if (deviceSnap) {
      const uids = new Set([...(deviceSnap.exists ? deviceSnap.data().uids || [] : []), uid]);
      if (uids.size > cfg.maxAccountsPerDevice) allSignals.add('MULTI_ACCOUNT_DEVICE');
    }
    if (ipSnap) {
      const uids = new Set([...(ipSnap.exists ? ipSnap.data().uids || [] : []), uid]);
      if (uids.size > cfg.maxAccountsPerIp) allSignals.add('SHARED_IP');
    }

    const signalList = [...allSignals];
    const claimStatus = core.claimStatusFor(signalList, { holdForFollow: hold });
    const validated = claimStatus === core.CLAIM_STATUS.VALIDADO;
    const points = Number(campaign.points) || 0;
    const actionLabel = cfg.actions[campaign.actionType]?.label || campaign.actionType;
    const claimRef = store.collection(COL.claims).doc();
    const wallet = walletSnap.exists ? walletSnap.data() : {};

    const claim = {
      uid,
      campaignId: campaign.id,
      campaignName: campaign.name,
      advertiser: campaign.advertiser,
      advertiserUid: campaign.advertiserUid || null,
      actionType: campaign.actionType,
      actionLabel,
      points,
      status: claimStatus,
      signals: signalList,
      visibleMs,
      deviceHash: deviceId ? hash(deviceId) : null,
      createdAtMs: now,
      updatedAtMs: now,
      ...meta,
    };
    if (hold && claimStatus === core.CLAIM_STATUS.PENDIENTE) {
      claim.validatesAtMs = now + cfg.followHoldHours * 60 * 60 * 1000;
    }
    tx.set(claimRef, claim);

    tx.set(
      walletRef,
      {
        uid,
        availablePoints: (Number(wallet.availablePoints) || 0) + (validated ? points : 0),
        pendingPoints: (Number(wallet.pendingPoints) || 0) + (validated ? 0 : points),
        totalPointsEarned: (Number(wallet.totalPointsEarned) || 0) + (validated ? points : 0),
        updatedAtMs: now,
      },
      { merge: true },
    );

    const nextCampaign = {
      ...campaign,
      awardedPoints: (Number(campaign.awardedPoints) || 0) + (validated ? points : 0),
      reservedPoints: (Number(campaign.reservedPoints) || 0) + (validated ? 0 : points),
      actionsCount: (Number(campaign.actionsCount) || 0) + 1,
    };
    const campaignPatch = {
      awardedPoints: nextCampaign.awardedPoints,
      reservedPoints: nextCampaign.reservedPoints,
      actionsCount: nextCampaign.actionsCount,
      updatedAtMs: now,
      ...(validated
        ? {
            'stats.pointsDelivered': inc(points),
            'stats.validated': inc(1),
            ...validatedStatFields(campaign.actionType, visibleMs),
          }
        : { 'stats.pointsPending': inc(points), 'stats.pending': inc(1) }),
    };
    if (!(Number(part.count) || 0)) campaignPatch['stats.uniqueUsers'] = inc(1);
    if (core.isExhausted(nextCampaign)) {
      campaignPatch.status = 'AGOTADA';
      campaignPatch.exhaustedAtMs = now;
    }
    tx.update(campaignRef, campaignPatch);

    tx.set(partRef, { uid, campaignId: campaign.id, count: inc(1), lastAtMs: now }, { merge: true });
    tx.set(
      dailyRef,
      { uid, day, rewards: inc(1), ...(followKind ? { follows: inc(1) } : {}), lastClaimAtMs: now },
      { merge: true },
    );
    if (deviceRef) tx.set(deviceRef, { uids: FieldValue.arrayUnion(uid), updatedAtMs: now }, { merge: true });
    if (ipRef) tx.set(ipRef, { uids: FieldValue.arrayUnion(uid), day, updatedAtMs: now }, { merge: true });
    if (sessionRef && sessionPatch) tx.set(sessionRef, { ...sessionPatch, claimId: claimRef.id }, { merge: true });
    if (extraWrites) extraWrites(tx, { claimId: claimRef.id, campaign, now });

    return {
      claimId: claimRef.id,
      status: claimStatus,
      points,
      exhausted: campaignPatch.status === 'AGOTADA',
      validatesAtMs: claim.validatesAtMs || null,
    };
  });
  if (result.exhausted) dropActiveCache();
  return result;
}

// ── Sesiones de visualización (tiempo medido en el servidor) ────────────────

const TIMED_KINDS = ['view', 'visit', 'view_follow'];

async function startSession({ uid, campaignId, deviceId, signals }) {
  const cfg = await loadConfig();
  if (!cfg.enabled) throw new RewardError('DISABLED', 'Gana Puntos está en pausa.', 409);
  const store = db();
  const campaign = campaignFromSnap(await store.collection(COL.campaigns).doc(String(campaignId)).get());
  if (!campaign || core.effectiveStatus(campaign) !== 'ACTIVA') {
    throw new RewardError('UNAVAILABLE', 'Esta campaña no está disponible ahora.', 409);
  }
  if (!TIMED_KINDS.includes(core.ACTION_KIND[campaign.actionType])) {
    throw new RewardError('WRONG_ACTION', 'Esta campaña no usa temporizador.', 400);
  }
  const [partSnap, daily, walletSnap] = await Promise.all([
    store.collection(COL.participations).doc(`${campaign.id}_${uid}`).get(),
    readDaily(uid),
    store.collection(COL.wallets).doc(uid).get(),
  ]);
  const maxPart = campaign.allowRecurrence ? Number(campaign.maxParticipationsPerUser) || 1 : 1;
  if (partSnap.exists && (Number(partSnap.data().count) || 0) >= maxPart) {
    throw new RewardError('ALREADY_CLAIMED', 'Ya recibiste esta recompensa.', 409);
  }
  if (daily.rewards >= cfg.dailyRewardLimit) {
    throw new RewardError('DAILY_LIMIT', 'Alcanzaste el límite diario de recompensas. Vuelve mañana.', 429);
  }
  const now = Date.now();
  const sessionSignals = new Set(core.clientSignals(signals));
  const wallet = walletSnap.exists ? walletSnap.data() : {};
  if (
    wallet.activeSessionId &&
    wallet.activeSessionCampaign !== campaign.id &&
    now - (Number(wallet.activeSessionAtMs) || 0) < 20_000
  ) {
    sessionSignals.add('MULTI_SESSION');
  }
  const ref = store.collection(COL.sessions).doc();
  const minSeconds = Number(campaign.minSeconds) || cfg.actions[campaign.actionType]?.minSeconds || 45;
  const batch = store.batch();
  batch.set(ref, {
    uid,
    campaignId: campaign.id,
    actionType: campaign.actionType,
    minSeconds,
    startedAtMs: now,
    lastBeatMs: now,
    visibleMs: 0,
    beats: 0,
    status: 'open',
    signals: [...sessionSignals],
    deviceHash: deviceId ? hash(deviceId) : null,
  });
  batch.set(
    store.collection(COL.wallets).doc(uid),
    { uid, activeSessionId: ref.id, activeSessionCampaign: campaign.id, activeSessionAtMs: now },
    { merge: true },
  );
  batch.update(store.collection(COL.campaigns).doc(campaign.id), { 'stats.viewsStarted': inc(1) });
  await batch.commit();
  return { sessionId: ref.id, minSeconds, heartbeatMs: 5000 };
}

async function heartbeat({ uid, sessionId, visible, signals }) {
  const ref = db().collection(COL.sessions).doc(String(sessionId));
  return db().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const session = snap.exists ? snap.data() : null;
    if (!session || session.uid !== uid) throw new RewardError('SESSION', 'Sesión no válida.', 400);
    if (session.status !== 'open') throw new RewardError('SESSION', 'Esta visualización ya terminó.', 409);
    const now = Date.now();
    if (now - session.startedAtMs > SESSION_MAX_AGE_MS) {
      tx.update(ref, { status: 'expired' });
      throw new RewardError('SESSION', 'La visualización expiró. Vuelve a empezar.', 409);
    }
    const { session: next } = core.applyHeartbeat(session, { nowMs: now, visible: visible !== false });
    const merged = new Set([...(next.signals || []), ...core.clientSignals(signals)]);
    next.signals = [...merged];
    tx.set(ref, next, { merge: true });
    const evaluation = core.evaluateViewSession(next, { nowMs: now, minSeconds: session.minSeconds });
    return {
      visibleSeconds: Math.floor(next.visibleMs / 1000),
      remainingSeconds: evaluation.remainingSeconds,
      ready: evaluation.ok,
    };
  });
}

async function isFollowing(uid, targetUid) {
  if (!uid || !targetUid) return false;
  const snap = await db().collection('users').doc(uid).collection('following').doc(targetUid).get();
  return snap.exists;
}

async function completeSession({ uid, sessionId, deviceId, ip, signals }) {
  const store = db();
  const sessionRef = store.collection(COL.sessions).doc(String(sessionId));
  const pre = await sessionRef.get();
  if (!pre.exists || pre.data().uid !== uid) throw new RewardError('SESSION', 'Sesión no válida.', 400);
  const campaignId = pre.data().campaignId;
  const campaign = campaignFromSnap(await store.collection(COL.campaigns).doc(campaignId).get());
  const kind = campaign ? core.ACTION_KIND[campaign.actionType] : null;
  if (kind === 'view_follow' && !(await isFollowing(uid, campaign.advertiserUid))) {
    throw new RewardError(
      'FOLLOW_REQUIRED',
      `Sigue a @${campaign.advertiserUsername || campaign.advertiser} para completar esta recompensa.`,
      409,
    );
  }
  const extra = core.clientSignals(signals);
  return award({
    uid,
    campaignId,
    kinds: TIMED_KINDS,
    signals: extra,
    hold: kind === 'view_follow',
    deviceId,
    ip,
    sessionRef,
    checkSession: (session, c, now) => {
      const { session: beat } = core.applyHeartbeat(session, { nowMs: now, visible: true });
      const minSeconds = Number(session.minSeconds) || Number(c.minSeconds) || 45;
      const evaluation = core.evaluateViewSession(beat, { nowMs: now, minSeconds });
      if (!evaluation.ok) {
        return {
          ok: false,
          error: `Faltan ${evaluation.remainingSeconds} s de visualización para ganar los puntos.`,
          remainingSeconds: evaluation.remainingSeconds,
        };
      }
      return { ok: true, session: beat, visibleMs: evaluation.visibleMs };
    },
  });
}

async function abandonSession({ uid, sessionId }) {
  const ref = db().collection(COL.sessions).doc(String(sessionId));
  const snap = await ref.get();
  if (!snap.exists || snap.data().uid !== uid || snap.data().status !== 'open') return;
  const batch = db().batch();
  batch.update(ref, { status: 'abandoned', abandonedAtMs: Date.now() });
  batch.update(db().collection(COL.campaigns).doc(snap.data().campaignId), { 'stats.abandoned': inc(1) });
  await batch.commit().catch(() => undefined);
}

// ── Seguir, comentar y acciones externas ────────────────────────────────────

async function claimFollow({ uid, campaignId, deviceId, ip, signals }) {
  const campaign = campaignFromSnap(await db().collection(COL.campaigns).doc(String(campaignId)).get());
  if (!campaign) throw new RewardError('NOT_FOUND', 'Campaña no encontrada.', 404);
  if (!(await isFollowing(uid, campaign.advertiserUid))) {
    throw new RewardError('FOLLOW_REQUIRED', 'Primero sigue la cuenta del anunciante.', 409);
  }
  return award({
    uid,
    campaignId,
    kinds: ['follow'],
    signals: core.clientSignals(signals),
    hold: true,
    deviceId,
    ip,
  });
}

async function claimComment({ uid, campaignId, text, deviceId, ip, signals }) {
  const check = core.validateComment(text);
  if (!check.ok) throw new RewardError('INVALID_COMMENT', check.error);
  const store = db();
  const [sameCampaign, sameUser] = await Promise.all([
    store.collection(COL.comments).where('campaignId', '==', String(campaignId)).where('norm', '==', check.norm).limit(3).get(),
    store.collection(COL.comments).where('uid', '==', uid).where('norm', '==', check.norm).limit(1).get(),
  ]);
  if (!sameUser.empty) throw new RewardError('DUPLICATE_COMMENT', 'Ya usaste ese comentario. Escribe uno nuevo.', 409);
  if (sameCampaign.size >= 2) {
    throw new RewardError('MASS_COMMENT', 'Ese texto ya lo publicaron otros usuarios. Escribe tu propio comentario.', 409);
  }
  const extraSignals = core.clientSignals(signals);
  if (sameCampaign.size === 1) extraSignals.push('SIMILAR_COMMENT');
  return award({
    uid,
    campaignId,
    kinds: ['comment'],
    signals: extraSignals,
    deviceId,
    ip,
    extraWrites: (tx, { claimId, now }) => {
      tx.set(store.collection(COL.comments).doc(), {
        uid,
        campaignId: String(campaignId),
        text: check.text,
        norm: check.norm,
        claimId,
        createdAtMs: now,
      });
    },
  });
}

async function startExternal({ uid, campaignId }) {
  const store = db();
  const campaign = campaignFromSnap(await store.collection(COL.campaigns).doc(String(campaignId)).get());
  if (!campaign || core.effectiveStatus(campaign) !== 'ACTIVA') {
    throw new RewardError('UNAVAILABLE', 'Esta campaña no está disponible ahora.', 409);
  }
  if (core.ACTION_KIND[campaign.actionType] !== 'external') {
    throw new RewardError('WRONG_ACTION', 'Esta campaña pide otra acción.', 400);
  }
  const partSnap = await store.collection(COL.participations).doc(`${campaign.id}_${uid}`).get();
  const maxPart = campaign.allowRecurrence ? Number(campaign.maxParticipationsPerUser) || 1 : 1;
  if (partSnap.exists && (Number(partSnap.data().count) || 0) >= maxPart) {
    throw new RewardError('ALREADY_CLAIMED', 'Ya recibiste esta recompensa.', 409);
  }
  const now = Date.now();
  const open = await store
    .collection(COL.leads)
    .where('uid', '==', uid)
    .where('campaignId', '==', campaign.id)
    .limit(5)
    .get();
  let code = '';
  open.forEach((d) => {
    const lead = d.data();
    if (!code && lead.status === 'ABIERTO' && lead.expiresAtMs > now) code = d.id;
  });
  if (!code) {
    code = crypto.randomBytes(10).toString('hex');
    await store.collection(COL.leads).doc(code).set({
      uid,
      campaignId: campaign.id,
      campaignName: campaign.name,
      actionType: campaign.actionType,
      status: 'ABIERTO',
      createdAtMs: now,
      expiresAtMs: now + LEAD_TTL_MS,
    });
  }
  await recordClick(uid, campaign.id);
  const url = new URL(campaign.linkUrl);
  url.searchParams.set('lb_ref', code);
  return { redirectUrl: url.toString(), ref: code };
}

/** Confirmación del anunciante (webhook firmado) o del Super Admin. */
async function confirmLead(code, { source, actor = null }) {
  const store = db();
  const leadRef = store.collection(COL.leads).doc(String(code));
  const snap = await leadRef.get();
  if (!snap.exists) throw new RewardError('NOT_FOUND', 'Referencia no encontrada.', 404);
  const lead = snap.data();
  if (lead.status === 'CONFIRMADO') return { duplicate: true, claimId: lead.claimId || null };
  if (lead.status !== 'ABIERTO' || lead.expiresAtMs < Date.now()) {
    throw new RewardError('EXPIRED', 'La referencia expiró o fue cerrada.', 409);
  }
  return award({
    uid: lead.uid,
    campaignId: lead.campaignId,
    kinds: ['external'],
    meta: { leadCode: String(code), confirmedBy: source, confirmedActor: actor },
    extraWrites: (tx, { claimId, now }) => {
      tx.update(leadRef, { status: 'CONFIRMADO', claimId, confirmedAtMs: now, confirmedBy: source });
    },
  });
}

function webhookSignature(secret, campaignId, ref) {
  return crypto.createHmac('sha256', String(secret)).update(`${campaignId}.${ref}`).digest('hex');
}

async function confirmFromWebhook({ campaignId, ref, signature }) {
  const snap = await db().collection(COL.campaigns).doc(String(campaignId)).get();
  if (!snap.exists) throw new RewardError('NOT_FOUND', 'Campaña no encontrada.', 404);
  const secret = String(snap.data().webhookSecret || '');
  const expected = webhookSignature(secret, campaignId, ref);
  const given = String(signature || '');
  const ok =
    secret &&
    given.length === expected.length &&
    crypto.timingSafeEqual(Buffer.from(given), Buffer.from(expected));
  if (!ok) throw new RewardError('BAD_SIGNATURE', 'Firma inválida.', 401);
  const leadSnap = await db().collection(COL.leads).doc(String(ref)).get();
  if (!leadSnap.exists || leadSnap.data().campaignId !== String(campaignId)) {
    throw new RewardError('NOT_FOUND', 'Referencia no encontrada.', 404);
  }
  return confirmLead(ref, { source: 'webhook' });
}

async function listLeads(campaignId) {
  const snap = await db().collection(COL.leads).where('campaignId', '==', String(campaignId)).limit(300).get();
  const rows = snap.docs.map((d) => ({ code: d.id, ...d.data() }));
  rows.sort((a, b) => (b.createdAtMs || 0) - (a.createdAtMs || 0));
  return attachUsers(rows);
}

// ── Auditoría (Super Admin) ─────────────────────────────────────────────────

async function resolveClaim(claimId, decision, { actor = null, note = '' } = {}) {
  if (decision !== 'VALIDADO' && decision !== 'RECHAZADO') throw new RewardError('INVALID', 'Decisión inválida.');
  const store = db();
  const claimRef = store.collection(COL.claims).doc(String(claimId));
  return store.runTransaction(async (tx) => {
    const claimSnap = await tx.get(claimRef);
    if (!claimSnap.exists) throw new RewardError('NOT_FOUND', 'Recompensa no encontrada.', 404);
    const claim = claimSnap.data();
    if (claim.status !== 'PENDIENTE' && claim.status !== 'SOSPECHOSO') {
      return { status: claim.status, unchanged: true };
    }
    const campaignRef = store.collection(COL.campaigns).doc(claim.campaignId);
    const walletRef = store.collection(COL.wallets).doc(claim.uid);
    const [campaignSnap, walletSnap] = await tx.getAll(campaignRef, walletRef);
    const points = Number(claim.points) || 0;
    const wallet = walletSnap.exists ? walletSnap.data() : {};
    const pending = Math.max(0, (Number(wallet.pendingPoints) || 0) - points);
    const now = Date.now();
    const ok = decision === 'VALIDADO';
    tx.set(
      walletRef,
      {
        pendingPoints: pending,
        ...(ok
          ? {
              availablePoints: (Number(wallet.availablePoints) || 0) + points,
              totalPointsEarned: (Number(wallet.totalPointsEarned) || 0) + points,
            }
          : {}),
        updatedAtMs: now,
      },
      { merge: true },
    );
    if (campaignSnap.exists) {
      const c = campaignSnap.data();
      const reserved = Math.max(0, (Number(c.reservedPoints) || 0) - points);
      tx.update(campaignRef, {
        reservedPoints: reserved,
        'stats.pointsPending': inc(-points),
        'stats.pending': inc(-1),
        ...(ok
          ? {
              awardedPoints: (Number(c.awardedPoints) || 0) + points,
              'stats.pointsDelivered': inc(points),
              'stats.validated': inc(1),
              ...validatedStatFields(claim.actionType, Number(claim.visibleMs) || 0),
            }
          : {
              actionsCount: Math.max(0, (Number(c.actionsCount) || 0) - 1),
              'stats.pointsRejected': inc(points),
              'stats.rejected': inc(1),
            }),
        updatedAtMs: now,
      });
    }
    tx.update(claimRef, {
      status: decision,
      resolvedAtMs: now,
      resolvedBy: actor,
      reviewNote: String(note || '').slice(0, 300),
      validatesAtMs: FieldValue.delete(),
      updatedAtMs: now,
    });
    return { status: decision };
  });
}

async function attachUsers(rows) {
  const uids = [...new Set(rows.map((r) => r.uid).filter(Boolean))].slice(0, 300);
  if (!uids.length) return rows;
  const snaps = await db().getAll(...uids.map((u) => db().collection('users').doc(u)));
  const byUid = new Map();
  snaps.forEach((s) => {
    if (!s.exists) return;
    const d = s.data() || {};
    byUid.set(s.id, { username: d.username || d.handle || '', displayName: d.displayName || '' });
  });
  return rows.map((r) => ({ ...r, user: byUid.get(r.uid) || null }));
}

async function listClaimsAdmin(status) {
  const allowed = ['PENDIENTE', 'SOSPECHOSO', 'VALIDADO', 'RECHAZADO'];
  const s = allowed.includes(status) ? status : 'SOSPECHOSO';
  const snap = await db().collection(COL.claims).where('status', '==', s).limit(300).get();
  const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  rows.sort((a, b) => (b.createdAtMs || 0) - (a.createdAtMs || 0));
  return attachUsers(rows);
}

async function adminOverview() {
  const [cfg, campaigns, globalSnap] = await Promise.all([
    loadConfig(),
    listCampaignsAdmin(),
    db().collection(COL.stats).doc('global').get(),
  ]);
  const g = globalSnap.exists ? globalSnap.data() : {};
  const sum = (key) => campaigns.reduce((acc, c) => acc + (Number(c[key]) || 0), 0);
  const delivered = sum('awardedPoints');
  const pending = sum('reservedPoints');
  return {
    config: cfg,
    totals: {
      campaigns: campaigns.length,
      active: campaigns.filter((c) => c.effectiveStatus === 'ACTIVA').length,
      pointsDelivered: delivered,
      pointsPending: pending,
      budgetPoints: sum('budgetPoints'),
      blastConverted: Number(g.blastConverted) || 0,
      pointsConverted: Number(g.pointsConverted) || 0,
      conversions: Number(g.conversions) || 0,
      liabilityCop: Math.round(((delivered + pending) / cfg.pointsPerBlast) * cfg.copPerEarnedBlast),
    },
  };
}

// ── Saldo del usuario y conversión a BLAST ganados ──────────────────────────

const CONVERSION_LABEL = { PROCESANDO: 'PENDIENTE', COMPLETADA: 'VALIDADO', FALLIDA: 'RECHAZADO' };

async function myRewards(uid) {
  const store = db();
  const cfg = await loadConfig();
  const [walletSnap, claimsSnap, conversionsSnap, daily] = await Promise.all([
    store.collection(COL.wallets).doc(uid).get(),
    store.collection(COL.claims).where('uid', '==', uid).limit(300).get(),
    store.collection(COL.conversions).where('uid', '==', uid).limit(100).get(),
    readDaily(uid),
  ]);
  const w = walletSnap.exists ? walletSnap.data() : {};
  const available = Number(w.availablePoints) || 0;
  const preview = core.computeConversion(available, cfg.pointsPerBlast);
  const history = [
    ...claimsSnap.docs.map((d) => {
      const c = d.data();
      return {
        id: d.id,
        kind: 'claim',
        campaign: c.campaignName || 'Campaña',
        action: c.actionLabel || c.actionType,
        points: Number(c.points) || 0,
        status: c.status === 'SOSPECHOSO' ? 'PENDIENTE' : c.status,
        createdAtMs: c.createdAtMs || 0,
        validatesAtMs: c.validatesAtMs || null,
      };
    }),
    ...conversionsSnap.docs.map((d) => {
      const c = d.data();
      return {
        id: d.id,
        kind: 'conversion',
        campaign: ORIGIN,
        action: 'Convertir a BLAST',
        points: -(Number(c.points) || 0),
        blast: Number(c.blast) || 0,
        status: CONVERSION_LABEL[c.status] || c.status,
        createdAtMs: c.createdAtMs || 0,
      };
    }),
  ].sort((a, b) => b.createdAtMs - a.createdAtMs);
  return {
    enabled: cfg.enabled,
    availablePoints: available,
    pendingPoints: Number(w.pendingPoints) || 0,
    totalBlast: Number(w.totalBlastConverted) || 0,
    totalPointsEarned: Number(w.totalPointsEarned) || 0,
    conversion: { blast: preview.blast, remaining: preview.remaining, canConvert: preview.blast >= 1 },
    limits: {
      dailyRewardLimit: cfg.dailyRewardLimit,
      usedToday: daily.rewards,
      dailyFollowLimit: cfg.dailyFollowLimit,
      followsToday: daily.follows,
    },
    history: history.slice(0, 200),
  };
}

async function finishConversion(conversionId) {
  const walletService = require('./walletService');
  const engine = require('./walletEngine');
  const store = db();
  const ref = store.collection(COL.conversions).doc(conversionId);
  const snap = await ref.get();
  if (!snap.exists) return { ok: false };
  const conv = snap.data();
  if (conv.status !== 'PROCESANDO') return { ok: conv.status === 'COMPLETADA', status: conv.status };
  const credit = await walletService.creditEarned({
    userId: conv.uid,
    amount: conv.blast,
    idempotencyKey: `AD_POINTS_CONVERT:${conversionId}`,
    earningType: engine.TX.EARNING_AD_REWARD,
    referenceType: 'AD_REWARD_CONVERSION',
    referenceId: conversionId,
    metadata: { origin: ORIGIN, points: conv.points },
  });
  const now = Date.now();
  if (credit?.ok) {
    const batch = store.batch();
    batch.update(ref, { status: 'COMPLETADA', completedAtMs: now });
    batch.set(
      store.collection(COL.wallets).doc(conv.uid),
      { totalBlastConverted: inc(conv.blast), convertedPoints: inc(conv.points), updatedAtMs: now },
      { merge: true },
    );
    batch.set(
      store.collection(COL.stats).doc('global'),
      { blastConverted: inc(conv.blast), pointsConverted: inc(conv.points), conversions: inc(1), updatedAtMs: now },
      { merge: true },
    );
    await batch.commit();
    return { ok: true, summary: credit.summary || null };
  }
  await store.runTransaction(async (tx) => {
    const fresh = await tx.get(ref);
    if (!fresh.exists || fresh.data().status !== 'PROCESANDO') return;
    const walletRef = store.collection(COL.wallets).doc(conv.uid);
    const walletSnap = await tx.get(walletRef);
    const w = walletSnap.exists ? walletSnap.data() : {};
    tx.set(walletRef, { availablePoints: (Number(w.availablePoints) || 0) + conv.points, updatedAtMs: now }, { merge: true });
    tx.update(ref, { status: 'FALLIDA', failedAtMs: now, failCode: String(credit?.code || 'CREDIT_FAILED') });
  });
  return { ok: false, code: credit?.code || 'CREDIT_FAILED' };
}

async function convertPoints(uid) {
  const cfg = await loadConfig();
  const store = db();
  const walletRef = store.collection(COL.wallets).doc(uid);
  const convRef = store.collection(COL.conversions).doc();
  const plan = await store.runTransaction(async (tx) => {
    const snap = await tx.get(walletRef);
    const w = snap.exists ? snap.data() : {};
    const available = Number(w.availablePoints) || 0;
    const { blast, used, remaining } = core.computeConversion(available, cfg.pointsPerBlast);
    if (blast < 1) throw new RewardError('NOT_ENOUGH', 'Aún no tienes puntos suficientes para convertir.', 409);
    const now = Date.now();
    tx.set(walletRef, { uid, availablePoints: remaining, updatedAtMs: now }, { merge: true });
    tx.set(convRef, {
      uid,
      points: used,
      blast,
      status: 'PROCESANDO',
      origin: ORIGIN,
      createdAtMs: now,
    });
    return { blast, used, remaining };
  });
  const done = await finishConversion(convRef.id);
  if (!done.ok) {
    throw new RewardError('CONVERT_FAILED', 'No se pudo completar la conversión. Tus puntos fueron devueltos.', 500);
  }
  return { conversionId: convRef.id, blast: plan.blast, remainingPoints: plan.remaining, summary: done.summary };
}

// ── Tareas programadas ──────────────────────────────────────────────────────

async function processDueFollowClaims(limit = 100) {
  const now = Date.now();
  const snap = await db().collection(COL.claims).where('validatesAtMs', '<=', now).limit(limit).get();
  let validated = 0;
  let rejected = 0;
  for (const d of snap.docs) {
    const claim = d.data();
    if (claim.status !== 'PENDIENTE') continue;
    try {
      const still = await isFollowing(claim.uid, claim.advertiserUid);
      await resolveClaim(d.id, still ? 'VALIDADO' : 'RECHAZADO', {
        actor: 'sistema',
        note: still ? 'Seguimiento verificado' : 'Dejó de seguir antes de terminar el periodo',
      });
      if (still) validated += 1;
      else rejected += 1;
    } catch (error) {
      console.warn('[adRewards] follow claim', d.id, error.message);
    }
  }
  return { validated, rejected };
}

async function sweepCampaigns() {
  const snap = await db()
    .collection(COL.campaigns)
    .where('status', 'in', ['ACTIVA', 'PROGRAMADA'])
    .limit(300)
    .get();
  const now = Date.now();
  let announced = false;
  const batch = db().batch();
  let writes = 0;
  snap.docs.forEach((d) => {
    const c = { id: d.id, ...d.data() };
    const eff = core.effectiveStatus(c, now);
    if (eff === 'FINALIZADA' || eff === 'AGOTADA') {
      batch.update(d.ref, { status: eff, updatedAtMs: now });
      writes += 1;
    } else if (eff === 'ACTIVA' && !c.announcedAtMs) {
      batch.update(d.ref, { announcedAtMs: now });
      announced = true;
      writes += 1;
    }
  });
  if (writes) await batch.commit();
  if (announced) await announceNewCampaigns();
  dropActiveCache();
  return { writes, announced };
}

async function retryStuckConversions() {
  const snap = await db().collection(COL.conversions).where('status', '==', 'PROCESANDO').limit(20).get();
  let fixed = 0;
  for (const d of snap.docs) {
    if (Date.now() - (Number(d.data().createdAtMs) || 0) < 2 * 60 * 1000) continue;
    const out = await finishConversion(d.id).catch(() => ({ ok: false }));
    if (out.ok) fixed += 1;
  }
  return { fixed };
}

async function runScheduled() {
  const [follows, campaigns, conversions] = await Promise.all([
    processDueFollowClaims().catch((e) => ({ error: e.message })),
    sweepCampaigns().catch((e) => ({ error: e.message })),
    retryStuckConversions().catch((e) => ({ error: e.message })),
  ]);
  return { follows, campaigns, conversions };
}

async function publicStatus() {
  const cfg = await loadConfig();
  return {
    enabled: cfg.enabled,
    intervalMinutes: cfg.adIntervalMinutes,
    latestPublishedAtMs: cfg.latestPublishedAtMs || 0,
  };
}

module.exports = {
  RewardError,
  COL,
  loadConfig,
  saveConfig,
  listCampaignsAdmin,
  createCampaign,
  updateCampaign,
  setCampaignStatus,
  rotateWebhookSecret,
  revealWebhookSecret,
  nextFeedCampaign,
  availableCampaigns,
  recordClick,
  startSession,
  heartbeat,
  completeSession,
  abandonSession,
  claimFollow,
  claimComment,
  startExternal,
  confirmLead,
  confirmFromWebhook,
  webhookSignature,
  listLeads,
  resolveClaim,
  listClaimsAdmin,
  adminOverview,
  myRewards,
  convertPoints,
  processDueFollowClaims,
  runScheduled,
  publicStatus,
};
