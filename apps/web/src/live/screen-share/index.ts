/**
 * Módulo Screen Share aislado (Android gaming + web fallback).
 * No incluye Sala Boom / Batalla / cámara PiP.
 */

export * from './ScreenShareState';
export * from './ScreenShareSession';
export * from './ScreenShareTransport';
export * from './ScreenShareAudio';
export * from './ScreenShareChat';
export * from './ScreenShareDiagnostics';
export * from './ScreenShareController';
export { ScreenShareVideo } from './ScreenShareVideo';
export { ScreenShareContainer } from './ScreenShareContainer';
export { useScreenShareSynchronization } from './useScreenShareSynchronization';
export { useSalaSynchronization } from './useSalaSynchronization';
