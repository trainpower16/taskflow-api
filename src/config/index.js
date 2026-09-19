'use strict';

const parseIntOr = (value, fallback) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
};

const env = process.env.NODE_ENV || 'development';

const config = {
  env,
  isProduction: env === 'production',
  isTest: env === 'test',
  appName: 'taskflow-api',
  version: process.env.APP_VERSION || require('../../package.json').version,
  buildNumber: process.env.BUILD_NUMBER || 'local',
  gitCommit: process.env.GIT_COMMIT || 'unknown',
  port: parseIntOr(process.env.PORT, 3000),
  host: process.env.HOST || '0.0.0.0',
  logLevel: process.env.LOG_LEVEL || (env === 'test' ? 'silent' : 'info'),
  database: {
    file: process.env.DATABASE_FILE || (env === 'test' ? ':memory:' : './data/taskflow.db'),
  },
  auth: {
    jwtSecret: process.env.JWT_SECRET || 'dev-only-insecure-secret-change-me',
    jwtExpiresIn: process.env.JWT_EXPIRES_IN || '1h',
    bcryptRounds: parseIntOr(process.env.BCRYPT_ROUNDS, env === 'test' ? 4 : 12),
  },
  rateLimit: {
    windowMs: parseIntOr(process.env.RATE_LIMIT_WINDOW_MS, 15 * 60 * 1000),
    max: parseIntOr(process.env.RATE_LIMIT_MAX, env === 'test' ? 10000 : 300),
  },
  shutdownTimeoutMs: parseIntOr(process.env.SHUTDOWN_TIMEOUT_MS, 10000),
};

function validateProductionConfig(cfg = config) {
  const errors = [];
  if (cfg.isProduction) {
    if (!process.env.JWT_SECRET) {
      errors.push('JWT_SECRET must be set in production');
    } else if (process.env.JWT_SECRET.length < 32) {
      errors.push('JWT_SECRET must be at least 32 characters in production');
    }
  }
  return errors;
}

module.exports = { config, validateProductionConfig };
