const express = require("express");
const mongoose = require("mongoose");

const env = require("../config/env");
const schemas = require("./schemas");
const { ok } = require("../utils/responses");
const { asyncHandler } = require("../utils/errors");

const {
  authenticate,
  authorize
} = require("../middleware/auth");

const {
  validate,
  validateObjectIds
} = require("../middleware/validate");

const {
  authLimiter,
  otpLimiter,
  smsLimiter,
  paymentLimiter
} = require("../middleware/rateLimits");

const auth = require("../controllers/authController");
const users = require("../controllers/userController");
const centres = require("../controllers/centreController");
const slots = require("../controllers/slotController");
const bookings = require("../controllers/bookingController");
const queue = require("../controllers/queueController");
const records = require("../controllers/recordController");
const notifications = require("../controllers/notificationController");
const admin = require("../controllers/adminController");

const router = express.Router();

const adminOnly = authorize("admin");
const operators = authorize("staff", "admin");
const farmerOnly = authorize("farmer");

const body = (schema) => validate(schema, "body");
const query = (schema) => validate(schema, "query");
const ids = validateObjectIds;
const handle = asyncHandler;

// Public health endpoint.
router.get("/health", (_req, res) => {
  const connected = mongoose.connection.readyState === 1;

  return ok(
    res,
    {
      service: "MANDI LIVE API",
      database: connected ? "connected" : "unavailable"
    },
    connected ? "API is healthy." : "Database unavailable.",
    connected ? 200 : 503
  );
});

// Authentication: full access JWTs are issued only after login OTP verification.
router.post(
  "/auth/register",
  authLimiter,
  body(schemas.register),
  handle(auth.register)
);

router.post(
  "/auth/login",
  authLimiter,
  body(schemas.login),
  handle(auth.login)
);

router.post(
  "/auth/verify-otp",
  otpLimiter,
  body(schemas.verifyOtp),
  handle(auth.verifyOtp)
);

router.post(
  "/auth/resend-otp",
  otpLimiter,
  body(schemas.resendOtp),
  handle(auth.resendOtp)
);

router.post(
  "/auth/logout",
  authenticate,
  body(schemas.emptyBody),
  handle(auth.logout)
);

// All subsequent routes require a verified, active database-backed session.
router.use(authenticate);

// Public-to-authenticated-client configuration only. No private keys.
router.get("/config", query(schemas.emptyQuery), (_req, res) => {
  return ok(res, {
    smsMode: env.smsMode,
    paymentMode: env.paymentMode,
    sandboxCheckoutEnabled: env.paymentMode === "razorpay_test",
    timeZone: "Asia/Kolkata",
    googleMapsConfiguredByFrontend: true
  });
});

// Profile.
router.get("/users/profile", handle(users.getProfile));

router.put(
  "/users/profile",
  body(schemas.profileUpdate),
  handle(users.updateProfile)
);

// Centre discovery: static paths precede /:id.
router.get(
  "/centres/nearby",
  query(schemas.nearby),
  handle(centres.nearbyCentres)
);

router.get(
  "/centres",
  query(schemas.centreList),
  handle(centres.listCentres)
);

router.post(
  "/centres",
  adminOnly,
  body(schemas.centreCreate),
  handle(centres.createCentre)
);

router.get(
  "/centres/:centreId/slots",
  ids,
  query(schemas.slotList),
  handle(slots.listSlots)
);

router.get(
  "/centres/:id",
  ids,
  query(schemas.centreDetail),
  handle(centres.getCentre)
);

router.put(
  "/centres/:id",
  adminOnly,
  ids,
  body(schemas.centreUpdate),
  handle(centres.updateCentre)
);

router.delete(
  "/centres/:id",
  adminOnly,
  ids,
  handle(centres.deleteCentre)
);

// Slot scheduling is administered centrally.
router.get(
  "/slots",
  query(schemas.slotList),
  handle(slots.listSlots)
);

router.post(
  "/slots",
  adminOnly,
  body(schemas.slotCreate),
  handle(slots.createSlot)
);

router.put(
  "/slots/:id",
  adminOnly,
  ids,
  body(schemas.slotUpdate),
  handle(slots.updateSlot)
);

