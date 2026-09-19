'use strict';

const { config, validateProductionConfig } = require('./config');
const database = require('./config/database');
const logger = require('./utils/logger');
const createApp = require('./app');

const configErrors = validateProductionConfig();
if (configErrors.length > 0) {
  logger.fatal({ configErrors }, 'refusing to start with an invalid production configuration');
  process.exit(1);
}

database.connect();

const app = createApp();
const server = app.listen(config.port, config.host, () => {
  logger.info({ port: config.port, commit: config.gitCommit }, 'taskflow-api started');
});

function shutdown(signal) {
  logger.info({ signal }, 'shutdown signal received');
  const timer = setTimeout(() => {
    logger.error('graceful shutdown timed out, forcing exit');
    process.exit(1);
  }, config.shutdownTimeoutMs);
  timer.unref();

  server.close(() => {
    database.close();
    logger.info('shutdown complete');
    process.exit(0);
  });
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('unhandledRejection', (reason) => {
  logger.error({ reason }, 'unhandled promise rejection');
});

module.exports = server;
