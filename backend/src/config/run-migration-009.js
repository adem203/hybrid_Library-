// One-shot: apply migration 009 (add last_logout_at column).
// Usage: node src/config/run-migration-009.js
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
    path.join(__dirname, 'migrations', '009_add_last_logout_at.sql'),
    'utf8'
  );

  try {
    await pool.query(sql);
    const check = await pool.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'utilisateurs' AND column_name = 'last_logout_at'
    `);
    console.log('Migration 009 applied. last_logout_at column:');
    for (const row of check.rows) {
      console.log(`  - ${row.column_name}: ${row.data_type}, nullable=${row.is_nullable}`);
    }
    process.exit(0);
  } catch (err) {
    console.error('Migration 009 failed:', err.message);
    process.exit(1);
  }
})();
