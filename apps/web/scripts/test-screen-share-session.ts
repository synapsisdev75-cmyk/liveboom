/**
 * Pruebas de los 4 fallos identificados (proyecto / simuladas).
 * Ejecutar: npx --yes tsx apps/web/scripts/test-screen-share-session.ts
 */
import assert from 'node:assert/strict';
import {
  ScreenShareOperationGate,
  mustReleaseStreamOnConnectFailure,
  overlayFailureWarning,
  secondStartBlocked,
  shouldKeepCaptureAfterOverlayError,
  waitRoomConnected,
  type WaitConnectedRoom,
} from '../src/lib/screenShareSession.ts';

function mockRoom(initial = 'disconnected'): WaitConnectedRoom & {
  setState: (s: string) => void;
  emit: (event: string) => void;
} {
  const listeners = new Map<string, Set<(...args: unknown[]) => void>>();
  let state = initial;
  return {
    get state() {
      return state;
    },
    setState(s: string) {
      state = s;
    },
    on(event, cb) {
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event)!.add(cb);
    },
    off(event, cb) {
      listeners.get(event)?.delete(cb);
    },
    emit(event: string) {
      for (const cb of listeners.get(event) || []) cb();
    },
  };
}

async function testOverlayFailureKeepsCapture() {
  assert.equal(shouldKeepCaptureAfterOverlayError(true, true), true);
  const warn = overlayFailureWarning(false, false, 'Compartiendo pantalla');
  assert.ok(warn && warn.includes('compartiendo'));
  console.log('OK 1: overlay falla tras publicar ⇒ captura se mantiene');
}

async function testConnectFailureReleasesStream() {
  assert.equal(mustReleaseStreamOnConnectFailure(true, false), true);
  assert.equal(mustReleaseStreamOnConnectFailure(true, true), false);
  console.log('OK 2: conexión falla tras obtener stream ⇒ liberar stream');
}

async function testDoubleStartWhileAuthorizing() {
  const gate = new ScreenShareOperationGate();
  const a = gate.beginStart();
  assert.ok(a != null);
  assert.equal(gate.beginStart(), null);
  assert.equal(secondStartBlocked(gate.phase), true);
  gate.failStart(a!);
  assert.equal(gate.phase, 'idle');
  console.log('OK 3: dos inicios con autorización pendiente ⇒ bloqueado');
}

async function testWaitConnectedOnReconnected() {
  const room = mockRoom('disconnected');
  const pending = waitRoomConnected(room, { timeoutMs: 2000 });
  // Simula Reconnected (no solo Connected).
  room.setState('connected');
  room.emit('reconnected');
  await pending;
  console.log('OK 4: waitConnected resuelve con Reconnected');
}

async function testStopSharesPromise() {
  const gate = new ScreenShareOperationGate();
  let runs = 0;
  const worker = async () => {
    runs += 1;
    await new Promise((r) => setTimeout(r, 30));
  };
  const p1 = gate.runStop(worker);
  const p2 = gate.runStop(worker);
  await Promise.all([p1, p2]);
  assert.equal(runs, 1);
  console.log('OK 5: stop concurrente espera la misma operación');
}

async function main() {
  await testOverlayFailureKeepsCapture();
  await testConnectFailureReleasesStream();
  await testDoubleStartWhileAuthorizing();
  await testWaitConnectedOnReconnected();
  await testStopSharesPromise();
  console.log('\nTodas las pruebas de screenShareSession pasaron.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
