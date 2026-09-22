#!/usr/bin/env node
'use strict';

/**
 * LiveBoom stress simulator (Node 20+, sin k6).
 *
 * Ejemplos:
 *   node tools/stress-sim/src/cli.js health --vus 30 --duration 20
 *   node tools/stress-sim/src/cli.js tokens --room mihost --vus 20 --duration 30
 *   node tools/stress-sim/src/cli.js mixed --room mihost --vus 40 --duration 45
 *   node tools/stress-sim/src/cli.js gifts --room mihost --gift boom_saludo --allow-gifts
 *   node tools/stress-sim/src/cli.js presence --room mihost --allow-firestore --vus 50
 *   node tools/stress-sim/src/cli.js all --room mihost --vus 20 --duration 20
 */

const { parseArgs } = require('./config');
const {
  phaseHealth,
  phaseTokens,
  phaseProfile,
  phaseGifts,
  phasePresence,
  phaseMixed,
  phaseCalls,
} = require('./phases');

function printHelp() {
  console.log(`LiveBoom stress-sim

Uso:
  node tools/stress-sim/src/cli.js <phase> [opciones]

Fases:
  health      GET /api/health (seguro, sin auth)
  tokens      GET /api/stream/token/:room (requiere STRESS_TOKEN + room)
  profile     GET /api/users/profile
  calls       POST /api/calls/start + release (señalización audio/video)
  gifts       POST /api/gifts/send (DESTRUCTIVO: --allow-gifts)
  presence    Heartbeats Firestore viewers (DESTRUCTIVO: --allow-firestore)
  mixed       health + profile + tokens juntos
  all         health → profile → tokens → mixed (sin gifts/presence/calls)

Opciones:
  --base URL          default STRESS_BASE_URL o https://liveboomapp.com
  --vus N             virtual users concurrentes
  --duration SEC      duración de cada fase
  --ramp SEC          ramp-up
  --room NAME         username host LIVE
  --gift ID           giftId para fase gifts
  --call-target UID   Firebase UID amigo (fase calls)
  --call-type audio|video
  --allow-gifts
  --allow-firestore

Auth: define STRESS_TOKEN (o STRESS_TOKENS) en tools/stress-sim/.env
Copia .env.example → .env
`);
}

async function main() {
  const cfg = parseArgs(process.argv.slice(2));
  if (cfg.help) {
    printHelp();
    process.exit(0);
  }

  console.log('[stress] LiveBoom stress-sim');
  console.log(`[stress] base=${cfg.baseUrl} phase=${cfg.phase} vus=${cfg.vus} duration=${cfg.durationSec}s`);
  console.log(`[stress] tokens=${cfg.tokens.length} room=${cfg.room || '(none)'}`);

  const results = [];

  async function run(name, fn) {
    console.log(`\n-------- phase: ${name} --------`);
    const ok = await fn(cfg);
    results.push({ name, ok: Boolean(ok) });
    return ok;
  }

  switch (cfg.phase) {
    case 'health':
      await run('health', phaseHealth);
      break;
    case 'tokens':
      await run('tokens', phaseTokens);
      break;
    case 'profile':
      await run('profile', phaseProfile);
      break;
    case 'gifts':
      await run('gifts', phaseGifts);
      break;
    case 'presence':
      await run('presence', phasePresence);
      break;
    case 'calls':
      await run('calls', phaseCalls);
      break;
    case 'mixed':
      await run('mixed', phaseMixed);
      break;
    case 'all':
      await run('health', phaseHealth);
      if (cfg.tokens.length) {
        await run('profile', phaseProfile);
        if (cfg.room) await run('tokens', phaseTokens);
        await run('mixed', phaseMixed);
      } else {
        console.warn('[stress] all: sin token → solo health. Añade STRESS_TOKEN para el resto.');
      }
      break;
    default:
      console.error(`[stress] fase desconocida: ${cfg.phase}`);
      printHelp();
      process.exit(2);
  }

  console.log('\n======== SUMMARY ========');
  for (const r of results) {
    console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}`);
  }
  const failed = results.some((r) => !r.ok);
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error('[stress] fatal', err);
  process.exit(1);
});
