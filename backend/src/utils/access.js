const {
  ProcurementCentre,
  Booking
} = require("../models");

const { AppError } = require("./errors");

function sameId(left, right) {
  if (!left || !right) {
    return false;
  }

  return String(left._id || left) === String(right._id || right);
}

function assertCentreAccess(user, centreId) {
  if (user.role === "admin") {
    return;
  }

  if (
    user.role !== "staff" ||
    !sameId(user.centre, centreId)
  ) {
    throw new AppError(
      403,
      "You can manage only your assigned procurement centre."
    );
  }
}

function assertBookingAccess(user, record) {
  if (user.role === "admin") {
    return;
  }

  if (
    user.role === "farmer" &&
    sameId(user._id, record.farmer)
  ) {
    return;
  }

  if (
    user.role === "staff" &&
    sameId(user.centre, record.centre)
  ) {
    return;
  }

  throw new AppError(403, "You cannot access this record.");
}

function recordScope(user) {
  if (user.role === "admin") {
    return {};
  }

  if (user.role === "staff") {
    if (!user.centre) {
      throw new AppError(
        403,
        "No procurement centre is assigned to your staff account."
      );
    }

    return { centre: user.centre };
  }

  return { farmer: user._id };
}

async function getAccessibleBooking(user, bookingId, session = null) {
  const query = Booking.findById(bookingId);

  if (session) {
    query.session(session);
  }

  const booking = await query;

  if (!booking) {
    throw new AppError(404, "Booking not found.");
  }

  assertBookingAccess(user, booking);
  return booking;
}

/*
 * Updating this document at the beginning of every centre-affecting
 * transaction serializes competing scheduling/queue/booking operations.
 */
async function lockCentre(centreId, session, requireActive = false) {
  const centre = await ProcurementCentre.findOneAndUpdate(
    {
      _id: centreId,
      ...(requireActive ? { active: true } : {})
    },
    {
      $inc: { operationVersion: 1 }
    },
    {
      session,
      new: true
    }
  );

  if (!centre) {
    throw new AppError(
      404,
      requireActive
        ? "Procurement centre not found or inactive."
        : "Procurement centre not found."
    );
  }

  return centre;
}

module.exports = {
  sameId,
  assertCentreAccess,
  assertBookingAccess,
  recordScope,
  getAccessibleBooking,
  lockCentre
};