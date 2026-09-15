const { AppError } = require("../utils/errors");

function validate(schema, source = "body") {
  return (req, _res, next) => {
    const result = schema.safeParse(req[source]);

    if (!result.success) {
      const errors = result.error.issues.map((issue) => ({
        field: issue.path.join("."),
        message: issue.message
      }));

      return next(
        new AppError(
          400,
          errors[0]?.message || "Invalid request data.",
          errors
        )
      );
    }

    req[source] = result.data;
    next();
  };
}

function validateObjectIds(req, _res, next) {
  for (const [key, value] of Object.entries(req.params)) {
    if (
      (key === "id" || key.endsWith("Id")) &&
      !/^[a-f\d]{24}$/i.test(value)
    ) {
      return next(
        new AppError(400, `Invalid ${key}.`)
      );
    }
  }

  next();
}

module.exports = {
  validate,
  validateObjectIds
};