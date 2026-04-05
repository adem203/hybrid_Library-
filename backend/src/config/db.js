const { Pool } = require('pg');
require('dotenv').config();

// Pool de connexions PostgreSQL
const pool = new Pool({
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  // Pool de 10 connexions max
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// Tester la connexion au démarrage
pool.connect((err, client, release) => {
  if (err) {
    console.error('❌ Erreur connexion PostgreSQL:', err.message);
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