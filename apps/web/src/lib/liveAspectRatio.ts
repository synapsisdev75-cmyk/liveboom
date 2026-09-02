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

export function liveStageOuterClass(ratio: LiveAspectRatio): string {
  if (ratio === '16:9') {
    return 'mx-auto flex h-full w-full max-w-full items-center justify-center';
  }
  return 'mx-auto flex h-full w-full max-w-[min(100%,calc(100dvh*9/16))] items-center justify-center';
}

export function liveStageInnerClass(ratio: LiveAspectRatio): string {
  if (ratio === '16:9') {
    return 'relative aspect-video h-auto w-full max-h-full max-w-full overflow-hidden bg-black lg:rounded-2xl';
  }
  return 'relative aspect-[9/16] h-full max-h-full w-auto max-w-full overflow-hidden bg-black lg:rounded-2xl';
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
