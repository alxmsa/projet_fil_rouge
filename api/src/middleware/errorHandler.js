'use strict';

/**
 * Gestionnaire d'erreurs central : toute erreur remontée via next(err)
 * (ou levée dans un handler async enveloppé par asyncHandler) atterrit ici.
 * Jamais de stacktrace envoyée au client, seulement un JSON propre.
 */
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  const status = err.statusCode || err.status || 500;

  if (status >= 500) {
    // On garde le détail côté serveur uniquement (logs), jamais côté client.
    console.error('[error]', err);
  }

  const payload = {
    error: status >= 500 ? 'Erreur interne du serveur.' : err.message || 'Requête invalide.',
  };

  if (Array.isArray(err.details) && err.details.length > 0) {
    payload.details = err.details;
  }

  res.status(status).json(payload);
}

/** Erreur HTTP typée, pour éviter de manipuler des objets Error nus dans les routes. */
class HttpError extends Error {
  constructor(statusCode, message, details) {
    super(message);
    this.statusCode = statusCode;
    this.details = details;
  }
}

/** Enveloppe un handler async pour transmettre automatiquement ses rejets à next(). */
function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

module.exports = { errorHandler, HttpError, asyncHandler };
