/**
 * Cotizaciones, órdenes Wompi y campañas de banners.
 * El widget del navegador no activa publicidad; lo hace el webhook o una verificación de transacción.
 */

const { randomUUID } = require('crypto');
const { FieldValue } = require('firebase-admin/firestore');
const { getStorage } = require('firebase-admin/storage');
const { firestoreConfigured, getAdminDb } = require('./firestoreAdmin');
const { packageById, packageByDays, quoteAmountCop, PRICE_VERSION } = require('./promoPackages');
const { sniffKind, inspectImageMeta, MAX_BYTES } = require('./promoInspect');
const { normalizeParams, projectTable, DEFAULT_PARAMS } = require('./promoProjection');

const STORAGE_BUCKET =
  process.env.FIREBASE_STORAGE_BUCKET || 'liveboom-app.firebasestorage.app';
const QUOTES = 'ad_quotes';
const ORDERS = 'ad_orders';
const PACKS = 'config/adPackages';
const PROJECTION = 'config/adRevenueProjection';
const PROMOS = 'promotions';
const DEDUP = 'ad_metric_dedup';
const QUOTE_TTL_MS = 2 * 60 * 60 * 1000;

function db() {
  return getAdminDb();
}

function bucket() {
  getAdminDb();
  return getStorage().bucket(STORAGE_BUCKET);
}

function safeUserPath(uid, raw) {
  const value = String(raw || '')
    .trim()
    .replace(/^\/+/, '');
  if (!uid || !value.startsWith(`users/${uid}/`)) return null;
  if (value.includes('..') || value.includes('\\') || value.includes('\0')) return null;
  return value;
}

function asPublicQuote(row) {
  if (!row) return null;
  return {
    quoteId: row.quoteId,
    packageId: row.packageId,
    days: row.days,
    hours: row.hours,
    format: row.format,
    priceVersion: row.priceVersion,
    totalCop: row.totalCop,
    amountInCents: row.amountInCents,
    currency: row.currency,
    regionId: row.regionId,
    slot: row.slot || 'rotation',
    exclusivity: false,
    expiresAtMs: row.expiresAtMs,
    mediaUrl: row.mediaUrl || '',
    warning: row.warning || null,
    inspect: row.inspect || null,
  };
}

async function loadCatalog() {
  if (!firestoreConfigured()) return publicCatalog();
  const snap = await db().doc(PACKS).get();
  return normalizeCatalog(snap.exists ? snap.data() : null);
}

