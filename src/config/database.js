'use strict';

const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');
const { config } = require('./index');
const logger = require('../utils/logger');

let db = null;

const SCHEMA = `
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS users (
    id            TEXT PRIMARY KEY,
    email         TEXT NOT NULL UNIQUE,
    name          TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    role          TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member')),
    created_at    TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS projects (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    owner_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS tasks (
    id          TEXT PRIMARY KEY,
    project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    title       TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    status      TEXT NOT NULL DEFAULT 'todo' CHECK (status IN ('todo', 'in_progress', 'done')),
    priority    TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high')),
    assignee_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    due_date    TEXT,
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_projects_owner ON projects(owner_id);
  CREATE INDEX IF NOT EXISTS idx_tasks_project  ON tasks(project_id);
  CREATE INDEX IF NOT EXISTS idx_tasks_status   ON tasks(status);
`;

function connect() {
  if (db) return db;

  const file = config.database.file;
  if (file !== ':memory:') {
    const dir = path.dirname(file);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.exec(SCHEMA);
  logger.info({ database: file }, 'database connected and schema applied');
  return db;
}

function getDb() {
  if (!db) return connect();
  return db;
}

function close() {
  if (db) {
    db.close();
    db = null;
  }
}

function healthCheck() {
  try {
    getDb().prepare('SELECT 1 AS ok').get();
    return true;
  } catch (err) {
    logger.error({ err }, 'database health check failed');
    return false;
  }
}

module.exports = { connect, getDb, close, healthCheck, SCHEMA };
