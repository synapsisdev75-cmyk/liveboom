const profiles = new Map();

function getProfile(uid) {
  return profiles.get(String(uid)) || null;
}

function saveProfile(uid, data) {
  const key = String(uid);
  const prev = profiles.get(key) || {};
  const next = {
    ...prev,
    ...data,
    firebaseUid: key,
    id: data.id || prev.id || key,
    updatedAt: new Date().toISOString(),
    createdAt: prev.createdAt || data.createdAt || new Date().toISOString(),
  };
  profiles.set(key, next);
  return next;
}

function findByUsername(username) {
  const needle = String(username || '')
    .trim()
    .toLowerCase();
  if (!needle) return null;
  for (const profile of profiles.values()) {
    if (String(profile.username || '').toLowerCase() === needle) {
      return profile;
    }
  }
  return null;
}

module.exports = { getProfile, saveProfile, findByUsername };
