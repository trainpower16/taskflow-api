'use strict';

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { config } = require('../config');
const userRepository = require('../repositories/userRepository');
const { ConflictError, UnauthorizedError } = require('../utils/errors');

/**
 * Authentication use-cases. Passwords are never stored or logged in plain text
 * and the hash is stripped from every object returned to the transport layer.
 */
const authService = {
  async register({ email, name, password, role = 'member' }) {
    if (userRepository.findByEmail(email)) {
      throw new ConflictError('A user with that email already exists');
    }
    const passwordHash = await bcrypt.hash(password, config.auth.bcryptRounds);
    return userRepository.create({ email, name, passwordHash, role });
  },

  async login({ email, password }) {
    const user = userRepository.findByEmail(email);
    // The same generic error is returned for an unknown email and a wrong
    // password so the endpoint cannot be used to enumerate valid accounts.
    if (!user) throw new UnauthorizedError('Invalid email or password');

    const matches = await bcrypt.compare(password, user.password_hash);
    if (!matches) throw new UnauthorizedError('Invalid email or password');

    return {
      token: this.issueToken(user),
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
    };
  },

  issueToken(user) {
    return jwt.sign(
      { sub: user.id, email: user.email, role: user.role },
      config.auth.jwtSecret,
      { expiresIn: config.auth.jwtExpiresIn }
    );
  },

  verifyToken(token) {
    try {
      return jwt.verify(token, config.auth.jwtSecret);
    } catch {
      throw new UnauthorizedError('Invalid or expired token');
    }
  },
};

module.exports = authService;
