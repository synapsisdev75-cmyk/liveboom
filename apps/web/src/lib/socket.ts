import { io, type Socket } from 'socket.io-client';
import { getApiBase } from './api';
import { auth } from './firebase';

let socket: Socket | null = null;

export async function getSocket(): Promise<Socket> {
  if (socket?.connected) {
    return socket;
  }
  const user = auth.currentUser;
  if (!user) {
    throw new Error('No auth');
  }
  const token = await user.getIdToken();
  socket = io(getApiBase() || window.location.origin, {
    auth: { token },
    transports: ['websocket', 'polling'],
  });
  return socket;
}

export function disconnectSocket() {
  socket?.disconnect();
  socket = null;
}
