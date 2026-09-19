'use strict';

const request = require('supertest');
const createApp = require('../../src/app');
const { setupDb, resetDb, teardownDb } = require('../helpers/testDb');

describe('TaskFlow API (integration)', () => {
  let app;

  beforeAll(() => {
    setupDb();
    app = createApp();
  });
  beforeEach(resetDb);
  afterAll(teardownDb);

  async function signUp(email = 'user@example.com', role = 'member') {
    await request(app)
      .post('/api/auth/register')
      .send({ email, name: 'Test User', password: 'password123', role });
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email, password: 'password123' });
    return { auth: `Bearer ${res.body.data.token}`, user: res.body.data.user };
  }

  describe('health and observability endpoints', () => {
    it('GET /health reports the running build', async () => {
      const res = await request(app).get('/health').expect(200);
      expect(res.body).toMatchObject({ status: 'ok', service: 'taskflow-api' });
      expect(res.body.version).toBeDefined();
    });

    it('GET /ready confirms the database is reachable', async () => {
      const res = await request(app).get('/ready').expect(200);
      expect(res.body).toEqual({ status: 'ready', checks: { database: 'up' } });
    });

    it('GET /metrics exposes Prometheus metrics', async () => {
      await request(app).get('/health');
      const res = await request(app).get('/metrics').expect(200);

      expect(res.headers['content-type']).toMatch(/text\/plain/);
      expect(res.text).toContain('http_requests_total');
      expect(res.text).toContain('taskflow_build_info');
      expect(res.text).toContain('taskflow_tasks_total');
    });

    it('labels a failed login with its full route so the alert rule can match it', async () => {
      await request(app)
        .post('/api/auth/login')
        .send({ email: 'ghost@example.com', password: 'wrong-password' })
        .expect(401);

      const res = await request(app).get('/metrics').expect(200);

      expect(res.text).toMatch(
        /http_requests_total\{method="POST",route="\/api\/auth\/login",status_code="401"/
      );
    });
  });

  describe('authentication', () => {
    it('registers a user and returns 201 without leaking the hash', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({ email: 'new@example.com', name: 'New', password: 'password123' })
        .expect(201);

      expect(res.body.data.email).toBe('new@example.com');
      expect(res.text).not.toContain('password');
    });

    it('rejects a weak password with a 400 and field-level detail', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({ email: 'weak@example.com', name: 'Weak', password: 'short' })
        .expect(400);

      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(res.body.error.details[0].field).toBe('password');
    });

    it('rejects a duplicate registration with a 409', async () => {
      await signUp('dupe@example.com');
      await request(app)
        .post('/api/auth/register')
        .send({ email: 'dupe@example.com', name: 'Dupe', password: 'password123' })
        .expect(409);
    });

    it('rejects a bad login with a 401', async () => {
      await signUp('login@example.com');
      await request(app)
        .post('/api/auth/login')
        .send({ email: 'login@example.com', password: 'wrong-password' })
        .expect(401);
    });

    it('refuses an unauthenticated or malformed request to a protected route', async () => {
      await request(app).get('/api/projects').expect(401);
      await request(app).get('/api/projects').set('Authorization', 'Bearer nonsense').expect(401);
      await request(app).get('/api/projects').set('Authorization', 'Basic abc').expect(401);
    });

    it('restricts the admin-only user list by role', async () => {
      const member = await signUp('member@example.com');
      await request(app).get('/api/auth/users').set('Authorization', member.auth).expect(403);

      const admin = await signUp('admin@example.com', 'admin');
      const res = await request(app)
        .get('/api/auth/users')
        .set('Authorization', admin.auth)
        .expect(200);
      expect(res.body.data.length).toBeGreaterThan(0);
    });
  });

  describe('projects and tasks lifecycle', () => {
    it('walks a project and its tasks through the full CRUD cycle', async () => {
      const { auth } = await signUp();

      const created = await request(app)
        .post('/api/projects')
        .set('Authorization', auth)
        .send({ name: 'Apollo', description: 'Moon shot' })
        .expect(201);
      const projectId = created.body.data.id;

      await request(app).get('/api/projects').set('Authorization', auth).expect(200);

      const task = await request(app)
        .post(`/api/projects/${projectId}/tasks`)
        .set('Authorization', auth)
        .send({ title: 'Build the rocket', priority: 'high', dueDate: '2026-12-01' })
        .expect(201);
      expect(task.body.data).toMatchObject({ title: 'Build the rocket', status: 'todo' });

      const updated = await request(app)
        .patch(`/api/projects/${projectId}/tasks/${task.body.data.id}`)
        .set('Authorization', auth)
        .send({ status: 'done' })
        .expect(200);
      expect(updated.body.data.status).toBe('done');

      const filtered = await request(app)
        .get(`/api/projects/${projectId}/tasks?status=done`)
        .set('Authorization', auth)
        .expect(200);
      expect(filtered.body.data).toHaveLength(1);

      await request(app)
        .delete(`/api/projects/${projectId}/tasks/${task.body.data.id}`)
        .set('Authorization', auth)
        .expect(204);

      await request(app)
        .patch(`/api/projects/${projectId}`)
        .set('Authorization', auth)
        .send({ name: 'Apollo 11' })
        .expect(200);

      await request(app)
        .delete(`/api/projects/${projectId}`)
        .set('Authorization', auth)
        .expect(204);

      await request(app).get(`/api/projects/${projectId}`).set('Authorization', auth).expect(404);
    });

    it('stops one user reading another user’s project', async () => {
      const alice = await signUp('alice@example.com');
      const bob = await signUp('bob@example.com');

      const project = await request(app)
        .post('/api/projects')
        .set('Authorization', alice.auth)
        .send({ name: 'Confidential' })
        .expect(201);

      await request(app)
        .get(`/api/projects/${project.body.data.id}`)
        .set('Authorization', bob.auth)
        .expect(403);

      const bobsList = await request(app)
        .get('/api/projects')
        .set('Authorization', bob.auth)
        .expect(200);
      expect(bobsList.body.data).toHaveLength(0);
    });

    it('rejects an invalid task payload', async () => {
      const { auth } = await signUp();
      const project = await request(app)
        .post('/api/projects')
        .set('Authorization', auth)
        .send({ name: 'Apollo' });

      await request(app)
        .post(`/api/projects/${project.body.data.id}/tasks`)
        .set('Authorization', auth)
        .send({ title: '', status: 'not-a-status' })
        .expect(400);
    });
  });

  describe('platform behaviour', () => {
    it('returns a structured 404 for an unknown route', async () => {
      const res = await request(app).get('/api/does-not-exist').expect(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });

    it('sets the security headers provided by helmet and a request id', async () => {
      const res = await request(app).get('/health').expect(200);

      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['x-powered-by']).toBeUndefined();
      expect(res.headers['x-request-id']).toBeDefined();
    });
  });
});
