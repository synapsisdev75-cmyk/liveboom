const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const core = require('./adRewardsCore');

const cfg = core.normalizeConfig({});

function campaign(extra = {}) {
  return {
    name: 'Marca',
    advertiser: 'Marca SAS',
    imageUrl: 'https://cdn.example.com/a.jpg',
    actionType: 'VIEW_SHORT',
    budgetPoints: 1000,
    status: 'ACTIVA',
    ...extra,
  };
}

describe('Gana Puntos: configuración', () => {
  it('usa los valores por defecto del programa', () => {
    assert.equal(cfg.pointsPerBlast, 1500);
    assert.equal(cfg.adIntervalMinutes, 10);
    assert.equal(cfg.dailyRewardLimit, 20);
    assert.equal(cfg.dailyFollowLimit, 5);
    assert.equal(cfg.followHoldHours, 72);
    assert.equal(cfg.actions.VIEW_SHORT.points, 50);
    assert.equal(cfg.actions.VIEW_SHORT.minSeconds, 45);
    assert.equal(cfg.actions.VIEW_LONG.points, 100);
    assert.equal(cfg.actions.FOLLOW.points, 200);
    assert.equal(cfg.actions.PURCHASE.minPoints, 1000);
    assert.equal(cfg.actions.PURCHASE.maxPoints, 5000);
  });

  it('limita las recompensas diarias a máximo 30', () => {
    assert.equal(core.normalizeConfig({ dailyRewardLimit: 99 }).dailyRewardLimit, 30);
    assert.equal(core.normalizeConfig({ dailyRewardLimit: 25 }).dailyRewardLimit, 25);
  });
});

describe('Gana Puntos: conversión', () => {
  it('1.500 puntos = 1 BLAST, sin fracciones', () => {
    assert.deepEqual(core.computeConversion(1500, 1500), { blast: 1, used: 1500, remaining: 0 });
    assert.deepEqual(core.computeConversion(1750, 1500), { blast: 1, used: 1500, remaining: 250 });
    assert.deepEqual(core.computeConversion(1499, 1500), { blast: 0, used: 0, remaining: 1499 });
    assert.deepEqual(core.computeConversion(4600, 1500), { blast: 3, used: 4500, remaining: 100 });
  });
});

describe('Gana Puntos: campañas', () => {
  it('valida el formulario y aplica los puntos por defecto de la acción', () => {
    const out = core.normalizeCampaignInput(campaign(), cfg);
    assert.equal(out.ok, true);
    assert.equal(out.campaign.points, 50);
    assert.equal(out.campaign.minSeconds, 45);
    assert.equal(out.campaign.maxParticipationsPerUser, 1);
  });

  it('exige la cuenta del anunciante para seguir y el enlace para registros', () => {
    assert.equal(core.normalizeCampaignInput(campaign({ actionType: 'FOLLOW' }), cfg).ok, false);
    assert.equal(core.normalizeCampaignInput(campaign({ actionType: 'REGISTER' }), cfg).ok, false);
  });

  it('mantiene la compra entre 1.000 y 5.000 puntos', () => {
    const out = core.normalizeCampaignInput(
      campaign({ actionType: 'PURCHASE', points: 9000, linkUrl: 'https://shop.example.com', budgetPoints: 50000 }),
      cfg,
    );
    assert.equal(out.campaign.points, 5000);
  });

  it('marca la campaña agotada cuando no alcanza el presupuesto o el cupo', () => {
    const base = { status: 'ACTIVA', points: 50, budgetPoints: 100 };
    assert.equal(core.effectiveStatus({ ...base, awardedPoints: 60 }), 'AGOTADA');
    assert.equal(core.effectiveStatus({ ...base, reservedPoints: 51 }), 'AGOTADA');
    assert.equal(core.effectiveStatus({ ...base, maxActions: 2, actionsCount: 2 }), 'AGOTADA');
    assert.equal(core.effectiveStatus(base), 'ACTIVA');
  });

  it('respeta pausa, fechas y publicación automática', () => {
    const now = 1_800_000_000_000;
    const base = { points: 50, budgetPoints: 500 };
    assert.equal(core.effectiveStatus({ ...base, status: 'PAUSADA' }, now), 'PAUSADA');
    assert.equal(core.effectiveStatus({ ...base, status: 'ACTIVA', startAtMs: now + 1 }, now), 'PROGRAMADA');
    assert.equal(core.effectiveStatus({ ...base, status: 'ACTIVA', endAtMs: now - 1 }, now), 'FINALIZADA');
    assert.equal(core.effectiveStatus({ ...base, status: 'PROGRAMADA', startAtMs: now - 1 }, now), 'ACTIVA');
    assert.equal(
      core.effectiveStatus({ ...base, status: 'PROGRAMADA', startAtMs: now - 1, autoPublish: false }, now),
      'PROGRAMADA',
    );
  });

  it('no expone presupuesto ni valores internos al usuario', () => {
    const pub = core.publicCampaign({ id: 'c1', ...campaign(), points: 50, budgetPoints: 9999, awardedPoints: 10 }, cfg);
    assert.equal(pub.budgetPoints, undefined);
    assert.equal(pub.awardedPoints, undefined);
    assert.equal(JSON.stringify(pub).includes('cop'), false);
  });
});

