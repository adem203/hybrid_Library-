// One-shot: apply migration 010 (add last_login_at column).
// Usage: node src/config/run-migration-010.js
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
    path.join(__dirname, 'migrations', '010_add_last_login_at.sql'),
    'utf8'
  );

  try {
    await pool.query(sql);
    const check = await pool.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'utilisateurs'
        AND column_name IN ('last_login_at', 'last_logout_at')
      ORDER BY column_name
    `);
    console.log('Migration 010 applied. Login/logout tracking columns:');
    for (const row of check.rows) {
      console.log(`  - ${row.column_name}: ${row.data_type}, nullable=${row.is_nullable}`);
    }
    process.exit(0);
  } catch (err) {
    console.error('Migration 010 failed:', err.message);
    process.exit(1);
  }
})();
