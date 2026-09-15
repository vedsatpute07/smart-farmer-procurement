const express = require("express");
const cors = require("cors");
const helmet = require("helmet");

const env = require("./config/env");
const routes = require("./routes");
const { apiLimiter } = require("./middleware/rateLimits");
const {
  notFound,
  errorHandler
} = require("./middleware/errorHandler");

const app = express();

app.disable("x-powered-by");

/*
 * Scalar query parsing prevents nested request query objects.
 * Zod schemas additionally reject unknown keys and unexpected input types.
 */
app.set("query parser", "simple");

app.use(helmet());

app.use(cors({
  origin: env.frontendUrl,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: false
}));

app.use(express.json({
  limit: "32kb",
  strict: true
}));

app.use("/api", (_req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  next();
});

app.use("/api", apiLimiter, routes);

app.use(notFound);
app.use(errorHandler);

module.exports = app;