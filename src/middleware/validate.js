'use strict';

const { ValidationError } = require('../utils/errors');

function validate(schema, source = 'body') {
  return (req, _res, next) => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      const details = result.error.issues.map((issue) => ({
        field: issue.path.join('.') || source,
        message: issue.message,
      }));
      return next(new ValidationError('Request validation failed', details));
    }
    if (source === 'body') {
      req.body = result.data;
    } else {
      req.validated = { ...(req.validated || {}), [source]: result.data };
    }
    return next();
  };
}

module.exports = validate;
