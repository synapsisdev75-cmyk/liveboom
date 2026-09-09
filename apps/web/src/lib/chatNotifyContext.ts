/**
 * Contexto de notificación de mensajes privados.
 * Un mismo mensaje solo puede ir a campana, badge de lista, o marcarse leído.
 */

export type ChatNotifyDecision = 'bell' | 'list' | 'active' | 'ignore';

type ChatNotifyContext = {
  inMessagesRoute: boolean;
  activeChatId: string | null;
  activePeerUid: string | null;
  documentVisible: boolean;
};

let ctx: ChatNotifyContext = {
  inMessagesRoute: false,
  activeChatId: null,
  activePeerUid: null,
  documentVisible: typeof document === 'undefined' || document.visibilityState === 'visible',
};

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    ctx = { ...ctx, documentVisible: document.visibilityState === 'visible' };
  });
}

export function isMessagesPath(pathname: string) {
  return pathname === '/mensajes' || pathname.startsWith('/mensajes/');
}

export function patchChatNotifyContext(partial: Partial<ChatNotifyContext>) {
  ctx = { ...ctx, ...partial };
}

export function getChatNotifyContext() {
  return ctx;
}

export function countInboxUnread(
  list: Array<{ chatId: string; uid: string; unread?: number }>,
) {
  const now = getChatNotifyContext();
  const viewingChat =
    now.documentVisible &&
    now.inMessagesRoute &&
    (now.activeChatId || now.activePeerUid);
  return list.reduce((sum, chat) => {
    if (
      viewingChat &&
      ((now.activeChatId && chat.chatId === now.activeChatId) ||
        (now.activePeerUid && chat.uid === now.activePeerUid))
    ) {
      return sum;
    }
    return sum + (chat.unread || 0);
  }, 0);
}

export function decideChatMessageNotify(input: {
  chatId: string;
  peerUid: string;
  lastFromUid?: string | null;
  myUid: string;
}): ChatNotifyDecision {
  if (input.lastFromUid && input.lastFromUid === input.myUid) return 'ignore';
  const now = getChatNotifyContext();
  const viewingThis =
    now.documentVisible &&
    now.inMessagesRoute &&
    Boolean(
      (now.activeChatId && now.activeChatId === input.chatId) ||
        (now.activePeerUid && now.activePeerUid === input.peerUid),
    );
  if (viewingThis) return 'active';
  if (now.documentVisible && now.inMessagesRoute) return 'list';
  return 'bell';
}
