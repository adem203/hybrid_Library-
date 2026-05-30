// One-shot: apply migration 007 (add GUEST role).
// Usage: node src/config/run-migration-007.js
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
    path.join(__dirname, 'migrations', '007_add_guest_role.sql'),
    'utf8'
  );

  try {
    await pool.query(sql);
    const check = await pool.query(`
      SELECT conname, pg_get_constraintdef(oid) AS def
      FROM pg_constraint
      WHERE conname IN ('utilisateurs_role_check', 'pending_registrations_role_check')
      ORDER BY conname
    `);
    console.log('Migration applied. Role constraints now allow GUEST:');
    for (const row of check.rows) console.log('  -', row.conname, '=>', row.def);
    process.exit(0);
  } catch (err) {
    console.error('Migration failed:', err.message);
    process.exit(1);
  }
})();
