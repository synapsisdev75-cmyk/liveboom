import type { LiveAspectRatio } from '../../../lib/liveAspectRatio';

export type LiveStudioFormat = LiveAspectRatio | 'dual';

export type BroadcastMode = 'camera' | 'screen' | 'gaming';

export type BroadcastState =
  | 'idle'
  | 'preparing'
  | 'connecting'
  | 'live'
  | 'reconnecting'
  | 'error'
  | 'ended';

export type SourceState = 'off' | 'active' | 'sharing' | 'error' | 'muted';

export type ConnectionQuality = 'excellent' | 'stable' | 'unstable' | 'reconnecting' | 'disconnected';

export type CameraSizePreset = 'S' | 'M' | 'L' | 'FULL' | 'hidden';

export type CameraAnchor = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'free';

export type SourceKind = 'camera' | 'screen' | 'mic' | 'game-audio';

export type StudioSource = {
  id: SourceKind;
  label: string;
  state: SourceState;
  visible: boolean;
};

export function parseStudioFormat(value: unknown): LiveStudioFormat {
  if (value === '16:9' || value === '9:16' || value === 'dual') return value;
  return '9:16';
}

export function studioFormatToAspect(format: LiveStudioFormat): LiveAspectRatio {
  return format === '16:9' ? '16:9' : '9:16';
}
