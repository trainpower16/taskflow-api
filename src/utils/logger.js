'use strict';

const pino = require('pino');
const { config } = require('../config');

/**
 * Structured JSON logging. Container logs are the primary signal that the
 * Monitoring stage consumes, so every line is machine-parseable and carries
 * the build metadata that ties a log line back to a pipeline run.
 */
const logger = pino({
  level: config.logLevel,
  base: {
    service: config.appName,
    version: config.version,
    build: config.buildNumber,
    env: config.env,
  },
  redact: {
    paths: ['req.headers.authorization', 'password', '*.password', 'body.password'],
    censor: '[REDACTED]',
  },
  timestamp: pino.stdTimeFunctions.isoTime,
});

module.exports = logger;
