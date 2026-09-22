'use strict';

const { request, runLoad } = require('./http');
const { createStats, printReport, passCriteria } = require('./stats');

async function phaseHealth(cfg) {
  const stats = createStats('health');
  await runLoad({
    vus: cfg.vus,
    durationSec: cfg.durationSec,
    rampSec: cfg.rampSec,
    label: 'health GET /api/health',
    fn: async () => {
      const res = await request(cfg.baseUrl, { path: '/api/health' });
      stats.record(res.ms, res.status, res.error);
    },
  });
  const snap = stats.snapshot();
  printReport(snap);
  return passCriteria(snap, { maxP95Ms: 500, maxErrorRate: 0.02 });
}

async function phaseTokens(cfg) {
  if (!cfg.tokens.length) {
    console.error('[stress] tokens: falta STRESS_TOKEN o STRESS_TOKENS');
    return false;
  }
  if (!cfg.room) {
    console.error('[stress] tokens: falta --room o STRESS_ROOM (username del host)');
    return false;
  }
  const room = encodeURIComponent(cfg.room);
  const stats = createStats('stream-token');
  await runLoad({
    vus: cfg.vus,
    durationSec: cfg.durationSec,
    rampSec: cfg.rampSec,
    label: `GET /api/stream/token/${cfg.room}`,
    fn: async (vu) => {
      const token = cfg.tokens[vu % cfg.tokens.length];
      const res = await request(cfg.baseUrl, {
        path: `/api/stream/token/${room}`,
        token,
      });
      stats.record(res.ms, res.status, res.error);
    },
  });
  const snap = stats.snapshot();
  printReport(snap);
  return passCriteria(snap, { maxP95Ms: 800, maxErrorRate: 0.01 });
}

async function phaseProfile(cfg) {
  if (!cfg.tokens.length) {
    console.error('[stress] profile: falta STRESS_TOKEN');
    return false;
  }
  const stats = createStats('profile');
  await runLoad({
    vus: cfg.vus,
    durationSec: cfg.durationSec,
    rampSec: cfg.rampSec,
    label: 'GET /api/users/profile',
    fn: async (vu) => {
      const token = cfg.tokens[vu % cfg.tokens.length];
      const res = await request(cfg.baseUrl, { path: '/api/users/profile', token });
      stats.record(res.ms, res.status, res.error);
    },
  });
  const snap = stats.snapshot();
  printReport(snap);
  return passCriteria(snap, { maxP95Ms: 800, maxErrorRate: 0.02 });
}

async function phaseGifts(cfg) {
  if (!cfg.allowGifts) {
    console.error('[stress] gifts BLOQUEADO. Usa --allow-gifts y STRESS_ALLOW_GIFTS=1 (gasta coins reales).');
    return false;
  }
  if (!cfg.tokens.length || !cfg.room || !cfg.giftId) {
    console.error('[stress] gifts: requiere token + --room + --gift');
    return false;
  }
  console.warn('[stress] WARNING: enviando regalos reales a producción/staging.');
  const stats = createStats('gifts-send');
  await runLoad({
    vus: Math.min(cfg.vus, 10),
    durationSec: Math.min(cfg.durationSec, 20),
    rampSec: cfg.rampSec,
    label: 'POST /api/gifts/send',
    fn: async (vu) => {
      const token = cfg.tokens[vu % cfg.tokens.length];
      const body = {
        giftId: cfg.giftId,
        roomName: cfg.room,
        multiplier: 1,
        clientId: `stress-${Date.now()}-${vu}-${Math.random().toString(36).slice(2, 8)}`,
      };
      if (cfg.giftRecipient) body.recipientUid = cfg.giftRecipient;
      const res = await request(cfg.baseUrl, {
        method: 'POST',
        path: '/api/gifts/send',
        token,
        body,
      });
      stats.record(res.ms, res.status, res.error);
      await new Promise((r) => setTimeout(r, 200));
    },
  });
  const snap = stats.snapshot();
  printReport(snap);
  return passCriteria(snap, { maxP95Ms: 2000, maxErrorRate: 0.05 });
}

/**
 * Simula heartbeats de viewers en Firestore (mismo path que la app).
 * Requiere Admin SDK + STRESS_ALLOW_FIRESTORE=1.
 */
