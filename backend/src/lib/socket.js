const { Server } = require('socket.io');

let io = null;

function normalizeRoom(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_')
    .slice(0, 64);
}

function allowedOrigin(origin) {
  if (!origin) return true;
  return (
    origin === 'http://localhost:5173' ||
    origin === 'http://127.0.0.1:5173' ||
    origin === 'https://liveboom-app.web.app' ||
    origin === 'https://liveboom-app.firebaseapp.com' ||
    origin === 'https://liveboomapp.com' ||
    origin === 'https://www.liveboomapp.com' ||
    origin === 'https://liveboomapp.com' ||
    origin === 'https://www.liveboomapp.com' ||
    origin.endsWith('.web.app') ||
    origin.endsWith('.firebaseapp.com')
  );
}

function initSocket(httpServer) {
  io = new Server(httpServer, {
    cors: {
      origin: (origin, callback) => {
        callback(null, allowedOrigin(origin));
      },
    },
  });

  io.use(async (socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) {
      next(new Error('unauthorized'));
      return;
    }
    try {
      const verifyMod = require('../lib/verifyFirebaseToken');
      const verify =
        typeof verifyMod === 'function'
          ? verifyMod
          : verifyMod.verifyFirebaseIdToken || verifyMod.default;
      socket.data.user = await verify(token);
      next();
    } catch {
      next(new Error('unauthorized'));
    }
  });

  io.on('connection', (socket) => {
    socket.on('join_room', (roomName) => {
      const room = normalizeRoom(roomName);
      if (!room) return;
      socket.join(`room:${room}`);
    });

    socket.on('leave_room', (roomName) => {
      const room = normalizeRoom(roomName);
      if (!room) return;
      socket.leave(`room:${room}`);
    });

    socket.on('send_message', (payload) => {
      const roomName = normalizeRoom(payload?.roomName);
      const text = typeof payload?.text === 'string' ? payload.text.trim().slice(0, 280) : '';
      if (!roomName || !text) return;
      const user = socket.data.user;
      io.to(`room:${roomName}`).emit('new_message', {
        id: `${Date.now()}-${socket.id}`,
        author: user?.name || user?.email || 'Liveboomer',
        text,
        at: new Date().toISOString(),
      });
    });
  });

  return io;
}

function getIO() {
  return io;
}

function emitGiftReceived(roomName, payload) {
  const room = normalizeRoom(roomName);
  if (!room) return;
  io?.to(`room:${room}`).emit('gift_received', payload);
}

module.exports = { initSocket, getIO, emitGiftReceived };
