const { FieldValue } = require('firebase-admin/firestore');
const { getStorage } = require('firebase-admin/storage');
const { firestoreConfigured, getAdminDb } = require('./firestoreAdmin');
const config = require('./verificationConfig');
const filesLib = require('./verificationFiles');
const {
  namesCompatible,
  documentNumberText,
  accountNumberText,
  ageFromBirthDate,
  parseExpiry,
  maskAccount,
} = require('./verificationNormalize');

const CASES = 'wallet_verification_cases';
const STORAGE_BUCKET =
  process.env.FIREBASE_STORAGE_BUCKET || 'liveboom-app.firebasestorage.app';

const CASE_STATUS = {
  NOT_STARTED: 'not_started',
  DRAFT: 'draft',
  SUBMITTED: 'submitted',
  IN_REVIEW: 'in_review',
  NEEDS_CORRECTION: 'needs_correction',
  VERIFIED: 'verified',
  REJECTED: 'rejected',
  NEEDS_REVERIFICATION: 'needs_reverification',
};

const ITEM_STATUS = {
  UNVERIFIED: 'unverified',
  IN_REVIEW: 'in_review',
  VERIFIED: 'verified',
  REJECTED: 'rejected',
  NEEDS_CORRECTION: 'needs_correction',
};

const memory = { cases: new Map(), files: new Map(), accounts: new Map(), events: new Map() };

function caseIdFor(uid) {
  return `wv_${String(uid || '').trim()}`;
}

function emptyCase(uid) {
  const now = Date.now();
  return {
    caseId: caseIdFor(uid),
    userId: String(uid),
    status: CASE_STATUS.NOT_STARTED,
    identityStatus: ITEM_STATUS.UNVERIFIED,
    identity: {
      legalName: '',
      documentType: 'CC',
      documentNumber: '',
      documentCountry: config.COUNTRY,
      birthDate: '',
      documentExpiry: '',
      email: '',
    },
    identityVersion: 0,
    evidenceVersion: 0,
    reviewedVersion: 0,
    identityVerifiedAtMs: null,
    identityVerifiedBy: null,
    needsAdmin: false,
    correction: {},
    consents: [],
    createdAtMs: now,
    updatedAtMs: now,
    submittedAtMs: null,
  };
}

function db() {
  return getAdminDb();
}

function caseRef(uid) {
  return db().collection(CASES).doc(caseIdFor(uid));
}

async function readCase(uid) {
  if (firestoreConfigured()) {
    const snap = await caseRef(uid).get();
    return snap.exists ? { ...emptyCase(uid), ...snap.data() } : emptyCase(uid);
  }
  return memory.cases.get(caseIdFor(uid)) || emptyCase(uid);
}

async function writeCase(uid, patch) {
  const current = await readCase(uid);
  const next = { ...current, ...patch, updatedAtMs: Date.now(), caseId: caseIdFor(uid), userId: String(uid) };
  if (firestoreConfigured()) {
    await caseRef(uid).set(
      { ...next, updatedAt: FieldValue.serverTimestamp() },
      { merge: true },
    );
  } else {
    memory.cases.set(caseIdFor(uid), next);
  }
  return next;
}

