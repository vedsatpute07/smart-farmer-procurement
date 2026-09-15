const { rateLimit } = require("express-rate-limit");

function createLimiter(limit, windowMs, message) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    handler(_req, res) {
      res.status(429).json({
        success: false,
        message
      });
    }
  });
}

const apiLimiter = createLimiter(
  600,
  60 * 1000,
  "Too many requests. Please wait a minute."
);

const authLimiter = createLimiter(
  40,
  15 * 60 * 1000,
  "Too many login or registration requests. Please try again later."
);

const otpLimiter = createLimiter(
  40,
  10 * 60 * 1000,
  "Too many OTP requests. Please try again later."
);

const smsLimiter = createLimiter(
  10,
  10 * 60 * 1000,
  "Too many SMS requests. Please wait before sending more messages."
);

const paymentLimiter = createLimiter(
  20,
  10 * 60 * 1000,
  "Too many sandbox checkout requests. Please try again later."
);

module.exports = {
  apiLimiter,
  authLimiter,
  otpLimiter,
  smsLimiter,
  paymentLimiter
};