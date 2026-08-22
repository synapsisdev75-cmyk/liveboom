const invitesByRoom = new Map();

function normalize(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_');
}

function addInvite(roomName, guestHandle) {
  const room = normalize(roomName);
  const guest = normalize(guestHandle);
  if (!room || !guest) return null;
  const set = invitesByRoom.get(room) || new Set();
  set.add(guest);
  invitesByRoom.set(room, set);
  return { room, guest };
}

function hasInvite(roomName, identities) {
  const room = normalize(roomName);
  const set = invitesByRoom.get(room);
  if (!set || !set.size) return false;
  const list = Array.isArray(identities) ? identities : [identities];
  return list.some((item) => set.has(normalize(item)));
}

function clearInvites(roomName) {
  invitesByRoom.delete(normalize(roomName));
}

function listInvites(roomName) {
  const set = invitesByRoom.get(normalize(roomName));
  return set ? Array.from(set) : [];
}

module.exports = { addInvite, hasInvite, clearInvites, listInvites, normalize };
