import { InternalChatPanel } from '../components/social/InternalChatPanel';

export function MessagesView() {
  return (
    <div className="flex h-[100dvh] min-h-0 flex-col">
      <InternalChatPanel fullscreen />
    </div>
  );
}