async function addEvent(uid, event) {
  const row = {
    id: `ev_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    atMs: Date.now(),
    ...event,
  };
  if (firestoreConfigured()) {
    await caseRef(uid).collection('events').doc(row.id).set(row);
  } else {
    const key = caseIdFor(uid);
    const list = memory.events.get(key) || [];
    list.push(row);
    memory.events.set(key, list);
  }
  return row;
}

async function listFiles(uid) {
  if (firestoreConfigured()) {
    const snap = await caseRef(uid).collection('files').get();
    return snap.docs.map((item) => item.data());
  }
  return [...(memory.files.get(caseIdFor(uid)) || [])];
}

async function listAccounts(uid) {
  if (firestoreConfigured()) {
    const snap = await caseRef(uid).collection('accounts').orderBy('createdAtMs', 'desc').get();
    return snap.docs.map((item) => item.data());
  }
  return [...(memory.accounts.get(caseIdFor(uid)) || [])];
}

function publicFile(file, { includePath } = {}) {
  if (!file) return null;
  return {
    id: file.id,
    slot: file.slot,
    contentType: file.contentType,
    size: file.size,
    status: file.status || 'pending',
    correctionMessage: file.correctionMessage || '',
    uploadedAtMs: file.uploadedAtMs,
    storagePath: includePath ? file.storagePath : undefined,
  };
}

function publicAccount(account) {
  if (!account) return null;
  return {
    id: account.id,
    bank: account.bank,
    accountType: account.accountType,
    accountNumberMasked: maskAccount(account.accountNumber),
    holderName: account.holderName,
    status: account.status,
    needsCertificate: Boolean(account.needsCertificate),
    createdAtMs: account.createdAtMs,
    verifiedAtMs: account.verifiedAtMs || null,
  };
}

function actionFor(row, files, accounts) {
  const status = row.status;
  if (status === CASE_STATUS.NOT_STARTED) return { key: 'start', label: 'Completar verificación' };
  if (status === CASE_STATUS.DRAFT) return { key: 'continue', label: 'Continuar verificación' };
  if (status === CASE_STATUS.NEEDS_CORRECTION) return { key: 'correct', label: 'Corregir documentos' };
  if (status === CASE_STATUS.SUBMITTED || status === CASE_STATUS.IN_REVIEW) {
    return { key: 'review', label: 'Consultar revisión' };
  }
  if (status === CASE_STATUS.VERIFIED) return { key: 'verified', label: 'Ver datos verificados' };
  if (status === CASE_STATUS.REJECTED || status === CASE_STATUS.NEEDS_REVERIFICATION) {
    return { key: 'restart', label: 'Completar verificación' };
  }
  return { key: 'continue', label: 'Continuar verificación' };
}

function publicCase(row, files, accounts) {
  const identityVerified = row.identityStatus === ITEM_STATUS.VERIFIED;
  const verifiedAccount = (accounts || []).find((item) => item.status === ITEM_STATUS.VERIFIED) || null;
  return {
    caseId: row.caseId,
    status: row.status,
    identityStatus: row.identityStatus,
    accountStatus: verifiedAccount
      ? ITEM_STATUS.VERIFIED
      : (accounts || []).some((item) => item.status === ITEM_STATUS.IN_REVIEW || item.status === ITEM_STATUS.NEEDS_CORRECTION)
        ? ITEM_STATUS.IN_REVIEW
        : ITEM_STATUS.UNVERIFIED,
    identity: {
      legalName: row.identity?.legalName || '',
      documentType: row.identity?.documentType || 'CC',
      documentNumber: row.identity?.documentNumber || '',
      documentCountry: row.identity?.documentCountry || config.COUNTRY,
      birthDate: row.identity?.birthDate || '',
      documentExpiry: row.identity?.documentExpiry || '',
      email: row.identity?.email || '',
    },
    identityVerified,
    identityVerifiedAtMs: row.identityVerifiedAtMs,
    correction: row.correction || {},
    consents: row.consents || [],
    files: (files || []).map((item) => publicFile(item)),
    accounts: (accounts || []).map(publicAccount),
    action: actionFor(row, files, accounts),
    biometricAvailable: config.biometricProviderConfigured(),
    config: config.publicConfig(),
    canWithdraw: identityVerified && Boolean(verifiedAccount),
    needsAdmin: Boolean(row.needsAdmin),
    message:
      identityVerified && verifiedAccount
        ? 'Identidad y cuenta verificadas. Ya puedes solicitar un retiro.'
        : 'Para solicitar tu retiro, necesitamos verificar tu identidad y la cuenta donde recibirás tus ganancias.',
  };
}

async function getPublicCase(uid) {
  const row = await readCase(uid);
  const [files, accounts] = await Promise.all([listFiles(uid), listAccounts(uid)]);
  return publicCase(row, files, accounts);
}

async function saveDraft(uid, payload, actor) {
  const row = await readCase(uid);
  if (row.status === CASE_STATUS.VERIFIED && !payload?.forceNew) {
    return getPublicCase(uid);
  }
  if (row.status === CASE_STATUS.IN_REVIEW) {
    const error = new Error('El expediente está en revisión. Espera el resultado o la corrección.');
    error.status = 409;
    throw error;
  }
  const identity = {
    ...(row.identity || {}),
    legalName: String(payload?.legalName || row.identity?.legalName || '').trim().slice(0, 120),
    documentType: config.documentTypeOf(payload?.documentType)?.id || row.identity?.documentType || 'CC',
    documentNumber: documentNumberText(payload?.documentNumber ?? row.identity?.documentNumber),
    documentCountry: config.COUNTRY,
    birthDate: String(payload?.birthDate || row.identity?.birthDate || '').trim().slice(0, 10),
    documentExpiry: String(payload?.documentExpiry || row.identity?.documentExpiry || '').trim().slice(0, 10),
    email: String(payload?.email || actor?.email || row.identity?.email || '').trim().slice(0, 180),
  };
  const nextStatus =
    row.status === CASE_STATUS.NOT_STARTED || row.status === CASE_STATUS.REJECTED
      ? CASE_STATUS.DRAFT
      : row.status === CASE_STATUS.VERIFIED && payload?.forceNew
        ? CASE_STATUS.NEEDS_REVERIFICATION
        : row.status;
  const keepIdentity =
    row.identityStatus === ITEM_STATUS.VERIFIED && !payload?.resetIdentity;
  await writeCase(uid, {
    identity,
    identityVersion: Math.floor(Number(row.identityVersion) || 0) + 1,
    status: nextStatus === CASE_STATUS.SUBMITTED ? CASE_STATUS.DRAFT : nextStatus,
    identityStatus: keepIdentity
      ? ITEM_STATUS.VERIFIED
      : nextStatus === CASE_STATUS.VERIFIED
        ? ITEM_STATUS.VERIFIED
        : ITEM_STATUS.UNVERIFIED,
  });
  await addEvent(uid, { type: 'draft_saved', actorId: uid });
  return getPublicCase(uid);
}

function requiredSlots(identity, accounts) {
  const doc = config.documentTypeOf(identity?.documentType) || config.DOCUMENT_TYPES.CC;
  const slots = [...doc.sides];
  const method = config.payoutMethodOf(accounts?.[0]?.bank);
  if (method?.needsCertificate) slots.push('bank_cert');
  return slots;
}

async function saveFile({ uid, slot, buffer, declaredType }) {
  const row = await readCase(uid);
  if (row.status === CASE_STATUS.IN_REVIEW || row.status === CASE_STATUS.SUBMITTED) {
    const error = new Error('El expediente está en revisión. Espera el resultado o la corrección.');
    error.status = 409;
    throw error;
  }
  const files = await listFiles(uid);
  if (files.length >= config.MAX_FILES_PER_CASE) {
    const error = new Error('Llegaste al máximo de archivos de este expediente.');
    error.status = 400;
    throw error;
  }
  if (!buffer || buffer.length < 32 || buffer.length > config.MAX_FILE_BYTES) {
    const error = new Error('El archivo no tiene un tamaño válido.');
    error.status = 400;
    throw error;
  }
  const mime = filesLib.sniffMime(buffer);
  if (!mime || (declaredType && declaredType !== mime && !(declaredType === 'image/jpg' && mime === 'image/jpeg'))) {
    const error = new Error('Solo se admiten JPG, PNG, WEBP o PDF reales.');
    error.status = 400;
    throw error;
  }
  const allowed = new Set(['id_front', 'id_back', 'passport', 'bank_cert']);
  if (!allowed.has(String(slot))) {
    const error = new Error('Ese tipo de documento no está habilitado.');
    error.status = 400;
    throw error;
  }
  const id = filesLib.newFileId();
  const path = filesLib.storagePath(uid, row.caseId, id);
  if (firestoreConfigured()) {
    const bucket = getStorage().bucket(STORAGE_BUCKET);
    const object = bucket.file(path);
    await object.save(buffer, {
      resumable: false,
      metadata: {
        contentType: mime,
        metadata: { uid: String(uid), slot: String(slot), caseId: row.caseId },
      },
    });
  }
  const meta = {
    id,
    slot: String(slot),
    storagePath: path,
    contentType: mime,
    size: buffer.length,
    sha256: filesLib.sha256(buffer),
    status: 'pending',
    correctionMessage: '',
    uploadedAtMs: Date.now(),
  };
  const previous = files.filter((item) => item.slot === slot);
  if (firestoreConfigured()) {
    const batch = db().batch();
    batch.set(caseRef(uid).collection('files').doc(id), meta);
    previous.forEach((item) => batch.delete(caseRef(uid).collection('files').doc(item.id)));
    batch.set(
      caseRef(uid),
      {
        evidenceVersion: Math.floor(Number(row.evidenceVersion) || 0) + 1,
        updatedAtMs: Date.now(),
        status: row.status === CASE_STATUS.NOT_STARTED ? CASE_STATUS.DRAFT : row.status,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
    await batch.commit();
  } else {
    const next = files.filter((item) => item.slot !== slot).concat(meta);
    memory.files.set(caseIdFor(uid), next);
    await writeCase(uid, {
      evidenceVersion: Math.floor(Number(row.evidenceVersion) || 0) + 1,
      status: row.status === CASE_STATUS.NOT_STARTED ? CASE_STATUS.DRAFT : row.status,
    });
  }
  await addEvent(uid, { type: 'file_uploaded', actorId: uid, slot, fileId: id });
  return getPublicCase(uid);
}

async function upsertAccount(uid, payload) {
  const method = config.payoutMethodOf(payload?.bank);
  if (!method) {
    const error = new Error('Ese medio de pago no está habilitado para retiros COP.');
    error.status = 400;
    throw error;
  }
  const typeOk = config.ACCOUNT_TYPES.some((item) => item.id === payload?.accountType);
  if (!typeOk) {
    const error = new Error('Tipo de cuenta no admitido.');
    error.status = 400;
    throw error;
  }
  const accountNumber = accountNumberText(payload?.accountNumber);
  if (accountNumber.length < 6) {
    const error = new Error('Indica el número de cuenta o celular.');
    error.status = 400;
    throw error;
  }
  const holderName = String(payload?.holderName || '').trim().slice(0, 120);
  if (holderName.length < 3) {
    const error = new Error('El titular debe ser el nombre legal, no el apodo del perfil.');
    error.status = 400;
    throw error;
  }
  const row = await readCase(uid);
  const accounts = await listAccounts(uid);
  const fingerprint = `${method.id}|${payload.accountType}|${accountNumber}`;
  const existing = accounts.find((item) => item.fingerprint === fingerprint);
  if (existing) {
    return getPublicCase(uid);
  }
  const id = `ac_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const account = {
    id,
    bank: method.id,
    accountType: String(payload.accountType),
    accountNumber,
    holderName,
    fingerprint,
    needsCertificate: method.needsCertificate,
    status: ITEM_STATUS.UNVERIFIED,
    createdAtMs: Date.now(),
    verifiedAtMs: null,
  };
  const nextStatus =
    row.status === CASE_STATUS.NOT_STARTED ? CASE_STATUS.DRAFT : row.status;
  if (firestoreConfigured()) {
    await caseRef(uid).collection('accounts').doc(id).set(account);
    await writeCase(uid, { status: nextStatus });
  } else {
    memory.accounts.set(caseIdFor(uid), [account, ...accounts]);
    await writeCase(uid, { status: nextStatus });
  }
  await addEvent(uid, { type: 'account_added', actorId: uid, accountId: id });
  return getPublicCase(uid);
}

async function submitCase(uid, payload, actor) {
  const current = await readCase(uid);
  if (current.status === CASE_STATUS.SUBMITTED || current.status === CASE_STATUS.IN_REVIEW) {
    const error = new Error('El expediente ya está en revisión.');
    error.status = 409;
    throw error;
  }
  await saveDraft(uid, payload?.identity || payload, actor);
  const fresh = await readCase(uid);
  const [files, accounts] = await Promise.all([listFiles(uid), listAccounts(uid)]);
  const age = ageFromBirthDate(fresh.identity?.birthDate);
  if (age == null || age < config.MIN_AGE) {
    const error = new Error('Debes ser mayor de 18 años para retirar.');
    error.status = 400;
    throw error;
  }
  const doc = config.documentTypeOf(fresh.identity.documentType);
  if (!doc) {
    const error = new Error('Tipo de documento no admitido.');
    error.status = 400;
    throw error;
  }
  if (doc.hasExpiry) {
    const exp = parseExpiry(fresh.identity.documentExpiry);
    if (!exp || exp < Date.now()) {
      const error = new Error('El documento está vencido o falta la fecha de vencimiento.');
      error.status = 400;
      throw error;
    }
  }
  if (!accounts.length) {
    const error = new Error('Agrega la cuenta donde recibirás el retiro.');
    error.status = 400;
    throw error;
  }
  const slots = requiredSlots(fresh.identity, accounts);
  for (const slot of slots) {
    const file = files.find((item) => item.slot === slot);
    if (!file) {
      const error = new Error('Faltan documentos obligatorios. Revisa frente, reverso o certificación según el caso.');
      error.status = 400;
      throw error;
    }
  }
  const accepted = Array.isArray(payload?.consents) ? payload.consents : [];
  const need = config.CONSENTS.map((item) => item.key);
  for (const key of need) {
    if (!accepted.includes(key)) {
      const error = new Error('Debes aceptar las autorizaciones para enviar el expediente.');
      error.status = 400;
      throw error;
    }
  }
  if (config.biometricProviderConfigured() && payload?.useBiometric) {
    const error = new Error('El proveedor biométrico no devolvió una verificación auténtica.');
    error.status = 409;
    throw error;
  }
  const consents = config.CONSENTS.filter((item) => accepted.includes(item.key)).map((item) => ({
    key: item.key,
    version: item.version,
    acceptedAtMs: Date.now(),
  }));
  const identityAlready = fresh.identityStatus === ITEM_STATUS.VERIFIED;
  const hasVerifiedAccount = accounts.some((item) => item.status === ITEM_STATUS.VERIFIED);
  const next = await writeCase(uid, {
    status: identityAlready && hasVerifiedAccount ? CASE_STATUS.VERIFIED : CASE_STATUS.SUBMITTED,
    identityStatus: identityAlready ? ITEM_STATUS.VERIFIED : ITEM_STATUS.IN_REVIEW,
    needsAdmin: true,
    submittedAtMs: Date.now(),
    submittedVersion: Math.floor(Number(fresh.evidenceVersion) || 0),
    consents,
    correction: {},
  });
  const pendingAccounts = accounts.filter((item) => item.status !== ITEM_STATUS.VERIFIED);
  if (firestoreConfigured()) {
    const batch = db().batch();
    pendingAccounts.forEach((item) => {
      batch.set(
        caseRef(uid).collection('accounts').doc(item.id),
        { status: ITEM_STATUS.IN_REVIEW },
        { merge: true },
      );
    });
    await batch.commit();
  } else {
    memory.accounts.set(
      caseIdFor(uid),
      accounts.map((item) =>
        item.status === ITEM_STATUS.VERIFIED ? item : { ...item, status: ITEM_STATUS.IN_REVIEW },
      ),
    );
  }
  await addEvent(uid, { type: 'submitted', actorId: uid, version: next.submittedVersion });
  return getPublicCase(uid);
}

function assertReviewer(actorId, caseUserId) {
  if (String(actorId) === String(caseUserId)) {
    const error = new Error('No puedes aprobar tu propio expediente.');
    error.status = 403;
    throw error;
  }
}

async function decideCase({ uid, actorId, actorEmail, action, reason, internalNote, slots, lockToken }) {
  assertReviewer(actorId, uid);
  const row = await readCase(uid);
  if (row.reviewLock && row.reviewLock.uid && row.reviewLock.uid !== actorId && Number(row.reviewLock.untilMs) > Date.now()) {
    const error = new Error('Otro revisor está trabajando este expediente.');
    error.status = 409;
    throw error;
  }
  if (row.submittedVersion && row.reviewedVersion && Number(row.evidenceVersion) !== Number(row.submittedVersion)) {
    if (action === 'approve') {
      const error = new Error('Hay documentos nuevos. Vuelve a abrir el expediente antes de aprobar.');
      error.status = 409;
      throw error;
    }
  }
  const userMessage = String(reason || '').trim().slice(0, 400);
  const note = String(internalNote || '').trim().slice(0, 500);
  if (action === 'approve') {
    const accounts = await listAccounts(uid);
    const files = await listFiles(uid);
    const slotsNeeded = requiredSlots(row.identity, accounts);
    for (const slot of slotsNeeded) {
      if (!files.find((item) => item.slot === slot)) {
        const error = new Error('No hay evidencias suficientes para aprobar.');
        error.status = 400;
        throw error;
      }
    }
    const pendingAccounts = accounts.filter(
      (item) => item.status === ITEM_STATUS.IN_REVIEW || item.status === ITEM_STATUS.UNVERIFIED,
    );
    const toVerify = pendingAccounts.length ? pendingAccounts : accounts;
    for (const item of toVerify) {
      const mismatch = namesCompatible(row.identity?.legalName, item.holderName);
      if (!mismatch.ok) {
        const error = new Error(
          'El titular de la cuenta no coincide con la identidad. No apruebes cuentas de terceros.',
        );
        error.status = 400;
        throw error;
      }
    }
    const retainUntilMs = Date.now() + config.RETAIN_DAYS_VERIFIED * 24 * 60 * 60 * 1000;
    await writeCase(uid, {
      status: CASE_STATUS.VERIFIED,
      identityStatus: ITEM_STATUS.VERIFIED,
      identityVerifiedAtMs: row.identityVerifiedAtMs || Date.now(),
      identityVerifiedBy: actorEmail || actorId,
      needsAdmin: false,
      reviewedVersion: Number(row.evidenceVersion) || 0,
      reviewLock: null,
      correction: {},
      retainUntilMs,
    });
    if (firestoreConfigured()) {
      const batch = db().batch();
      toVerify.forEach((item) => {
        batch.set(
          caseRef(uid).collection('accounts').doc(item.id),
          { status: ITEM_STATUS.VERIFIED, verifiedAtMs: Date.now() },
          { merge: true },
        );
      });
      files.forEach((item) => {
        batch.set(caseRef(uid).collection('files').doc(item.id), { status: 'accepted' }, { merge: true });
      });
      await batch.commit();
    } else {
      const verifiedIds = new Set(toVerify.map((item) => item.id));
      memory.accounts.set(
        caseIdFor(uid),
        accounts.map((item) =>
          verifiedIds.has(item.id)
            ? { ...item, status: ITEM_STATUS.VERIFIED, verifiedAtMs: Date.now() }
            : item,
        ),
      );
    }
    await addEvent(uid, {
      type: 'approved',
      actorId,
      actorEmail,
      userMessage: '',
      internalNote: note,
      version: Number(row.evidenceVersion) || 0,
    });
    notifyDecision(uid, 'approved', '');
    return getPublicCase(uid);
  }
  if (action === 'correct') {
    if (!userMessage) {
      const error = new Error('Indica la corrección concreta para el usuario.');
      error.status = 400;
      throw error;
    }
    const correction = {};
    const list = Array.isArray(slots) && slots.length ? slots : ['general'];
    list.forEach((slot) => {
      correction[slot] = userMessage;
    });
    await writeCase(uid, {
      status: CASE_STATUS.NEEDS_CORRECTION,
      identityStatus: ITEM_STATUS.NEEDS_CORRECTION,
      needsAdmin: false,
      correction,
      reviewLock: null,
    });
    if (firestoreConfigured() && Array.isArray(slots)) {
      const files = await listFiles(uid);
      const batch = db().batch();
      files
        .filter((item) => slots.includes(item.slot))
        .forEach((item) => {
          batch.set(
            caseRef(uid).collection('files').doc(item.id),
            { status: 'rejected', correctionMessage: userMessage },
            { merge: true },
          );
        });
      await batch.commit();
    }
    await addEvent(uid, {
      type: 'needs_correction',
      actorId,
      actorEmail,
      userMessage,
      internalNote: note,
      slots: list,
    });
    notifyDecision(uid, 'needs_correction', userMessage);
    return getPublicCase(uid);
  }
  if (action === 'reject') {
    if (!userMessage) {
      const error = new Error('Documenta el motivo de rechazo.');
      error.status = 400;
      throw error;
    }
    await writeCase(uid, {
      status: CASE_STATUS.REJECTED,
      identityStatus: ITEM_STATUS.REJECTED,
      needsAdmin: false,
      correction: { general: userMessage },
      reviewLock: null,
      retainUntilMs: Date.now() + config.RETAIN_DAYS_REJECTED * 24 * 60 * 60 * 1000,
    });
    await addEvent(uid, {
      type: 'rejected',
      actorId,
      actorEmail,
      userMessage,
      internalNote: note,
    });
    notifyDecision(uid, 'rejected', userMessage);
    return getPublicCase(uid);
  }
  const error = new Error('Acción no válida.');
  error.status = 400;
  throw error;
}

async function lockCase(uid, actorId) {
  assertReviewer(actorId, uid);
  const row = await readCase(uid);
  if (row.reviewLock?.uid && row.reviewLock.uid !== actorId && Number(row.reviewLock.untilMs) > Date.now()) {
    const error = new Error('Otro revisor está trabajando este expediente.');
    error.status = 409;
    throw error;
  }
  await writeCase(uid, {
    status: row.status === CASE_STATUS.SUBMITTED ? CASE_STATUS.IN_REVIEW : row.status,
    reviewLock: { uid: actorId, untilMs: Date.now() + 15 * 60 * 1000 },
  });
  return getPublicCase(uid);
}

function caseListItem(row) {
  return {
    caseId: row.caseId,
    userId: row.userId,
    status: row.status,
    identityStatus: row.identityStatus,
    legalName: row.identity?.legalName || '',
    documentType: row.identity?.documentType || '',
    updatedAtMs: row.updatedAtMs,
    submittedAtMs: row.submittedAtMs,
    needsAdmin: Boolean(row.needsAdmin),
  };
}

async function listQueue({ cursor, limit, filter } = {}) {
  const size = Math.min(50, Math.max(1, Math.floor(Number(limit) || 20)));
  const queueOnly = String(filter || 'queue') !== 'all';
  if (firestoreConfigured()) {
    let query = db().collection(CASES);
    if (queueOnly) query = query.where('needsAdmin', '==', true);
    query = query.orderBy('updatedAtMs', 'desc').limit(size + 1);
    if (cursor) query = query.startAfter(Number(cursor));
    const snap = await query.get();
    const rows = snap.docs.slice(0, size).map((item) => item.data());
    const next = snap.docs.length > size ? String(rows[rows.length - 1]?.updatedAtMs || '') : null;
    return { cases: rows.map(caseListItem), nextCursor: next };
  }
  const rows = [...memory.cases.values()]
    .filter((item) => (queueOnly ? item.needsAdmin : item.status !== CASE_STATUS.NOT_STARTED))
    .sort((a, b) => (b.updatedAtMs || 0) - (a.updatedAtMs || 0));
  return { cases: rows.slice(0, size).map(caseListItem), nextCursor: null };
}

async function adminGet(uid) {
  const pub = await getPublicCase(uid);
  const events = firestoreConfigured()
    ? (await caseRef(uid).collection('events').orderBy('atMs', 'desc').limit(40).get()).docs.map((item) => item.data())
    : [...(memory.events.get(caseIdFor(uid)) || [])].reverse();
  return {
    ...pub,
    userId: String(uid),
    events: events.map((item) => ({
      id: item.id,
      type: item.type,
      atMs: item.atMs,
      actorEmail: item.actorEmail || null,
      userMessage: item.userMessage || '',
      internalNote: item.internalNote || '',
      slots: item.slots || [],
    })),
  };
}

async function signedFileUrl({ uid, fileId, actorId, isAdmin }) {
  const files = await listFiles(uid);
  const file = files.find((item) => item.id === fileId);
  if (!file) {
    const error = new Error('Archivo no encontrado.');
    error.status = 404;
    throw error;
  }
  if (!isAdmin && String(actorId) !== String(uid)) {
    const error = new Error('No autorizado.');
    error.status = 403;
    throw error;
  }
  if (!firestoreConfigured()) {
    return { url: '', expiresAtMs: Date.now() + 120000 };
  }
  const bucket = getStorage().bucket(STORAGE_BUCKET);
  const [url] = await bucket.file(file.storagePath).getSignedUrl({
    version: 'v4',
    action: 'read',
    expires: Date.now() + 5 * 60 * 1000,
  });
  return { url, expiresAtMs: Date.now() + 5 * 60 * 1000, contentType: file.contentType, slot: file.slot };
}

async function requireVerifiedPayout(uid, { fullName, documentId, payoutMethod, accountNumber, accountType, accountId }) {
  const row = await readCase(uid);
  const accounts = await listAccounts(uid);
  if (row.identityStatus !== ITEM_STATUS.VERIFIED || row.status !== CASE_STATUS.VERIFIED) {
    return { ok: false, code: 'IDENTITY_UNVERIFIED' };
  }
  const wantedId = String(accountId || '').trim();
  const wantedNumber = accountNumberText(accountNumber);
  const account = wantedId
    ? accounts.find((item) => item.id === wantedId && item.status === ITEM_STATUS.VERIFIED)
    : accounts.find(
        (item) =>
          item.status === ITEM_STATUS.VERIFIED &&
          item.bank === String(payoutMethod || '').trim() &&
          item.accountType === String(accountType || '').trim() &&
          item.accountNumber === wantedNumber,
      );
  if (!account) {
    return { ok: false, code: 'ACCOUNT_UNVERIFIED' };
  }
  if (payoutMethod && String(payoutMethod).trim() && account.bank !== String(payoutMethod).trim()) {
    return { ok: false, code: 'ACCOUNT_UNVERIFIED' };
  }
  const providedName = String(fullName || row.identity?.legalName || '').trim();
  const providedDoc = documentNumberText(documentId || row.identity?.documentNumber);
  const identityMatch = namesCompatible(row.identity?.legalName, providedName);
  const accountMatch = namesCompatible(row.identity?.legalName, account.holderName);
  if (!identityMatch.ok || !accountMatch.ok) {
    return { ok: false, code: 'HOLDER_MISMATCH' };
  }
  if (providedDoc !== documentNumberText(row.identity.documentNumber)) {
    return { ok: false, code: 'DOCUMENT_MISMATCH' };
  }
  return {
    ok: true,
    caseId: row.caseId,
    accountId: account.id,
    account: {
      id: account.id,
      bank: account.bank,
      accountType: account.accountType,
      accountNumber: account.accountNumber,
      accountNumberMasked: maskAccount(account.accountNumber),
      holderName: account.holderName,
    },
    snapshot: {
      caseId: row.caseId,
      legalName: row.identity.legalName,
      documentType: row.identity.documentType,
      documentNumber: row.identity.documentNumber,
      identityVerified: true,
      accountVerified: true,
      identityVerifiedAtMs: row.identityVerifiedAtMs,
      accountVerifiedAtMs: account.verifiedAtMs,
    },
  };
}

function notifyDecision(uid, type, userMessage) {
  if (process.env.NODE_TEST_CONTEXT || !firestoreConfigured()) return;
  const titles = {
    approved: 'Verificación de retiro aprobada',
    needs_correction: 'Corrección en tu verificación de retiro',
    rejected: 'Verificación de retiro rechazada',
  };
  const bodies = {
    approved: 'Tu identidad y cuenta de cobro fueron verificadas. Ya puedes solicitar un retiro.',
    needs_correction: userMessage || 'Hay una corrección pendiente en tu expediente.',
    rejected: userMessage || 'Tu expediente de verificación fue rechazado.',
  };
  Promise.resolve()
    .then(() => {
      const { sendPushToUsers } = require('./pushNotify');
      return sendPushToUsers({
        recipientUids: [uid],
        title: titles[type] || 'Verificación de retiro',
        body: String(bodies[type] || '').slice(0, 180),
        channel: 'general',
        data: { href: '/wallet/withdraw/verification', kind: 'withdrawal_verification' },
      });
    })
    .catch((error) => {
      console.warn('[verification] push', error instanceof Error ? error.message : error);
    });
}

async function purgeExpiredEvidence({ now = Date.now(), limit = 20 } = {}) {
  if (!firestoreConfigured()) return { purged: 0 };
  const snap = await db()
    .collection(CASES)
    .where('retainUntilMs', '<=', now)
    .orderBy('retainUntilMs', 'asc')
    .limit(Math.min(50, Math.max(1, limit)))
    .get();
  let purged = 0;
  const bucket = getStorage().bucket(STORAGE_BUCKET);
  for (const doc of snap.docs) {
    const row = doc.data() || {};
    const uid = String(row.userId || '').trim();
    if (!uid) continue;
    const files = await listFiles(uid);
    for (const file of files) {
      if (!file.storagePath) continue;
      try {
        await bucket.file(file.storagePath).delete({ ignoreNotFound: true });
      } catch (error) {
        console.warn('[verification] purge file', error instanceof Error ? error.message : error);
      }
      await caseRef(uid).collection('files').doc(file.id).set(
        { storagePath: '', purgedAtMs: now, status: 'purged' },
        { merge: true },
      );
    }
    await writeCase(uid, { filesPurgedAtMs: now, retainUntilMs: now + 10 * 365 * 24 * 60 * 60 * 1000 });
    purged += 1;
  }
  return { purged };
}

module.exports = {
  CASE_STATUS,
  ITEM_STATUS,
  getPublicCase,
  saveDraft,
  saveFile,
  upsertAccount,
  submitCase,
  decideCase,
  lockCase,
  listQueue,
  adminGet,
  signedFileUrl,
  requireVerifiedPayout,
  publicAccount,
  purgeExpiredEvidence,
};
module.exports.default = module.exports;
