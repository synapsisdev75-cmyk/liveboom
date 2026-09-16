/**
 * Estado lógico de presentación LIVE.
 * Screen Share / Sala / Batalla son mutuamente excluyentes.
 */

export type LivePresentationMode = 'normal' | 'screen_share' | 'sala' | 'battle';

let mode: LivePresentationMode = 'normal';

export function getLivePresentationMode(): LivePresentationMode {
  return mode;
}

export function setLivePresentationMode(next: LivePresentationMode, reason = ''): void {
  if (mode === next) return;
  const prev = mode;
  mode = next;
  console.log(`[MODE] ${next}`, reason ? { from: prev, reason } : { from: prev });
}

export function assertCanEnterScreenShare(opts: {
  salaActive: boolean;
  battleActive: boolean;
}): { ok: true } | { ok: false; message: string } {
  if (opts.salaActive) {
    return { ok: false, message: 'Finaliza Sala/Batalla antes de presentar tu pantalla.' };
  }
  if (opts.battleActive) {
    return { ok: false, message: 'Finaliza Sala/Batalla antes de presentar tu pantalla.' };
  }
  return { ok: true };
}

export function assertCanEnterSalaOrBattle(opts: {
  screenSharing: boolean;
}): { ok: true } | { ok: false; message: string } {
  if (opts.screenSharing) {
    return {
      ok: false,
      message: 'Deja de compartir pantalla antes de abrir Sala o Batalla.',
    };
  }
  return { ok: true };
}
