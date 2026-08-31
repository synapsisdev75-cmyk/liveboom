const KEY_PREFIX = 'liveboom.suggestions.ignored.v1';
const MAX_STORED = 200;

export function readIgnoredSuggestionUids(viewerUid?: string | null): string[] {
  if (!viewerUid) return [];
  try {
    const raw = localStorage.getItem(`${KEY_PREFIX}:${viewerUid}`);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.map((id) => String(id).trim()).filter(Boolean);
  } catch {
    return [];
  }
}

export function ignoreSuggestedCreator(viewerUid: string, targetUid: string) {
  const uid = String(targetUid).trim();
  if (!viewerUid || !uid) return;
  const next = new Set(readIgnoredSuggestionUids(viewerUid));
  next.add(uid);
  try {
    localStorage.setItem(
      `${KEY_PREFIX}:${viewerUid}`,
      JSON.stringify([...next].slice(-MAX_STORED)),
    );
  } catch {
    // storage lleno / privado
  }
}
