'use strict';

const express = require('express');
const { z } = require('zod');
const taskService = require('../services/taskService');
const validate = require('../middleware/validate');

// mergeParams gives this router access to :projectId from the parent route.
const router = express.Router({ mergeParams: true });

const createSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  status: z.enum(['todo', 'in_progress', 'done']).optional(),
  priority: z.enum(['low', 'medium', 'high']).optional(),
  dueDate: z.string().date().optional(),
});

const updateSchema = createSchema.partial();

/** Maps the camelCase API contract onto the snake_case database columns. */
const toColumns = (body) => ({
  title: body.title,
  description: body.description,
  status: body.status,
  priority: body.priority,
  due_date: body.dueDate,
});

router.post('/', validate(createSchema), (req, res, next) => {
  try {
    const task = taskService.create(req.user, req.params.projectId, {
      ...req.body,
      dueDate: req.body.dueDate ?? null,
    });
    res.status(201).json({ data: task });
  } catch (err) {
    next(err);
  }
});

router.get('/', (req, res, next) => {
  try {
    const tasks = taskService.list(req.user, req.params.projectId, { status: req.query.status });
    res.json({ data: tasks });
  } catch (err) {
    next(err);
  }
});

router.get('/:taskId', (req, res, next) => {
  try {
    res.json({ data: taskService.get(req.user, req.params.projectId, req.params.taskId) });
  } catch (err) {
    next(err);
  }
});

router.patch('/:taskId', validate(updateSchema), (req, res, next) => {
  try {
    const task = taskService.update(
      req.user,
      req.params.projectId,
      req.params.taskId,
      toColumns(req.body)
    );
    res.json({ data: task });
  } catch (err) {
    next(err);
  }
});

router.delete('/:taskId', (req, res, next) => {
  try {
    taskService.remove(req.user, req.params.projectId, req.params.taskId);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

module.exports = router;
