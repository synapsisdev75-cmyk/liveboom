const PENDING_BIRTH_PREFIX = 'liveboom_pending_birth_';

export function storePendingBirthYear(uid: string, year: number) {
  localStorage.setItem(`${PENDING_BIRTH_PREFIX}${uid}`, String(year));
}

export function readPendingBirthDate(uid: string): string | null {
  const raw = localStorage.getItem(`${PENDING_BIRTH_PREFIX}${uid}`);
  if (!raw) return null;
  const year = Number(raw);
  if (!Number.isFinite(year) || year < 1900) return null;
  return `${year}-01-01`;
}

export function clearPendingBirth(uid: string) {
  localStorage.removeItem(`${PENDING_BIRTH_PREFIX}${uid}`);
}

export function ageFromIsoDate(isoDate: string) {
  const birth = new Date(`${isoDate}T00:00:00`);
  if (Number.isNaN(birth.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const monthDelta = today.getMonth() - birth.getMonth();
  if (monthDelta < 0 || (monthDelta === 0 && today.getDate() < birth.getDate())) {
    age -= 1;
  }
  return age;
}

export function adultCutoffDate() {
  const date = new Date();
  date.setFullYear(date.getFullYear() - 18);
  return date.toISOString().slice(0, 10);
}

export function ageFromBirthYear(year: number) {
  const today = new Date();
  return today.getFullYear() - year;
}