describe('Gana Puntos: temporizador del servidor', () => {
  it('suma solo latidos visibles y descarta huecos largos', () => {
    let s = { startedAtMs: 0, lastBeatMs: 0, visibleMs: 0 };
    for (let t = 5000; t <= 45000; t += 5000) {
      s = core.applyHeartbeat(s, { nowMs: t, visible: true }).session;
    }
    assert.equal(s.visibleMs, 45000);
    s = core.applyHeartbeat(s, { nowMs: 120000, visible: true }).session;
    assert.equal(s.visibleMs, 45000);
    s = core.applyHeartbeat(s, { nowMs: 125000, visible: false }).session;
    assert.equal(s.visibleMs, 45000);
  });

  it('no deja completar antes del tiempo (abandono = 0 puntos)', () => {
    const s = { startedAtMs: 0, visibleMs: 30000 };
    const r = core.evaluateViewSession(s, { nowMs: 31000, minSeconds: 45 });
    assert.equal(r.ok, false);
    assert.ok(r.remainingSeconds > 0);
    assert.equal(core.evaluateViewSession({ startedAtMs: 0, visibleMs: 45000 }, { nowMs: 46000, minSeconds: 45 }).ok, true);
  });

  it('ignora latidos acelerados y los marca como señal', () => {
    let s = { startedAtMs: 0, lastBeatMs: 0, visibleMs: 0 };
    for (let i = 1; i <= 6; i += 1) {
      s = core.applyHeartbeat(s, { nowMs: i * 100, visible: true }).session;
    }
    assert.equal(s.visibleMs, 0);
    assert.ok(s.signals.includes('FAST_BEATS'));
  });

  it('un reloj adelantado del cliente no acelera el conteo', () => {
    const s = { startedAtMs: 0, visibleMs: 90000 };
    assert.equal(core.evaluateViewSession(s, { nowMs: 20000, minSeconds: 45 }).ok, false);
  });
});

describe('Gana Puntos: antifraude', () => {
  it('una señal deja la recompensa en auditoría, no la rechaza', () => {
    assert.equal(core.claimStatusFor(['AUTOMATION']), 'SOSPECHOSO');
    assert.equal(core.claimStatusFor([]), 'VALIDADO');
    assert.equal(core.claimStatusFor([], { holdForFollow: true }), 'PENDIENTE');
  });

  it('detecta reproducción acelerada y automatización', () => {
    assert.deepEqual(core.clientSignals({ webdriver: true, playbackRate: 2 }), ['AUTOMATION', 'ACCELERATED_PLAYBACK']);
    assert.deepEqual(core.clientSignals({ playbackRate: 1 }), []);
  });

  it('acepta comentarios reales y rechaza spam', () => {
    assert.equal(core.validateComment('Me encanta este producto, lo voy a probar').ok, true);
    assert.equal(core.validateComment('').ok, false);
    assert.equal(core.validateComment('🔥🔥🔥🔥🔥 wow').ok, false);
    assert.equal(core.validateComment('jajajajajajajajaja').ok, false);
    assert.equal(core.validateComment('bueno bueno bueno bueno bueno').ok, false);
    assert.equal(core.validateComment('mira esto https://spam.example.com ya').ok, false);
  });

  it('normaliza textos para detectar comentarios idénticos masivos', () => {
    assert.equal(
      core.normalizeCommentText('¡Qué BUENO está! 🔥'),
      core.normalizeCommentText('que bueno esta'),
    );
  });
});

describe('Gana Puntos: segmentación', () => {
  it('filtra por ciudad y edad sin excluir datos desconocidos', () => {
    const now = Date.UTC(2026, 9, 5);
    const c = { city: 'villavicencio', ageMin: 18, ageMax: 30 };
    assert.equal(core.matchesTargeting(c, { geo: { city: 'Villavicencio' }, birthDate: '2000-01-01' }, now), true);
    assert.equal(core.matchesTargeting(c, { geo: { city: 'Bogotá' } }, now), false);
    assert.equal(core.matchesTargeting(c, { birthDate: '1980-01-01' }, now), false);
    assert.equal(core.matchesTargeting(c, {}, now), true);
  });

  it('usa el día de Colombia para los límites diarios', () => {
    assert.equal(core.dayKey(Date.UTC(2026, 9, 6, 3, 0)), '20261005');
    assert.equal(core.dayKey(Date.UTC(2026, 9, 6, 6, 0)), '20261006');
  });
});
