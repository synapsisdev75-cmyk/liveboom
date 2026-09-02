import { useEffect, useState } from 'react';
import { useAuthStore } from '../../store/authStore';
import type { PromotionAd } from '../../lib/promotionsFirestore';
import { PromotionBanner } from './PromotionBanner';
import { PromotionExpandedViewer } from './PromotionExpandedViewer';

const ROTATE_MS = 5000;

type Props = {
  ads: PromotionAd[];
  compact?: boolean;
  onManageMine?: () => void;
};

export function PromotionBannerCarousel({ ads, compact = true, onManageMine }: Props) {
  const profile = useAuthStore((s) => s.profile);
  const [index, setIndex] = useState(0);
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);

  const adKey = ads.map((a) => a.id).join(',');

  useEffect(() => {
    setIndex(0);
  }, [adKey]);

  useEffect(() => {
    if (ads.length <= 1 || expandedIndex !== null) return;
    const timer = window.setInterval(() => {
      setIndex((current) => (current + 1) % ads.length);
    }, ROTATE_MS);
    return () => window.clearInterval(timer);
  }, [ads.length, expandedIndex]);

  if (ads.length === 0) return null;

  const expandedAd = expandedIndex !== null ? ads[expandedIndex] : null;
  const isOwner = Boolean(
    expandedAd && profile?.firebaseUid && expandedAd.ownerUid === profile.firebaseUid,
  );

  const carousel = (
    <>
      {ads.length === 1 ? (
        <PromotionBanner ad={ads[0]!} compact={compact} onOpen={() => setExpandedIndex(0)} />
      ) : (
        <div className="relative">
          <div className="overflow-hidden rounded-xl">
            <div
              className="flex transition-transform duration-700 ease-in-out motion-reduce:transition-none"
              style={{ transform: `translate3d(-${index * 100}%, 0, 0)` }}
            >
              {ads.map((ad, i) => (
                <div key={ad.id} className="w-full shrink-0">
                  <PromotionBanner ad={ad} compact={compact} onOpen={() => setExpandedIndex(i)} />
                </div>
              ))}
            </div>
          </div>
          <div className="mt-2 flex justify-center gap-1.5">
            {ads.map((ad, i) => (
              <button
                key={ad.id}
                type="button"
                onClick={() => setIndex(i)}
                className={`h-1.5 rounded-full transition-all ${
                  i === index ? 'w-4 bg-cyan-300' : 'w-1.5 bg-zinc-600 hover:bg-zinc-400'
                }`}
                aria-label={`Ver publicidad ${i + 1}`}
              />
            ))}
          </div>
        </div>
      )}
    </>
  );

  return (
    <>
      {carousel}
      {expandedIndex !== null ? (
        <PromotionExpandedViewer
          ads={ads}
          index={expandedIndex}
          onIndexChange={setExpandedIndex}
          onClose={() => setExpandedIndex(null)}
          onManageMine={
            onManageMine
              ? () => {
                  setExpandedIndex(null);
                  onManageMine();
                }
              : undefined
          }
          isOwner={isOwner}
        />
      ) : null}
    </>
  );
}
