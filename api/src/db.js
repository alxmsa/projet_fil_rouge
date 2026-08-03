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

module.exports = { pool, query };
