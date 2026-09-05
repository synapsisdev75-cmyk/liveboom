import { doc, getDoc } from 'firebase/firestore';
import { db } from './firebase';

export async function canCallUser(currentUserId: string, targetUserId: string): Promise<boolean> {
  const a = String(currentUserId || '').trim();
  const b = String(targetUserId || '').trim();
  if (!a || !b || a === b) return false;
  const [ab, ba] = await Promise.all([
    getDoc(doc(db, 'users', a, 'friends', b)),
    getDoc(doc(db, 'users', b, 'friends', a)),
  ]);
  return ab.exists() && ba.exists();
}

export function canCallFromFriends(friends: Array<{ uid: string }>, targetUid: string) {
  const uid = String(targetUid || '').trim();
  if (!uid) return false;
  return friends.some((friend) => friend.uid === uid);
}
