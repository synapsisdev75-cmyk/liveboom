const persist = require('./persist');

const profiles = new Map();

function hydrate() {
  const rows = persist.load('profiles', []);
  for (const row of rows) {
    if (row?.firebaseUid) profiles.set(String(row.firebaseUid), row);
  }
}

function flush() {
  persist.debouncedSave('profiles', Array.from(profiles.values()));
}

hydrate();

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
  flush();
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

function listProfiles(query, { limit = 20, excludeUid } = {}) {
  const needle = String(query || '')
    .trim()
    .toLowerCase()
    .replace(/^@/, '');
  const results = [];
  for (const profile of profiles.values()) {
    if (excludeUid && profile.firebaseUid === excludeUid) continue;
    const username = String(profile.username || '').toLowerCase();
    const bio = String(profile.bio || '').toLowerCase();
    const displayName = String(profile.displayName || '').toLowerCase();
    if (!needle || username.includes(needle) || bio.includes(needle) || displayName.includes(needle)) {
      results.push(profile);
    }
    if (results.length >= limit) break;
  }
  return results.sort((a, b) =>
    String(a.username).localeCompare(String(b.username), 'es'),
  );
}

module.exports = { getProfile, saveProfile, findByUsername, listProfiles };
