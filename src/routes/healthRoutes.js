'use strict';

const express = require('express');
const { config } = require('../config');
const database = require('../config/database');
const { register } = require('../monitoring/metrics');

const router = express.Router();
const startedAt = Date.now();

/** Liveness: is the process up? Used by the Docker HEALTHCHECK. */
router.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: config.appName,
    version: config.version,
    build: config.buildNumber,
    commit: config.gitCommit,
    env: config.env,
    uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000),
  });
});

/** Readiness: can the instance actually serve traffic? Gates the deployment. */
router.get('/ready', (_req, res) => {
  const dbReady = database.healthCheck();
  res.status(dbReady ? 200 : 503).json({
    status: dbReady ? 'ready' : 'not_ready',
    checks: { database: dbReady ? 'up' : 'down' },
  });
});

/** Prometheus scrape endpoint. */
router.get('/metrics', async (_req, res, next) => {
  try {
    res.set('Content-Type', register.contentType);
    res.send(await register.metrics());
  } catch (err) {
    next(err);
  }
});

module.exports = router;
