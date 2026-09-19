'use strict';

function catchError(fn) {
  try {
    fn();
  } catch (err) {
    return err;
  }
  throw new Error('Expected the function to throw, but it returned normally');
}

module.exports = catchError;
