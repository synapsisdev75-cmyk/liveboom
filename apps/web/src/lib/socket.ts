import type { Socket } from 'socket.io-client';
import { getApiBase } from './api';
import { auth } from './firebase';

let socket: Socket | null = null;
let pending: Promise<Socket> | null = null;
let generation = 0;

/**
 * Una sola conexión compartida. Mientras conecta o reconecta se reutiliza la misma instancia:
 * crear otra dejaba sockets huérfanos reintentando para siempre y listeners duplicados.
 */
export async function getSocket(): Promise<Socket> {
  if (socket && (socket.connected || socket.active)) {
    return socket;
  }
  if (pending) return pending;
  if (!auth.currentUser) {
    throw new Error('No auth');
  }
  const gen = generation;
  pending = (async () => {
    const { io } = await import('socket.io-client');
    if (gen !== generation || !auth.currentUser) {
      throw new Error('No auth');
    }
    socket?.disconnect();
    socket = io(getApiBase() || window.location.origin, {
      // Token fresco en cada (re)conexión: el ID token de Firebase caduca a la hora.
      auth: (cb) => {
        const user = auth.currentUser;
        if (!user) {
          cb({});
          return;
        }
        user.getIdToken().then(
          (token) => cb({ token }),
          () => cb({}),
        );
      },
      transports: ['websocket', 'polling'],
      reconnectionDelayMax: 30_000,
    });
    return socket;
  })();
  try {
    return await pending;
  } finally {
    pending = null;
  }
}

export function disconnectSocket() {
  generation += 1;
  socket?.disconnect();
  socket = null;
}
