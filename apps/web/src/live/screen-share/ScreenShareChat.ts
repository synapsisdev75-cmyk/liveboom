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

export function pushScreenShareChatLinesIfChanged(lines: string[]): void {
  const fingerprint = lines.join('\n');
  if (fingerprint === lastHudFingerprint) return;
  lastHudFingerprint = fingerprint;
  void updateScreenShareChatHud(lines.length ? lines : ['Chat del LIVE']);
}

export function resetScreenShareChatHudCache(): void {
  lastHudFingerprint = '';
}
