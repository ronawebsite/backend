const db = require('../config/db');

async function migrate() {
  console.log('=== Migrating Support Tickets, Disputes, and Email Messaging Tables ===');

  await db.query(`
    CREATE TABLE IF NOT EXISTS support_tickets (
      id INT AUTO_INCREMENT PRIMARY KEY,
      ticket_number VARCHAR(32) NOT NULL UNIQUE,
      user_id INT NOT NULL,
      subject VARCHAR(255) NOT NULL,
      category ENUM('TRADE_DISPUTE', 'DEPOSIT_ISSUE', 'WITHDRAWAL_STATUS', 'ACCOUNT_SECURITY', 'GENERAL_SUPPORT') NOT NULL DEFAULT 'GENERAL_SUPPORT',
      priority ENUM('LOW', 'MEDIUM', 'HIGH', 'URGENT') NOT NULL DEFAULT 'MEDIUM',
      status ENUM('OPEN', 'IN_REVIEW', 'RESOLVED', 'CLOSED') NOT NULL DEFAULT 'OPEN',
      is_dispute TINYINT(1) NOT NULL DEFAULT 0,
      related_trade_id INT NULL,
      source ENUM('USER_SUBMITTED', 'AI_BOT_ESCALATED', 'EMAIL') NOT NULL DEFAULT 'USER_SUBMITTED',
      ai_summary TEXT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_ticket_user (user_id),
      INDEX idx_ticket_status (status),
      INDEX idx_ticket_dispute (is_dispute),
      CONSTRAINT fk_ticket_user FOREIGN KEY (user_id) REFERENCES app_users (id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);
  console.log('✓ support_tickets table verified.');

  // Drop old support_messages and recreate cleanly
  await db.query(`DROP TABLE IF EXISTS support_messages`);
  await db.query(`
    CREATE TABLE support_messages (
      id INT AUTO_INCREMENT PRIMARY KEY,
      ticket_id INT NOT NULL,
      sender_id INT NULL,
      sender_role ENUM('USER', 'ADMIN', 'AI_ASSISTANT') NOT NULL,
      sender_name VARCHAR(255) NOT NULL,
      sender_email VARCHAR(255) NULL,
      message TEXT NOT NULL,
      is_email_dispatched TINYINT(1) NOT NULL DEFAULT 0,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_msg_ticket (ticket_id),
      CONSTRAINT fk_msg_ticket FOREIGN KEY (ticket_id) REFERENCES support_tickets (id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);
  console.log('✓ support_messages table created cleanly.');

  // Clean and seed 2 realistic sample tickets for user: 1 General Support and 1 Dispute
  await db.query(`DELETE FROM support_messages`);
  await db.query(`DELETE FROM support_tickets`);

  const [users] = await db.query("SELECT id, full_name, email FROM app_users WHERE role = 'user' LIMIT 1");
  if (users.length > 0) {
    const u = users[0];

    // Ticket 1: General Support
    const [t1] = await db.query(
      `INSERT INTO support_tickets (ticket_number, user_id, subject, category, priority, status, is_dispute, source) 
       VALUES ('TIC-204819', ?, 'Inquiry Regarding Daily Managed Profit Execution', 'GENERAL_SUPPORT', 'MEDIUM', 'OPEN', 0, 'USER_SUBMITTED')`,
      [u.id]
    );

    await db.query(
      `INSERT INTO support_messages (ticket_id, sender_id, sender_role, sender_name, sender_email, message, is_email_dispatched) 
       VALUES (?, ?, 'USER', ?, ?, 'Hi support team, I noticed my portfolio profits updated smoothly. How often does the trading desk open new positions?', 1)`,
      [t1.insertId, u.id, u.full_name, u.email]
    );

    await db.query(
      `INSERT INTO support_messages (ticket_id, sender_id, sender_role, sender_name, sender_email, message, is_email_dispatched) 
       VALUES (?, NULL, 'ADMIN', 'Senior Wealth Supervisor', 'admin@mail.com', 'Hello Alexander! Our algorithmic engine scans volatility every 5 seconds and enters high-probability breakouts during US and European market sessions.', 1)`,
      [t1.insertId]
    );

    // Ticket 2: Trade Dispute
    const [t2] = await db.query(
      `INSERT INTO support_tickets (ticket_number, user_id, subject, category, priority, status, is_dispute, source, ai_summary) 
       VALUES ('DISPUTE-839102', ?, 'Dispute on NVDA Execution Spread Buffer', 'TRADE_DISPUTE', 'HIGH', 'IN_REVIEW', 1, 'AI_BOT_ESCALATED', 'Client flagged entry price spread on NVDA position. Escalate to senior desk for margin buffer rebate.')`,
      [u.id]
    );

    await db.query(
      `INSERT INTO support_messages (ticket_id, sender_id, sender_role, sender_name, sender_email, message, is_email_dispatched) 
       VALUES (?, NULL, 'AI_ASSISTANT', 'Fichain Pro AI Bot', 'support-bot@fichain.pro', '🤖 Automated Dispute Escalation: The investor requested a review of the execution spread on NVDA. I have placed this case in priority review for a senior supervisor.', 1)`,
      [t2.insertId]
    );

    await db.query(
      `INSERT INTO support_messages (ticket_id, sender_id, sender_role, sender_name, sender_email, message, is_email_dispatched) 
       VALUES (?, ?, 'USER', ?, ?, 'I want to confirm if the recent top-up directive will reduce the entry spread on tech stocks.', 1)`,
      [t2.insertId, u.id, u.full_name, u.email]
    );

    console.log('✓ Seeded initial support ticket & active dispute.');
  }

  process.exit(0);
}

migrate().catch(err => {
  console.error('Migration error:', err);
  process.exit(1);
});
