const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { prisma } = require('../lib/prisma');
const { livekitEnabled, createLivekitToken } = require('../lib/livekit');

function usernameFromToken(decoded) {
  const raw = decoded.name || (decoded.email ? decoded.email.split('@')[0] : decoded.uid);
  const base =
    String(raw)
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '')
      .slice(0, 20) || 'user';
  return `${base}_${decoded.uid.slice(0, 8)}`;
}

router.get('/token/:roomName', requireAuth, async (req, res) => {
  if (!livekitEnabled()) {
    res.status(503).json({ error: 'LiveKit no está configurado' });
    return;
  }

  const roomName = String(req.params.roomName || '')
    .trim()
    .slice(0, 64);
  if (!roomName) {
    res.status(400).json({ error: 'roomName es obligatorio' });
    return;
  }

  try {
    let isCreator = false;
    let displayName = req.user.name || req.user.email || req.user.uid.slice(0, 8);
    try {
      const dbUser = await prisma.user.findUnique({
        where: { firebaseUid: req.user.uid },
      });
      const roomOwner = await prisma.user.findFirst({
        where: { username: roomName },
      });
      isCreator = Boolean(
        (dbUser && (dbUser.username === roomName || (roomOwner && roomOwner.id === dbUser.id))) ||
          usernameFromToken(req.user) === roomName ||
          req.user.uid === roomName,
      );
      displayName = req.user.name || dbUser?.username || displayName;
    } catch {
      isCreator = usernameFromToken(req.user) === roomName || roomName === req.user.uid;
    }

    const token = await createLivekitToken({
      identity: req.user.uid,
      name: displayName,
      room: roomName,
      canPublish: isCreator,
    });

    res.json({
      token,
      serverUrl: process.env.LIVEKIT_URL,
      roomName,
      canPublish: isCreator,
    });
  } catch (error) {
    console.error('[stream/token]', error);
    res.status(500).json({ error: 'No se pudo generar el token de LiveKit' });
  }
});

module.exports = router;
