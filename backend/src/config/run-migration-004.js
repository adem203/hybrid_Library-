// One-shot: apply migration 004 (email OTP tables).
// Usage: node src/config/run-migration-004.js
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
    path.join(__dirname, 'migrations', '004_create_email_otps.sql'),
    'utf8'
  );
  try {
    await pool.query(sql);
    const check = await pool.query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name IN ('pending_registrations', 'login_otps')
      ORDER BY table_name
    `);
    console.log('Migration applied. Tables present:');
    for (const row of check.rows) console.log('  -', row.table_name);
    process.exit(0);
  } catch (err) {
    console.error('Migration failed:', err.message);
    process.exit(1);
  }
})();
