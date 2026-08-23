const persist = require('./persist');

const profiles = new Map();

function hydrate() {
  const rows = persist.load('profiles', []);
  for (const row of rows) {
    if (row?.firebaseUid) profiles.set(String(row.firebaseUid), row);
  }
}

function flush() {
  persist.saveNow('profiles', Array.from(profiles.values()));
}

hydrate();

function getProfile(uid) {
  return profiles.get(String(uid)) || null;
}

function saveProfile(uid, data, { persist: shouldPersist = true } = {}) {
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
  if (shouldPersist) flush();
  return next;
}

function profileHaystack(profile) {
  return [
    profile.username,
    profile.displayName,
    profile.bio,
    profile.email,
    profile.category,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function normalizeNeedle(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/^@/, '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function fieldValues(profile) {
  return [
    profile.username,
    profile.displayName,
    profile.bio,
    profile.email?.split('@')[0],
    profile.email,
    profile.category,
  ]
    .filter(Boolean)
    .map((value) => normalizeNeedle(value));
}

function matchesProfile(profile, needle, cat) {
  if (cat && String(profile.category || '').toLowerCase() !== cat) return false;
  if (!needle) return true;
  const tokens = normalizeNeedle(needle).split(/\s+/).filter(Boolean);
  const fields = fieldValues(profile);
  return tokens.every((token) => fields.some((field) => field.includes(token)));
}

async function hydrateFromDatabase() {
  const { prisma, hasDatabase } = require('./prisma');
  if (!hasDatabase || !prisma) return;
  try {
    const users = await prisma.user.findMany({ take: 500, orderBy: { updatedAt: 'desc' } });
    for (const user of users) {
      const existing = getProfile(user.firebaseUid);
      const dbUpdated = user.updatedAt ? new Date(user.updatedAt).getTime() : 0;
      const memUpdated = existing?.updatedAt ? new Date(existing.updatedAt).getTime() : 0;
      if (existing && memUpdated >= dbUpdated) continue;
      saveProfile(
        user.firebaseUid,
        {
          id: user.id,
          firebaseUid: user.firebaseUid,
          email: user.email,
          username: user.username,
          displayName: existing?.displayName || user.username,
          avatarUrl: user.avatarUrl,
          bio: user.bio,
          birthDate: user.birthDate ? user.birthDate.toISOString().slice(0, 10) : null,
          category: existing?.category || null,
        },
        { persist: false },
      );
    }
    flush();
  } catch (error) {
    console.warn('[profileMemory] hydrateFromDatabase:', error.message);
  }
}

void hydrateFromDatabase();

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

function listProfiles(query, { limit = 20, excludeUid, category } = {}) {
  const needle = String(query || '')
    .trim()
    .toLowerCase()
    .replace(/^@/, '');
  const cat = String(category || '')
    .trim()
    .toLowerCase();
  const results = [];
  for (const profile of profiles.values()) {
    if (excludeUid && profile.firebaseUid === excludeUid) continue;
    if (!matchesProfile(profile, needle, cat)) continue;
    results.push(profile);
  }
  return results
    .sort((a, b) => String(a.username).localeCompare(String(b.username), 'es'))
    .slice(0, limit);
}

function deleteProfile(uid) {
  profiles.delete(String(uid));
  flush();
}

module.exports = { getProfile, saveProfile, findByUsername, listProfiles, deleteProfile };
