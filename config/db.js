const mysql = require('mysql2/promise');
const env = require('./env');
const logger = require('./logger');

const pool = mysql.createPool({
  host: env.DB_HOST,
  port: env.DB_PORT,
  user: env.DB_USER,
  password: env.DB_PASSWORD,
  database: env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 25,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 10000,
  decimalNumbers: true
});

async function testConnection() {
  try {
    const conn = await pool.getConnection();
    logger.info(`[Database] MySQL Connection Pool initialized on ${env.DB_HOST}:${env.DB_PORT} [DB: ${env.DB_NAME}]`);
    conn.release();
  } catch (err) {
    logger.error(`[Database Error] Failed to connect to MySQL: ${err.message}`);
  }
}

testConnection();

module.exports = {
  pool,
  query: (sql, params) => pool.query(sql, params),
  execute: (sql, params) => pool.execute(sql, params)
};
