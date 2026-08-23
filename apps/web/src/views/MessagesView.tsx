import { InternalChatPanel } from '../components/social/InternalChatPanel';

export function MessagesView() {
  return (
    <div className="mx-auto w-full max-w-3xl space-y-4">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-400">Comunidad</p>
        <h1 className="mt-1 text-xl font-bold text-white sm:text-2xl">Mensajes</h1>
        <p className="mt-1 text-sm text-zinc-400">Conversa en privado con tus amigos de Liveboom.</p>
      </div>
      <InternalChatPanel />
    </div>
  );
}
