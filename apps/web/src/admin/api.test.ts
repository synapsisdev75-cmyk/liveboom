/**
 * Ejecutar: npx tsx apps/web/src/admin/api.test.ts
 */
import { chatParticipantLabel, newIdempotencyKey, type AdminChatRow } from './helpers';

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg);
}

const key = newIdempotencyKey('admin-blast');
assert(key.startsWith('admin-blast:'), 'prefix');
assert(newIdempotencyKey('admin-blast') !== key, 'unique');

const chat: AdminChatRow = {
  chatId: 'c1',
  participants: ['a', 'b'],
  profiles: { a: { displayName: 'Ana', username: 'ana' } },
  lastMessage: 'hola',
  lastAt: null,
};
assert(chatParticipantLabel(chat, 'a') === 'Ana', 'label');
assert(chatParticipantLabel(chat, 'b') === 'b', 'fallback uid');

console.log('superAdmin api helpers ok');
