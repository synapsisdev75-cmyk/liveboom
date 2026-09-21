export type AdminChatRow = {
  chatId: string;
  participants: string[];
  profiles: Record<
    string,
    { username?: string; displayName?: string; avatarUrl?: string | null }
  >;
  lastMessage: string | null;
  lastAt: string | null;
};

export function newIdempotencyKey(prefix: string): string {
  const rand =
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}:${rand}`;
}

export function chatParticipantLabel(chat: AdminChatRow, uid: string): string {
  const p = chat.profiles[uid];
  if (p?.displayName) return p.displayName;
  if (p?.username) return `@${p.username}`;
  return uid.slice(0, 8);
}
