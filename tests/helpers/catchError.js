'use strict';

/**
 * Runs fn and returns the error it threw, so assertions about the error can be
 * made unconditionally rather than inside a catch block.
 */
function catchError(fn) {
  try {
    fn();
  } catch (err) {
    return err;
  }
  throw new Error('Expected the function to throw, but it returned normally');
}

module.exports = catchError;
