// One-shot: apply migration 006 (notifications).
// Usage: node src/config/run-migration-006.js
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT, 10),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

(async () => {
  const sql = fs.readFileSync(
    path.join(__dirname, 'migrations', '006_create_notifications.sql'),
    'utf8'
  );

  try {
    await pool.query(sql);
    const check = await pool.query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name = 'notifications'
    `);
    console.log('Migration applied. Tables present:');
    for (const row of check.rows) console.log('  -', row.table_name);
    process.exit(0);
  } catch (err) {
    console.error('Migration failed:', err.message);
    process.exit(1);
  }
})();
