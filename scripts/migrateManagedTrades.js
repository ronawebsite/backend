const db = require('../config/db');

async function migrate() {
  const queries = [
    `ALTER TABLE trades ADD COLUMN IF NOT EXISTS is_managed TINYINT(1) NOT NULL DEFAULT 0`,
    `ALTER TABLE trades ADD COLUMN IF NOT EXISTS current_profit DECIMAL(20, 2) NOT NULL DEFAULT 0.00`,
    `ALTER TABLE trades ADD COLUMN IF NOT EXISTS target_outcome VARCHAR(50) NOT NULL DEFAULT 'IN_PROGRESS'`,
    `ALTER TABLE trades ADD COLUMN IF NOT EXISTS admin_notes VARCHAR(255) DEFAULT NULL`,
    `ALTER TABLE trades ADD COLUMN IF NOT EXISTS intervention_at TIMESTAMP NULL DEFAULT NULL`
  ];

  for (const q of queries) {
    try {
      await db.query(q);
      console.log('Executed:', q);
    } catch (err) {
      console.log('Notice:', err.message);
    }
  }

  const [cols] = await db.query('DESCRIBE trades');
  console.log('Updated columns:', cols.map(c => c.Field));
  process.exit(0);
}

migrate().catch(err => {
  console.error(err);
  process.exit(1);
});
