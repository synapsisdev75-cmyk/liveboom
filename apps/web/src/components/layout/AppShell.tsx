import { useEffect } from 'react';
import { apiPublic, type GiftDto } from '../../lib/api';
import { useUiStore } from '../../store/uiStore';
import { FeedView } from '../feed/FeedView';
import { LiveRoom } from '../live/LiveRoom';
import { WalletView } from '../wallet/WalletView';
import { InteractionPanel } from './InteractionPanel';
import { Sidebar } from './Sidebar';

export function AppShell() {
  const toast = useUiStore((s) => s.toast);
  const nav = useUiStore((s) => s.nav);
  const view = useUiStore((s) => s.view);
  const setGifts = useUiStore((s) => s.setGifts);

  useEffect(() => {
    void apiPublic<{ gifts: GiftDto[] }>('/api/streams/gifts').then((data) => {
      setGifts(data.gifts);
    });
  }, [setGifts]);

  return (
    <div className="flex h-screen overflow-hidden bg-zinc-950 text-zinc-100">
      <Sidebar />
      <main className="min-w-0 flex-[1.6] p-3 sm:p-4">
        {nav === 'wallet' ? <WalletView /> : null}
        {nav === 'home' && view === 'feed' ? <FeedView /> : null}
        {nav === 'home' && view === 'live' ? <LiveRoom /> : null}
        {nav !== 'home' && nav !== 'wallet' ? (
          <section className="grid h-full place-items-center rounded-3xl border border-white/5 bg-boom-panel">
            <p className="text-sm text-zinc-500">Esta sección llega en la siguiente iteración.</p>
          </section>
        ) : null}
      </main>
      <InteractionPanel />
      {toast ? (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full bg-boom-panel px-4 py-2 text-sm text-white shadow-gift ring-1 ring-boom-fuchsia/40">
          {toast}
        </div>
      ) : null}
    </div>
  );
}
