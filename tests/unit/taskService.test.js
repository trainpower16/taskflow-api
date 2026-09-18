'use strict';

const taskService = require('../../src/services/taskService');
const projectService = require('../../src/services/projectService');
const taskRepository = require('../../src/repositories/taskRepository');
const userRepository = require('../../src/repositories/userRepository');
const { setupDb, resetDb, teardownDb } = require('../helpers/testDb');
const catchError = require('../helpers/catchError');

describe('taskService', () => {
  let owner;
  let other;
  let project;

  beforeAll(setupDb);
  afterAll(teardownDb);

  beforeEach(() => {
    resetDb();
    owner = userRepository.create({ email: 'owner@example.com', name: 'Owner', passwordHash: 'x' });
    other = userRepository.create({ email: 'other@example.com', name: 'Other', passwordHash: 'x' });
    project = projectService.create(owner, { name: 'Apollo' });
  });

  it('creates a task with sensible defaults', () => {
    const task = taskService.create(owner, project.id, { title: 'Write tests' });

    expect(task).toMatchObject({
      title: 'Write tests',
      status: 'todo',
      priority: 'medium',
      project_id: project.id,
    });
  });

  it('refuses to create a task in a project the actor cannot access', () => {
    expect(() => taskService.create(other, project.id, { title: 'Sneaky' })).toThrow(
      /do not have access/
    );
  });

  it('filters the task list by status', () => {
    taskService.create(owner, project.id, { title: 'A', status: 'todo' });
    taskService.create(owner, project.id, { title: 'B', status: 'done' });

    expect(taskService.list(owner, project.id, { status: 'done' })).toHaveLength(1);
    expect(taskService.list(owner, project.id)).toHaveLength(2);
  });

  it('does not return a task belonging to a different project', () => {
    const otherProject = projectService.create(owner, { name: 'Gemini' });
    const task = taskService.create(owner, otherProject.id, { title: 'Elsewhere' });

    const error = catchError(() => taskService.get(owner, project.id, task.id));

    expect(error.statusCode).toBe(404);
  });

  it('updates a task and leaves unknown fields untouched', () => {
    const task = taskService.create(owner, project.id, { title: 'Before' });
    const updated = taskService.update(owner, project.id, task.id, {
      status: 'in_progress',
      project_id: 'hijacked',
    });

    expect(updated.status).toBe('in_progress');
    expect(updated.project_id).toBe(project.id);
  });

  it('deletes a task', () => {
    const task = taskService.create(owner, project.id, { title: 'Temp' });

    expect(taskService.remove(owner, project.id, task.id)).toBe(true);
    expect(taskService.list(owner, project.id)).toHaveLength(0);
  });

  it('counts tasks by status for the monitoring gauge', () => {
    taskService.create(owner, project.id, { title: 'A', status: 'todo' });
    taskService.create(owner, project.id, { title: 'B', status: 'todo' });
    taskService.create(owner, project.id, { title: 'C', status: 'done' });

    expect(taskRepository.countByStatus()).toEqual({ todo: 2, in_progress: 0, done: 1 });
  });

  it('removes a project’s tasks when the project is deleted', () => {
    taskService.create(owner, project.id, { title: 'Orphan candidate' });
    projectService.remove(owner, project.id);

    expect(taskRepository.countByStatus()).toEqual({ todo: 0, in_progress: 0, done: 0 });
  });
});
