import { ConnectionState, Room, RoomEvent } from 'livekit-client';
import { useEffect, useRef } from 'react';
import {
  registerLiveViewer,
  touchLiveViewerHeartbeat,
  unregisterLiveViewer,
} from '../lib/liveGiftsFirestore';

type LivePresenceUser = {
  uid: string;
  username: string;
  displayName: string;
};

/**
 * Registra presencia de espectador solo dentro de la sala real (/stream).
 * Preview en Inicio/Explorar NO debe usar este hook.
 */
export function useLivePresence(
  roomName: string,
  room: Room,
  user: LivePresenceUser | null,
  enabled: boolean,
) {
  const activeRoomRef = useRef('');

  useEffect(() => {
    if (!enabled || !user?.uid || !roomName) return;

    const uid = user.uid;
    const activeKey = `${roomName}:${uid}`;
    let registered = false;
    let heartbeatTimer = 0;

    const register = () => {
      if (registered || activeRoomRef.current === activeKey) return;
      registered = true;
      activeRoomRef.current = activeKey;
      void registerLiveViewer(roomName, {
        uid,
        username: user.username,
        displayName: user.displayName,
      }).catch(() => undefined);
      heartbeatTimer = window.setInterval(() => {
        void touchLiveViewerHeartbeat(roomName, uid).catch(() => undefined);
      }, 12_000);
    };

    const unregister = () => {
      if (!registered) return;
      registered = false;
      if (activeRoomRef.current === activeKey) activeRoomRef.current = '';
      window.clearInterval(heartbeatTimer);
      void unregisterLiveViewer(roomName, uid).catch(() => undefined);
    };

    const onConnected = () => register();
    const onDisconnected = () => unregister();

    if (room.state === ConnectionState.Connected) register();
    room.on(RoomEvent.Connected, onConnected);
    room.on(RoomEvent.Disconnected, onDisconnected);

    return () => {
      room.off(RoomEvent.Connected, onConnected);
      room.off(RoomEvent.Disconnected, onDisconnected);
      unregister();
    };
  }, [enabled, room, roomName, user?.uid, user?.username, user?.displayName]);
}
