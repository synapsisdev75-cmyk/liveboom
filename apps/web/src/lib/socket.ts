import { io, type Socket } from 'socket.io-client';
import { auth } from './firebase';

const ONLINE_API = 'https://liveboom.vercel.app';
const API_BASE = String(import.meta.env.VITE_API_URL || ONLINE_API).replace(/\/$/, '');

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
  socket = io(API_BASE || window.location.origin, {
    auth: { token },
    transports: ['websocket', 'polling'],
  });
  return socket;
}

export function disconnectSocket() {
  socket?.disconnect();
  socket = null;
}
