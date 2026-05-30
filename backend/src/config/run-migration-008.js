// One-shot: apply migration 008 (backfill teacher/admin matricules).
// Usage: node src/config/run-migration-008.js
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
    path.join(__dirname, 'migrations', '008_backfill_teacher_admin_matricule.sql'),
    'utf8'
  );

  try {
    await pool.query(sql);
    const summary = await pool.query(`
      SELECT role,
             COUNT(*) FILTER (WHERE matricule IS NOT NULL) AS with_matricule,
             COUNT(*) FILTER (WHERE matricule IS NULL)     AS without_matricule
      FROM utilisateurs
      WHERE role IN ('ETUDIANT', 'ENSEIGNANT', 'ADMIN', 'BIBLIOTHECAIRE')
      GROUP BY role
      ORDER BY role
    `);
    console.log('Migration 008 applied. Matricule coverage:');
    for (const row of summary.rows) {
      console.log(`  - ${row.role}: with=${row.with_matricule}, without=${row.without_matricule}`);
    }
    process.exit(0);
  } catch (err) {
    console.error('Migration 008 failed:', err.message);
    process.exit(1);
  }
})();
