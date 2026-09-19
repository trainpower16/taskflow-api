'use strict';

const projectRepository = require('../repositories/projectRepository');
const { NotFoundError, ForbiddenError } = require('../utils/errors');

const projectService = {
  create(actor, data) {
    return projectRepository.create({ ...data, ownerId: actor.id });
  },

  list(actor, options = {}) {
    return projectRepository.listForUser(actor.id, {
      ...options,
      isAdmin: actor.role === 'admin',
    });
  },

  getOwned(actor, id) {
    const project = projectRepository.findById(id);
    if (!project) throw new NotFoundError('Project');
    if (actor.role !== 'admin' && project.owner_id !== actor.id) {
      throw new ForbiddenError('You do not have access to this project');
    }
    return project;
  },

  update(actor, id, fields) {
    this.getOwned(actor, id);
    return projectRepository.update(id, fields);
  },

  remove(actor, id) {
    this.getOwned(actor, id);
    return projectRepository.remove(id);
  },
};

module.exports = projectService;
