'use strict';

const { randomUUID } = require('crypto');
const db = require('../db');

/**
 * Modèle Task, backé par PostgreSQL.
 * Chaque tâche : id (uuid), description, status, createdAt, updatedAt.
 * Le mapping snake_case (colonnes SQL) -> camelCase (JSON) se fait ici,
 * pour ne pas fuiter les conventions SQL vers l'API.
 */

function toApi(row) {
  if (!row) return null;
  return {
    id: row.id,
    description: row.description,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function findAll() {
  const { rows } = await db.query(
    'SELECT id, description, status, created_at, updated_at FROM tasks ORDER BY created_at ASC'
  );
  return rows.map(toApi);
}

async function findById(id) {
  const { rows } = await db.query(
    'SELECT id, description, status, created_at, updated_at FROM tasks WHERE id = $1',
    [id]
  );
  return toApi(rows[0]);
}

async function create({ description, status = 'pending' }) {
  const id = randomUUID();
  const { rows } = await db.query(
    `INSERT INTO tasks (id, description, status, created_at, updated_at)
     VALUES ($1, $2, $3, now(), now())
     RETURNING id, description, status, created_at, updated_at`,
    [id, description, status]
  );
  return toApi(rows[0]);
}

async function update(id, changes) {
  const fields = [];
  const values = [];
  let idx = 1;

  if (Object.prototype.hasOwnProperty.call(changes, 'description')) {
    fields.push(`description = $${idx++}`);
    values.push(changes.description);
  }
  if (Object.prototype.hasOwnProperty.call(changes, 'status')) {
    fields.push(`status = $${idx++}`);
    values.push(changes.status);
  }

  if (fields.length === 0) {
    return findById(id);
  }

  fields.push('updated_at = now()');
  values.push(id);

  const { rows } = await db.query(
    `UPDATE tasks SET ${fields.join(', ')} WHERE id = $${idx} RETURNING id, description, status, created_at, updated_at`,
    values
  );
  return toApi(rows[0]);
}

async function remove(id) {
  const { rowCount } = await db.query('DELETE FROM tasks WHERE id = $1', [id]);
  return rowCount > 0;
}

module.exports = { findAll, findById, create, update, remove };
