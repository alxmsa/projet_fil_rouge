'use strict';

const VALID_STATUSES = ['pending', 'in_progress', 'done'];
const MAX_DESCRIPTION_LENGTH = 2000;
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Valide le corps d'une requête de création/mise à jour de tâche.
 * Ne lève jamais d'exception : retourne toujours { valid, errors }.
 * C'est ce garde-fou qui manquait le premier jour, quand une description
 * de plusieurs dizaines de milliers de caractères faisait planter le process.
 */
function validateTaskInput(body, { partial = false } = {}) {
  const errors = [];

  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    return { valid: false, errors: ['Le corps de la requête doit être un objet JSON.'] };
  }

  const hasDescription = Object.prototype.hasOwnProperty.call(body, 'description');
  const hasStatus = Object.prototype.hasOwnProperty.call(body, 'status');

  if (!partial && !hasDescription) {
    errors.push('Le champ "description" est requis.');
  }

  if (hasDescription) {
    if (typeof body.description !== 'string') {
      errors.push('Le champ "description" doit être une chaîne de caractères.');
    } else if (body.description.trim().length === 0) {
      errors.push('Le champ "description" ne peut pas être vide.');
    } else if (body.description.length > MAX_DESCRIPTION_LENGTH) {
      errors.push(
        `Le champ "description" dépasse la limite de ${MAX_DESCRIPTION_LENGTH} caractères.`
      );
    }
  }

  if (hasStatus) {
    if (typeof body.status !== 'string' || !VALID_STATUSES.includes(body.status)) {
      errors.push(`Le champ "status" doit être l'une des valeurs : ${VALID_STATUSES.join(', ')}.`);
    }
  }

  return { valid: errors.length === 0, errors };
}

function isValidUUID(value) {
  return typeof value === 'string' && UUID_REGEX.test(value);
}

module.exports = {
  validateTaskInput,
  isValidUUID,
  VALID_STATUSES,
  MAX_DESCRIPTION_LENGTH,
};
