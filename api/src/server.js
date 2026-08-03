'use strict';

require('dotenv').config();

const app = require('./app');
const { waitForDb, closePool } = require('./db');

const PORT = Number(process.env.PORT) || 3000;

let server;

async function start() {
  // On attend que Postgres soit joignable avant d'ouvrir le port HTTP :
  // évite de répondre 200 sur /health alors que la base n'est pas prête.
  await waitForDb({
    retries: Number(process.env.DB_CONNECT_RETRIES) || 10,
    delayMs: Number(process.env.DB_CONNECT_DELAY_MS) || 2000,
  });

  server = app.listen(PORT, () => {
    console.log(`[server] API à l'écoute sur le port ${PORT}`);
  });
}

async function shutdown(signal) {
  console.log(`[server] signal ${signal} reçu, arrêt propre en cours...`);
  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }
  await closePool();
  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

start().catch((err) => {
  console.error('[server] échec du démarrage :', err);
  process.exit(1);
});
