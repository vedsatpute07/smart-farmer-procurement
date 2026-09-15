const { AppError } = require("../utils/errors");

function notFound(_req, _res, next) {
  next(new AppError(404, "API route not found."));
}

function errorHandler(error, _req, res, _next) {
  let statusCode = error.isOperational ? error.statusCode : 500;
  let message = error.isOperational
    ? error.message
    : "Something went wrong. Please try again.";
  let details = error.isOperational ? error.details : undefined;

  if (error.code === 11000) {
    statusCode = 409;

    const keys = Object.keys(error.keyPattern || {});

    if (keys.includes("phone") || keys.includes("email")) {
      message = "An account with these contact details already exists.";
    } else if (keys.includes("farmer") && keys.includes("date")) {
      message = "You already have a non-cancelled booking for this date.";
    } else if (keys.includes("centre") && keys.includes("date")) {
      message = "This operation conflicts with an existing slot or active token.";
    } else {
      message = "A matching record already exists. Refresh before trying again.";
    }
  }

  if (error.name === "ValidationError") {
    statusCode = 400;
    message = "Invalid record data.";

    details = Object.values(error.errors).map((item) => ({
      field: item.path,
      message: item.kind === "user defined"
        ? item.message
        : "This field has an invalid value."
    }));
  }

  if (error.name === "CastError") {
    statusCode = 400;
    message = "Invalid record identifier or field value.";
  }

  if (error.name === "StrictModeError") {
    statusCode = 400;
    message = "The request contains an unsupported field.";
  }

  if (error.type === "entity.parse.failed") {
    statusCode = 400;
    message = "Request body must contain valid JSON.";
  }

  if (error.type === "entity.too.large") {
    statusCode = 413;
    message = "Request body is too large.";
  }

  if (
    error.name === "MongoServerSelectionError" ||
    error.name === "MongoNetworkError" ||
    error.name === "MongoNetworkTimeoutError"
  ) {
    statusCode = 503;
    message = "The database is temporarily unavailable. Please try again.";
  }

  if (error.hasErrorLabel?.("TransientTransactionError")) {
    statusCode = 409;
    message = "Records changed during this operation. Refresh and try again.";
  }

  if (error.hasErrorLabel?.("UnknownTransactionCommitResult")) {
    statusCode = 503;
    message =
      "The operation outcome could not be confirmed. Check your saved records before retrying.";
  }

  if (statusCode >= 500) {
    // Never log request bodies, credentials, raw URIs or provider error objects.
    console.error("API operation failed:", {
      name: error.name || "Error",
      code: error.code || "INTERNAL_ERROR"
    });
  }

  res.status(statusCode).json({
    success: false,
    message,
    ...(details ? { errors: details } : {})
  });
}

module.exports = {
  notFound,
  errorHandler
};