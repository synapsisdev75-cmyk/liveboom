const dns = require('dns').promises;

const EMAIL_RE = /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i;

const DISPOSABLE_DOMAINS = new Set([
  '10minutemail.com',
  '10minutemail.net',
  '20minutemail.com',
  'mailinator.com',
  'mailinator.net',
  'guerrillamail.com',
  'guerrillamail.net',
  'guerrillamail.org',
  'guerrillamailblock.com',
  'sharklasers.com',
  'grr.la',
  'yopmail.com',
  'yopmail.net',
  'yopmail.fr',
  'tempmail.com',
  'temp-mail.org',
  'temp-mail.io',
  'tempmail.net',
  'tempmailo.com',
  'tempail.com',
  'tempr.email',
  'throwawaymail.com',
  'trashmail.com',
  'trashmail.net',
  'getnada.com',
  'nada.email',
  'dispostable.com',
  'maildrop.cc',
  'mailnesia.com',
  'mintemail.com',
  'mohmal.com',
  'emailondeck.com',
  'fakeinbox.com',
  'fakemail.net',
  'spamgourmet.com',
  'mytemp.email',
  'moakt.com',
  'burnermail.io',
  'discard.email',
  'dropmail.me',
  'emailfake.com',
  'mail.tm',
  'mail.gw',
  'inboxkitten.com',
  'luxusmail.org',
  'mailcatch.com',
  'mailpoof.com',
  'spambox.us',
  'tmail.ws',
  'tmpmail.org',
  'tmpmail.net',
  'example.com',
  'example.org',
  'example.net',
  'test.com',
]);

const TYPO_DOMAINS = {
  'gmial.com': 'gmail.com',
  'gmai.com': 'gmail.com',
  'gamil.com': 'gmail.com',
  'gmaill.com': 'gmail.com',
  'gmail.co': 'gmail.com',
  'gmail.con': 'gmail.com',
  'gmail.cm': 'gmail.com',
  'gmail.om': 'gmail.com',
  'gmail.es': 'gmail.com',
  'gmail.com.co': 'gmail.com',
  'gnail.com': 'gmail.com',
  'hotmial.com': 'hotmail.com',
  'hotmai.com': 'hotmail.com',
  'hotmal.com': 'hotmail.com',
  'hotmail.co': 'hotmail.com',
  'hotmail.con': 'hotmail.com',
  'hotmil.com': 'hotmail.com',
  'outlok.com': 'outlook.com',
  'outlook.co': 'outlook.com',
  'outlook.con': 'outlook.com',
  'yahooo.com': 'yahoo.com',
  'yaho.com': 'yahoo.com',
  'yahoo.co': 'yahoo.com',
  'yahoo.con': 'yahoo.com',
  'icloud.co': 'icloud.com',
  'iclod.com': 'icloud.com',
};

const domainCache = new Map();
const DOMAIN_CACHE_MS = 6 * 60 * 60 * 1000;

function normalizeEmail(raw) {
  return String(raw || '').trim().toLowerCase();
}

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(Object.assign(new Error('timeout'), { code: 'ETIMEOUT' })), ms)),
  ]);
}

/** 'ok' | 'no_mail' | 'unknown' (DNS no respondió: no bloquear por fallas de red). */
async function domainAcceptsMail(domain) {
  const cached = domainCache.get(domain);
  if (cached && Date.now() - cached.at < DOMAIN_CACHE_MS) return cached.value;
  let value;
  try {
    const records = await withTimeout(dns.resolveMx(domain), 4000);
    const usable = records.filter((r) => r && r.exchange && r.exchange !== '.');
    value = usable.length ? 'ok' : 'no_mail';
  } catch (error) {
    const code = error && error.code;
    if (code === 'ENOTFOUND' || code === 'ENODATA') {
      value = 'no_mail';
    } else {
      value = 'unknown';
    }
  }
  if (value !== 'unknown') domainCache.set(domain, { at: Date.now(), value });
  return value;
}

/**
 * Revisa que el correo pueda existir: formato, dominio no desechable / sin error de tipeo
 * y con servidores de correo (MX). La existencia del buzón se confirma con el correo de verificación.
 */
async function checkEmailDeliverable(raw) {
  const email = normalizeEmail(raw);
  if (!email || email.length > 254 || !EMAIL_RE.test(email)) {
    return { ok: false, reason: 'invalid_format' };
  }
  const [local, domain] = email.split('@');
  if (!local || local.length > 64 || local.startsWith('.') || local.endsWith('.') || local.includes('..')) {
    return { ok: false, reason: 'invalid_format' };
  }
  if (TYPO_DOMAINS[domain]) {
    return { ok: false, reason: 'typo', suggestion: `${local}@${TYPO_DOMAINS[domain]}` };
  }
  if (DISPOSABLE_DOMAINS.has(domain) || domain.endsWith('.local') || domain.endsWith('.test')) {
    return { ok: false, reason: 'disposable' };
  }
  const mail = await domainAcceptsMail(domain);
  if (mail === 'no_mail') return { ok: false, reason: 'no_mail_server' };
  return { ok: true, email };
}

module.exports = { checkEmailDeliverable, normalizeEmail, TYPO_DOMAINS, DISPOSABLE_DOMAINS };
