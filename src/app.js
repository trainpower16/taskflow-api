'use strict';

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const { randomUUID } = require('node:crypto');
const { config } = require('./config');
const { metricsMiddleware } = require('./monitoring/metrics');
const { notFoundHandler, errorHandler } = require('./middleware/errorHandler');
const healthRoutes = require('./routes/healthRoutes');
const authRoutes = require('./routes/authRoutes');
const projectRoutes = require('./routes/projectRoutes');

/**
 * Builds the Express application. The app is kept separate from the HTTP
 * server so the integration tests can exercise it in-process with supertest.
 */
function createApp() {
  const app = express();

  app.disable('x-powered-by');
  app.use(helmet());
  app.use(cors());
  app.use(compression());
  app.use(express.json({ limit: '100kb' }));

  // A correlation id on every request ties API responses to log lines.
  app.use((req, res, next) => {
    req.id = req.headers['x-request-id'] || randomUUID();
    res.setHeader('X-Request-Id', req.id);
    next();
  });

  app.use(metricsMiddleware);

  // Health and metrics are deliberately mounted before the rate limiter so
  // that probes and Prometheus scrapes can never be throttled.
  app.use('/', healthRoutes);

  app.use(
    rateLimit({
      windowMs: config.rateLimit.windowMs,
      max: config.rateLimit.max,
      standardHeaders: true,
      legacyHeaders: false,
      message: { error: { code: 'RATE_LIMITED', message: 'Too many requests' } },
    })
  );

  app.use('/api/auth', authRoutes);
  app.use('/api/projects', projectRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

module.exports = createApp;
