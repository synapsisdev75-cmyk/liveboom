/**
 * Audio de Screen Share (mic FGS + audio de juego).
 * Contenedores independientes; sin cámara.
 */

export {
  getNativeAudioMixerState,
  setNativeGameAudioMuted,
  setNativeMicMuted,
  startNativeMicStream,
  startNativeScreenAudioStream,
  stopNativeMicStream,
  stopNativeScreenAudioStream,
  toggleNativeGameAudioMuted,
  toggleNativeMicMuted,
} from '../../lib/nativeLiveMedia';
