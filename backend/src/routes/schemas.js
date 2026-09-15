const { z } = require("zod");

const {
  QUEUE_STATUSES,
  PROCUREMENT_STATUSES,
  PAYMENT_STATUSES
} = require("../models");

const {
  isValidDateString,
  isValidTime
} = require("../utils/dates");

const id = z.string()
  .regex(/^[a-f\d]{24}$/i, "Invalid record identifier.");

const date = z.string()
  .refine(isValidDateString, "Enter a valid date in YYYY-MM-DD format.");

const time = z.string()
  .refine(isValidTime, "Enter a valid 24-hour time in HH:mm format.");

const name = z.string()
  .trim()
  .min(2, "Name must contain at least two characters.")
  .max(80);

const phone = z.string()
  .trim()
  .regex(
    /^\+[1-9]\d{7,14}$/,
    "Use an international phone number including country code."
  );

const email = z.string()
  .trim()
  .toLowerCase()
  .email("Enter a valid email address.")
  .max(160);

const password = z.string()
  .min(8, "Password must contain at least eight characters.")
  .max(72, "Password must contain at most 72 characters.")
  .regex(/[a-z]/, "Password must include a lowercase letter.")
  .regex(/[A-Z]/, "Password must include an uppercase letter.")
  .regex(/\d/, "Password must include a number.")
  .refine(
    (value) => Buffer.byteLength(value, "utf8") <= 72,
    "Password must contain at most 72 UTF-8 bytes."
  );

const village = z.string().trim().max(100);
const district = z.string().trim().max(100);
const address = z.string().trim().max(250);
const notes = z.string().trim().max(500);
const crop = z.string().trim().min(2).max(60);
const quantityKg = z.number().finite().min(1).max(1000000);

const queryBoolean = z.enum(["true", "false"])
  .transform((value) => value === "true");

/*
 * Query numbers must be scalar, non-empty strings before conversion.
 * z.coerce.number() alone would interpret an empty string as zero.
 */
function queryNumber(min, max, defaultValue, integer = false) {
  const numberSchema = integer
    ? z.number().finite().int().min(min).max(max)
    : z.number().finite().min(min).max(max);

  const result = z.string()
    .trim()
    .min(1, "A numeric query value cannot be empty.")
    .transform(Number)
    .pipe(numberSchema);

  return defaultValue === undefined
    ? result
    : result.default(String(defaultValue));
}

const pagination = {
  page: queryNumber(1, 100000, 1, true),
  limit: queryNumber(1, 100, 20, true)
};

function nonEmpty(schema) {
  return schema.refine(
    (value) => Object.keys(value).length > 0,
    "Provide at least one field to update."
  );
}

const emptyBody = z.object({}).strict();
const emptyQuery = z.object({}).strict();

const register = z.object({
  name,
  phone,
  email,
  password,
  village: village.default(""),
  district: district.default(""),
  address: address.default("")
}).strict();

const login = z.object({
  identifier: z.string()
    .trim()
    .min(3)
    .max(160)
    .refine(
      (value) =>
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) ||
        /^\+[1-9]\d{7,14}$/.test(value),
      "Enter a valid email or international phone number."
    ),
  password: z.string().min(1).max(200)
}).strict();

const verifyOtp = z.object({
  challengeId: z.string().uuid("Invalid OTP challenge."),
  otp: z.string().regex(/^\d{6}$/, "OTP must contain exactly six digits.")
}).strict();

const resendOtp = z.object({
  challengeId: z.string().uuid("Invalid OTP challenge.")
}).strict();

const profileUpdate = nonEmpty(z.object({
  name: name.optional(),
  village: village.optional(),
  district: district.optional(),
  address: address.optional()
}).strict());

const farmerUpdate = nonEmpty(z.object({
  name: name.optional(),
  village: village.optional(),
  district: district.optional(),
  address: address.optional(),
  active: z.boolean().optional()
}).strict());

const centreFields = {
  name: z.string().trim().min(3).max(120),
  address: z.string().trim().min(5).max(250),
  district: z.string().trim().min(2).max(100),
  phone,
  workingHours: z.string().trim().min(3).max(100),
  crops: z.array(crop)
    .min(1)
    .max(20)
    .refine(
      (values) => new Set(values).size === values.length,
      "Crop names must be unique."
    ),
  latitude: z.number().finite().min(-90).max(90),
  longitude: z.number().finite().min(-180).max(180)
};

const centreCreate = z.object(centreFields).strict();

const centreUpdate = nonEmpty(
  z.object(centreFields)
    .partial()
    .extend({
      active: z.boolean().optional()
    })
    .strict()
).refine(
  (value) =>
    (value.latitude === undefined) === (value.longitude === undefined),
  "Provide latitude and longitude together."
);

