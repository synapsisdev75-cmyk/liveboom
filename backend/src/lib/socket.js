const { Server } = require('socket.io');

let io = null;

function allowedOrigin(origin) {
  if (!origin) return true;
  return (
    origin === 'http://localhost:5173' ||
    origin === 'http://127.0.0.1:5173' ||
    origin === 'https://liveboom-app.web.app' ||
    origin === 'https://liveboom-app.firebaseapp.com' ||
    origin === 'https://liveboom.vercel.app' ||
    origin.endsWith('.vercel.app')
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
      const { verifyFirebaseIdToken } = require('../middleware/auth');
      socket.data.user = await verifyFirebaseIdToken(token);
      next();
    } catch {
      next(new Error('unauthorized'));
    }
  });

  io.on('connection', (socket) => {
    socket.on('join_room', (roomName) => {
      if (typeof roomName !== 'string' || !roomName.trim()) return;
      socket.join(`room:${roomName.trim()}`);
    });

    socket.on('send_message', (payload) => {
      const roomName = typeof payload?.roomName === 'string' ? payload.roomName.trim() : '';
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
  io?.to(`room:${roomName}`).emit('gift_received', payload);
}

module.exports = { initSocket, getIO, emitGiftReceived };
