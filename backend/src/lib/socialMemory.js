const { findByUsername, getProfile, listProfiles } = require('./profileMemory');
const persist = require('./persist');

const follows = new Map();
const posts = new Map();
const postsByUser = new Map();
const reactions = new Map();
const friends = new Map();
const friendRequests = new Map();

function exportState() {
  return {
    follows: Object.fromEntries([...follows.entries()].map(([k, v]) => [k, [...v]])),
    posts: Object.fromEntries(posts),
    postsByUser: Object.fromEntries(postsByUser),
    reactions: Object.fromEntries(
      [...reactions.entries()].map(([postId, map]) => [postId, Object.fromEntries(map)]),
    ),
    friends: Object.fromEntries([...friends.entries()].map(([k, v]) => [k, [...v]])),
    friendRequests: Object.fromEntries(friendRequests),
  };
}

function importState(data) {
  if (!data || typeof data !== 'object') return;
  follows.clear();
  for (const [k, arr] of Object.entries(data.follows || {})) {
    follows.set(k, new Set(arr));
  }
  posts.clear();
  for (const [k, v] of Object.entries(data.posts || {})) {
    posts.set(k, v);
  }
  postsByUser.clear();
  for (const [k, v] of Object.entries(data.postsByUser || {})) {
    postsByUser.set(k, v);
  }
  reactions.clear();
  for (const [postId, obj] of Object.entries(data.reactions || {})) {
    reactions.set(postId, new Map(Object.entries(obj)));
  }
  friends.clear();
  for (const [k, arr] of Object.entries(data.friends || {})) {
    friends.set(k, new Set(arr));
  }
  friendRequests.clear();
  for (const [k, v] of Object.entries(data.friendRequests || {})) {
    friendRequests.set(k, v);
  }
}

function flush() {
  persist.debouncedSave('social', exportState());
}

importState(persist.load('social', null));

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
    displayName: profile.displayName || profile.username,
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
  flush();
  return { ok: true, target: userSummary(target) };
}

function unfollow(followerUid, targetUsername) {
  const target = resolveByUsername(targetUsername);
  if (!target) return { error: 'Usuario no encontrado' };
  followingSet(followerUid).delete(target.firebaseUid);
  flush();
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
  flush();

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
  flush();
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
  flush();
  return { post: serializePost(post, uid) };
}

function friendsSet(uid) {
  const key = String(uid);
  if (!friends.has(key)) friends.set(key, new Set());
  return friends.get(key);
}

function requestKey(fromUid, toUid) {
  return `${fromUid}:${toUid}`;
}

function areFriends(uidA, uidB) {
  return friendsSet(uidA).has(String(uidB));
}

function friendshipStatus(viewerUid, targetUsername) {
  const target = resolveByUsername(targetUsername);
  if (!target || !viewerUid) return 'none';
  if (target.firebaseUid === viewerUid) return 'self';
  if (areFriends(viewerUid, target.firebaseUid)) return 'friends';
  const sent = friendRequests.get(requestKey(viewerUid, target.firebaseUid));
  if (sent === 'pending') return 'pending_sent';
  const received = friendRequests.get(requestKey(target.firebaseUid, viewerUid));
  if (received === 'pending') return 'pending_received';
  return 'none';
}

function sendFriendRequest(fromUid, targetUsername) {
  const target = resolveByUsername(targetUsername);
  if (!target) return { error: 'Usuario no encontrado' };
  if (target.firebaseUid === fromUid) return { error: 'No puedes enviarte solicitud a ti mismo' };
  if (areFriends(fromUid, target.firebaseUid)) return { error: 'Ya son amigos' };
  const reverse = friendRequests.get(requestKey(target.firebaseUid, fromUid));
  if (reverse === 'pending') {
    return acceptFriendRequest(fromUid, target.username);
  }
  friendRequests.set(requestKey(fromUid, target.firebaseUid), 'pending');
  flush();
  return { ok: true, status: 'pending_sent', target: userSummary(target) };
}

function acceptFriendRequest(uid, fromUsername) {
  const from = resolveByUsername(fromUsername);
  if (!from) return { error: 'Usuario no encontrado' };
  const key = requestKey(from.firebaseUid, uid);
  if (friendRequests.get(key) !== 'pending') {
    return { error: 'No hay solicitud pendiente' };
  }
  friendRequests.delete(key);
  friendsSet(uid).add(from.firebaseUid);
  friendsSet(from.firebaseUid).add(uid);
  flush();
  return { ok: true, status: 'friends', friend: userSummary(from) };
}

function rejectFriendRequest(uid, fromUsername) {
  const from = resolveByUsername(fromUsername);
  if (!from) return { error: 'Usuario no encontrado' };
  friendRequests.delete(requestKey(from.firebaseUid, uid));
  flush();
  return { ok: true };
}

function cancelFriendRequest(fromUid, targetUsername) {
  const target = resolveByUsername(targetUsername);
  if (!target) return { error: 'Usuario no encontrado' };
  friendRequests.delete(requestKey(fromUid, target.firebaseUid));
  flush();
  return { ok: true, status: 'none' };
}

function removeFriend(uid, targetUsername) {
  const target = resolveByUsername(targetUsername);
  if (!target) return { error: 'Usuario no encontrado' };
  friendsSet(uid).delete(target.firebaseUid);
  friendsSet(target.firebaseUid).delete(uid);
  flush();
  return { ok: true };
}

function listFriends(username) {
  const user = resolveByUsername(username);
  if (!user) return [];
  const result = [];
  for (const friendUid of friendsSet(user.firebaseUid)) {
    const profile = getProfile(friendUid);
    if (profile) result.push(userSummary(profile));
  }
  return result;
}

function listIncomingRequests(uid) {
  const result = [];
  const keySuffix = `:${uid}`;
  for (const [key, status] of friendRequests.entries()) {
    if (status !== 'pending' || !key.endsWith(keySuffix)) continue;
    const fromUid = key.slice(0, -keySuffix.length);
    const profile = getProfile(fromUid);
    if (profile) result.push(userSummary(profile));
  }
  return result;
}

function searchUsers(query, viewerUid) {
  return listProfiles(query, { limit: 24, excludeUid: viewerUid }).map((profile) => ({
    ...userSummary(profile),
    friendshipStatus: friendshipStatus(viewerUid, profile.username),
    isFollowing: viewerUid ? isFollowing(viewerUid, profile.username) : false,
  }));
}

function publicProfile(username, viewerUid) {
  const profile = resolveByUsername(username);
  if (!profile) return null;
  const counts = followCounts(profile.username);
  const friendList = listFriends(profile.username);
  return {
    ...userSummary(profile),
    followersCount: counts.followers,
    followingCount: counts.following,
    friendsCount: friendList.length,
    isFollowing: viewerUid ? isFollowing(viewerUid, profile.username) : false,
    isOwnProfile: viewerUid ? profile.firebaseUid === viewerUid : false,
    friendshipStatus: friendshipStatus(viewerUid, profile.username),
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
  sendFriendRequest,
  acceptFriendRequest,
  rejectFriendRequest,
  cancelFriendRequest,
  removeFriend,
  listFriends,
  listIncomingRequests,
  searchUsers,
  friendshipStatus,
};
