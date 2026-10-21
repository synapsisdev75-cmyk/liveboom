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

/** null hasta que Capacitor informe si la app nativa está abierta. */
let nativeAppActive: boolean | null = null;

function syncDocumentVisible() {
  const pageVisible = typeof document !== 'undefined' && document.visibilityState === 'visible';
  const visible = nativeAppActive === false ? false : pageVisible;
  ctx = { ...ctx, documentVisible: visible };
}

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    syncDocumentVisible();
  });
}

if (typeof window !== 'undefined') {
  void import('@capacitor/core')
    .then(({ Capacitor }) => {
      if (!Capacitor.isNativePlatform()) return;
      return import('@capacitor/app').then(({ App }) => {
        void App.getState().then((state) => {
          nativeAppActive = state.isActive;
          syncDocumentVisible();
        });
        void App.addListener('appStateChange', ({ isActive }) => {
          nativeAppActive = isActive;
          syncDocumentVisible();
        });
      });
    })
    .catch(() => undefined);
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

function matchesOpenChat(input: { chatId?: string | null; peerUid?: string | null }) {
  const now = getChatNotifyContext();
  if (!now.activeChatId && !now.activePeerUid) return false;
  if (input.chatId && now.activeChatId && input.chatId === now.activeChatId) return true;
  if (input.peerUid && now.activePeerUid && input.peerUid === now.activePeerUid) return true;
  return false;
}

/** App visible en pantalla (no en segundo plano ni pestaña oculta). */
export function isAppInForeground() {
  if (nativeAppActive === false) return false;
  return typeof document !== 'undefined' && document.visibilityState === 'visible';
}

/** No mostrar banner del sistema si ya estás viendo ese chat (página o ventana flotante). */
export function shouldSuppressMobileChatTrayNotify(input: {
  chatId?: string | null;
  peerUid?: string | null;
}): boolean {
  const now = getChatNotifyContext();
  if (!now.documentVisible) return false;
  return matchesOpenChat(input);
}

export function countInboxUnread(
  list: Array<{ chatId: string; uid: string; unread?: number }>,
) {
  const now = getChatNotifyContext();
  const viewingChat = now.documentVisible && (now.activeChatId || now.activePeerUid);
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
  const matchingChat = matchesOpenChat({
    chatId: input.chatId,
    peerUid: input.peerUid,
  });
  // Chat abierto (página, hoja o ventana flotante) → sin campana, sonido ni tray.
  if (now.documentVisible && matchingChat) return 'active';
  if (now.documentVisible && now.inMessagesRoute) return 'list';
  return 'bell';
}
