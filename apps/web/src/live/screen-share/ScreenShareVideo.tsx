/**
 * Contenedor de render exclusivo para Screen Share (espectador / host externo).
 * No monta SalaBoomStage, BattleStage ni PiP de cámara.
 */

import { VideoTrack, type TrackReference } from '@livekit/components-react';

export function ScreenShareVideo({
  screenTrack,
}: {
  screenTrack: TrackReference;
}) {
  return (
    <VideoTrack
      trackRef={screenTrack}
      className="absolute inset-0 h-full w-full bg-black [&_video]:h-full [&_video]:w-full [&_video]:object-contain"
    />
  );
}
