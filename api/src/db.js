'use strict';

const { Pool } = require('pg');

/**
 * Toute la configuration vient de l'environnement, rien en dur.
 * DATABASE_URL prime si présent (pratique pour les registries/ PaaS),
 * sinon on retombe sur les variables PG* standard utilisées par l'image
 * officielle postgres.
 */
const connectionConfig = process.env.DATABASE_URL
  ? { connectionString: process.env.DATABASE_URL }
  : {
      host: process.env.PGHOST,
      port: Number(process.env.PGPORT) || 5432,
      user: process.env.PGUSER,
      password: process.env.PGPASSWORD,
      database: process.env.PGDATABASE,
    };

const pool = new Pool({
  ...connectionConfig,
  max: Number(process.env.PG_POOL_MAX) || 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
  console.error('[db] erreur inattendue sur une connexion inactive du pool', err);
});

function query(text, params) {
  return pool.query(text, params);
}

/**
 * Au démarrage, le conteneur Postgres peut ne pas encore accepter de
 * connexions : `depends_on` (sans condition) ne garantit que l'ordre de
 * *lancement* des conteneurs, pas que Postgres soit prêt à cet instant.
 * On retente avec un backoff simple plutôt que de laisser le process
 * planter en boucle (crash-loop observé au premier `docker compose up`).
 */
async function waitForDb({ retries = 10, delayMs = 2000 } = {}) {
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      await pool.query('SELECT 1');
      console.log('[db] connexion PostgreSQL établie');
      return;
    } catch (err) {
      console.warn(
        `[db] tentative ${attempt}/${retries} échouée (${err.code || err.message}), nouvelle tentative dans ${delayMs}ms`
      );
      if (attempt === retries) throw err;
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}

async function closePool() {
  await pool.end();
}

module.exports = { pool, query, waitForDb, closePool };
