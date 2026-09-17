/**
 * Chat flotante exclusivo de Screen Share (overlay nativo).
 * No reemplaza el chat general del LIVE.
 */

import {
  bindScreenShareChatSend,
  updateScreenShareChatHud,
} from '../../lib/nativeLiveMedia';

export { bindScreenShareChatSend, updateScreenShareChatHud };

/** Evita empujar el HUD si el texto no cambió. */
let lastHudFingerprint = '';

export function pushScreenShareChatLinesIfChanged(
  lines: string[],
  opts?: { force?: boolean },
): void {
  const fingerprint = lines.join('\n');
  if (!opts?.force && fingerprint === lastHudFingerprint) return;
  lastHudFingerprint = fingerprint;
  void updateScreenShareChatHud(lines.length ? lines : ['Chat del LIVE']);
}

export function resetScreenShareChatHudCache(): void {
  lastHudFingerprint = '';
}

/** Al mostrar el overlay (salir al juego), forzar re-push aunque el texto no cambie. */
export function forcePushScreenShareChatLines(lines: string[]): void {
  resetScreenShareChatHudCache();
  pushScreenShareChatLinesIfChanged(lines, { force: true });
}
