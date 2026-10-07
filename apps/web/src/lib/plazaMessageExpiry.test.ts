/**
 * Chat del video: cada mensaje se borra a los 10 minutos, del más viejo al más nuevo.
 * Ejecutar: npx tsx apps/web/src/lib/plazaMessageExpiry.test.ts
 */
import {
  PLAZA_MESSAGE_FADE_MS,
  PLAZA_MESSAGE_VISIBLE_MS,
  plazaMessageExpiresAt,
  visiblePlazaMessages,
} from './plazaMessageExpiry';

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg);
}

const T0 = 1_000_000;
const MIN = 60_000;

// Carga inicial: se descuenta lo que ya lleva publicado.
assert(plazaMessageExpiresAt(T0, T0 - MIN, false) === T0 + 9 * MIN, 'mensaje de 1 min: quedan 9 min');
assert(plazaMessageExpiresAt(T0, T0 - 12 * MIN, false) === T0, 'mensaje de 12 min: ya vencido');
assert(plazaMessageExpiresAt(T0, T0 + 2 * MIN, false) === T0 + PLAZA_MESSAGE_VISIBLE_MS, 'reloj atrasado: 10 min completos');
// En vivo: siempre 10 min desde que llega, aunque el reloj del teléfono esté adelantado.
assert(plazaMessageExpiresAt(T0, T0 - 15 * MIN, true) === T0 + PLAZA_MESSAGE_VISIBLE_MS, 'en vivo: 10 min completos');

const messages = [{ id: 'viejo' }, { id: 'medio' }, { id: 'nuevo' }];
const expiresAt = new Map([
  ['viejo', T0 + MIN],
  ['medio', T0 + 2 * MIN],
  ['nuevo', T0 + 3 * MIN],
]);

let state = visiblePlazaMessages(messages, expiresAt, T0);
assert(state.visible.map((m) => m.id).join() === 'viejo,medio,nuevo', 'al inicio se ven todos en orden');
assert(state.visible.every((m) => !m.leaving), 'nadie se está yendo');
assert(state.nextAt === T0 + MIN - PLAZA_MESSAGE_FADE_MS, 'próxima revisión: cuando empieza a irse el más viejo');

state = visiblePlazaMessages(messages, expiresAt, T0 + MIN - PLAZA_MESSAGE_FADE_MS);
assert(state.visible[0]?.id === 'viejo' && state.visible[0].leaving, 'el más viejo se desvanece primero');
assert(!state.visible[1]?.leaving, 'el siguiente sigue fijo');
assert(state.nextAt === T0 + MIN, 'próxima revisión: cuando se borra el más viejo');

state = visiblePlazaMessages(messages, expiresAt, T0 + MIN);
assert(state.visible.map((m) => m.id).join() === 'medio,nuevo', 'se borró el más viejo');

state = visiblePlazaMessages(messages, expiresAt, T0 + 2 * MIN);
assert(state.visible.map((m) => m.id).join() === 'nuevo', 'luego el del medio');

state = visiblePlazaMessages(messages, expiresAt, T0 + 3 * MIN);
assert(state.visible.length === 0 && state.nextAt === null, 'al final no queda ninguno ni más revisiones');

assert(visiblePlazaMessages([{ id: 'x' }], new Map(), T0).visible.length === 0, 'sin vencimiento conocido no se muestra');

console.log('plazaMessageExpiry: ok');
