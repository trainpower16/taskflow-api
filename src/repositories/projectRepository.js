'use strict';

const { randomUUID } = require('node:crypto');
const { getDb } = require('../config/database');

const projectRepository = {
  create({ name, description = '', ownerId }) {
    const id = randomUUID();
    getDb()
      .prepare('INSERT INTO projects (id, name, description, owner_id) VALUES (?, ?, ?, ?)')
      .run(id, name, description, ownerId);
    return this.findById(id);
  },

  findById(id) {
    return getDb().prepare('SELECT * FROM projects WHERE id = ?').get(id);
  },

  /** Admins see every project; members only see the ones they own. */
  listForUser(userId, { isAdmin = false, limit = 50, offset = 0 } = {}) {
    if (isAdmin) {
      return getDb()
        .prepare('SELECT * FROM projects ORDER BY created_at DESC LIMIT ? OFFSET ?')
        .all(limit, offset);
    }
    return getDb()
      .prepare(
        'SELECT * FROM projects WHERE owner_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?'
      )
      .all(userId, limit, offset);
  },

  update(id, fields) {
    const allowed = ['name', 'description'];
    const entries = Object.entries(fields).filter(
      ([key, value]) => allowed.includes(key) && value !== undefined
    );
    if (entries.length === 0) return this.findById(id);

    const setClause = entries.map(([key]) => `${key} = ?`).join(', ');
    const values = entries.map(([, value]) => value);
    getDb()
      .prepare(`UPDATE projects SET ${setClause}, updated_at = datetime('now') WHERE id = ?`)
      .run(...values, id);
    return this.findById(id);
  },

  remove(id) {
    return getDb().prepare('DELETE FROM projects WHERE id = ?').run(id).changes > 0;
  },

  count() {
    return getDb().prepare('SELECT COUNT(*) AS c FROM projects').get().c;
  },
};

module.exports = projectRepository;
