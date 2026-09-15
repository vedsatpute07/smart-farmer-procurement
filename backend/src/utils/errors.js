class AppError extends Error {
  constructor(statusCode, message, details = undefined) {
    super(message);
    this.name = "AppError";
    this.statusCode = statusCode;
    this.details = details;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

function asyncHandler(handler) {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

function assert(condition, statusCode, message) {
  if (!condition) {
    throw new AppError(statusCode, message);
  }
}

module.exports = {
  AppError,
  asyncHandler,
  assert
};