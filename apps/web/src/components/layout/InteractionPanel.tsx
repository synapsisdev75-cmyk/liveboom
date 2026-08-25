import { Gift, Send, Smile, WalletCards } from 'lucide-react';
import { api, type GiftDto } from '../../lib/api';
import { getSocket } from '../../lib/socket';
import { useAuthStore } from '../../store/authStore';
import { useUiStore } from '../../store/uiStore';

const accentClass: Record<string, string> = {
  cyan: 'border-boom-cyan/40 bg-boom-cyan/10',
  fuchsia: 'border-boom-fuchsia/40 bg-boom-fuchsia/10',
  gold: 'border-boom-gold/40 bg-boom-gold/10',
  blue: 'border-sky-400/40 bg-sky-400/10',
};

export function InteractionPanel() {
  const messages = useUiStore((s) => s.messages);
  const draft = useUiStore((s) => s.draft);
  const giftOpen = useUiStore((s) => s.giftOpen);
  const gifts = useUiStore((s) => s.gifts);
  const donors = useUiStore((s) => s.donors);
  const stream = useUiStore((s) => s.activeStream);
  const setDraft = useUiStore((s) => s.setDraft);
  const toggleGifts = useUiStore((s) => s.toggleGifts);
  const setToast = useUiStore((s) => s.setToast);
  const setNav = useUiStore((s) => s.setNav);
  const coins = useAuthStore((s) => s.profile?.coins ?? 0);
  const setCoins = useAuthStore((s) => s.setCoins);
  const syncProfile = useAuthStore((s) => s.syncProfile);

  const first = donors.find((d) => d.rank === 1);
  const second = donors.find((d) => d.rank === 2);
  const third = donors.find((d) => d.rank === 3);

  async function sendMessage() {
    const text = draft.trim();
    if (!text || !stream) return;
    setDraft('');
    const socket = await getSocket();
    socket.emit('chat:send', { streamId: stream.id, text });
  }

  async function sendGift(gift: GiftDto) {
    if (!stream) return;
    if (coins < gift.price) {
      setToast('Saldo insuficiente. Recarga coins para continuar.');
      window.setTimeout(() => setToast(null), 2600);
      return;
    }
    setCoins(coins - gift.price);
    useUiStore.getState().toggleGifts();
    try {
      const result = await api<{ coins: number }>(`/api/streams/${stream.id}/gifts`, {
        method: 'POST',
        body: JSON.stringify({ giftId: gift.id }),
      });
      setCoins(result.coins);
    } catch (error) {
      await syncProfile();
      setToast(error instanceof Error ? error.message : 'No se pudo enviar el regalo');
      window.setTimeout(() => setToast(null), 2800);
    }
  }

  return (
    <aside className="hidden h-full w-[22%] min-w-[300px] max-w-[360px] flex-col border-l border-white/5 bg-zinc-800/45 px-4 py-4 backdrop-blur-xl lg:flex">
      <div>
        <p className="text-center text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
          Top Donadores
        </p>
        <div className="mt-3 flex items-end justify-center gap-3">
          {second ? <DonorAvatar donor={second} size="sm" /> : null}
          {first ? <DonorAvatar donor={first} size="lg" /> : null}
          {third ? <DonorAvatar donor={third} size="sm" /> : null}
          {donors.length === 0 ? (
            <p className="text-xs text-zinc-500">Sé el primero en enviar un regalo</p>
          ) : null}
        </div>
      </div>

      <div className="mt-5 flex min-h-0 flex-1 flex-col rounded-2xl border border-white/5 bg-boom-panel/80">
        <div className="border-b border-white/5 px-3 py-2 text-xs font-semibold text-zinc-400">Chat en vivo</div>
        <ul className="chat-scroll flex-1 space-y-3 overflow-y-auto px-3 py-3">
          {messages.map((msg) => (
            <li key={msg.id} className="flex gap-2">
              {msg.avatar ? (
                <img src={msg.avatar} alt="" className="mt-0.5 h-7 w-7 rounded-full object-cover" />
              ) : (
                <span className="mt-0.5 h-7 w-7 rounded-full bg-white/10" />
              )}
              <div
                className={`min-w-0 rounded-xl px-2.5 py-1.5 ${
                  msg.donation
                    ? 'border border-yellow-500/50 bg-gradient-to-r from-yellow-500/20 to-fuchsia-500/20'
                    : ''
                }`}
              >
                <p className="flex items-center gap-1.5 text-[11px] font-semibold text-cyan-300">
                  {msg.donation ? <Gift size={13} className="text-fuchsia-400" /> : null}
                  {msg.author}
                </p>
                <p className="text-xs leading-snug text-white">
                  {msg.text}
                  {msg.donation ? (
                    <span className="ml-1 font-semibold text-yellow-300">+{msg.donation}</span>
                  ) : null}
                </p>
              </div>
            </li>
          ))}
        </ul>

        <form
          className="relative border-t border-white/5 p-3"
          onSubmit={(event) => {
            event.preventDefault();
            void sendMessage();
          }}
        >
          {giftOpen ? (
            <div className="absolute bottom-16 left-3 right-3 rounded-2xl border border-white/10 bg-[#16181E] p-3 shadow-gift">
              <p className="mb-2 text-xs font-semibold text-zinc-300">Caja de Regalos</p>
              <div className="gift-row flex snap-x snap-mandatory gap-1 overflow-x-auto overflow-y-hidden pb-1">
                {gifts.map((gift) => (
                  <button
                    key={gift.id}
                    type="button"
                    onClick={() => void sendGift(gift)}
                    className={`w-[4.35rem] shrink-0 snap-start rounded-xl border px-1 py-2 text-center transition hover:brightness-125 ${accentClass[gift.accent] ?? accentClass.cyan}`}
                  >
                    <span className="block text-xl">{gift.emoji}</span>
                    <span className="mt-1 block text-[10px] font-semibold text-zinc-200">{gift.price}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          <div className="flex items-center gap-2 rounded-xl bg-black/40 px-2 py-1.5 ring-1 ring-white/10">
            <Smile size={16} className="text-zinc-500" />
            <input
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="Envía un mensaje..."
              className="h-8 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-zinc-500"
            />
            <button type="submit" className="text-boom-cyan" aria-label="Enviar">
              <Send size={16} />
            </button>
          </div>
        </form>
      </div>

      <div className="mt-3 flex items-center gap-2 rounded-2xl border border-white/5 bg-boom-panel px-3 py-2.5">
        <button
          type="button"
          onClick={toggleGifts}
          className="grid h-10 w-10 place-items-center rounded-xl bg-boom-fuchsia/15 text-boom-fuchsia"
          aria-label="Abrir caja de regalos"
        >
          <Gift size={18} />
        </button>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Caja de Regalos</p>
          <p className="truncate text-sm font-bold text-white">
            SALDO: {coins.toLocaleString('es-ES')} COINS
          </p>
        </div>
        <button
          type="button"
          onClick={() => setNav('wallet')}
          className="rounded-full bg-gradient-to-r from-cyan-500 to-fuchsia-500 px-6 py-2 text-xs font-bold text-white shadow-[0_0_15px_rgba(0,240,255,0.5)] transition-transform hover:scale-105"
        >
          <WalletCards size={13} />
          Recargar Coins
        </button>
      </div>
    </aside>
  );
}

function DonorAvatar({
  donor,
  size,
}: {
  donor: { name: string; avatar: string; coins: number };
  size: 'sm' | 'lg';
}) {
  const dim = size === 'lg' ? 'h-16 w-16' : 'h-12 w-12';
  return (
    <div className="flex flex-col items-center">
      <div className={`live-ring rounded-full p-[2px] ${size === 'lg' ? 'shadow-glow' : ''}`}>
        <img src={donor.avatar} alt="" className={`${dim} rounded-full object-cover`} />
      </div>
      <p className="mt-1 text-xs font-semibold text-white">{donor.name}</p>
      <p className="text-[10px] text-boom-gold">{donor.coins.toLocaleString('es-ES')}</p>
    </div>
  );
}
