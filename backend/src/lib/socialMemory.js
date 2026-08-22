const { findByUsername, getProfile } = require('./profileMemory');

const follows = new Map();
const posts = new Map();
const postsByUser = new Map();
const reactions = new Map();

const MAX_POSTS_PER_USER = 60;
const MAX_PHOTO_BYTES = 4 * 1024 * 1024;
const MAX_VIDEO_BYTES = 8 * 1024 * 1024;
const MAX_TEXT_LENGTH = 2000;

function normalizeUsername(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/^@/, '')
    .replace(/[^a-z0-9_]/g, '_');
}

function userSummary(profile) {
  if (!profile) return null;
  return {
    username: profile.username,
    displayName: profile.username,
    avatarUrl: profile.avatarUrl || null,
    bio: profile.bio || null,
  };
}

function resolveByUsername(username) {
  return findByUsername(normalizeUsername(username));
}

function followingSet(followerUid) {
  const key = String(followerUid);
  if (!follows.has(key)) follows.set(key, new Set());
  return follows.get(key);
}

function follow(followerUid, targetUsername) {
  const target = resolveByUsername(targetUsername);
  if (!target) return { error: 'Usuario no encontrado' };
  if (target.firebaseUid === followerUid) return { error: 'No puedes seguirte a ti mismo' };
  followingSet(followerUid).add(target.firebaseUid);
  return { ok: true, target: userSummary(target) };
}

function unfollow(followerUid, targetUsername) {
  const target = resolveByUsername(targetUsername);
  if (!target) return { error: 'Usuario no encontrado' };
  followingSet(followerUid).delete(target.firebaseUid);
  return { ok: true };
}

function isFollowing(followerUid, targetUsername) {
  const target = resolveByUsername(targetUsername);
  if (!target || !followerUid) return false;
  return followingSet(followerUid).has(target.firebaseUid);
}

function listFollowingUsernames(username) {
  const user = resolveByUsername(username);
  if (!user) return [];
  const result = [];
  for (const targetUid of followingSet(user.firebaseUid)) {
    const profile = getProfile(targetUid);
    if (profile) result.push(userSummary(profile));
  }
  return result;
}

function listFollowersUsernames(username) {
  const user = resolveByUsername(username);
  if (!user) return [];
  const result = [];
  for (const [followerUid, set] of follows.entries()) {
    if (!set.has(user.firebaseUid)) continue;
    const profile = getProfile(followerUid);
    if (profile) result.push(userSummary(profile));
  }
  return result;
}

function followCounts(username) {
  const user = resolveByUsername(username);
  if (!user) return { followers: 0, following: 0 };
  let followers = 0;
  for (const set of follows.values()) {
    if (set.has(user.firebaseUid)) followers += 1;
  }
  return {
    followers,
    following: followingSet(user.firebaseUid).size,
  };
}

function postStats(postId) {
  const map = reactions.get(postId) || new Map();
  let likes = 0;
  let dislikes = 0;
  for (const value of map.values()) {
    if (value === 'like') likes += 1;
    if (value === 'dislike') dislikes += 1;
  }
  return { likes, dislikes };
}

function serializePost(post, viewerUid) {
  const stats = postStats(post.id);
  const viewerReaction = viewerUid
    ? reactions.get(post.id)?.get(String(viewerUid)) || null
    : null;
  return {
    ...post,
    likes: stats.likes,
    dislikes: stats.dislikes,
    viewerReaction,
  };
}

function createPost({ uid, username, type, caption, mediaUrl }) {
  const author = normalizeUsername(username);
  const text = String(caption || '').trim().slice(0, MAX_TEXT_LENGTH);
  const kind = String(type || 'text').toLowerCase();

  if (!['photo', 'video', 'text'].includes(kind)) {
    return { error: 'Tipo inválido. Usa photo, video o text.' };
  }
  if (kind === 'text' && !text) {
    return { error: 'Escribe algo para publicar.' };
  }
  if ((kind === 'photo' || kind === 'video') && !mediaUrl) {
    return { error: 'Falta la foto o el video.' };
  }
  if (kind === 'photo' && Buffer.byteLength(String(mediaUrl), 'utf8') > MAX_PHOTO_BYTES) {
    return { error: 'La foto es demasiado grande (máx. 4 MB).' };
  }
  if (kind === 'video' && Buffer.byteLength(String(mediaUrl), 'utf8') > MAX_VIDEO_BYTES) {
    return { error: 'El video es demasiado grande (máx. 8 MB).' };
  }

  const post = {
    id: `post_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    authorUid: String(uid),
    authorUsername: author,
    type: kind,
    caption: text || null,
    mediaUrl: kind === 'text' ? null : String(mediaUrl),
    createdAt: new Date().toISOString(),
  };

  posts.set(post.id, post);
  const list = postsByUser.get(author) || [];
  list.unshift(post.id);
  postsByUser.set(author, list.slice(0, MAX_POSTS_PER_USER));

  return { post: serializePost(post, uid) };
}

function listPosts(username, viewerUid) {
  const author = normalizeUsername(username);
  const ids = postsByUser.get(author) || [];
  return ids
    .map((id) => posts.get(id))
    .filter(Boolean)
    .map((post) => serializePost(post, viewerUid));
}

function deletePost(postId, uid) {
  const post = posts.get(postId);
  if (!post) return { error: 'Publicación no encontrada' };
  if (post.authorUid !== String(uid)) return { error: 'No autorizado' };
  posts.delete(postId);
  reactions.delete(postId);
  const author = post.authorUsername;
  postsByUser.set(
    author,
    (postsByUser.get(author) || []).filter((id) => id !== postId),
  );
  return { ok: true };
}

function reactToPost(postId, uid, reaction) {
  const post = posts.get(postId);
  if (!post) return { error: 'Publicación no encontrada' };
  const key = String(uid);
  if (!reactions.has(postId)) reactions.set(postId, new Map());
  const map = reactions.get(postId);
  if (!reaction || reaction === 'none') {
    map.delete(key);
  } else if (reaction === 'like' || reaction === 'dislike') {
    map.set(key, reaction);
  } else {
    return { error: 'Reacción inválida' };
  }
  return { post: serializePost(post, uid) };
}

function publicProfile(username, viewerUid) {
  const profile = resolveByUsername(username);
  if (!profile) return null;
  const counts = followCounts(profile.username);
  return {
    ...userSummary(profile),
    followersCount: counts.followers,
    followingCount: counts.following,
    isFollowing: viewerUid ? isFollowing(viewerUid, profile.username) : false,
    isOwnProfile: viewerUid ? profile.firebaseUid === viewerUid : false,
  };
}

module.exports = {
  follow,
  unfollow,
  isFollowing,
  listFollowingUsernames,
  listFollowersUsernames,
  followCounts,
  createPost,
  listPosts,
  deletePost,
  reactToPost,
  publicProfile,
  normalizeUsername,
};
