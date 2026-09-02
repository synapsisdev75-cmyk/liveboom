/** Fuente oficial de foto de perfil en LiveBoom: `avatarUrl` (Firestore users). */

export type AvatarSource = {
  avatarUrl?: string | null;
  avatar_url?: string | null;
  photoURL?: string | null;
  photoUrl?: string | null;
  profileImage?: string | null;
  image?: string | null;
  avatar?: string | null;
};

/** Normaliza cualquier forma conocida a una URL usable (o null). */
export function resolveUserAvatar(source: AvatarSource | string | null | undefined): string | null {
  if (typeof source === 'string') {
    const trimmed = source.trim();
    return trimmed || null;
  }
  if (!source || typeof source !== 'object') return null;

  const candidates = [
    source.avatarUrl,
    source.avatar_url,
    source.photoURL,
    source.photoUrl,
    source.profileImage,
    source.image,
    source.avatar,
  ];

  for (const value of candidates) {
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (trimmed) return trimmed;
    }
  }
  return null;
}

/** Merge seguro: un null/vacío entrante no borra un avatar válido previo. */
export function mergeAvatarUrl(
  previous: string | null | undefined,
  incoming: string | null | undefined,
): string | null {
  return resolveUserAvatar(incoming) || resolveUserAvatar(previous) || null;
}

export function avatarInitial(
  username?: string | null,
  displayName?: string | null,
): string {
  const base = (displayName || username || '?').trim();
  return (base.slice(0, 1) || '?').toUpperCase();
}
