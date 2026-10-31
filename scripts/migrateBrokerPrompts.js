const db = require('../config/db');

async function migrate() {
  const query = `
    CREATE TABLE IF NOT EXISTS broker_prompts (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      title VARCHAR(255) NOT NULL,
      message TEXT NOT NULL,
      target_amount DECIMAL(20, 2) DEFAULT NULL,
      expected_payout DECIMAL(20, 2) DEFAULT NULL,
      urgency VARCHAR(50) NOT NULL DEFAULT 'opportunity',
      status VARCHAR(50) NOT NULL DEFAULT 'active',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      dismissed_at TIMESTAMP NULL DEFAULT NULL,
      INDEX idx_prompts_user (user_id),
      CONSTRAINT fk_prompts_user FOREIGN KEY (user_id) REFERENCES app_users (id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `;

  try {
    await db.query(query);
    console.log('broker_prompts table created successfully.');
  } catch (err) {
    console.log('Notice:', err.message);
  }

  // Check columns in broker_prompts
  const [cols] = await db.query('DESCRIBE broker_prompts');
  console.log('broker_prompts columns:', cols.map(c => c.Field));
  process.exit(0);
}

migrate().catch(err => {
  console.error(err);
  process.exit(1);
});
