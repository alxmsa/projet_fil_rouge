'use strict';

// On mocke le modèle pour tester les routes HTTP indépendamment de Postgres :
// ces tests tournent donc sans docker-compose. Les tests de bout en bout
// contre une vraie base sont documentés dans le README (section Tests).
jest.mock('../../src/models/task');

const request = require('supertest');
const app = require('../../src/app');
const taskModel = require('../../src/models/task');

const SAMPLE_TASK = {
  id: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
  description: 'Écrire les tests d\'intégration',
  status: 'pending',
  createdAt: '2026-08-03T15:00:00.000Z',
  updatedAt: '2026-08-03T15:00:00.000Z',
};

afterEach(() => {
  jest.clearAllMocks();
});

describe('GET /health', () => {
  test('répond 200 avec un statut ok', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });
});

describe('POST /api/tasks puis GET /api/tasks', () => {
  test('une création suivie d\'un GET renvoie bien la tâche créée', async () => {
    taskModel.create.mockResolvedValue(SAMPLE_TASK);
    taskModel.findAll.mockResolvedValue([SAMPLE_TASK]);

    const createRes = await request(app)
      .post('/api/tasks')
      .send({ description: SAMPLE_TASK.description });
    expect(createRes.status).toBe(201);
    expect(createRes.body.id).toBe(SAMPLE_TASK.id);

    const listRes = await request(app).get('/api/tasks');
    expect(listRes.status).toBe(200);
    expect(listRes.body).toEqual([SAMPLE_TASK]);
  });
});

describe('GET /api/tasks/:id', () => {
  test('un id inexistant renvoie un 404 propre, jamais un crash', async () => {
    taskModel.findById.mockResolvedValue(null);
    const res = await request(app).get(`/api/tasks/${SAMPLE_TASK.id}`);
    expect(res.status).toBe(404);
    expect(res.body.error).toBeDefined();
  });

  test('un id mal formé renvoie 400', async () => {
    const res = await request(app).get('/api/tasks/pas-un-uuid');
    expect(res.status).toBe(400);
  });
});

describe('POST /api/tasks avec un corps invalide', () => {
  test('un JSON malformé est refusé avec un 400 clair', async () => {
    const res = await request(app)
      .post('/api/tasks')
      .set('Content-Type', 'application/json')
      .send('{ "description": "oops"'); // JSON tronqué volontairement
    expect(res.status).toBe(400);
    expect(taskModel.create).not.toHaveBeenCalled();
  });

  test('une description surdimensionnée est refusée avec un 400 clair', async () => {
    const res = await request(app)
      .post('/api/tasks')
      .send({ description: 'x'.repeat(3000) });
    expect(res.status).toBe(400);
    expect(taskModel.create).not.toHaveBeenCalled();
  });
});

describe('DELETE /api/tasks/:id', () => {
  test('supprime une tâche existante et répond 204', async () => {
    taskModel.remove.mockResolvedValue(true);
    const res = await request(app).delete(`/api/tasks/${SAMPLE_TASK.id}`);
    expect(res.status).toBe(204);
  });

  test('renvoie 404 si la tâche n\'existe pas', async () => {
    taskModel.remove.mockResolvedValue(false);
    const res = await request(app).delete(`/api/tasks/${SAMPLE_TASK.id}`);
    expect(res.status).toBe(404);
  });
});
