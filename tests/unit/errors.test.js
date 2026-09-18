'use strict';

const {
  AppError,
  ValidationError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
} = require('../../src/utils/errors');

describe('error taxonomy', () => {
  it('maps each error type to the correct status code and code using its defaults', () => {
    const cases = [
      [new ValidationError(), 400, 'VALIDATION_ERROR'],
      [new UnauthorizedError(), 401, 'UNAUTHORIZED'],
      [new ForbiddenError(), 403, 'FORBIDDEN'],
      [new NotFoundError(), 404, 'NOT_FOUND'],
      [new ConflictError(), 409, 'CONFLICT'],
      [new AppError('boom'), 500, 'INTERNAL_ERROR'],
    ];

    for (const [error, statusCode, code] of cases) {
      expect(error).toBeInstanceOf(AppError);
      expect(error.statusCode).toBe(statusCode);
      expect(error.code).toBe(code);
      expect(error.isOperational).toBe(true);
      expect(error.stack).toBeDefined();
    }
  });

  it('names the missing resource in a NotFoundError', () => {
    expect(new NotFoundError('Project').message).toBe('Project not found');
  });

  it('carries validation details through to the handler', () => {
    const error = new ValidationError('Bad input', [{ field: 'email', message: 'required' }]);
    expect(error.details).toHaveLength(1);
  });
});
