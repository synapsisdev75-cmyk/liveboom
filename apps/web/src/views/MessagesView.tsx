import { InternalChatPanel } from '../components/social/InternalChatPanel';

export function MessagesView() {
  return (
    <div className="flex h-full min-h-0 flex-1 flex-col">
      <InternalChatPanel page />
    </div>
  );
}
