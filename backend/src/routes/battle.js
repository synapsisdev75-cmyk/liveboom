const express = require('express');
const { asFn } = require('../lib/asFn');
const agora = require('../lib/agora');
const { getAdminDb } = require('../lib/firestoreAdmin');

const router = express.Router();
const requireAuth = asFn(require('../middleware/requireAuth'));

function asHostOfBattle(decoded, battle) {
  const uid = String(decoded?.uid || '');
  if (!uid || !battle) return false;
  return battle.hostAUid === uid || battle.hostBUid === uid;
}

async function readBattle(battleId) {
  const id = String(battleId || '').trim();
  if (!id) return null;
  try {
    const snap = await getAdminDb().collection('liveBattles').doc(id).get();
    if (!snap.exists) return null;
    return { id: snap.id, ...snap.data() };
  } catch (error) {
    console.warn('[battle] read', error.message);
    return null;
  }
}

router.get('/config', requireAuth, (_req, res) => {
  res.json({
    enabled: agora.agoraEnabled(),
    appId: agora.agoraEnabled() ? agora.agoraAppId() : '',
  });
});

/** Token RTC: hosts publican; espectadores solo escuchan/ven. */
router.post('/token', requireAuth, async (req, res) => {
  if (!agora.agoraEnabled()) {
    res.status(503).json({ error: 'Batalla Boom no está configurada (Agora)' });
    return;
  }
  const battleId = typeof req.body?.battleId === 'string' ? req.body.battleId.trim() : '';
  const channel = typeof req.body?.channel === 'string' ? req.body.channel.trim() : '';
  const asHost = Boolean(req.body?.asHost);
  const uid = agora.agoraUid(req.user.uid);

  const battle = battleId ? await readBattle(battleId) : null;
  const room = channel || battle?.channel || '';
  if (!agora.isBattleChannel(room)) {
    res.status(400).json({ error: 'Canal de batalla inválido' });
    return;
  }

  let publisher = false;
  if (asHost) {
    if (battle && !asHostOfBattle(req.user, battle)) {
      res.status(403).json({ error: 'Solo los dos hosts pueden publicar en la batalla' });
      return;
    }
    publisher = true;
  }

  try {
    const minted = agora.buildRtcToken({ channel: room, uid, publisher });
    res.json({
      ...minted,
      battleId: battle?.id || battleId || null,
    });
  } catch (error) {
    console.error('[battle/token]', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'No se pudo crear el token de batalla',
    });
  }
});

module.exports = router;
