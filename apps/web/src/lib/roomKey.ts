/** Clave canónica de sala (alineada con backend `normalize`). */
export function roomKey(name: string): string {
  return (
    String(name || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, '_')
      .slice(0, 64) || 'room'
  );
}
