import { createContext, useContext, type ReactNode } from 'react';
import { useResolvedChatTheme } from '../../chatThemes/useChatTheme';
import type { ResolvedChatTheme } from '../../chatThemes/types';

const ChatThemeContext = createContext<ResolvedChatTheme | null>(null);

/** Expone el tema resuelto (global o de la conversación) a cualquier descendiente. */
export function ChatThemeProvider({ chatId, children }: { chatId?: string | null; children: ReactNode }) {
  const resolved = useResolvedChatTheme(chatId);
  return <ChatThemeContext.Provider value={resolved}>{children}</ChatThemeContext.Provider>;
}

export function ChatThemeValueProvider({ value, children }: { value: ResolvedChatTheme; children: ReactNode }) {
  return <ChatThemeContext.Provider value={value}>{children}</ChatThemeContext.Provider>;
}

export function useChatThemeContext() {
  return useContext(ChatThemeContext);
}
