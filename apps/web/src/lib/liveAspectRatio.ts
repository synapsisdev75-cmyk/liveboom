import type { LiveViewportOrientation, LiveViewportSurface } from '../hooks/useLiveViewport';

export type LiveAspectRatio = '16:9' | '9:16';

export const DEFAULT_LIVE_ASPECT_RATIO: LiveAspectRatio = '9:16';

export function parseLiveAspectRatio(value: unknown): LiveAspectRatio {
  return value === '16:9' ? '16:9' : '9:16';
}

export function liveCanvasDimensions(ratio: LiveAspectRatio) {
  return ratio === '16:9'
    ? { width: 1280, height: 720 }
    : { width: 720, height: 1280 };
}

export function liveStageSectionClass(opts?: { hostDashboard?: boolean }): string {
  if (opts?.hostDashboard) {
    return 'lb-live-stage-section relative flex min-h-0 w-full flex-1 items-center justify-center overflow-hidden bg-black lg:min-w-0 lg:rounded-2xl lg:border lg:border-white/10 lg:shadow-[0_0_40px_rgba(139,92,246,0.12)]';
  }
  return 'lb-live-stage-section relative flex min-h-0 w-full flex-1 items-center justify-center overflow-hidden bg-black lg:w-[70%] lg:rounded-2xl lg:border lg:border-white/10 lg:shadow-[0_0_48px_rgba(0,240,255,0.12)]';
}

export function liveStageOuterClass(
  ratio: LiveAspectRatio,
  viewport?: { orientation: LiveViewportOrientation; surface: LiveViewportSurface },
): string {
  const ratioToken = ratio === '16:9' ? 'lb-live-stage--16x9' : 'lb-live-stage--9x16';
  const surfaceToken =
    viewport?.surface === 'tablet'
      ? 'lb-live-surface-tablet'
      : viewport?.surface === 'phone'
        ? 'lb-live-surface-phone'
        : 'lb-live-surface-desktop';
  const orientationToken =
    viewport?.orientation === 'landscape'
      ? 'lb-live-orient-landscape'
      : 'lb-live-orient-portrait';

  if (ratio === '16:9') {
    return `lb-live-stage-outer ${ratioToken} ${surfaceToken} ${orientationToken} mx-auto flex h-full w-full max-w-full items-center justify-center`;
  }
  return `lb-live-stage-outer ${ratioToken} ${surfaceToken} ${orientationToken} mx-auto flex h-full w-full max-w-[min(100%,calc(100dvh*9/16))] items-center justify-center lg:max-w-full`;
}

export function liveStageInnerClass(ratio: LiveAspectRatio): string {
  const ratioToken = ratio === '16:9' ? 'lb-live-stage--16x9' : 'lb-live-stage--9x16';
  return `lb-live-stage-inner ${ratioToken} relative overflow-hidden bg-black lg:rounded-2xl`;
}

export function liveHostControlsBottomClass(viewport: {
  orientation: LiveViewportOrientation;
  surface: LiveViewportSurface;
}): string {
  const desktop = 'lg:bottom-8';
  if (viewport.surface === 'desktop') return desktop;
  if (viewport.orientation === 'landscape') {
    return `bottom-[max(0.75rem,env(safe-area-inset-bottom))] ${desktop}`;
  }
  return `bottom-[min(48dvh,calc(100dvh-11rem))] ${desktop}`;
}

export function livePreviewFrameClass(ratio: LiveAspectRatio): string {
  if (ratio === '16:9') {
    return 'relative mx-auto aspect-video w-full max-w-full overflow-hidden rounded-2xl bg-zinc-950 ring-1 ring-white/10';
  }
  return 'relative mx-auto aspect-[9/16] w-full max-w-[min(100%,14rem)] overflow-hidden rounded-2xl bg-zinc-950 ring-1 ring-white/10 sm:max-w-[min(100%,18rem)]';
}

export function liveAspectRatioLabel(ratio: LiveAspectRatio): string {
  return ratio === '16:9' ? '16:9 Horizontal' : '9:16 Vertical';
}
