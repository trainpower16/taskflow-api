'use strict';

const { randomUUID } = require('node:crypto');
const { getDb } = require('../config/database');

/** Data access for users. All SQL is parameterised to prevent SQL injection. */
const userRepository = {
  create({ email, name, passwordHash, role = 'member' }) {
    const id = randomUUID();
    getDb()
      .prepare(
        'INSERT INTO users (id, email, name, password_hash, role) VALUES (?, ?, ?, ?, ?)'
      )
      .run(id, email.toLowerCase(), name, passwordHash, role);
    return this.findById(id);
  },

  findById(id) {
    return getDb()
      .prepare('SELECT id, email, name, role, created_at FROM users WHERE id = ?')
      .get(id);
  },

  findByEmail(email) {
    return getDb()
      .prepare('SELECT * FROM users WHERE email = ?')
      .get(String(email).toLowerCase());
  },

  list() {
    return getDb()
      .prepare('SELECT id, email, name, role, created_at FROM users ORDER BY created_at DESC')
      .all();
  },

  count() {
    return getDb().prepare('SELECT COUNT(*) AS c FROM users').get().c;
  },
};

module.exports = userRepository;