router.delete(
  "/slots/:id",
  adminOnly,
  ids,
  handle(slots.deleteSlot)
);

// Bookings.
router.post(
  "/bookings",
  farmerOnly,
  body(schemas.bookingCreate),
  handle(bookings.createBooking)
);

router.get(
  "/bookings",
  query(schemas.bookingList),
  handle(bookings.listBookings)
);

router.get(
  "/bookings/:id",
  ids,
  handle(bookings.getBooking)
);

router.put(
  "/bookings/:id",
  authorize("farmer", "admin"),
  ids,
  body(schemas.bookingUpdate),
  handle(bookings.updateBooking)
);

router.delete(
  "/bookings/:id",
  ids,
  handle(bookings.cancelBooking)
);

// Tokens.
router.get(
  "/tokens/my-token",
  farmerOnly,
  query(schemas.tokenQuery),
  handle(bookings.myToken)
);

router.get(
  "/tokens/:id",
  ids,
  handle(bookings.getToken)
);

// Queue.
router.get(
  "/queue/status",
  query(schemas.queueStatusQuery),
  handle(queue.getQueueStatus)
);

router.post(
  "/queue/next",
  operators,
  body(schemas.queueNext),
  handle(queue.nextToken)
);

router.put(
  "/queue/:id/status",
  operators,
  ids,
  body(schemas.queueUpdate),
  handle(queue.updateQueueStatus)
);

router.get(
  "/queue/:centreId",
  ids,
  query(schemas.queueQuery),
  handle(queue.getCentreQueue)
);

// Procurement records.
router.get(
  "/procurements",
  query(schemas.procurementList),
  handle(records.listProcurements)
);

router.get(
  "/procurements/:id",
  ids,
  handle(records.getProcurement)
);

router.put(
  "/procurements/:id/status",
  operators,
  ids,
  body(schemas.procurementUpdate),
  handle(records.updateProcurementStatus)
);

// Payment monitoring.
router.get(
  "/payments",
  query(schemas.paymentList),
  handle(records.listPayments)
);

router.get(
  "/payments/:id",
  ids,
  handle(records.getPayment)
);

router.put(
  "/payments/:id/status",
  operators,
  ids,
  body(schemas.paymentUpdate),
  handle(records.updatePaymentStatus)
);

// Separate, optional admin-only TEST Checkout demonstration.
router.get(
  "/payments/:id/test-orders",
  adminOnly,
  ids,
  query(schemas.emptyQuery),
  handle(records.listTestOrders)
);

router.post(
  "/payments/:id/test-orders",
  adminOnly,
  paymentLimiter,
  ids,
  body(schemas.emptyBody),
  handle(records.createTestOrder)
);

router.post(
  "/payments/:id/verify-test-payment",
  adminOnly,
  paymentLimiter,
  ids,
  body(schemas.verifyTestPayment),
  handle(records.verifyTestPayment)
);

// Notifications.
router.get(
  "/notifications",
  query(schemas.notificationList),
  handle(notifications.listNotifications)
);

router.put(
  "/notifications/:id/read",
  ids,
  body(schemas.emptyBody),
  handle(notifications.markRead)
);

router.post(
  "/notifications/send-sms",
  operators,
  smsLimiter,
  body(schemas.manualSms),
  handle(notifications.sendManualSms)
);

// Admin.
router.get(
  "/admin/dashboard",
  adminOnly,
  handle(admin.dashboard)
);

router.get(
  "/admin/stats",
  adminOnly,
  handle(admin.stats)
);

router.get(
  "/admin/farmers",
  adminOnly,
  query(schemas.farmerList),
  handle(admin.listFarmers)
);

router.put(
  "/admin/farmers/:id",
  adminOnly,
  ids,
  body(schemas.farmerUpdate),
  handle(admin.updateFarmer)
);

router.get(
  "/admin/bookings",
  adminOnly,
  query(schemas.bookingList),
  handle(admin.listBookings)
);

router.get(
  "/admin/procurements",
  adminOnly,
  query(schemas.procurementList),
  handle(admin.listProcurements)
);

router.get(
  "/admin/payments",
  adminOnly,
  query(schemas.paymentList),
  handle(admin.listPayments)
);

module.exports = router;