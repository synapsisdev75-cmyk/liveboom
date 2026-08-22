const express = require('express');
const { asFn } = require('../lib/asFn');
const social = require('../lib/socialMemory');
const verifyMod = require('../lib/verifyFirebaseToken');
const verifyFirebaseIdToken =
  typeof verifyMod === 'function' ? verifyMod : verifyMod.verifyFirebaseIdToken || verifyMod.default;

const router = express.Router();
const requireAuth = asFn(require('../middleware/requireAuth'));

async function optionalAuth(req, _res, next) {
  const header = req.headers.authorization || '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    req.viewerUid = null;
    next();
    return;
  }
  try {
    const decoded = await verifyFirebaseIdToken(match[1]);
    req.viewerUid = decoded.uid;
    req.user = decoded;
    next();
  } catch {
    req.viewerUid = null;
    next();
  }
}

router.get('/profile/:username', optionalAuth, (req, res) => {
  const profile = social.publicProfile(req.params.username, req.viewerUid);
  if (!profile) {
    res.status(404).json({ error: 'Usuario no encontrado' });
    return;
  }
  res.json({ profile });
});

router.get('/followers/:username', (req, res) => {
  const username = social.normalizeUsername(req.params.username);
  if (!social.publicProfile(username)) {
    res.status(404).json({ error: 'Usuario no encontrado' });
    return;
  }
  res.json({ users: social.listFollowersUsernames(username) });
});

router.get('/following/:username', (req, res) => {
  const username = social.normalizeUsername(req.params.username);
  if (!social.publicProfile(username)) {
    res.status(404).json({ error: 'Usuario no encontrado' });
    return;
  }
  res.json({ users: social.listFollowingUsernames(username) });
});

router.post('/follow/:username', requireAuth, (req, res) => {
  const result = social.follow(req.user.uid, req.params.username);
  if (result.error) {
    res.status(result.error === 'Usuario no encontrado' ? 404 : 400).json({ error: result.error });
    return;
  }
  res.status(201).json(result);
});

router.delete('/follow/:username', requireAuth, (req, res) => {
  const result = social.unfollow(req.user.uid, req.params.username);
  if (result.error) {
    res.status(404).json({ error: result.error });
    return;
  }
  res.json(result);
});

router.get('/posts/:username', optionalAuth, (req, res) => {
  const username = social.normalizeUsername(req.params.username);
  if (!social.publicProfile(username)) {
    res.status(404).json({ error: 'Usuario no encontrado' });
    return;
  }
  res.json({ posts: social.listPosts(username, req.viewerUid) });
});

router.post('/posts', requireAuth, (req, res) => {
  const username =
    typeof req.body?.username === 'string'
      ? req.body.username
      : req.user.email?.split('@')[0] || req.user.uid.slice(0, 12);
  const result = social.createPost({
    uid: req.user.uid,
    username,
    type: req.body?.type,
    caption: req.body?.caption,
    mediaUrl: req.body?.mediaUrl,
  });
  if (result.error) {
    res.status(400).json({ error: result.error });
    return;
  }
  res.status(201).json(result);
});

router.delete('/posts/:postId', requireAuth, (req, res) => {
  const result = social.deletePost(req.params.postId, req.user.uid);
  if (result.error) {
    res.status(result.error === 'No autorizado' ? 403 : 404).json({ error: result.error });
    return;
  }
  res.json(result);
});

router.post('/posts/:postId/react', requireAuth, (req, res) => {
  const reaction = req.body?.reaction;
  const result = social.reactToPost(req.params.postId, req.user.uid, reaction);
  if (result.error) {
    res.status(404).json({ error: result.error });
    return;
  }
  res.json(result);
});

module.exports = router;
module.exports.default = router;
