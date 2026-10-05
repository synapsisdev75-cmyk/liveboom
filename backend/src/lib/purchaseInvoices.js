/**
 * Facturas (comprobantes) de compras pagadas: recargas de BLAST y publicidad.
 * Solo lectura; los montos salen de la orden congelada, nunca del catálogo vigente.
 */

const { createHash } = require('crypto');
const { firestoreConfigured, getAdminDb } = require('./firestoreAdmin');
const { packageLabel } = require('./promoPackages');

const SELLER = {
  name: 'MACRO REAL S.A.S.',
  brand: 'LiveBoom',
  nit: '901.525.356-9',
  address: 'Villavicencio, Meta, Colombia',
  email: 'macroreal2026@gmail.com',
  phone: '+57 313 387 8060',
  website: 'https://liveboomapp.com',
};

const CREDITED_BLAST = new Set(['CREDITED', 'COMPLETED']);

function msOf(value) {
  if (!value) return 0;
  if (typeof value === 'number') return value;
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (typeof value._seconds === 'number') return value._seconds * 1000;
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? parsed : 0;
}

function invoiceNumber(reference) {
  const hash = createHash('sha1').update(String(reference || '')).digest('hex');
  return `LB-${hash.slice(0, 10).toUpperCase()}`;
}

/** `paymentOrders` guarda `amountInCop` en centavos (igual que Wompi). */
function mapBlastOrder(order) {
  if (!order?.id) return null;
  const status = String(order.status || '').toUpperCase();
  if (!CREDITED_BLAST.has(status)) return null;
  const cents = Math.max(0, Math.floor(Number(order.amountInCop ?? order.priceCOP) || 0));
  const blast = Math.max(0, Math.floor(Number(order.blastAmount ?? order.coins) || 0));
  if (!cents || !blast) return null;
  return {
    id: `blast:${order.id}`,
    kind: 'blast',
    invoiceNumber: invoiceNumber(order.id),
    reference: String(order.wompiReference || order.id),
    wompiTransactionId: order.wompiTransactionId ? String(order.wompiTransactionId) : null,
    description: `Recarga de ${blast.toLocaleString('es-CO')} BLAST`,
    detail: order.packageId ? `Paquete ${order.packageId}` : null,
    quantity: blast,
    amountCop: Math.round(cents / 100),
    currency: 'COP',
    paidAtMs: Number(order.creditedAtMs) || msOf(order.creditedAt) || msOf(order.updatedAt) || msOf(order.createdAt),
  };
}

function mapAdOrder(order) {
  if (!order?.reference) return null;
  if (String(order.paymentStatus || '') !== 'paid') return null;
  const amountCop = Math.max(0, Math.round(Number(order.totalCop) || 0));
  if (!amountCop) return null;
  const duration = packageLabel(order.days, order.hours);
  const format = order.format === 'animated' ? 'animado / video' : 'estático';
  return {
    id: `ads:${order.reference}`,
    kind: 'ads',
    invoiceNumber: invoiceNumber(order.reference),
    reference: String(order.reference),
    wompiTransactionId: order.wompiTransactionId ? String(order.wompiTransactionId) : null,
    description: `Publicidad ${duration}`,
    detail: [format, order.regionLabel || order.regionId, order.title].filter(Boolean).join(' · '),
    quantity: 1,
    amountCop,
    currency: 'COP',
    paidAtMs: Number(order.paidAtMs) || msOf(order.updatedAt) || Number(order.createdAtMs) || 0,
  };
}

async function readDocs(query) {
  try {
    const snap = await query.get();
    return snap.docs.map((d) => ({ id: d.id, reference: d.id, ...d.data() }));
  } catch (error) {
    console.warn('[invoices] read', error.message);
    return [];
  }
}

async function listUserPurchases(uid) {
  const id = String(uid || '').trim();
  if (!id || !firestoreConfigured()) return [];
  const db = getAdminDb();
  const [byUid, byUser, ads] = await Promise.all([
    readDocs(db.collection('paymentOrders').where('uid', '==', id).limit(200)),
    readDocs(db.collection('paymentOrders').where('userId', '==', id).limit(200)),
    readDocs(db.collection('ad_orders').where('uid', '==', id).limit(200)),
  ]);
  const blastById = new Map();
  [...byUid, ...byUser].forEach((order) => blastById.set(order.id, order));
  return [
    ...[...blastById.values()].map(mapBlastOrder),
    ...ads.map(mapAdOrder),
  ]
    .filter(Boolean)
    .sort((a, b) => b.paidAtMs - a.paidAtMs);
}

async function readBuyer(uid, email) {
  const buyer = { uid: String(uid || ''), name: '', username: '', email: String(email || '') };
  if (!buyer.uid || !firestoreConfigured()) return buyer;
  try {
    const snap = await getAdminDb().collection('users').doc(buyer.uid).get();
    const data = snap.exists ? snap.data() : {};
    buyer.name = String(data.displayName || data.name || '').slice(0, 120);
    buyer.username = String(data.username || data.handle || '').slice(0, 40);
    if (!buyer.email) buyer.email = String(data.email || '');
  } catch (error) {
    console.warn('[invoices] buyer', error.message);
  }
  return buyer;
}

module.exports = {
  SELLER,
  invoiceNumber,
  mapBlastOrder,
  mapAdOrder,
  listUserPurchases,
  readBuyer,
};
module.exports.default = module.exports;
