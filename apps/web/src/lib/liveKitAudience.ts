import { Room, RoomEvent } from 'livekit-client';
import { useEffect, useState } from 'react';
import {
  isScreenShareIdentity,
  isHostOrScreenParticipant,
} from './screenShareIdentity';
import { publishLiveViewerAggregate, listenLiveRoomFeedViewerCount } from './liveGiftsFirestore';

/** Participantes de audiencia (excluye host y screen-share). */
export function listLiveKitAudience(
  room: Room,
  hostUid?: string | null,
): Array<{ identity: string; name: string }> {
  const out: Array<{ identity: string; name: string }> = [];
  for (const p of room.remoteParticipants.values()) {
    const id = String(p.identity || '');
    if (!id || isScreenShareIdentity(id)) continue;
    if (hostUid && isHostOrScreenParticipant(id, hostUid)) continue;
    out.push({
      identity: id,
      name: String(p.name || id).slice(0, 60),
    });
  }
  return out;
}

export function countLiveKitAudience(room: Room, hostUid?: string | null): number {
  return listLiveKitAudience(room, hostUid).length;
}

/**
 * Contador de sala: el host publica desde LiveKit (fuente de verdad media).
 * Todos leen el campo agregado `liveRooms.viewers` (1 listener, 0 writes por viewer).
 */
export function useAggregatedViewerCount(opts: {
  roomName: string;
  room: Room;
  hostUid?: string | null;
  isHost: boolean;
  connected: boolean;
}) {
  const { roomName, room, hostUid, isHost, connected } = opts;
  const [viewers, setViewers] = useState(0);

  useEffect(() => {
    if (!roomName) return;
    return listenLiveRoomFeedViewerCount(roomName, setViewers);
  }, [roomName]);

  useEffect(() => {
    if (!isHost || !roomName || !connected) return;

    const publish = () => {
      const n = countLiveKitAudience(room, hostUid);
      setViewers(n);
      void publishLiveViewerAggregate(roomName, n).catch(() => undefined);
    };

    publish();
    const onChange = () => publish();
    room.on(RoomEvent.ParticipantConnected, onChange);
    room.on(RoomEvent.ParticipantDisconnected, onChange);
    room.on(RoomEvent.Connected, onChange);
    const timer = window.setInterval(publish, 12_000);
    return () => {
      room.off(RoomEvent.ParticipantConnected, onChange);
      room.off(RoomEvent.ParticipantDisconnected, onChange);
      room.off(RoomEvent.Connected, onChange);
      window.clearInterval(timer);
    };
  }, [isHost, roomName, room, hostUid, connected]);

  return { viewers };
}
