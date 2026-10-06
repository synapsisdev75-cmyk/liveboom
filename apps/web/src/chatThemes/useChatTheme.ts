import { useEffect, useMemo } from 'react';
import { useAppearanceStore } from '../store/appearanceStore';
import { useAuthStore } from '../store/authStore';
import { useChatThemesAdminStore } from './adminConfig';
import { ensureChatFonts } from './fonts';
import { useChatThemePrefs } from './prefsStore';
import { resolveChatTheme } from './resolve';
import './themes';
import type { ChatAppearance, ResolvedChatTheme } from './types';

/** Engancha usuario + configuración pública. Idempotente: se puede llamar desde varios componentes. */
export function useChatThemeSync(chatId?: string | null) {
  const uid = useAuthStore((state) => state.profile?.firebaseUid ?? state.firebaseUser?.uid ?? null);
  const bindUser = useChatThemePrefs((state) => state.bindUser);
  const watchChat = useChatThemePrefs((state) => state.watchChat);
  const storeUid = useChatThemePrefs((state) => state.uid);
  const subscribeAdmin = useChatThemesAdminStore((state) => state.subscribe);

  useEffect(() => subscribeAdmin(), [subscribeAdmin]);
  useEffect(() => {
    if (uid) bindUser(uid);
  }, [uid, bindUser]);
  useEffect(() => {
    if (!chatId || !storeUid) return undefined;
    return watchChat(chatId);
  }, [chatId, storeUid, watchChat]);
}

/** Preferencia efectiva: la de la conversación si existe, si no la global. */
export function useChatAppearance(chatId?: string | null): { appearance: ChatAppearance; scope: 'chat' | 'global' } {
  const global = useChatThemePrefs((state) => state.global);
  const perChat = useChatThemePrefs((state) => (chatId ? state.perChat[chatId] : undefined));
  return perChat ? { appearance: perChat, scope: 'chat' } : { appearance: global, scope: 'global' };
}

export function useResolveChatTheme(appearance: ChatAppearance): ResolvedChatTheme {
  const admin = useChatThemesAdminStore((state) => state.config);
  const appScheme = useAppearanceStore((state) => state.theme);
  const resolved = useMemo(
    () => resolveChatTheme({ appearance, admin, appScheme }),
    [appearance, admin, appScheme],
  );
  useEffect(() => {
    ensureChatFonts(resolved.fonts);
  }, [resolved.fonts]);
  return resolved;
}

export function useResolvedChatTheme(chatId?: string | null): ResolvedChatTheme {
  useChatThemeSync(chatId);
  const { appearance } = useChatAppearance(chatId);
  return useResolveChatTheme(appearance);
}
