import type { CSSProperties } from 'react';

/** Same LiveKit sizing for voice and video: content-sized, never viewport fill. */
export const LIVEKIT_VOICE_STYLE: CSSProperties = {
  width: 'fit-content',
  height: 'auto',
  minHeight: 0,
  background: 'transparent',
};
