'use strict';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret-that-is-long-enough-for-tests';
process.env.DATABASE_FILE = ':memory:';
process.env.LOG_LEVEL = 'silent';