async function saveCatalog(payload, actorEmail) {
  const current = await loadCatalog();
  const next = normalizeCatalog({
    ...(payload || {}),
    version: current.version + 1,
  });
  await db().doc(PACKS).set({
    ...next,
    updatedBy: String(actorEmail || ''),
    updatedAtMs: Date.now(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  return next;
}

async function loadProjection() {
  if (!firestoreConfigured()) {
    return { params: DEFAULT_PARAMS, updatedAtMs: 0, updatedBy: null };
  }
  const snap = await db().doc(PROJECTION).get();
  const data = snap.exists ? snap.data() : {};
  return {
    params: normalizeParams(data.params || data),
    updatedAtMs: Number(data.updatedAtMs || 0),
    updatedBy: data.updatedBy || null,
  };
}

async function saveProjection(params, actorEmail) {
  const next = normalizeParams(params);
  await db().doc(PROJECTION).set(
    {
      params: next,
      updatedBy: String(actorEmail || ''),
      updatedAtMs: Date.now(),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
  return { params: next, updatedAtMs: Date.now(), updatedBy: actorEmail };
}

async function sniffStorage(path) {
  const file = bucket().file(path);
  const [exists] = await file.exists();
  if (!exists) {
    const error = new Error('No se encontró el archivo del banner');
    error.code = 'NOT_FOUND';
    throw error;
  }
  const [meta] = await file.getMetadata();
  const size = Number(meta.size || 0);
  if (size > MAX_BYTES) {
    const error = new Error('El banner supera 40 MB');
    error.code = 'TOO_LARGE';
    throw error;
  }
  const [buf] = await file.download({ start: 0, end: Math.min(size, 256 * 1024) - 1 });
  return sniffKind(buf, meta.contentType, path);
}

async function createQuote(input) {
  if (!firestoreConfigured()) {
    const error = new Error('Firestore no está configurado');
    error.code = 'NO_DB';
    throw error;
  }
  const uid = String(input.uid || '');
  const catalog = await loadCatalog();
  const pkg = input.packageId
    ? packageById(input.packageId, catalog)
    : packageByDays(input.days, catalog);
  const storagePath = input.storagePath ? safeUserPath(uid, input.storagePath) : null;
  if (input.storagePath && !storagePath) {
    const error = new Error('Ruta de archivo inválida');
    error.code = 'INVALID_PATH';
    throw error;
  }

  let sniff = { container: 'none', format: 'static' };
  if (storagePath) {
    sniff = await sniffStorage(storagePath);
  } else if (input.mediaUrl) {
    sniff = sniffKind(Buffer.alloc(0), input.mime || '', input.mediaUrl);
    if (!sniff.format) sniff.format = 'static';
  }

  const inspect = inspectImageMeta(
    {
      width: input.width,
      height: input.height,
      durationSec: input.durationSec,
    },
    sniff,
  );
  if (!inspect.ready) {
    const error = new Error(inspect.errors[0] || 'No se pudo determinar el formato del banner');
    error.code = 'INVALID_MEDIA';
    throw error;
  }

  const format = inspect.format;
  const totalCop = quoteAmountCop(pkg, format);
  const quoteId = randomUUID();
  const row = {
    quoteId,
    uid,
    packageId: pkg.id,
    days: pkg.days,
    hours: pkg.hours,
    format,
    priceVersion: catalog.version || PRICE_VERSION,
    totalCop,
    amountInCents: totalCop * 100,
    currency: 'COP',
    regionId: String(input.regionId || 'nacional').slice(0, 40),
    regionLabel: String(input.regionLabel || '').slice(0, 80),
    kind: String(input.kind || 'marketing').slice(0, 32),
    title: String(input.title || 'Promoción').slice(0, 80),
    linkUrl: String(input.linkUrl || '').slice(0, 500),
    mediaUrl: String(input.mediaUrl || '').slice(0, 500),
    storagePath: storagePath || null,
    ownerUsername: String(input.ownerUsername || '').slice(0, 40),
    ownerDisplayName: String(input.ownerDisplayName || '').slice(0, 80),
    ownerAvatarUrl: input.ownerAvatarUrl || null,
    slot: 'rotation',
    exclusivity: false,
    inspect,
    warning: inspect.warning,
    status: 'open',
    createdAtMs: Date.now(),
    expiresAtMs: Date.now() + QUOTE_TTL_MS,
    createdAt: FieldValue.serverTimestamp(),
  };
  await db().collection(QUOTES).doc(quoteId).set(row);
  return asPublicQuote(row);
}

async function readQuote(quoteId, uid) {
  const snap = await db().collection(QUOTES).doc(String(quoteId || '')).get();
  if (!snap.exists) return null;
  const row = snap.data();
  if (uid && row.uid !== uid) return null;
  return { quoteId: snap.id, ...row };
}

async function persistOrder(order) {
  await db().collection(ORDERS).doc(order.reference).set(
    {
      ...order,
      updatedAtMs: Date.now(),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
}

async function readOrder(reference) {
  const snap = await db().collection(ORDERS).doc(String(reference || '')).get();
  if (!snap.exists) return null;
  return { reference: snap.id, ...snap.data() };
}

function publicOrder(row) {
  if (!row) return null;
  return {
    reference: row.reference,
    status: row.status,
    paymentStatus: row.paymentStatus,
    reviewStatus: row.reviewStatus,
    publishStatus: row.publishStatus,
    days: row.days,
    hours: row.hours,
    totalCop: row.totalCop,
    amountInCents: row.amountInCents,
    format: row.format,
    packageId: row.packageId,
    quoteId: row.quoteId,
    campaignId: row.campaignId || null,
    currency: row.currency,
  };
}

async function createPendingOrder({ quote, reference, uid, userId }) {
  if (quote.expiresAtMs && quote.expiresAtMs < Date.now()) {
    const error = new Error('La cotización venció. Genera una nueva.');
    error.code = 'QUOTE_EXPIRED';
    throw error;
  }
  const order = {
    reference,
    uid,
    userId: userId || null,
    kind: 'promo',
    quoteId: quote.quoteId,
    packageId: quote.packageId,
    days: quote.days,
    hours: quote.hours,
    format: quote.format,
    priceVersion: quote.priceVersion,
    totalCop: quote.totalCop,
    amountInCents: quote.amountInCents,
    amountInCop: quote.amountInCents,
    currency: 'COP',
    regionId: quote.regionId,
    regionLabel: quote.regionLabel,
    promoKind: quote.kind,
    title: quote.title,
    linkUrl: quote.linkUrl,
    mediaUrl: quote.mediaUrl,
    storagePath: quote.storagePath,
    ownerUsername: quote.ownerUsername,
    ownerDisplayName: quote.ownerDisplayName,
    ownerAvatarUrl: quote.ownerAvatarUrl,
    status: 'pending',
    paymentStatus: 'pending',
    reviewStatus: 'pending',
    publishStatus: 'draft',
    campaignId: null,
    createdAtMs: Date.now(),
    createdAt: FieldValue.serverTimestamp(),
  };
  await persistOrder(order);
  return order;
}

function isDeliverable(data, now = Date.now()) {
  if (!data) return false;
  if (data.active === false) return false;
  if (Number(data.expiresAtMs || 0) <= now) return false;
  const pay = String(data.paymentStatus || '');
  if (pay && !['paid', 'simulated'].includes(pay)) return false;
  const review = String(data.reviewStatus || '');
  if (review && review !== 'approved') return false;
  return true;
}

async function writeCampaignFromOrder(order, extra = {}) {
  const hours = Math.max(1, Number(order.hours) || 24);
  const simulate = extra.simulate === true;
  const approved = extra.approved === true || simulate;
  const now = Date.now();
  const payload = {
    kind: order.promoKind || order.kind || 'marketing',
    title: String(order.title || 'Promoción').slice(0, 80),
    mediaUrl: String(order.mediaUrl || '').slice(0, 500),
    linkUrl: String(order.linkUrl || '').slice(0, 500),
    regionId: order.regionId || 'nacional',
    regionLabel: order.regionLabel || 'Colombia',
    ownerUid: order.uid,
    ownerUsername: order.ownerUsername || '',
    ownerDisplayName: order.ownerDisplayName || order.ownerUsername || '',
    ownerAvatarUrl: order.ownerAvatarUrl || null,
    coinsPaid: Number(order.totalCop || 0),
    amountPaidCop: Number(order.totalCop || 0),
    hours,
    packageId: order.packageId,
    format: order.format || 'static',
    priceVersion: order.priceVersion || PRICE_VERSION,
    paymentStatus: simulate ? 'simulated' : 'paid',
    reviewStatus: approved ? 'approved' : 'pending',
    publishStatus: approved ? 'live' : 'pending_review',
    slot: 'rotation',
    exclusivity: false,
    orderReference: order.reference,
    impressions: 0,
    clicks: 0,
    active: approved,
    startsAtMs: approved ? now : null,
    expiresAtMs: approved ? now + hours * 3600_000 : 0,
    createdAt: FieldValue.serverTimestamp(),
    createdAtMs: now,
    updatedAtMs: now,
  };
  if (order.campaignId) {
    await db().collection(PROMOS).doc(order.campaignId).set(payload, { merge: true });
    return order.campaignId;
  }
  const ref = db().collection(PROMOS).doc();
  await ref.set(payload);
  return ref.id;
}

async function markOrderPaid(order, txn) {
  if (order.paymentStatus === 'paid' && order.campaignId) {
    return { duplicate: true, campaignId: order.campaignId };
  }
  const campaignId = await writeCampaignFromOrder(
    { ...order, paymentStatus: 'paid' },
    { approved: false, simulate: false },
  );
  await persistOrder({
    ...order,
    status: 'paid',
    paymentStatus: 'paid',
    reviewStatus: 'pending',
    publishStatus: 'pending_review',
    campaignId,
    wompiTransactionId: txn?.id || order.wompiTransactionId || null,
    paidAtMs: Date.now(),
  });
  return { duplicate: false, campaignId };
}

async function trySettlePromoTransaction(txn) {
  const reference = String(txn?.reference || '').trim();
  if (!reference || !firestoreConfigured()) return { handled: false };
  const order = await readOrder(reference);
  if (!order || order.kind !== 'promo') return { handled: false };

  const status = String(txn.status || '').toUpperCase();
  const amount = Number(txn.amount_in_cents ?? txn.amountInCents ?? txn.amount);
  const currency = String(txn.currency || 'COP').toUpperCase();
  if (currency && currency !== 'COP') {
    return { handled: true, error: 'CURRENCY_MISMATCH' };
  }
  if (Number.isFinite(amount) && Number(order.amountInCents) && amount !== Number(order.amountInCents)) {
    return { handled: true, error: 'AMOUNT_MISMATCH' };
  }

  if (status === 'APPROVED') {
    const result = await markOrderPaid(order, txn);
    return { handled: true, duplicate: result.duplicate, campaignId: result.campaignId };
  }
  if (['DECLINED', 'VOIDED', 'ERROR'].includes(status)) {
    await persistOrder({
      ...order,
      status: status.toLowerCase(),
      paymentStatus: 'failed',
      wompiTransactionId: txn.id || null,
    });
    return { handled: true, failed: true };
  }
  await persistOrder({
    ...order,
    status: 'pending',
    paymentStatus: 'pending',
    wompiTransactionId: txn.id || null,
  });
  return { handled: true, pending: true };
}

async function approveCampaign({ campaignId, actorEmail }) {
  const ref = db().collection(PROMOS).doc(String(campaignId || ''));
  const snap = await ref.get();
  if (!snap.exists) {
    const error = new Error('Campaña no encontrada');
    error.code = 'NOT_FOUND';
    throw error;
  }
  const data = snap.data();
  const pay = String(data.paymentStatus || '');
  if (!['paid', 'simulated'].includes(pay)) {
    const error = new Error('La campaña no tiene un pago confirmado');
    error.code = 'NOT_PAID';
    throw error;
  }
  if (data.reviewStatus === 'approved' && data.active) {
    return { id: snap.id, ...data };
  }
  const hours = Math.max(1, Number(data.hours) || 24);
  const now = Date.now();
  const patch = {
    reviewStatus: 'approved',
    publishStatus: 'live',
    active: true,
    startsAtMs: now,
    expiresAtMs: now + hours * 3600_000,
    reviewedBy: String(actorEmail || ''),
    reviewedAtMs: now,
    updatedAtMs: now,
  };
  await ref.set(patch, { merge: true });
  return { id: snap.id, ...data, ...patch };
}

async function rejectCampaign({ campaignId, actorEmail, reason }) {
  const ref = db().collection(PROMOS).doc(String(campaignId || ''));
  await ref.set(
    {
      reviewStatus: 'rejected',
      publishStatus: 'rejected',
      active: false,
      reviewedBy: String(actorEmail || ''),
      rejectReason: String(reason || '').slice(0, 240),
      reviewedAtMs: Date.now(),
      updatedAtMs: Date.now(),
    },
    { merge: true },
  );
}

async function expireDueCampaigns(limit = 40) {
  if (!firestoreConfigured()) return { expired: 0 };
  const snap = await db().collection(PROMOS).where('active', '==', true).limit(80).get();
  const now = Date.now();
  let expired = 0;
  const batch = db().batch();
  snap.docs.forEach((docSnap) => {
    if (expired >= limit) return;
    const data = docSnap.data();
    if (Number(data.expiresAtMs || 0) > now) return;
    batch.set(
      docSnap.ref,
      { active: false, publishStatus: 'expired', updatedAtMs: now },
      { merge: true },
    );
    expired += 1;
  });
  if (expired) await batch.commit();
  return { expired };
}

async function recordMetric({ promoId, uid, type }) {
  if (!['impression', 'click'].includes(type)) return { ok: false };
  const ref = db().collection(PROMOS).doc(String(promoId || ''));
  const snap = await ref.get();
  if (!snap.exists) return { ok: false };
  const data = snap.data();
  if (!isDeliverable(data)) return { ok: false, skipped: 'not_deliverable' };
  const hour = new Date().toISOString().slice(0, 13);
  const dedupId = `${promoId}_${uid || 'anon'}_${hour}_${type}`;
  const dedupRef = db().collection(DEDUP).doc(dedupId);
  const created = await db().runTransaction(async (tx) => {
    const existing = await tx.get(dedupRef);
    if (existing.exists) return false;
    tx.set(dedupRef, { promoId, uid: uid || null, type, hour, createdAtMs: Date.now() });
    tx.set(
      ref,
      {
        [type === 'click' ? 'clicks' : 'impressions']: FieldValue.increment(1),
        updatedAtMs: Date.now(),
      },
      { merge: true },
    );
    return true;
  });
  return { ok: true, counted: created };
}

async function listAdminCampaigns() {
  const pending = await db().collection(PROMOS).where('reviewStatus', '==', 'pending').limit(40).get();
  const live = await db().collection(PROMOS).where('active', '==', true).limit(40).get();
  const map = new Map();
  [...pending.docs, ...live.docs].forEach((d) => map.set(d.id, { id: d.id, ...d.data() }));
  return [...map.values()].sort((a, b) => Number(b.createdAtMs || 0) - Number(a.createdAtMs || 0));
}

async function listMyCampaigns(uid) {
  const snap = await db().collection(PROMOS).where('ownerUid', '==', uid).limit(40).get();
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => Number(b.createdAtMs || 0) - Number(a.createdAtMs || 0));
}

function projectionWithParams(params, maus) {
  return projectTable(maus, params);
}

module.exports = {
  loadCatalog,
  saveCatalog,
  loadProjection,
  saveProjection,
  createQuote,
  readQuote,
  asPublicQuote,
  persistOrder,
  readOrder,
  publicOrder,
  createPendingOrder,
  trySettlePromoTransaction,
  markOrderPaid,
  approveCampaign,
  rejectCampaign,
  expireDueCampaigns,
  recordMetric,
  listAdminCampaigns,
  listMyCampaigns,
  isDeliverable,
  writeCampaignFromOrder,
  projectionWithParams,
};
module.exports.default = module.exports;
