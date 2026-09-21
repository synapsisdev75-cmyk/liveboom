import { InternalChatPanel } from '../components/social/InternalChatPanel';
import { useMessagesInboxVisible } from '../hooks/useMessagesInboxVisible';
import { Navigate } from 'react-router-dom';

export function MessagesView() {
  const visible = useMessagesInboxVisible();
  if (!visible) return <Navigate to="/" replace />;
  return (
    <div className="flex h-full min-h-0 flex-1 flex-col">
      <InternalChatPanel page />
    </div>
  );
}
