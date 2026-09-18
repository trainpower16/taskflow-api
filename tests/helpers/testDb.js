'use strict';

const database = require('../../src/config/database');

/** Opens a clean in-memory database for a test file. */
function setupDb() {
  database.connect();
}

/** Empties every table between tests so cases cannot leak state into each other. */
function resetDb() {
  const db = database.getDb();
  db.exec('DELETE FROM tasks; DELETE FROM projects; DELETE FROM users;');
}

function teardownDb() {
  database.close();
}

module.exports = { setupDb, resetDb, teardownDb };
