'use strict';

const database = require('../../src/config/database');

function setupDb() {
  database.connect();
}

function resetDb() {
  const db = database.getDb();
  db.exec('DELETE FROM tasks; DELETE FROM projects; DELETE FROM users;');
}

function teardownDb() {
  database.close();
}

module.exports = { setupDb, resetDb, teardownDb };
