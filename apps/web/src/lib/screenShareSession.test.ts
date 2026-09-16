/**
 * Pruebas unitarias de screenShareSession (sin montar LiveRoom / sin APK).
 * Ejecutar: npx tsx apps/web/src/lib/screenShareSession.test.ts
 */
import {
  ScreenShareOperationGate,
  waitRoomConnected,
  participantHasHostMedia,
  overlayFailureWarning,
  mustReleaseStreamOnConnectFailure,
  secondStartBlocked,
} from './screenShareSession.ts';

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg);
}

async function testGate() {
  const gate = new ScreenShareOperationGate();
  assert(gate.canStart(), 'idle can start');
  const a = gate.beginStart();
  assert(a === 1, 'op 1');
  assert(secondStartBlocked(gate.phase), 'second blocked');
  assert(gate.beginStart() == null, 'no second start');
  gate.failStart(a!);
  assert(gate.phase === 'idle', 'failStart idle');

  const b = gate.beginStart()!;
  gate.advance(b, 'publishing');
  gate.markActive(b);
  assert(gate.phase === 'active', 'active');

  let ran = 0;
  const p1 = gate.runStop(async () => {
    ran += 1;
  });
  const p2 = gate.runStop(async () => {
    ran += 1;
  });
  await Promise.all([p1, p2]);
  assert(ran === 1, 'single stop worker');
  assert(gate.phase === 'idle', 'idle after stop');

  // worker sync throw
  const g2 = new ScreenShareOperationGate();
  g2.beginStart();
  try {
    await g2.runStop(() => {
      throw new Error('boom');
    });
    assert(false, 'should throw');
  } catch {
    /* expected */
  }
  assert(g2.phase === 'idle', 'idle after sync throw');
}

async function testWaitConnected() {
  type Fake = {
    state: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    handlers: Record<string, Set<(...a: any[]) => void>>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    on(e: any, cb: (...a: any[]) => void): void;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    off(e: any, cb: (...a: any[]) => void): void;
  };
  const room: Fake = {
    state: 'connecting',
    handlers: {},
    on(e, cb) {
      (this.handlers[e] ||= new Set()).add(cb);
    },
    off(e, cb) {
      this.handlers[e]?.delete(cb);
    },
  };

  const already = { ...room, state: 'connected' };
  await waitRoomConnected(already, { timeoutMs: 100 });

  const ac = new AbortController();
  const p = waitRoomConnected(room, { timeoutMs: 5000, signal: ac.signal });
  ac.abort();
  try {
    await p;
    assert(false, 'abort should reject');
  } catch (err) {
    assert((err as Error).name === 'AbortError', 'AbortError name');
  }

  room.state = 'connecting';
  const p2 = waitRoomConnected(room, { timeoutMs: 2000 });
  room.state = 'connected';
  room.handlers.connectionStateChanged?.forEach((cb) => cb());
  await p2;
}

function testHostMedia() {
  const cam = {
    get source() {
      return 'camera';
    },
    get isMuted() {
      return false;
    },
    get track() {
      return { mediaStreamTrack: { readyState: 'live' } };
    },
  };
  assert(participantHasHostMedia([cam]), 'camera ok');
  assert(
    participantHasHostMedia([
      {
        get source() {
          return 'screen_share';
        },
        get isMuted() {
          return false;
        },
        get track() {
          return { mediaStreamTrack: { readyState: 'live' } };
        },
      },
    ]),
    'screen ok',
  );
  assert(overlayFailureWarning(false, false, 'base')?.includes('base'), 'overlay warn');
  assert(overlayFailureWarning(true, false, 'base') == null, 'shown ok');
  assert(mustReleaseStreamOnConnectFailure(true, false), 'release on connect fail');
}

await testGate();
await testWaitConnected();
testHostMedia();
console.log('screenShareSession.test.ts OK');
