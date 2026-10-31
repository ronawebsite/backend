const { Server } = require('socket.io');
const marketStream = require('../services/marketStream.service');
const stockStream = require('../services/stockStream.service');
const logger = require('../config/logger');

let io = null;

function initSocket(server, clientUrl) {
  io = new Server(server, {
    cors: {
      origin: [clientUrl, 'http://localhost:4200', 'http://127.0.0.1:4200'],
      methods: ['GET', 'POST'],
      credentials: true
    }
  });

  io.on('connection', (socket) => {
    logger.info(`[Socket.IO] Client connected: ${socket.id}`);

    // Send full current tickers snapshot immediately on connect (crypto + stocks)
    socket.emit('market:snapshot', marketStream.getAllTickers());
    socket.emit('stock:snapshot', stockStream.getAllTickers());

    // Allow user to join personal room for trade alerts
    socket.on('user:join', (userId) => {
      if (userId) {
        socket.join(`user_${userId}`);
        logger.debug(`[Socket.IO] Socket ${socket.id} joined user_${userId}`);
      }
    });

    // Client requests crypto order book subscription
    socket.on('subscribe:orderbook', (pair) => {
      const book = marketStream.getOrderBook(pair);
      socket.emit('market:orderbook', book);
    });

    // Client requests stock order book subscription
    socket.on('subscribe:stock_orderbook', (symbolOrPair) => {
      const book = stockStream.getOrderBook(symbolOrPair);
      socket.emit('stock:orderbook', book);
    });

    socket.on('disconnect', () => {
      logger.info(`[Socket.IO] Client disconnected: ${socket.id}`);
    });
  });

  // Relay live crypto ticker events
  marketStream.on('ticker', (ticker) => {
    if (io) {
      io.emit('market:ticker', ticker);
    }
  });

  // Relay live stock ticker events
  stockStream.on('ticker', (ticker) => {
    if (io) {
      io.emit('stock:ticker', ticker);
    }
  });

  logger.info('[Socket.IO] Real-time market & stocks gateway initialized');
  return io;
}

function getIO() {
  return io;
}

function notifyUser(userId, event, data) {
  if (io) {
    io.to(`user_${userId}`).emit(event, data);
  }
}

module.exports = {
  initSocket,
  getIO,
  notifyUser
};
