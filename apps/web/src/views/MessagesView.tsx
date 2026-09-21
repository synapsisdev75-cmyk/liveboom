import { InternalChatPanel } from '../components/social/InternalChatPanel';
import { MESSAGES_INBOX_ENABLED } from '../lib/messagesUiFlags';
import { Navigate } from 'react-router-dom';

export function MessagesView() {
  if (!MESSAGES_INBOX_ENABLED) return <Navigate to="/" replace />;
  return (
    <div className="flex h-full min-h-0 flex-1 flex-col">
      <InternalChatPanel page />
    </div>
  );
}
