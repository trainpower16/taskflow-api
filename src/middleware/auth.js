'use strict';

const authService = require('../services/authService');
const userRepository = require('../repositories/userRepository');
const { UnauthorizedError, ForbiddenError } = require('../utils/errors');

/** Verifies the bearer token and attaches the current user to the request. */
function authenticate(req, _res, next) {
  try {
    const header = req.headers.authorization || '';
    const [scheme, token] = header.split(' ');
    if (scheme !== 'Bearer' || !token) {
      throw new UnauthorizedError('A Bearer token is required');
    }

    const payload = authService.verifyToken(token);
    const user = userRepository.findById(payload.sub);
    if (!user) throw new UnauthorizedError('Token refers to a user that no longer exists');

    req.user = user;
    return next();
  } catch (err) {
    return next(err);
  }
}

/** Role gate, used for the admin-only endpoints. */
function requireRole(...roles) {
  return (req, _res, next) => {
    if (!req.user) return next(new UnauthorizedError());
    if (!roles.includes(req.user.role)) {
      return next(new ForbiddenError(`Requires one of: ${roles.join(', ')}`));
    }
    return next();
  };
}

module.exports = { authenticate, requireRole };
