/**
 * =====================================================================
 * FICHAIN PRO - ONE-CLICK DATABASE RECREATION SCRIPT
 * Usage: node database/recreate.js
 * =====================================================================
 */

const path = require('path');
const fs = require('fs');

// Attempt to load mysql2 and bcryptjs from server/node_modules
const serverModules = path.join(__dirname, '..', 'server', 'node_modules');
let mysql, bcrypt;

try {
  mysql = require(path.join(serverModules, 'mysql2', 'promise'));
  bcrypt = require(path.join(serverModules, 'bcryptjs'));
} catch (e) {
  try {
    mysql = require('mysql2/promise');
    bcrypt = require('bcryptjs');
  } catch (err) {
    console.error('❌ Could not load mysql2 or bcryptjs. Run "npm install" in the server directory first.');
    process.exit(1);
  }
}

// Load environment variables
const dotenv = require(path.join(serverModules, 'dotenv'));
dotenv.config({ path: path.join(__dirname, '..', 'server', '.env') });
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const DB_HOST = process.env.DB_HOST || process.env.DB_SERVER || '127.0.0.1';
const DB_PORT = parseInt(process.env.DB_PORT || '3307', 10);
const DB_USER = process.env.DB_USER || process.env.DB_USERNAME || 'root';
const DB_PASSWORD = process.env.DB_PASSWORD !== undefined ? process.env.DB_PASSWORD : '';
const DB_NAME = process.env.DB_NAME || 'ddfichain';

async function recreateDatabase() {
  console.log('\n=============================================================');
  console.log('🚀 FICHAIN PRO - COMPLETE DATABASE RECREATION & INITIALIZATION');
  console.log('=============================================================');
  console.log(`📍 Connecting to MySQL Server at ${DB_HOST}:${DB_PORT} [User: ${DB_USER}]...`);

  let rootConnection;
  try {
    // 1. Connect to MySQL Server root without selecting database first
    rootConnection = await mysql.createConnection({
      host: DB_HOST,
      port: DB_PORT,
      user: DB_USER,
      password: DB_PASSWORD,
      multipleStatements: true
    });
    console.log('✓ Successfully connected to MySQL engine.');

    // 2. Ensure database exists
    console.log(`✓ Ensuring database \`${DB_NAME}\` exists...`);
    await rootConnection.query(`CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    await rootConnection.end();

    // 3. Connect directly to target database
    const connection = await mysql.createConnection({
      host: DB_HOST,
      port: DB_PORT,
      user: DB_USER,
      password: DB_PASSWORD,
      database: DB_NAME,
      multipleStatements: true
    });
    console.log(`✓ Connected to database: \`${DB_NAME}\``);

    // 4. Read SQL file
    const sqlPath = path.join(__dirname, 'init_broker_db.sql');
    if (!fs.existsSync(sqlPath)) {
      throw new Error(`Cannot find SQL file at ${sqlPath}`);
    }
    console.log('✓ Reading database schema and seed template...');
    let sqlContent = fs.readFileSync(sqlPath, 'utf8');

    // 5. Generate fresh bcrypt hash for password '123456'
    const salt = await bcrypt.genSalt(10);
    const freshPasswordHash = await bcrypt.hash('123456', salt);

    // Replace dummy hash in SQL file with fresh computed hash
    sqlContent = sqlContent.split('$2a$10$Q7eYqXyv6p4a1uGvG3q7Ce6rUv9l2R5jK0hL7nC4kK4pT0bZ6v912').join(freshPasswordHash);

    // 6. Execute SQL script
    console.log('✓ Executing database recreation DDL & seeding initial data...');
    await connection.query(sqlContent);
    console.log('✓ All 16 tables dropped, recreated, indexed, and populated successfully!\n');

    // 7. Verify tables created
    const [tables] = await connection.query('SHOW TABLES');
    console.log('📋 VERIFIED CREATED TABLES:');
    console.log('-------------------------------------------------------------');
    const tableNames = tables.map(r => Object.values(r)[0]);
    tableNames.forEach((tbl, idx) => {
      console.log(`   ${(idx + 1).toString().padStart(2, '0')}. ${tbl}`);
    });

    console.log('\n-------------------------------------------------------------');
    console.log('🔑 DEFAULT DEMO ACCOUNTS READY:');
    console.log('-------------------------------------------------------------');
    console.log('   👤 INVESTOR / PRO TRADER:');
    console.log('      Email:    user@mail.com');
    console.log('      Password: 123456');
    console.log('      PIN:      1234');
    console.log('      Balance:  $25,450.00 USD + $14,850.00 USDT + 1.845 BTC');
    console.log('');
    console.log('   🛡️ ADMINISTRATOR / SUPERVISOR:');
    console.log('      Email:    admin@mail.com');
    console.log('      Password: 123456');
    console.log('      PIN:      1234');
    console.log('-------------------------------------------------------------');
    console.log('🎉 DATABASE RECREATION COMPLETED WITH 100% SUCCESS!\n');

    await connection.end();
  } catch (err) {
    console.error('\n❌ DATABASE RECREATION ERROR:', err.message);
    if (rootConnection) await rootConnection.end();
    process.exit(1);
  }
}

recreateDatabase();
