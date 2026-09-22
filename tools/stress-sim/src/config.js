'use strict';

const path = require('path');
const fs = require('fs');

function loadDotEnv() {
  const candidates = [
    path.join(__dirname, '..', '.env'),
    path.join(__dirname, '..', '..', '..', '.env'),
  ];
  for (const file of candidates) {
    if (!fs.existsSync(file)) continue;
    const text = fs.readFileSync(file, 'utf8');
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq <= 0) continue;
      const key = trimmed.slice(0, eq).trim();
      let val = trimmed.slice(eq + 1).trim();
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      if (process.env[key] === undefined) process.env[key] = val;
    }
  }
}

loadDotEnv();

function intEnv(name, fallback) {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

function boolEnv(name) {
  const v = String(process.env[name] || '')
    .trim()
    .toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}

function tokensFromEnv() {
  const multi = String(process.env.STRESS_TOKENS || '')
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);
  const single = String(process.env.STRESS_TOKEN || '').trim();
  if (multi.length) return multi;
  if (single) return [single];
  return [];
}

function parseArgs(argv) {
  const out = {
    phase: 'health',
    baseUrl: process.env.STRESS_BASE_URL || 'https://liveboomapp.com',
    vus: intEnv('STRESS_VUS', 20),
    durationSec: intEnv('STRESS_DURATION_SEC', 30),
    rampSec: intEnv('STRESS_RAMP_SEC', 5),
    room: String(process.env.STRESS_ROOM || '').trim(),
    giftId: String(process.env.STRESS_GIFT_ID || '').trim(),
    giftRecipient: String(process.env.STRESS_GIFT_RECIPIENT_UID || '').trim(),
    callTargetUid: String(process.env.STRESS_CALL_TARGET_UID || '').trim(),
    callType: String(process.env.STRESS_CALL_TYPE || 'audio').trim() === 'video' ? 'video' : 'audio',
    allowGifts: boolEnv('STRESS_ALLOW_GIFTS'),
    allowFirestore: boolEnv('STRESS_ALLOW_FIRESTORE'),
    tokens: tokensFromEnv(),
    help: false,
  };

  const positionals = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    if (a === '--help' || a === '-h') out.help = true;
    else if (a === '--phase') out.phase = String(next() || out.phase);
    else if (a === '--base') out.baseUrl = String(next() || out.baseUrl).replace(/\/$/, '');
    else if (a === '--vus') out.vus = Math.max(1, Number(next()) || out.vus);
    else if (a === '--duration') out.durationSec = Math.max(1, Number(next()) || out.durationSec);
    else if (a === '--ramp') out.rampSec = Math.max(0, Number(next()) || out.rampSec);
    else if (a === '--room') out.room = String(next() || '');
    else if (a === '--gift') out.giftId = String(next() || '');
    else if (a === '--call-target') out.callTargetUid = String(next() || '');
    else if (a === '--call-type') out.callType = String(next() || 'audio') === 'video' ? 'video' : 'audio';
    else if (a === '--allow-gifts') out.allowGifts = true;
    else if (a === '--allow-firestore') out.allowFirestore = true;
    else if (!a.startsWith('-')) positionals.push(a);
  }

  if (positionals[0]) out.phase = positionals[0];
  out.baseUrl = out.baseUrl.replace(/\/$/, '');
  return out;
}

module.exports = { parseArgs, tokensFromEnv, boolEnv, intEnv };
