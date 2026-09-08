import { useCallback, useEffect, useRef, useState } from 'react';
import { findLiveGift } from './liveboomGifts';
import type { LiveWishItem } from './liveGiftsFirestore';

export type AchievedWish = {
  wishId: string;
  giftId: string;
  name: string;
  quantity: number;
};

const SHOW_MS = 4200;
const EXIT_MS = 280;

function toAchieved(item: LiveWishItem): AchievedWish {
  const gift = findLiveGift(item.giftId);
  return {
    wishId: item.wishId,
    giftId: item.giftId,
    name: gift?.name || item.giftName || item.giftId,
    quantity: Math.max(1, Math.floor(Number(item.targetQuantity) || 1)),
  };
}

export function useLiveWishAchieved(
  username: string,
  completedWishes: LiveWishItem[],
  ready = false,
) {
  const primedRef = useRef(false);
  const toastedRef = useRef(new Set<string>());
  const queueRef = useRef<AchievedWish[]>([]);
  const showingRef = useRef(false);
  const hideTimerRef = useRef<number | null>(null);
  const exitTimerRef = useRef<number | null>(null);
  const [current, setCurrent] = useState<AchievedWish | null>(null);
  const [leaving, setLeaving] = useState(false);

  const clearTimers = useCallback(() => {
    if (hideTimerRef.current != null) {
      window.clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
    if (exitTimerRef.current != null) {
      window.clearTimeout(exitTimerRef.current);
      exitTimerRef.current = null;
    }
  }, []);

  const presentRef = useRef<(item: AchievedWish) => void>(() => undefined);

  presentRef.current = (item: AchievedWish) => {
    showingRef.current = true;
    setLeaving(false);
    setCurrent(item);
    clearTimers();
    hideTimerRef.current = window.setTimeout(() => {
      setLeaving(true);
      exitTimerRef.current = window.setTimeout(() => {
        const next = queueRef.current.shift() || null;
        if (next) {
          presentRef.current(next);
          return;
        }
        showingRef.current = false;
        setCurrent(null);
        setLeaving(false);
      }, EXIT_MS);
    }, SHOW_MS);
  };

  const announce = useCallback((item: LiveWishItem) => {
    if (!item.wishId || toastedRef.current.has(item.wishId)) return;
    toastedRef.current.add(item.wishId);
    const achieved = toAchieved(item);
    if (!showingRef.current) {
      presentRef.current(achieved);
      return;
    }
    if (queueRef.current.some((row) => row.wishId === item.wishId)) return;
    queueRef.current.push(achieved);
  }, []);

  useEffect(() => {
    primedRef.current = false;
    toastedRef.current = new Set();
    queueRef.current = [];
    showingRef.current = false;
    clearTimers();
    setCurrent(null);
    setLeaving(false);
  }, [username, clearTimers]);

  useEffect(() => {
    const completed = completedWishes.filter((row) => row.status === 'COMPLETED' && row.wishId);
    if (!ready) return;
    if (!primedRef.current) {
      primedRef.current = true;
      for (const row of completed) toastedRef.current.add(row.wishId);
      return;
    }
    for (const row of completed) announce(row);
  }, [ready, completedWishes, announce]);

  useEffect(() => () => clearTimers(), [clearTimers]);

  return { achievedWish: current, leaving };
}
