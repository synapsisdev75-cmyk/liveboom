import { useEffect, useState } from 'react';
import { Radio, SquarePen } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { MyPromotionsModal } from '../components/ads/MyPromotionsModal';
import { PromoteAdsModal } from '../components/ads/PromoteAdsModal';
import { PublicidadSidebarCard } from '../components/ads/PublicidadSidebarCard';
import { CreatePostModal } from '../components/social/CreatePostModal';
import { listenActivePromotions, listenMyPromotions, type PromotionAd } from '../lib/promotionsFirestore';
import { fetchPrivateLocation } from '../lib/userLocation';
import { useAuthStore } from '../store/authStore';
import { useT } from '../i18n';

export function CreateView() {
  const t = useT();
  const profile = useAuthStore((state) => state.profile);
  const navigate = useNavigate();
  const [createOpen, setCreateOpen] = useState(false);
  const [ads, setAds] = useState<PromotionAd[]>([]);
  const [myAds, setMyAds] = useState<PromotionAd[]>([]);
  const [regionId, setRegionId] = useState('nacional');
  const [promoteOpen, setPromoteOpen] = useState(false);
  const [myPromotionsOpen, setMyPromotionsOpen] = useState(false);

  useEffect(() => {
    if (!profile?.firebaseUid) return;
    void fetchPrivateLocation(profile.firebaseUid)
      .then((geo) => {
        if (geo?.regionId) setRegionId(geo.regionId);
      })
      .catch(() => undefined);
  }, [profile?.firebaseUid]);

  useEffect(() => listenActivePromotions(regionId, setAds), [regionId]);
  useEffect(() => listenMyPromotions(profile?.firebaseUid, setMyAds), [profile?.firebaseUid]);

  if (!profile) {
    return (
      <div className="lb-create-page grid min-h-full place-items-center rounded-2xl p-6">
        <p className="lb-create-page__muted text-center text-sm">
          <Link to="/login" className="lb-create-page__link underline">
            {t('common.signIn')}
          </Link>{' '}
          {t('create.signInToCreate')}
        </p>
      </div>
    );
  }

  return (
    <div className="lb-page lb-create-page mx-auto flex min-h-full w-full max-w-lg flex-col gap-5 overflow-x-hidden rounded-2xl p-4 sm:p-6">
      <div className="min-w-0">
        <h1 className="lb-create-page__title text-xl font-bold sm:text-2xl">{t('create.title')}</h1>
        <p className="lb-create-page__muted mt-1 text-sm">{t('create.subtitle')}</p>
      </div>

      <button
        type="button"
        onClick={() => navigate('/transmitir')}
        className="lb-create-action lb-create-action--live flex min-h-[4.5rem] items-center gap-3 rounded-2xl p-3.5 text-left transition hover:brightness-110 sm:gap-4 sm:p-4"
      >
        <span className="lb-create-action__icon grid h-12 w-12 shrink-0 place-items-center rounded-xl">
          <Radio size={22} />
        </span>
        <span className="min-w-0">
          <span className="lb-create-action__title block text-base font-bold">Iniciar LIVE</span>
          <span className="lb-create-page__muted mt-0.5 block text-xs">
            Checklist de seguridad, metas y transmisión en tiempo real.
          </span>
        </span>
      </button>

      <button
        type="button"
        onClick={() => setCreateOpen(true)}
        className="lb-create-action lb-create-action--post flex min-h-[4.5rem] items-center gap-3 rounded-2xl p-3.5 text-left sm:gap-4 sm:p-4"
      >
        <span className="lb-create-action__icon grid h-12 w-12 shrink-0 place-items-center rounded-xl">
          <SquarePen size={22} />
        </span>
        <span className="min-w-0">
          <span className="lb-create-action__title block text-base font-bold">Hacer una nueva publicación</span>
          <span className="lb-create-page__muted mt-0.5 block text-xs">
            Crea y comparte una nueva publicación con foto, video o texto.
          </span>
        </span>
      </button>

      <div className="w-full min-w-0 [&_img]:bg-black/35 [&_img]:object-contain [&_video]:bg-black/35 [&_video]:object-contain">
        <PublicidadSidebarCard
          ads={ads}
          myAds={myAds}
          loggedIn
          compact={false}
          className="lb-create-ad"
          onConfigure={() => setPromoteOpen(true)}
          onManageMyPromotions={() => setMyPromotionsOpen(true)}
        />
      </div>

      {createOpen ? (
        <CreatePostModal
          username={profile.handle}
          autoOpen
          hideTrigger
          onClose={() => setCreateOpen(false)}
          onCreated={() => setCreateOpen(false)}
        />
      ) : null}

      {promoteOpen ? (
        <PromoteAdsModal defaultRegionId={regionId} onClose={() => setPromoteOpen(false)} />
      ) : null}
      {myPromotionsOpen ? (
        <MyPromotionsModal ads={myAds} onClose={() => setMyPromotionsOpen(false)} />
      ) : null}
    </div>
  );
}
