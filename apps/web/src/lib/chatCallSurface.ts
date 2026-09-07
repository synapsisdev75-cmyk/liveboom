import { useEffect, useState } from 'react';

export type ChatCallSurface = {
  chatId: string;
  host: HTMLElement;
  dock: HTMLElement;
};

let current: ChatCallSurface | null = null;
const listeners = new Set<() => void>();

export function registerChatCallSurface(next: ChatCallSurface | null) {
  current = next;
  listeners.forEach((fn) => fn());
}

export function getChatCallSurface() {
  return current;
}

export function useChatCallSurface() {
  const [surface, setSurface] = useState<ChatCallSurface | null>(getChatCallSurface);
  useEffect(() => {
    const sync = () => setSurface(getChatCallSurface());
    listeners.add(sync);
    sync();
    return () => {
      listeners.delete(sync);
    };
  }, []);
  return surface;
}
