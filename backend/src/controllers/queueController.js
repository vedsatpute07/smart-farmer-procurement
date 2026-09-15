const {
  Booking,
  Queue
} = require("../models");

const { AppError } = require("../utils/errors");
const { ok } = require("../utils/responses");
const {
  assertBookingAccess,
  assertCentreAccess
} = require("../utils/access");
const { todayIST } = require("../utils/dates");

const queueService = require("../services/queueService");
const bookingService = require("../services/bookingService");

async function getCentreQueue(req, res) {
  const result = await queueService.getQueueSnapshot(
    req.user,
    req.params.centreId,
    req.query.date || todayIST()
  );

  return ok(res, result);
}

async function getQueueStatus(req, res) {
  if (req.query.bookingId) {
    const booking = await Booking.findById(
      req.query.bookingId
    ).lean();

    if (!booking) {
      throw new AppError(404, "Booking not found.");
    }

    assertBookingAccess(req.user, booking);

    const bundle = await bookingService.getBookingDetails(
      req.user,
      booking._id
    );

    return ok(res, {
      bookingId: booking._id,
      token: bundle.token,
      ...bundle.queue
    });
  }

  if (req.user.role === "farmer") {
    const booking = await Booking.findOne({
      farmer: req.user._id,
      status: "Booked",
      active: true,
      ...(req.query.date ? { date: req.query.date } : {})
    })
      .sort({ date: 1, startTime: 1, createdAt: 1 })
      .lean();

    if (!booking) {
      return ok(
        res,
        null,
        "No active queue entry found."
      );
    }

    const bundle = await bookingService.getBookingDetails(
      req.user,
      booking._id
    );

    return ok(res, {
      bookingId: booking._id,
      token: bundle.token,
      ...bundle.queue
    });
  }

  const centreId = req.query.centreId || req.user.centre;

  if (!centreId) {
    throw new AppError(
      400,
      "Select a procurement centre."
    );
  }

  const result = await queueService.getQueueSnapshot(
    req.user,
    centreId,
    req.query.date || todayIST()
  );

  return ok(res, result);
}

async function nextToken(req, res) {
  const centreId = req.body.centreId || req.user.centre;

  if (!centreId) {
    throw new AppError(
      400,
      "Select a procurement centre."
    );
  }

  const result = await queueService.callNextToken(
    req.user,
    centreId,
    req.body.date || todayIST()
  );

  return ok(
    res,
    result,
    "Next token called."
  );
}

async function updateQueueStatus(req, res) {
  if (req.body.status === "Cancelled") {
    const entry = await Queue.findById(
      req.params.id
    ).lean();

    if (!entry) {
      throw new AppError(404, "Queue entry not found.");
    }

    assertCentreAccess(req.user, entry.centre);

    /*
     * Cancellation is delegated to the booking service so it also
     * releases slot capacity and preserves a consistent history.
     */
    await bookingService.cancelBooking(
      req.user,
      entry.booking
    );

    const snapshot = await queueService.getQueueSnapshot(
      req.user,
      entry.centre,
      entry.date
    );

    return ok(
      res,
      snapshot,
      "Booking and queue token cancelled."
    );
  }

  const result = await queueService.changeQueueStatus(
    req.user,
    req.params.id,
    req.body.status
  );

  return ok(
    res,
    result,
    "Queue status updated."
  );
}

module.exports = {
  getCentreQueue,
  getQueueStatus,
  nextToken,
  updateQueueStatus
};