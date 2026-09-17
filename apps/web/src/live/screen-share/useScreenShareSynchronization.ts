/**
 * Sync exclusivo Screen Share.
 * Nunca publica sala_layout / pip_sync / battle.
 */

import { useEffect } from 'react';
import { getLivePresentationMode } from './ScreenShareState';
import { ssLog } from './ScreenShareDiagnostics';

export function useScreenShareSynchronization(opts: {
  screenSharing: boolean;
  sessionId?: string | null;
  transport?: string | null;
}) {
  useEffect(() => {
    if (!opts.screenSharing) return;
    if (getLivePresentationMode() !== 'screen_share') return;
    ssLog('SS-SESSION', {
      event: 'sync',
      sessionId: opts.sessionId || null,
      transport: opts.transport || null,
    });
  }, [opts.screenSharing, opts.sessionId, opts.transport]);
}