async function phasePresence(cfg) {
  if (!cfg.allowFirestore) {
    console.error('[stress] presence BLOQUEADO. Usa --allow-firestore (escribe en Firestore).');
    return false;
  }
  if (!cfg.room) {
    console.error('[stress] presence: falta --room');
    return false;
  }

  let admin;
  try {
    // Reusa firebase-admin del backend si está instalado.
    // eslint-disable-next-line import/no-dynamic-require, global-require
    admin = require(require('path').join(__dirname, '..', '..', '..', 'backend', 'node_modules', 'firebase-admin'));
  } catch {
    try {
      // eslint-disable-next-line global-require
      admin = require('firebase-admin');
    } catch {
      console.error('[stress] presence: instala firebase-admin en backend o en tools/stress-sim');
      return false;
    }
  }

  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.applicationDefault(),
    });
  }
  const db = admin.firestore();
  const room = String(cfg.room)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_');
  const stats = createStats('viewer-heartbeat');
  const viewerCount = Math.min(cfg.vus, 200);
  console.log(`[stress] writing viewer heartbeats room=${room} viewers=${viewerCount}`);

  const deadline = Date.now() + cfg.durationSec * 1000;
  const workers = [];
  for (let i = 0; i < viewerCount; i++) {
    workers.push(
      (async () => {
        const uid = `stress_vu_${i}_${process.pid}`;
        const ref = db.collection('liveRooms').doc(room).collection('viewers').doc(uid);
        while (Date.now() < deadline) {
          const t0 = performance.now();
          try {
            await ref.set(
              {
                uid,
                displayName: `StressVU${i}`,
                heartbeatAtMs: Date.now(),
                joinedAtMs: Date.now(),
                stressSim: true,
              },
              { merge: true },
            );
            stats.record(performance.now() - t0, 200, null);
          } catch (err) {
            stats.record(performance.now() - t0, 500, String(err.message || err));
          }
          await new Promise((r) => setTimeout(r, 25_000));
        }
        try {
          await ref.delete();
        } catch {
          /* ignore cleanup */
        }
      })(),
    );
  }
  await Promise.all(workers);
  const snap = stats.snapshot();
  printReport(snap);
  return passCriteria(snap, { maxP95Ms: 1500, maxErrorRate: 0.05 });
}

async function phaseMixed(cfg) {
  if (!cfg.tokens.length) {
    console.error('[stress] mixed: falta STRESS_TOKEN');
    return false;
  }
  const healthStats = createStats('mixed-health');
  const tokenStats = createStats('mixed-token');
  const profileStats = createStats('mixed-profile');
  const room = cfg.room ? encodeURIComponent(cfg.room) : null;

  await runLoad({
    vus: cfg.vus,
    durationSec: cfg.durationSec,
    rampSec: cfg.rampSec,
    label: 'mixed health+profile(+token)',
    fn: async (vu) => {
      const token = cfg.tokens[vu % cfg.tokens.length];
      const h = await request(cfg.baseUrl, { path: '/api/health' });
      healthStats.record(h.ms, h.status, h.error);

      const p = await request(cfg.baseUrl, { path: '/api/users/profile', token });
      profileStats.record(p.ms, p.status, p.error);

      if (room) {
        const t = await request(cfg.baseUrl, {
          path: `/api/stream/token/${room}`,
          token,
        });
        tokenStats.record(t.ms, t.status, t.error);
      }
    },
  });

  const snaps = [healthStats.snapshot(), profileStats.snapshot()];
  if (room) snaps.push(tokenStats.snapshot());
  let allPass = true;
  for (const snap of snaps) {
    printReport(snap);
    const ok = passCriteria(snap, {
      maxP95Ms: snap.name.includes('token') ? 800 : 700,
      maxErrorRate: 0.02,
    });
    allPass = allPass && ok;
  }
  return allPass;
}

async function phaseCalls(cfg) {
  if (!cfg.tokens.length) {
    console.error('[stress] calls: falta STRESS_TOKEN');
    return false;
  }
  if (!cfg.callTargetUid) {
    console.error(
      '[stress] calls: falta STRESS_CALL_TARGET_UID o --call-target (UID Firebase de un AMIGO de la cuenta del token)',
    );
    return false;
  }

  // Un mismo caller solo puede tener 1 llamada (busy lock). Con 1 token → 1 VU.
  const vus = Math.min(cfg.vus, cfg.tokens.length, 5);
  if (vus < cfg.vus) {
    console.warn(
      `[stress] calls: VUs bajados a ${vus} (busy lock: 1 llamada activa por identidad/token)`,
    );
  }

  const stats = createStats('calls-start-release');
  await runLoad({
    vus,
    durationSec: cfg.durationSec,
    rampSec: Math.min(cfg.rampSec, 2),
    label: `POST /api/calls/start (${cfg.callType}) + release`,
    fn: async (vu) => {
      const token = cfg.tokens[vu % cfg.tokens.length];
      const t0 = performance.now();
      const start = await request(cfg.baseUrl, {
        method: 'POST',
        path: '/api/calls/start',
        token,
        body: {
          targetUid: cfg.callTargetUid,
          type: cfg.callType,
        },
      });
      const callId = start.json?.callId ? String(start.json.callId) : '';
      if (callId) {
        await request(cfg.baseUrl, {
          method: 'POST',
          path: '/api/calls/release',
          token,
          body: { callId },
        });
      }
      const ms = performance.now() - t0;
      // Contamos el ciclo start(+release). 409 busy cuenta como fail de contención.
      stats.record(ms, start.status, start.error);
      await new Promise((r) => setTimeout(r, 150));
    },
  });
  const snap = stats.snapshot();
  printReport(snap);
  return passCriteria(snap, { maxP95Ms: 1200, maxErrorRate: 0.05 });
}

module.exports = {
  phaseHealth,
  phaseTokens,
  phaseProfile,
  phaseGifts,
  phasePresence,
  phaseMixed,
  phaseCalls,
};
