'use strict';

const { randomUUID } = require('node:crypto');
const { getDb } = require('../config/database');

const taskRepository = {
  create({ projectId, title, description = '', status = 'todo', priority = 'medium', assigneeId = null, dueDate = null }) {
    const id = randomUUID();
    getDb()
      .prepare(
        `INSERT INTO tasks (id, project_id, title, description, status, priority, assignee_id, due_date)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(id, projectId, title, description, status, priority, assigneeId, dueDate);
    return this.findById(id);
  },

  findById(id) {
    return getDb().prepare('SELECT * FROM tasks WHERE id = ?').get(id);
  },

  /** Lists the tasks of a project, optionally filtered by status. */
  listByProject(projectId, { status, limit = 50, offset = 0 } = {}) {
    if (status) {
      return getDb()
        .prepare(
          `SELECT * FROM tasks WHERE project_id = ? AND status = ?
           ORDER BY created_at DESC LIMIT ? OFFSET ?`
        )
        .all(projectId, status, limit, offset);
    }
    return getDb()
      .prepare('SELECT * FROM tasks WHERE project_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?')
      .all(projectId, limit, offset);
  },

  update(id, fields) {
    const allowed = ['title', 'description', 'status', 'priority', 'assignee_id', 'due_date'];
    const entries = Object.entries(fields).filter(
      ([key, value]) => allowed.includes(key) && value !== undefined
    );
    if (entries.length === 0) return this.findById(id);

    const setClause = entries.map(([key]) => `${key} = ?`).join(', ');
    const values = entries.map(([, value]) => value);
    getDb()
      .prepare(`UPDATE tasks SET ${setClause}, updated_at = datetime('now') WHERE id = ?`)
      .run(...values, id);
    return this.findById(id);
  },

  remove(id) {
    return getDb().prepare('DELETE FROM tasks WHERE id = ?').run(id).changes > 0;
  },

  /** Task counts grouped by status — exported to Prometheus as a business metric. */
  countByStatus() {
    const rows = getDb().prepare('SELECT status, COUNT(*) AS c FROM tasks GROUP BY status').all();
    const counts = { todo: 0, in_progress: 0, done: 0 };
    for (const row of rows) {
      counts[row.status] = row.c;
    }
    return counts;
  },
};

module.exports = taskRepository;
