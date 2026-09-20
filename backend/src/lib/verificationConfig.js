/**
 * Requisitos de verificación para retiros COP a cuenta propia (persona natural).
 *
 * PENDIENTE DE OPERACIÓN / LEGAL:
 * - No hay proveedor documental/facial configurado (VERIFICATION_PROVIDER_*).
 *   La comprobación real es revisión autorizada en Super Admin. No se simula aprobación.
 * - Textos de privacidad y tributarios deben revisarse para la entidad operadora.
 * - No se promete un plazo de revisión (slaHours vacío).
 * - Conservación: retainDaysAfterDecision; la eliminación programada queda por habilitar.
 * - Países y métodos no listados aquí no se habilitan.
 */

const MIN_AGE = 18;
const COUNTRY = 'CO';
const RETAIN_DAYS_VERIFIED = 730;
const RETAIN_DAYS_REJECTED = 90;
const MAX_FILE_BYTES = 8 * 1024 * 1024;
const MAX_FILES_PER_CASE = 12;

const DOCUMENT_TYPES = {
  CC: {
    id: 'CC',
    label: 'Cédula de ciudadanía',
    sides: ['id_front', 'id_back'],
    hasExpiry: false,
  },
  CE: {
    id: 'CE',
    label: 'Cédula de extranjería',
    sides: ['id_front', 'id_back'],
    hasExpiry: true,
  },
  PA: {
    id: 'PA',
    label: 'Pasaporte',
    sides: ['passport'],
    hasExpiry: true,
  },
};

const PAYOUT_METHODS = [
  { id: 'Nequi', label: 'Nequi', accountKind: 'wallet', needsCertificate: false },
  { id: 'Daviplata', label: 'Daviplata', accountKind: 'wallet', needsCertificate: false },
  { id: 'Bancolombia', label: 'Bancolombia', accountKind: 'bank', needsCertificate: true },
  { id: 'Davivienda', label: 'Davivienda', accountKind: 'bank', needsCertificate: true },
  { id: 'Banco de Bogotá', label: 'Banco de Bogotá', accountKind: 'bank', needsCertificate: true },
  { id: 'BBVA', label: 'BBVA', accountKind: 'bank', needsCertificate: true },
];

const ACCOUNT_TYPES = [
  { id: 'ahorros', label: 'Ahorros' },
  { id: 'corriente', label: 'Corriente' },
  { id: 'billetera', label: 'Billetera digital' },
];

/** Extra docs: vacío a propósito. No se exige RUT/domicilio a todos. */
const EXTRA_DOCUMENTS = [];

const CONSENTS = [
  {
    key: 'identity_processing',
    version: 'identity-co-v1',
    title: 'Tratamiento de datos de identidad',
    body:
      'LiveBoom trata tu nombre legal, documento y evidencias solo para verificar quién eres y habilitar retiros a tu cuenta. No se usa para publicar tu perfil.',
  },
  {
    key: 'account_ownership',
    version: 'account-co-v1',
    title: 'Titularidad de la cuenta de cobro',
    body:
      'Declaras que la cuenta es tuya y coincide con tu identidad. LiveBoom no acepta cuentas de terceros en esta ruta.',
  },
  {
    key: 'admin_review',
    version: 'admin-review-v1',
    title: 'Revisión administrativa',
    body:
      'No hay un proveedor biométrico configurado. Un superadministrador autorizado revisará tus evidencias. Subir un archivo no te verifica. Aprobar la identidad no transfiere dinero.',
  },
];

function biometricCredentialsPresent() {
  return Boolean(
    String(process.env.VERIFICATION_PROVIDER_URL || '').trim() &&
      String(process.env.VERIFICATION_PROVIDER_API_KEY || '').trim(),
  );
}

function biometricProviderConfigured() {
  // No hay adaptador a un proveedor real. Credenciales en env no habilitan biometría simulada.
  return false;
}

function publicConfig() {
  return {
    country: COUNTRY,
    minAge: MIN_AGE,
    slaHours: null,
    biometricAvailable: false,
    biometricCredentialsPresent: biometricCredentialsPresent(),
    biometricNote:
      'No hay proveedor documental/facial conectado. La alternativa operativa es la revisión administrativa autorizada de tus documentos. No es reconocimiento facial ni prueba de vida.',
    documentTypes: Object.values(DOCUMENT_TYPES).map((item) => ({
      id: item.id,
      label: item.label,
      sides: item.sides,
      hasExpiry: item.hasExpiry,
    })),
    payoutMethods: PAYOUT_METHODS.map((item) => ({
      id: item.id,
      label: item.label,
      accountKind: item.accountKind,
      needsCertificate: item.needsCertificate,
    })),
    accountTypes: ACCOUNT_TYPES,
    extraDocuments: EXTRA_DOCUMENTS,
    consents: CONSENTS,
    maxFileBytes: MAX_FILE_BYTES,
    allowedMime: ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'],
  };
}

function documentTypeOf(id) {
  return DOCUMENT_TYPES[String(id || '').toUpperCase()] || null;
}

function payoutMethodOf(id) {
  const key = String(id || '').trim();
  return PAYOUT_METHODS.find((item) => item.id === key) || null;
}

module.exports = {
  MIN_AGE,
  COUNTRY,
  RETAIN_DAYS_VERIFIED,
  RETAIN_DAYS_REJECTED,
  MAX_FILE_BYTES,
  MAX_FILES_PER_CASE,
  DOCUMENT_TYPES,
  PAYOUT_METHODS,
  ACCOUNT_TYPES,
  EXTRA_DOCUMENTS,
  CONSENTS,
  biometricCredentialsPresent,
  biometricProviderConfigured,
  publicConfig,
  documentTypeOf,
  payoutMethodOf,
};
module.exports.default = module.exports;
