'use strict';

const express = require('express');
const taskModel = require('../models/task');
const { validateTaskInput, isValidUUID } = require('../utils/validation');
const { HttpError, asyncHandler } = require('../middleware/errorHandler');

const router = express.Router();

function ensureValidId(id) {
  if (!isValidUUID(id)) {
    throw new HttpError(400, `"${id}" n'est pas un identifiant valide.`);
  }
}

// POST /api/tasks — créer une tâche
router.post(
  '/',
  asyncHandler(async (req, res) => {
    const { valid, errors } = validateTaskInput(req.body);
    if (!valid) {
      throw new HttpError(400, 'Corps de requête invalide.', errors);
    }
    const task = await taskModel.create({
      description: req.body.description,
      status: req.body.status || 'pending',
    });
    res.status(201).json(task);
  })
);

// GET /api/tasks — lister toutes les tâches
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const tasks = await taskModel.findAll();
    res.json(tasks);
  })
);

// GET /api/tasks/:id — voir une tâche
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    ensureValidId(req.params.id);
    const task = await taskModel.findById(req.params.id);
    if (!task) {
      throw new HttpError(404, 'Tâche introuvable.');
    }
    res.json(task);
  })
);

// PUT /api/tasks/:id — modifier une tâche
router.put(
  '/:id',
  asyncHandler(async (req, res) => {
    ensureValidId(req.params.id);
    const { valid, errors } = validateTaskInput(req.body, { partial: true });
    if (!valid) {
      throw new HttpError(400, 'Corps de requête invalide.', errors);
    }
    const existing = await taskModel.findById(req.params.id);
    if (!existing) {
      throw new HttpError(404, 'Tâche introuvable.');
    }
    const task = await taskModel.update(req.params.id, req.body);
    res.json(task);
  })
);

// DELETE /api/tasks/:id — supprimer une tâche
router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    ensureValidId(req.params.id);
    const deleted = await taskModel.remove(req.params.id);
    if (!deleted) {
      throw new HttpError(404, 'Tâche introuvable.');
    }
    res.status(204).send();
  })
);

module.exports = router;
