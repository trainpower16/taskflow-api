'use strict';

const { z } = require('zod');
const validate = require('../../src/middleware/validate');
const { requireRole } = require('../../src/middleware/auth');
const { errorHandler, notFoundHandler } = require('../../src/middleware/errorHandler');
const { ValidationError, AppError } = require('../../src/utils/errors');
const { routeLabel } = require('../../src/monitoring/metrics');
const { validateProductionConfig } = require('../../src/config');

const mockRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

describe('validate middleware', () => {
  const schema = z.object({ name: z.string().min(1), age: z.number().optional() });

  it('passes a valid body through', () => {
    const req = { body: { name: 'Alice' } };
    const next = jest.fn();

    validate(schema)(req, mockRes(), next);

    expect(next).toHaveBeenCalledWith();
    expect(req.body).toEqual({ name: 'Alice' });
  });

  it('forwards a ValidationError carrying per-field details', () => {
    const next = jest.fn();

    validate(schema)({ body: { name: '' } }, mockRes(), next);

    const err = next.mock.calls[0][0];
    expect(err).toBeInstanceOf(ValidationError);
    expect(err.statusCode).toBe(400);
    expect(err.details[0].field).toBe('name');
  });

  it('stores a validated query separately from the body', () => {
    const req = { query: { name: 'Alice' } };
    const next = jest.fn();

    validate(schema, 'query')(req, mockRes(), next);

    expect(next).toHaveBeenCalledWith();
    expect(req.validated.query).toEqual({ name: 'Alice' });
  });
});

describe('requireRole middleware', () => {
  it('allows a user holding the required role', () => {
    const next = jest.fn();
    requireRole('admin')({ user: { role: 'admin' } }, mockRes(), next);
    expect(next).toHaveBeenCalledWith();
  });

  it('rejects a user without the role', () => {
    const next = jest.fn();
    requireRole('admin')({ user: { role: 'member' } }, mockRes(), next);
    expect(next.mock.calls[0][0].statusCode).toBe(403);
  });

  it('rejects an unauthenticated request', () => {
    const next = jest.fn();
    requireRole('admin')({}, mockRes(), next);
    expect(next.mock.calls[0][0].statusCode).toBe(401);
  });
});

describe('errorHandler', () => {
  const req = { originalUrl: '/api/test', method: 'GET', id: 'req-1' };

  it('reports an operational error faithfully', () => {
    const res = mockRes();

    errorHandler(new AppError('Teapot', 418, 'TEAPOT'), req, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(418);
    expect(res.json.mock.calls[0][0].error).toMatchObject({ code: 'TEAPOT', message: 'Teapot' });
  });

  it('hides the internals of an unexpected error behind a generic 500', () => {
    const res = mockRes();

    errorHandler(new Error('connect ECONNREFUSED 10.0.0.5:5432'), req, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(500);
    const body = res.json.mock.calls[0][0];
    expect(body.error.message).toBe('An unexpected error occurred');
    expect(JSON.stringify(body)).not.toContain('ECONNREFUSED');
  });

  it('turns an unmatched route into a 404', () => {
    const next = jest.fn();
    notFoundHandler({ method: 'GET', originalUrl: '/nope' }, mockRes(), next);
    expect(next.mock.calls[0][0].statusCode).toBe(404);
  });
});

describe('metrics route labels', () => {
  it('collapses identifiers so the label cardinality stays bounded', () => {
    const label = routeLabel({
      baseUrl: '/api/projects/0f2b1c4e-6a7d-4f8b-9c1d-2e3f4a5b6c7d/tasks',
      route: { path: '/:taskId' },
    });

    expect(label).toBe('/api/projects/:id/tasks/:taskId');
  });
});

describe('production configuration guard', () => {
  const original = { ...process.env };
  afterEach(() => {
    process.env.JWT_SECRET = original.JWT_SECRET;
  });

  it('accepts a non-production environment without a secret', () => {
    expect(validateProductionConfig({ isProduction: false })).toEqual([]);
  });

  it('refuses a production start-up with a missing or weak secret', () => {
    delete process.env.JWT_SECRET;
    expect(validateProductionConfig({ isProduction: true })).toHaveLength(1);

    process.env.JWT_SECRET = 'too-short';
    expect(validateProductionConfig({ isProduction: true })[0]).toMatch(/at least 32 characters/);
  });
});
