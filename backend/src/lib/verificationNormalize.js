function fold(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function nameTokens(value) {
  const stop = new Set(['de', 'del', 'la', 'las', 'los', 'y', 'da', 'do', 'dos']);
  return fold(value)
    .split(' ')
    .filter((token) => token && !stop.has(token));
}

function namesCompatible(a, b) {
  const left = nameTokens(a);
  const right = nameTokens(b);
  if (!left.length || !right.length) return { ok: false, reason: 'MISSING_NAME' };
  if (fold(a) === fold(b)) return { ok: true, reason: 'EXACT' };
  const setL = new Set(left);
  const setR = new Set(right);
  let overlap = 0;
  for (const token of setL) {
    if (setR.has(token)) overlap += 1;
  }
  const needed = Math.min(2, Math.min(setL.size, setR.size));
  if (overlap >= needed && overlap >= 1) return { ok: true, reason: 'TOKEN_OVERLAP' };
  return { ok: false, reason: 'NAME_MISMATCH' };
}

function documentNumberText(value) {
  return String(value ?? '').trim().slice(0, 32);
}

function accountNumberText(value) {
  return String(value ?? '').trim().slice(0, 40);
}

function maskAccount(value) {
  const raw = accountNumberText(value);
  if (raw.length <= 4) return '••••';
  return `${'•'.repeat(Math.max(4, raw.length - 4))}${raw.slice(-4)}`;
}

function ageFromBirthDate(iso, now = Date.now()) {
  const text = String(iso || '').trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (!match) return null;
  const birth = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  if (Number.isNaN(birth.getTime())) return null;
  const today = new Date(now);
  let age = today.getUTCFullYear() - birth.getUTCFullYear();
  const md = today.getUTCMonth() - birth.getUTCMonth();
  if (md < 0 || (md === 0 && today.getUTCDate() < birth.getUTCDate())) age -= 1;
  return age;
}

function parseExpiry(iso) {
  const text = String(iso || '').trim();
  if (!text) return null;
  const ms = Date.parse(text.length === 10 ? `${text}T00:00:00.000Z` : text);
  return Number.isFinite(ms) ? ms : null;
}

module.exports = {
  fold,
  nameTokens,
  namesCompatible,
  documentNumberText,
  accountNumberText,
  maskAccount,
  ageFromBirthDate,
  parseExpiry,
};
module.exports.default = module.exports;
