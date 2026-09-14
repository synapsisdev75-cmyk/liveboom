#!/usr/bin/env node
/** Reports LiveKit env presence without printing secrets. */
const fs = require('fs');

function load(file) {
  if (!fs.existsSync(file)) return null;
  const out = {};
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
    const i = trimmed.indexOf('=');
    const key = trimmed.slice(0, i).trim();
    let val = trimmed.slice(i + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

function report(file) {
  const env = load(file);
  console.log(`--- ${file}`);
  if (!env) {
    console.log('MISSING_FILE');
    return;
  }
  for (const key of [
    'LIVEKIT_URL',
    'LIVEKIT_API_KEY',
    'LIVEKIT_API_SECRET',
    'PORT',
    'CLIENT_ORIGIN',
  ]) {
    const val = env[key] || '';
    if (!val) console.log(`${key}: MISSING`);
    else if (/SECRET|KEY/.test(key)) console.log(`${key}: OK len=${val.length}`);
    else console.log(`${key}: ${val}`);
  }
}

report('backend/.env');
report('packages/backend/.env');
report('backend/.env.liveboom-app');
