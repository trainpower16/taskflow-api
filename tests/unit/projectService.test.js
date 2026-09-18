'use strict';

const projectService = require('../../src/services/projectService');
const userRepository = require('../../src/repositories/userRepository');
const { setupDb, resetDb, teardownDb } = require('../helpers/testDb');
const catchError = require('../helpers/catchError');

describe('projectService', () => {
  let owner;
  let other;
  let admin;

  beforeAll(setupDb);
  afterAll(teardownDb);

  beforeEach(() => {
    resetDb();
    owner = userRepository.create({ email: 'owner@example.com', name: 'Owner', passwordHash: 'x' });
    other = userRepository.create({ email: 'other@example.com', name: 'Other', passwordHash: 'x' });
    admin = userRepository.create({
      email: 'admin@example.com',
      name: 'Admin',
      passwordHash: 'x',
      role: 'admin',
    });
  });

  it('creates a project owned by the acting user', () => {
    const project = projectService.create(owner, { name: 'Apollo', description: 'Moon shot' });

    expect(project).toMatchObject({ name: 'Apollo', description: 'Moon shot', owner_id: owner.id });
  });

  it('lists only the projects a member owns', () => {
    projectService.create(owner, { name: 'Mine' });
    projectService.create(other, { name: 'Theirs' });

    const visible = projectService.list(owner);

    expect(visible).toHaveLength(1);
    expect(visible[0].name).toBe('Mine');
  });

  it('lets an admin see every project', () => {
    projectService.create(owner, { name: 'Mine' });
    projectService.create(other, { name: 'Theirs' });

    expect(projectService.list(admin)).toHaveLength(2);
  });

  it('refuses access to a project owned by somebody else', () => {
    const project = projectService.create(owner, { name: 'Private' });

    const error = catchError(() => projectService.getOwned(other, project.id));

    expect(error.statusCode).toBe(403);
    expect(error.message).toMatch(/do not have access/);
  });

  it('reports a missing project as 404 rather than 403', () => {
    const error = catchError(() => projectService.getOwned(owner, 'does-not-exist'));

    expect(error.statusCode).toBe(404);
  });

  it('updates only the whitelisted fields', () => {
    const project = projectService.create(owner, { name: 'Before' });
    const updated = projectService.update(owner, project.id, {
      name: 'After',
      owner_id: other.id,
    });

    expect(updated.name).toBe('After');
    expect(updated.owner_id).toBe(owner.id);
  });

  it('deletes a project the actor owns', () => {
    const project = projectService.create(owner, { name: 'Temp' });

    expect(projectService.remove(owner, project.id)).toBe(true);
    expect(projectService.list(owner)).toHaveLength(0);
  });
});
