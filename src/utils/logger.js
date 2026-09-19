'use strict';

const pino = require('pino');
const { config } = require('../config');

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
