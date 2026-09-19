'use strict';

const { AppError, NotFoundError } = require('../utils/errors');
const logger = require('../utils/logger');
const { config } = require('../config');

function notFoundHandler(req, _res, next) {
  next(new NotFoundError(`Route ${req.method} ${req.originalUrl}`));
}

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
