/**
 * Sync exclusivo Sala Boom.
 * No depende de screenSharing / pipVisible / frameLayout.
 */

import { useEffect } from 'react';
import { getLivePresentationMode } from './ScreenShareState';

export function useSalaSynchronization(opts: {
  salaActive: boolean;
  salaPinnedId?: string | null;
  salaLayoutKey?: string | null;
  onTick?: () => void;
}) {
  useEffect(() => {
    if (!opts.salaActive) return;
    if (getLivePresentationMode() === 'screen_share') return;
    opts.onTick?.();
  }, [opts.salaActive, opts.salaPinnedId, opts.salaLayoutKey, opts.onTick]);
}
