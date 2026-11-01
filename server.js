const express = require('express');
const http = require('http');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');
const path = require('path');

const env = require('./config/env');
const logger = require('./config/logger');
const { pool } = require('./config/db');
const { initSocket } = require('./sockets/market.socket');
const errorHandler = require('./middlewares/errorHandler');
const { apiLimiter } = require('./middlewares/rateLimiter');

// Import routes
const authRoutes = require('./routes/auth.routes');
const userRoutes = require('./routes/user.routes');
const tradeRoutes = require('./routes/trade.routes');
const botRoutes = require('./routes/bot.routes');
const cardRoutes = require('./routes/card.routes');
const walletRoutes = require('./routes/wallet.routes');
const adminRoutes = require('./routes/admin.routes');
const stockRoutes = require('./routes/stock.routes');
const supportRoutes = require('./routes/support.routes');
const planRoutes = require('./routes/plan.routes');

// Start Real-Time Growth Plan Engine
require('./services/planEngine.service');

// Initialize Platform Deposit Wallets
require('./services/depositWallet.service');

const app = express();
const server = http.createServer(app);

// Initialize WebSockets
initSocket(server, env.CLIENT_URL);

// Global Middlewares
app.use(helmet({
  crossOriginResourcePolicy: false,
  contentSecurityPolicy: false
}));

app.use(cors({
  origin: (origin, callback) => {
    // Dynamically allow requesting origin (Netlify, localhost, custom domains, or mobile apps)
    callback(null, true);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-transaction-pin', 'X-Requested-With', 'Accept', 'Origin']
}));
app.options('*', cors());

app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ extended: true, limit: '15mb' }));
app.use(cookieParser());
app.use(morgan('dev'));

// Static uploads directory
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ONLINE',
    service: 'Fichain Pro Institutional FinTech Engine',
    timestamp: new Date().toISOString(),
    uptime_seconds: process.uptime(),
    database_port: env.DB_PORT
  });
});

// API Routes
app.use('/api', apiLimiter);
app.use('/api/auth', authRoutes);
app.use('/api/user', userRoutes);
app.use('/api/trade', tradeRoutes);
app.use('/api/bots', botRoutes);
app.use('/api/cards', cardRoutes);
app.use('/api/wallet', walletRoutes);
app.use('/api/stocks', stockRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/support', supportRoutes);
app.use('/api/plans', planRoutes);

// Global Error Handler
app.use(errorHandler);

// Bootstrap Server
const PORT = env.PORT;
server.listen(PORT, () => {
  logger.info(`========================================================`);
  logger.info(`🚀 FICHAIN PRO INSTITUTIONAL FINTECH PLATFORM IS RUNNING`);
  logger.info(`🌐 HTTP & WebSocket Gateway: http://localhost:${PORT}`);
  logger.info(`📡 Socket.IO Real-Time Engine Active`);
  logger.info(`🛡️ Environment: ${env.NODE_ENV}`);
  logger.info(`========================================================`);
});

// Graceful Shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received. Closing server and database pool gracefully...');
  server.close(async () => {
    await pool.end();
    process.exit(0);
  });
});

module.exports = { app, server };
