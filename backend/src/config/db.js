const { Pool } = require('pg');
require('dotenv').config();

// ─────────────────────────────────────────────
// Configuration de la connexion PostgreSQL
//
// Production (Neon, Render, etc.) : fournir DATABASE_URL.
//   ex: postgresql://user:pass@ep-xxx.aws.neon.tech/db?sslmode=require
//   → SSL est activé automatiquement.
//
// Développement local : fournir DB_HOST / DB_PORT / DB_NAME / DB_USER / DB_PASSWORD.
// ─────────────────────────────────────────────
const useConnectionString = Boolean(process.env.DATABASE_URL);

// Fail-fast : aucune configuration de base de données détectée.
// Sur Render/Vercel, les variables doivent être définies dans le dashboard,
// PAS dans un fichier .env (qui n'est pas déployé).
if (!useConnectionString && !process.env.DB_HOST) {
  console.error(
    '❌ Aucune configuration PostgreSQL détectée.\n' +
    '   Définissez DATABASE_URL (recommandé, ex: Neon) dans les variables\n' +
    '   d\'environnement de votre hébergeur (Render → Environment), ou\n' +
    '   DB_HOST/DB_PORT/DB_NAME/DB_USER/DB_PASSWORD pour une base locale.'
  );
  process.exit(1);
}

// Active SSL si on est sur une URL distante (Neon/Render exigent SSL),
// sauf si explicitement désactivé via PGSSL=disable.
const sslEnabled = useConnectionString && process.env.PGSSL !== 'disable';

const pool = new Pool(
  useConnectionString
    ? {
        connectionString: process.env.DATABASE_URL,
        ssl: sslEnabled ? { rejectUnauthorized: false } : false,
        max: 10,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 10000,
      }
    : {
        host: process.env.DB_HOST,
        port: parseInt(process.env.DB_PORT),
        database: process.env.DB_NAME,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        max: 10,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 10000,
      }
);

// Tester la connexion au démarrage
pool.connect((err, client, release) => {
  if (err) {
    // Diagnostic complet : message vide = souvent un problème SSL ou un
    // hôte injoignable (variable DATABASE_URL absente/incorrecte).
    console.error('❌ Erreur connexion PostgreSQL');
    console.error('   mode        :', useConnectionString ? 'DATABASE_URL' : 'DB_HOST');
    console.error('   message     :', err.message || '(vide)');
    console.error('   code        :', err.code || '(n/a)');
    if (err.stack) console.error(err.stack);
    process.exit(1);
  }
  console.log('✅ Connexion PostgreSQL établie avec succès');
  release();
});

// Fonction helper pour exécuter des requêtes
const query = (text, params) => pool.query(text, params);

// Fonction pour les transactions
const getClient = () => pool.connect();

module.exports = { query, getClient, pool };
