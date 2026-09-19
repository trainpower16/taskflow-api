'use strict';

const taskRepository = require('../repositories/taskRepository');
const projectService = require('./projectService');
const { NotFoundError } = require('../utils/errors');

const taskService = {
  create(actor, projectId, data) {
    projectService.getOwned(actor, projectId);
    return taskRepository.create({ ...data, projectId });
  },

  list(actor, projectId, options = {}) {
    projectService.getOwned(actor, projectId);
    return taskRepository.listByProject(projectId, options);
  },

  get(actor, projectId, taskId) {
    projectService.getOwned(actor, projectId);
    const task = taskRepository.findById(taskId);
    if (!task || task.project_id !== projectId) throw new NotFoundError('Task');
    return task;
  },

  update(actor, projectId, taskId, fields) {
    this.get(actor, projectId, taskId);
    return taskRepository.update(taskId, fields);
  },

  remove(actor, projectId, taskId) {
    this.get(actor, projectId, taskId);
    return taskRepository.remove(taskId);
  },
};

module.exports = taskService;
