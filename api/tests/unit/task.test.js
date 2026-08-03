'use strict';

const { validateTaskInput, isValidUUID, MAX_DESCRIPTION_LENGTH } = require('../../src/utils/validation');

describe('validateTaskInput', () => {
  test('accepte une description valide', () => {
    const { valid, errors } = validateTaskInput({ description: 'Acheter du lait' });
    expect(valid).toBe(true);
    expect(errors).toHaveLength(0);
  });

  test('refuse un corps sans description en création', () => {
    const { valid, errors } = validateTaskInput({});
    expect(valid).toBe(false);
    expect(errors.length).toBeGreaterThan(0);
  });

  test('accepte un corps partiel sans description en mise à jour', () => {
    const { valid } = validateTaskInput({ status: 'done' }, { partial: true });
    expect(valid).toBe(true);
  });

  test('refuse une description trop longue (regression du bug du jour 1)', () => {
    const hugeDescription = 'x'.repeat(MAX_DESCRIPTION_LENGTH + 1);
    const { valid, errors } = validateTaskInput({ description: hugeDescription });
    expect(valid).toBe(false);
    expect(errors.some((e) => e.includes('dépasse'))).toBe(true);
  });

  test('refuse un status en dehors de l\'énumération autorisée', () => {
    const { valid, errors } = validateTaskInput({ description: 'x', status: 'not-a-real-status' });
    expect(valid).toBe(false);
    expect(errors.some((e) => e.includes('status'))).toBe(true);
  });

  test('refuse un corps qui n\'est pas un objet', () => {
    const { valid } = validateTaskInput('pas un objet');
    expect(valid).toBe(false);
  });
});

describe('isValidUUID', () => {
  test('valide un UUID v4 bien formé', () => {
    expect(isValidUUID('3fa85f64-5717-4562-b3fc-2c963f66afa6')).toBe(true);
  });

  test('rejette une chaîne quelconque', () => {
    expect(isValidUUID('123')).toBe(false);
    expect(isValidUUID(undefined)).toBe(false);
  });
});
