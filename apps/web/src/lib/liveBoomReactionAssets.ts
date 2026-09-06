export const LIVEBOOM_REACTION_ASSETS = {
  likeOff: '/reactions/like-off.png?v=official',
  likeOn: '/reactions/like-on.png?v=official',
  dislikeOff: '/reactions/dislike-off.png?v=official',
  dislikeOn: '/reactions/dislike-on.png?v=official',
} as const;

export type LiveBoomReaction = 'like' | 'dislike' | null;
export type LiveBoomTargetType = 'post' | 'boomclip' | 'flashboom' | 'comment' | 'message' | 'reply';

let preloaded = false;
export function preloadLiveBoomReactionAssets() {
  if (preloaded || typeof window === 'undefined') return;
  preloaded = true;
  for (const src of Object.values(LIVEBOOM_REACTION_ASSETS)) {
    const img = new Image();
    img.decoding = 'async';
    img.src = src;
  }
}

preloadLiveBoomReactionAssets();
