const db = require('../config/db');

async function migrate() {
  console.log('Starting Growth Plans migration...');

  // 1. Upgrade / Recreate investment_plans table with modern institutional columns
  await db.query(`
    CREATE TABLE IF NOT EXISTS investment_plans (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      description TEXT,
      initial_amount DECIMAL(18,2) NOT NULL DEFAULT 1000.00,
      target_amount DECIMAL(18,2) NOT NULL DEFAULT 2500.00,
      duration_days INT NOT NULL DEFAULT 7,
      duration_seconds INT NOT NULL DEFAULT 604800,
      roi_percentage DECIMAL(10,2) DEFAULT 150.00,
      risk_level VARCHAR(50) DEFAULT 'Low Risk',
      badge VARCHAR(50) DEFAULT 'Popular',
      icon VARCHAR(50) DEFAULT '📈',
      color VARCHAR(50) DEFAULT 'teal',
      is_active TINYINT(1) DEFAULT 1,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  // Ensure all columns exist on investment_plans
  const [existingPlanCols] = await db.query('DESCRIBE investment_plans');
  const planColNames = existingPlanCols.map(c => c.Field);

  const planColumnsToAdd = [
    { name: 'initial_amount', type: 'DECIMAL(18,2) NOT NULL DEFAULT 1000.00' },
    { name: 'target_amount', type: 'DECIMAL(18,2) NOT NULL DEFAULT 2500.00' },
    { name: 'duration_days', type: 'INT NOT NULL DEFAULT 7' },
    { name: 'duration_seconds', type: 'INT NOT NULL DEFAULT 604800' },
    { name: 'roi_percentage', type: 'DECIMAL(10,2) DEFAULT 150.00' },
    { name: 'badge', type: "VARCHAR(50) DEFAULT 'Popular'" },
    { name: 'is_active', type: 'TINYINT(1) DEFAULT 1' },
    { name: 'created_at', type: 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP' },
    { name: 'updated_at', type: 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP' }
  ];

  for (const col of planColumnsToAdd) {
    if (!planColNames.includes(col.name)) {
      try {
        await db.query(`ALTER TABLE investment_plans ADD COLUMN ${col.name} ${col.type}`);
        console.log(`Added column ${col.name} to investment_plans`);
      } catch (e) {
        console.log(`Column ${col.name} notice:`, e.message);
      }
    }
  }

  // Seed standard institutional plans if table is empty or update existing
  const [existingPlans] = await db.query('SELECT COUNT(*) as count FROM investment_plans WHERE is_active = 1');
  if (existingPlans[0].count === 0 || planColNames.includes('min_deposit')) {
    // Populate or refresh with institutional presets
    const seedPlans = [
      {
        name: 'Alpha Starter Yield Plan',
        description: 'Automated multi-asset allocation. Starts at $500 and steadily compounds to $1,250 over 3 days.',
        initial_amount: 500.00,
        target_amount: 1250.00,
        duration_days: 3,
        duration_seconds: 3 * 86400,
        roi_percentage: 150.00,
        risk_level: 'Conservative',
        badge: 'Fast 3-Day',
        icon: '🌱',
        color: 'emerald'
      },
      {
        name: 'Bitcoin & Tech Momentum Plan',
        description: 'Strategic quantitative growth. Starts at $1,000 and compounds to guaranteed $2,800 over 7 days.',
        initial_amount: 1000.00,
        target_amount: 2800.00,
        duration_days: 7,
        duration_seconds: 7 * 86400,
        roi_percentage: 180.00,
        risk_level: 'Balanced Growth',
        badge: 'Most Popular',
        icon: '⚡',
        color: 'cyan'
      },
      {
        name: 'Institutional VIP Compounding Plan',
        description: 'Elite high-frequency multi-asset arbitrage. Starts at $5,000 and grows to $16,500 over 14 days.',
        initial_amount: 5000.00,
        target_amount: 16500.00,
        duration_days: 14,
        duration_seconds: 14 * 86400,
        roi_percentage: 230.00,
        risk_level: 'Institutional Elite',
        badge: 'High Yield VIP',
        icon: '👑',
        color: 'purple'
      },
      {
        name: 'Demo Flash Fast-Track Plan (5 Mins)',
        description: 'Fast-forward presentation mode for faculty evaluations. Starts at $1,000 and matures to $2,500 in 5 minutes.',
        initial_amount: 1000.00,
        target_amount: 2500.00,
        duration_days: 1,
        duration_seconds: 300, // 5 minutes!
        roi_percentage: 150.00,
        risk_level: 'Demo Fast-Track',
        badge: '⚡ Presentation Demo',
        icon: '🚀',
        color: 'amber'
      }
    ];

    for (const p of seedPlans) {
      // Check if plan already exists by name
      const [existing] = await db.query('SELECT id FROM investment_plans WHERE name = ?', [p.name]);
      if (existing.length === 0) {
        await db.query(
          `INSERT INTO investment_plans (name, description, initial_amount, target_amount, duration_days, duration_seconds, roi_percentage, risk_level, badge, icon, color, is_active)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
          [p.name, p.description, p.initial_amount, p.target_amount, p.duration_days, p.duration_seconds, p.roi_percentage, p.risk_level, p.badge, p.icon, p.color]
        );
        console.log(`Inserted plan: ${p.name}`);
      } else {
        await db.query(
          `UPDATE investment_plans SET description = ?, initial_amount = ?, target_amount = ?, duration_days = ?, duration_seconds = ?, roi_percentage = ?, risk_level = ?, badge = ?, icon = ?, color = ? WHERE id = ?`,
          [p.description, p.initial_amount, p.target_amount, p.duration_days, p.duration_seconds, p.roi_percentage, p.risk_level, p.badge, p.icon, p.color, existing[0].id]
        );
        console.log(`Updated plan: ${p.name}`);
      }
    }
  }

  // 2. Upgrade / Recreate investments table with live fluctuating value and target tracking
  await db.query(`
    CREATE TABLE IF NOT EXISTS investments (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      plan_id INT DEFAULT NULL,
      plan_name VARCHAR(100) NOT NULL,
      invested_amount DECIMAL(18,2) NOT NULL,
      target_amount DECIMAL(18,2) NOT NULL,
      current_value DECIMAL(18,2) NOT NULL,
      current_profit DECIMAL(18,2) NOT NULL DEFAULT 0.00,
      duration_days INT NOT NULL DEFAULT 7,
      duration_seconds INT NOT NULL DEFAULT 604800,
      start_date DATETIME NOT NULL,
      end_date DATETIME NOT NULL,
      status VARCHAR(50) NOT NULL DEFAULT 'ACTIVE',
      payout_credited TINYINT(1) DEFAULT 0,
      last_tick_at DATETIME DEFAULT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_inv_user (user_id),
      INDEX idx_inv_status (status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  // Ensure all columns exist on investments
  const [existingInvCols] = await db.query('DESCRIBE investments');
  const invColNames = existingInvCols.map(c => c.Field);

  const invColumnsToAdd = [
    { name: 'plan_id', type: 'INT DEFAULT NULL' },
    { name: 'invested_amount', type: 'DECIMAL(18,2) NOT NULL DEFAULT 0.00' },
    { name: 'target_amount', type: 'DECIMAL(18,2) NOT NULL DEFAULT 0.00' },
    { name: 'current_value', type: 'DECIMAL(18,2) NOT NULL DEFAULT 0.00' },
    { name: 'current_profit', type: 'DECIMAL(18,2) NOT NULL DEFAULT 0.00' },
    { name: 'duration_days', type: 'INT NOT NULL DEFAULT 7' },
    { name: 'duration_seconds', type: 'INT NOT NULL DEFAULT 604800' },
    { name: 'payout_credited', type: 'TINYINT(1) DEFAULT 0' },
    { name: 'last_tick_at', type: 'DATETIME DEFAULT NULL' },
    { name: 'created_at', type: 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP' },
    { name: 'updated_at', type: 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP' }
  ];

  for (const col of invColumnsToAdd) {
    if (!invColNames.includes(col.name)) {
      try {
        await db.query(`ALTER TABLE investments ADD COLUMN ${col.name} ${col.type}`);
        console.log(`Added column ${col.name} to investments`);
      } catch (e) {
        console.log(`Column ${col.name} notice:`, e.message);
      }
    }
  }

  // 3. Clean legacy investments with nonexistent app_users
  await db.query("UPDATE investments SET status = 'ARCHIVED' WHERE user_id NOT IN (SELECT id FROM app_users)");
  console.log('Archived legacy investments with invalid user_id.');

  // 4. Modernize transactions table type column to VARCHAR(50) so all financial events are recorded cleanly
  try {
    await db.query("ALTER TABLE transactions MODIFY COLUMN type VARCHAR(50) NOT NULL DEFAULT 'deposit'");
    console.log('transactions.type column widened to VARCHAR(50).');
  } catch (e) {
    console.log('transactions.type notice:', e.message);
  }

  // 5. Create plan_candle_ticks table for storing real-time Binance-style chart ticks
  await db.query(`
    CREATE TABLE IF NOT EXISTS plan_candle_ticks (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      investment_id INT NOT NULL,
      time INT NOT NULL,
      open DECIMAL(18,2) NOT NULL,
      high DECIMAL(18,2) NOT NULL,
      low DECIMAL(18,2) NOT NULL,
      close DECIMAL(18,2) NOT NULL,
      volume DECIMAL(18,4) NOT NULL DEFAULT 1.0000,
      INDEX idx_inv_time (investment_id, time),
      CONSTRAINT fk_ticks_investment FOREIGN KEY (investment_id) REFERENCES investments (id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);
  console.log('plan_candle_ticks table created / verified.');

  console.log('✅ Growth Plans migration completed successfully!');
  process.exit(0);
}

migrate().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
