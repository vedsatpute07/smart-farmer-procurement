const {
  Booking,
  Token
} = require("../models");

const { AppError } = require("../utils/errors");
const { ok } = require("../utils/responses");
const { assertBookingAccess } = require("../utils/access");

const bookingService = require("../services/bookingService");

async function createBooking(req, res) {
  const result = await bookingService.createBooking(
    req.user,
    req.body
  );

  const deliveryFailed = result.smsDelivery.some(
    (status) => status === "failed"
  );

  const message = result.refreshRequired
    ? "Booking saved. Open My Bookings to retrieve its token and current status."
    : deliveryFailed
      ? "Booking confirmed and token saved. SMS delivery failed; your records are available in the application."
      : "Booking confirmed and token generated.";

  return ok(
    res,
    result,
    message,
    201
  );
}

async function listBookings(req, res) {
  const result = await bookingService.listBookings(
    req.user,
    req.query
  );

  return ok(res, result);
}

async function getBooking(req, res) {
  const result = await bookingService.getBookingDetails(
    req.user,
    req.params.id
  );

  return ok(res, result);
}

async function updateBooking(req, res) {
  const result = await bookingService.updateBooking(
    req.user,
    req.params.id,
    req.body
  );

  return ok(
    res,
    result,
    "Booking details updated."
  );
}

async function cancelBooking(req, res) {
  const result = await bookingService.cancelBooking(
    req.user,
    req.params.id
  );

  return ok(
    res,
    result,
    "Booking cancelled."
  );
}

async function getToken(req, res) {
  const token = await Token.findById(req.params.id).lean();

  if (!token) {
    throw new AppError(404, "Token not found.");
  }

  const booking = await Booking.findById(token.booking).lean();

  if (!booking) {
    throw new AppError(404, "Related booking not found.");
  }

  assertBookingAccess(req.user, booking);

  const result = await bookingService.getBookingDetails(
    req.user,
    booking._id
  );

  return ok(res, result);
}

async function myToken(req, res) {
  const filter = {
    farmer: req.user._id,
    active: true,
    ...(req.query.date ? { date: req.query.date } : {})
  };

  let booking = await Booking.findOne({
    ...filter,
    status: "Booked"
  })
    .sort({ date: 1, startTime: 1, createdAt: 1 })
    .lean();

  if (!booking) {
    booking = await Booking.findOne(filter)
      .sort({ date: -1, createdAt: -1 })
      .lean();
  }

  if (!booking) {
    return ok(
      res,
      null,
      "You do not have a token yet."
    );
  }

  const result = await bookingService.getBookingDetails(
    req.user,
    booking._id
  );

  return ok(res, result);
}

module.exports = {
  createBooking,
  listBookings,
  getBooking,
  updateBooking,
  cancelBooking,
  getToken,
  myToken
};