/**
 * Controlador lógico Screen Share (Android gaming).
 * NO toca cámara, Sala Boom ni Batalla.
 */

import { isNativeAndroidApp } from '../../lib/nativeLiveMedia';
import { ssLog } from './ScreenShareDiagnostics';
import {
  assertCanEnterSalaOrBattle,
  assertCanEnterScreenShare,
  setLivePresentationMode,
} from './ScreenShareState';

export function logScreenStart(detail?: Record<string, unknown>): void {
  console.log('[SCREEN] start', detail || {});
  setLivePresentationMode('screen_share', 'screen_start');
  ssLog('SS-SESSION', { event: 'start', ...(detail || {}) });
}

export function logScreenStop(detail?: Record<string, unknown>): void {
  console.log('[SCREEN] stop', detail || {});
  setLivePresentationMode('normal', 'screen_stop');
  ssLog('SS-STOP', { event: 'stop', ...(detail || {}) });
}

export function logSalaStart(): void {
  console.log('[SALA] start');
  setLivePresentationMode('sala', 'sala_start');
}

export function logBattleStart(): void {
  console.log('[BATTLE] start');
  setLivePresentationMode('battle', 'battle_start');
}

export function logModeNormal(reason: string): void {
  setLivePresentationMode('normal', reason);
}

/** Android Screen Share: nunca PiP de cámara / nunca cameraTrackRef. */
export function isAndroidScreenSharePath(screenSharing: boolean): boolean {
  return Boolean(screenSharing && isNativeAndroidApp());
}

export function guardEnterScreenShare(salaActive: boolean, battleActive: boolean) {
  return assertCanEnterScreenShare({ salaActive, battleActive });
}

export function guardEnterSalaOrBattle(screenSharing: boolean) {
  return assertCanEnterSalaOrBattle({ screenSharing });
}
