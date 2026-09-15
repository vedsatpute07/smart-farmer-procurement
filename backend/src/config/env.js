const path = require("node:path");
const dotenv = require("dotenv");
const { z } = require("zod");

dotenv.config({
  path: path.resolve(__dirname, "../../.env")
});

const durationPattern = /^([1-9]\d{0,5})(s|m|h|d)$/;

function validDuration(value) {
  const match = durationPattern.exec(value);

  if (!match) {
    return false;
  }

  const multipliers = { s: 1, m: 60, h: 3600, d: 86400 };
  const seconds = Number(match[1]) * multipliers[match[2]];

  return seconds >= 60 && seconds <= 7 * 86400;
}

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"])
    .default("development"),

  PORT: z.coerce.number().int().min(1).max(65535).default(5000),

  FRONTEND_URL: z.string().url().default("http://localhost:5173"),

  MONGODB_URI: z.string().min(1).default(
    "mongodb://127.0.0.1:27017/farmer_procurement?replicaSet=rs0"
  ),

  JWT_SECRET: z.string().min(32),
  JWT_EXPIRES_IN: z.string().default("8h").refine(validDuration),

  OTP_HASH_SECRET: z.string().min(32),
  OTP_TTL_SECONDS: z.coerce.number().int().min(60).max(900).default(300),
  OTP_RESEND_COOLDOWN_SECONDS: z.coerce.number().int().min(30).max(300).default(60),
  OTP_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(10).default(5),

  SMS_MODE: z.enum(["mock", "twilio"]).default("mock"),
  TWILIO_ACCOUNT_SID: z.string().default(""),
  TWILIO_AUTH_TOKEN: z.string().default(""),
  TWILIO_PHONE_NUMBER: z.string().default(""),

  PAYMENT_MODE: z.enum(["monitoring", "razorpay_test"]).default("monitoring"),
  RAZORPAY_KEY_ID: z.string().default(""),
  RAZORPAY_KEY_SECRET: z.string().default(""),
  RAZORPAY_WEBHOOK_SECRET: z.string().default("")
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  const fields = [...new Set(
    parsed.error.issues.map((issue) => issue.path.join("."))
  )];

  throw new Error(
    `Invalid backend environment configuration: ${fields.join(", ")}. ` +
    "Check backend/.env.example. Secret values are not logged."
  );
}

const values = parsed.data;
const origin = new URL(values.FRONTEND_URL);

if (
  !["http:", "https:"].includes(origin.protocol) ||
  origin.origin !== values.FRONTEND_URL
) {
  throw new Error(
    "FRONTEND_URL must be an HTTP/HTTPS origin without a path or trailing slash."
  );
}

if (!/^mongodb(\+srv)?:\/\//.test(values.MONGODB_URI)) {
  throw new Error("MONGODB_URI must be a MongoDB connection string.");
}

if (values.JWT_SECRET === values.OTP_HASH_SECRET) {
  throw new Error("JWT_SECRET and OTP_HASH_SECRET must be different.");
}

if (
  values.OTP_RESEND_COOLDOWN_SECONDS >= values.OTP_TTL_SECONDS
) {
  throw new Error(
    "OTP_RESEND_COOLDOWN_SECONDS must be smaller than OTP_TTL_SECONDS."
  );
}

if (values.SMS_MODE === "twilio") {
  if (
    !/^AC[a-f\d]{32}$/i.test(values.TWILIO_ACCOUNT_SID) ||
    !values.TWILIO_AUTH_TOKEN ||
    !/^\+[1-9]\d{7,14}$/.test(values.TWILIO_PHONE_NUMBER)
  ) {
    throw new Error(
      "Twilio mode requires a valid Account SID, Auth Token and E.164 sender number."
    );
  }
}

if (
  values.PAYMENT_MODE === "razorpay_test" &&
  (
    !values.RAZORPAY_KEY_ID.startsWith("rzp_test_") ||
    !values.RAZORPAY_KEY_SECRET
  )
) {
  throw new Error(
    "razorpay_test mode requires a Razorpay TEST Key ID and TEST Key Secret."
  );
}

if (values.RAZORPAY_KEY_ID.startsWith("rzp_live_")) {
  throw new Error("Live Razorpay keys are not permitted in this MVP.");
}

if (
  values.NODE_ENV === "production" &&
  (
    values.SMS_MODE === "mock" ||
    values.PAYMENT_MODE === "razorpay_test"
  )
) {
  throw new Error(
    "Mock SMS and the Razorpay sandbox demonstration are development-only."
  );
}

module.exports = Object.freeze({
  nodeEnv: values.NODE_ENV,
  port: values.PORT,
  frontendUrl: values.FRONTEND_URL,
  mongodbUri: values.MONGODB_URI,
  jwtSecret: values.JWT_SECRET,
  jwtExpiresIn: values.JWT_EXPIRES_IN,
  otpHashSecret: values.OTP_HASH_SECRET,
  otpTtlSeconds: values.OTP_TTL_SECONDS,
  otpResendCooldownSeconds: values.OTP_RESEND_COOLDOWN_SECONDS,
  otpMaxAttempts: values.OTP_MAX_ATTEMPTS,
  smsMode: values.SMS_MODE,
  twilioAccountSid: values.TWILIO_ACCOUNT_SID,
  twilioAuthToken: values.TWILIO_AUTH_TOKEN,
  twilioPhoneNumber: values.TWILIO_PHONE_NUMBER,
  paymentMode: values.PAYMENT_MODE,
  razorpayKeyId: values.RAZORPAY_KEY_ID,
  razorpayKeySecret: values.RAZORPAY_KEY_SECRET
});