/**
 * Contenedor visual exclusivo de Screen Share (Mobile Gaming).
 * No importa cámara, Sala ni Battle.
 */

import type { TrackReference } from '@livekit/components-react';
import type { ReactNode } from 'react';
import { ScreenShareVideo } from './ScreenShareVideo';

type Props = {
  screenTrack: TrackReference;
  className?: string;
  children?: ReactNode;
};

/**
 * Capa de presentación: solo Track.Source.ScreenShare.
 * Overlays nativos (chat + LB) viven en LiveMediaPlugin, no aquí.
 */
export function ScreenShareContainer({ screenTrack, className, children }: Props) {
  return (
    <div className={className || 'lb-ss-container absolute inset-0'} data-lb-mode="screen_share">
      <ScreenShareVideo screenTrack={screenTrack} />
      {children}
    </div>
  );
}
