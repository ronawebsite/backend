const logger = require('../config/logger');

function errorHandler(err, req, res, next) {
  logger.error(`[Express Error] ${req.method} ${req.url} -> ${err.message}`, { stack: err.stack });

  const statusCode = err.statusCode || 500;
  const message = err.message || 'Internal Server Error';

  res.status(statusCode).json({
    success: false,
    error: message,
    code: err.code || 'SERVER_ERROR',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
}

module.exports = errorHandler;