const centreList = z.object({
  ...pagination,
  search: z.string().trim().max(100).optional(),
  district: z.string().trim().max(100).optional(),
  date: date.optional(),
  includeInactive: queryBoolean.optional()
}).strict();

const centreDetail = z.object({
  date: date.optional()
}).strict();

const nearby = z.object({
  latitude: queryNumber(-90, 90),
  longitude: queryNumber(-180, 180),
  radiusKm: queryNumber(1, 500, 100),
  limit: queryNumber(1, 100, 50, true),
  date: date.optional()
}).strict();

const slotCreate = z.object({
  centreId: id,
  date,
  startTime: time,
  endTime: time,
  capacity: z.number().int().min(1).max(500)
}).strict();

const slotUpdate = nonEmpty(z.object({
  date: date.optional(),
  startTime: time.optional(),
  endTime: time.optional(),
  capacity: z.number().int().min(1).max(500).optional(),
  active: z.boolean().optional()
}).strict());

const slotList = z.object({
  ...pagination,
  centreId: id.optional(),
  date: date.optional(),
  includeInactive: queryBoolean.optional()
}).strict();

const bookingCreate = z.object({
  centreId: id,
  slotId: id,
  crop,
  quantityKg
}).strict();

const bookingUpdate = nonEmpty(z.object({
  crop: crop.optional(),
  quantityKg: quantityKg.optional()
}).strict());

const bookingList = z.object({
  ...pagination,
  centreId: id.optional(),
  date: date.optional(),
  status: z.enum(["Booked", "Cancelled", "Completed"]).optional()
}).strict();

const tokenQuery = z.object({
  date: date.optional()
}).strict();

const queueQuery = z.object({
  date: date.optional()
}).strict();

const queueStatusQuery = z.object({
  bookingId: id.optional(),
  centreId: id.optional(),
  date: date.optional()
}).strict();

const queueNext = z.object({
  centreId: id.optional(),
  date: date.optional()
}).strict();

const queueUpdate = z.object({
  status: z.enum(QUEUE_STATUSES)
}).strict();

const procurementList = z.object({
  ...pagination,
  bookingId: id.optional(),
  centreId: id.optional(),
  date: date.optional(),
  status: z.enum(PROCUREMENT_STATUSES).optional()
}).strict();

const paymentList = z.object({
  ...pagination,
  bookingId: id.optional(),
  centreId: id.optional(),
  date: date.optional(),
  status: z.enum(PAYMENT_STATUSES).optional()
}).strict();

const procurementUpdate = z.object({
  status: z.enum(PROCUREMENT_STATUSES),
  actualQuantityKg: quantityKg.optional(),
  notes: notes.optional()
}).strict().refine(
  (value) =>
    value.actualQuantityKg === undefined ||
    value.status === "Procurement Completed",
  "Actual quantity is recorded when procurement is completed."
);

const paymentUpdate = z.object({
  status: z.enum(PAYMENT_STATUSES),
  amountRupees: z.number()
    .finite()
    .min(0)
    .max(100000000)
    .refine(
      (value) =>
        Math.abs(value * 100 - Math.round(value * 100)) < 0.00001,
      "Amount must have at most two decimal places."
    )
    .optional(),
  reference: z.string().trim().max(100).optional(),
  notes: notes.optional()
}).strict();

const notificationList = z.object({
  ...pagination,
  unreadOnly: queryBoolean.optional()
}).strict();

const manualSms = z.object({
  userId: id,
  bookingId: id.optional(),
  message: z.string().trim().min(5).max(900)
}).strict();

const farmerList = z.object({
  ...pagination,
  search: z.string().trim().max(100).optional()
}).strict();

const verifyTestPayment = z.object({
  razorpay_order_id: z.string()
    .regex(/^order_[A-Za-z0-9]+$/, "Invalid Razorpay order ID.")
    .max(100),
  razorpay_payment_id: z.string()
    .regex(/^pay_[A-Za-z0-9]+$/, "Invalid Razorpay payment ID.")
    .max(100),
  razorpay_signature: z.string()
    .regex(/^[a-f\d]{64}$/i, "Invalid Razorpay signature format.")
}).strict();

module.exports = {
  emptyBody,
  emptyQuery,
  register,
  login,
  verifyOtp,
  resendOtp,
  profileUpdate,
  farmerUpdate,
  centreCreate,
  centreUpdate,
  centreList,
  centreDetail,
  nearby,
  slotCreate,
  slotUpdate,
  slotList,
  bookingCreate,
  bookingUpdate,
  bookingList,
  tokenQuery,
  queueQuery,
  queueStatusQuery,
  queueNext,
  queueUpdate,
  procurementList,
  paymentList,
  procurementUpdate,
  paymentUpdate,
  notificationList,
  manualSms,
  farmerList,
  verifyTestPayment
};