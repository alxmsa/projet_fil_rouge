'use strict';

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const taskRoutes = require('./routes/tasks');
const { errorHandler, HttpError } = require('./middleware/errorHandler');

const app = express();

// Middleware de sécurité et de parsing
app.use(helmet());
app.use(cors({ origin: process.env.CORS_ORIGIN || '*' }));
// Limite explicite sur la taille du corps JSON : c'est ce qui manquait
// le jour où une description de 50 000 caractères faisait planter le process.
app.use(express.json({ limit: process.env.JSON_BODY_LIMIT || '100kb' }));

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date() });
});

// Routes
app.use('/api/tasks', taskRoutes);

// 404 générique pour tout le reste
app.use((req, res, next) => {
  next(new HttpError(404, 'Route introuvable.'));
});

// Un corps JSON malformé est intercepté par express.json avant d'arriver
// dans les routes : on le transforme ici en 400 propre plutôt que de
// laisser express renvoyer sa page d'erreur HTML par défaut.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed' || err instanceof SyntaxError) {
    return res.status(400).json({ error: 'Corps JSON malformé.' });
  }
  if (err.type === 'entity.too.large') {
    return res.status(400).json({ error: 'Corps de requête trop volumineux.' });
  }
  return next(err);
});

// Error handling
app.use(errorHandler);

module.exports = app;
