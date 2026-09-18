'use strict';

const { AppError, NotFoundError } = require('../utils/errors');
const logger = require('../utils/logger');
const { config } = require('../config');

/** Terminal 404 handler for any route that did not match. */
function notFoundHandler(req, _res, next) {
  next(new NotFoundError(`Route ${req.method} ${req.originalUrl}`));
}

/**
 * Single error funnel. Operational errors are reported faithfully; anything
 * unexpected is logged in full but reported to the client as a generic 500 so
 * that stack traces and internals never leak off the server.
 */
// The unused fourth parameter is required: Express identifies error-handling
// middleware by its arity, so removing it would silently disable this handler.
function errorHandler(err, req, res, _next) {
  const isOperational = err instanceof AppError && err.isOperational;
  const statusCode = isOperational ? err.statusCode : 500;

  if (statusCode >= 500) {
    logger.error({ err, path: req.originalUrl, method: req.method }, 'unhandled request error');
  } else {
    logger.warn({ code: err.code, path: req.originalUrl, method: req.method }, err.message);
  }

  res.status(statusCode).json({
    error: {
      code: isOperational ? err.code : 'INTERNAL_ERROR',
      message: isOperational ? err.message : 'An unexpected error occurred',
      ...(isOperational && err.details ? { details: err.details } : {}),
      ...(config.isProduction ? {} : { requestId: req.id }),
    },
  });
}

module.exports = { notFoundHandler, errorHandler };
