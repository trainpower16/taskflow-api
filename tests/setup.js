'use strict';

// Every test run uses an isolated in-memory database and a fixed secret so the
// suite is hermetic and produces identical results on a developer machine and
// on the Jenkins agent.
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret-that-is-long-enough-for-tests';
process.env.DATABASE_FILE = ':memory:';
process.env.LOG_LEVEL = 'silent';
