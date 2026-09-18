'use strict';

const express = require('express');
const { z } = require('zod');
const projectService = require('../services/projectService');
const validate = require('../middleware/validate');
const { authenticate } = require('../middleware/auth');
const taskRoutes = require('./taskRoutes');

const router = express.Router();

const createSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(2000).optional(),
});

const updateSchema = createSchema.partial();

router.use(authenticate);

router.post('/', validate(createSchema), (req, res, next) => {
  try {
    res.status(201).json({ data: projectService.create(req.user, req.body) });
  } catch (err) {
    next(err);
  }
});

router.get('/', (req, res, next) => {
  try {
    res.json({ data: projectService.list(req.user) });
  } catch (err) {
    next(err);
  }
});

router.get('/:id', (req, res, next) => {
  try {
    res.json({ data: projectService.getOwned(req.user, req.params.id) });
  } catch (err) {
    next(err);
  }
});

router.patch('/:id', validate(updateSchema), (req, res, next) => {
  try {
    res.json({ data: projectService.update(req.user, req.params.id, req.body) });
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', (req, res, next) => {
  try {
    projectService.remove(req.user, req.params.id);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

// Tasks are always addressed through their parent project.
router.use('/:projectId/tasks', taskRoutes);

module.exports = router;
