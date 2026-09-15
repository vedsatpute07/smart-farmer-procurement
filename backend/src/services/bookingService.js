const mongoose = require("mongoose");
const { randomUUID } = require("node:crypto");

const {
  User,
  Slot,
  Booking,
  Token,
  Queue,
  Procurement,
  Payment
} = require("../models");

const { AppError } = require("../utils/errors");
const { withTransaction } = require("../utils/transaction");
const {
  assertBookingAccess,
  assertCentreAccess,
  lockCentre,
  recordScope
} = require("../utils/access");
const { assertSlotBookable } = require("../utils/dates");

const {
  createNotification,
  deliverNotifications
} = require("./notificationService");
const { getQueueSnapshot } = require("./queueService");

function generateTokenNumber(date) {
  const suffix = randomUUID()
    .replaceAll("-", "")
    .slice(0, 16)
    .toUpperCase();

  return `AGRI-${date.replaceAll("-", "")}-${suffix}`;
}

function populateBooking(query) {
  return query
    .populate("farmer", "name phone email village district isDemo")
    .populate(
      "centre",
      "name address district phone workingHours location crops active isDemo"
    )
    .populate(
      "slot",
      "date startTime endTime capacity bookedCount active"
    );
}

async function createBooking(user, input) {
  if (user.role !== "farmer") {
    throw new AppError(403, "Only farmers can book procurement slots.");
  }

  const committed = await withTransaction(async (session) => {
    const centre = await lockCentre(input.centreId, session, true);

    const farmer = await User.findOne({
      _id: user._id,
      role: "farmer",
      active: true,
      verified: true
    }).session(session);

    if (!farmer) {
      throw new AppError(403, "Your farmer account is not available.");
    }

    const slot = await Slot.findOne({
      _id: input.slotId,
      centre: centre._id
    }).session(session);

    if (!slot) {
      throw new AppError(
        404,
        "The selected slot does not belong to this procurement centre."
      );
    }

    assertSlotBookable(slot);

    if (!centre.crops.includes(input.crop)) {
      throw new AppError(
        400,
        "The selected crop is not accepted at this centre."
      );
    }

    const duplicate = await Booking.exists({
      farmer: user._id,
      date: slot.date,
      active: true
    }).session(session);

    if (duplicate) {
      throw new AppError(
        409,
        "You already have a non-cancelled booking for this date."
      );
    }

    /*
     * The centre transaction lock serializes same-centre reservations.
     * The conditional update and partial unique booking index also protect
     * capacity and same-farmer bookings under concurrent requests.
     */
    const reserved = await Slot.updateOne(
      {
        _id: slot._id,
        active: true,
        bookedCount: slot.bookedCount,
        capacity: slot.capacity
      },
      {
        $inc: { bookedCount: 1 }
      },
      {
        session,
        runValidators: true
      }
    );

    if (reserved.modifiedCount !== 1) {
      throw new AppError(
        409,
        "Slot availability changed. Refresh and try again."
      );
    }

    const bookingId = new mongoose.Types.ObjectId();
    const tokenId = new mongoose.Types.ObjectId();
    const queueId = new mongoose.Types.ObjectId();
    const procurementId = new mongoose.Types.ObjectId();
    const tokenNumber = generateTokenNumber(slot.date);

    await Booking.create(
      [{
        _id: bookingId,
        farmer: farmer._id,
        centre: centre._id,
        slot: slot._id,
        date: slot.date,
        startTime: slot.startTime,
        endTime: slot.endTime,
        crop: input.crop,
        quantityKg: input.quantityKg,
        status: "Booked",
        active: true
      }],
      { session }
    );

    await Token.create(
      [{
        _id: tokenId,
        number: tokenNumber,
        farmer: farmer._id,
        centre: centre._id,
        booking: bookingId,
        queue: queueId
      }],
      { session }
    );

    await Queue.create(
      [{
        _id: queueId,
        farmer: farmer._id,
        centre: centre._id,
        booking: bookingId,
        token: tokenId,
        date: slot.date,
        startTime: slot.startTime,
        status: "Waiting",
        activeService: false
      }],
      { session }
    );

    await Procurement.create(
      [{
        _id: procurementId,
        booking: bookingId,
        farmer: farmer._id,
        centre: centre._id,
        status: "Booked"
      }],
      { session }
    );

    await Payment.create(
      [{
        booking: bookingId,
        procurement: procurementId,
        farmer: farmer._id,
        centre: centre._id,
        status: "Pending",
        amountRupees: 0
      }],
      { session }
    );

    const bookingNotice = await createNotification(
      {
        user: farmer._id,
        booking: bookingId,
        type: "booking",
        message:
          `MANDI LIVE: Booking confirmed at ${centre.name} on ${slot.date}, ` +
          `${slot.startTime}-${slot.endTime} IST. ` +
          `Crop: ${input.crop}. Expected quantity: ${input.quantityKg} kg.`
      },
      session
    );

    const tokenNotice = await createNotification(
      {
        user: farmer._id,
        booking: bookingId,
        type: "token",
        message:
          `MANDI LIVE: Your token is ${tokenNumber}. Queue status: Waiting. ` +
          "Open My Bookings to view your latest queue position."
      },
      session
    );

    return {
      bookingId,
      notificationIds: [bookingNotice._id, tokenNotice._id]
    };
  });

  /*
   * Do not send SMS inside a transaction: MongoDB may retry its callback.
   * Failed delivery cannot undo the committed booking.
   */
  const deliveries = await deliverNotifications(committed.notificationIds);

  try {
    const bundle = await getBookingDetails(user, committed.bookingId);

    return {
      ...bundle,
      smsDelivery: deliveries.map((delivery) => delivery.status)
    };
  } catch {
    /*
     * The booking is committed even if a subsequent read fails.
     * Return its identifier without incorrectly reporting that booking failed.
     */
    return {
      bookingId: String(committed.bookingId),
      committed: true,
      refreshRequired: true,
      smsDelivery: deliveries.map((delivery) => delivery.status)
    };
  }
}

async function updateBooking(user, bookingId, input) {
  if (!["farmer", "admin"].includes(user.role)) {
    throw new AppError(
      403,
      "Only the farmer or an administrator can edit booking details."
    );
  }

  const initial = await Booking.findById(bookingId).lean();

  if (!initial) {
    throw new AppError(404, "Booking not found.");
  }

  assertBookingAccess(user, initial);

  await withTransaction(async (session) => {
    const centre = await lockCentre(initial.centre, session);
    const booking = await Booking.findById(bookingId).session(session);

    if (!booking) {
      throw new AppError(404, "Booking not found.");
    }

    assertBookingAccess(user, booking);

    const queue = await Queue.findOne({
      booking: booking._id
    }).session(session);

    if (
      !booking.active ||
      booking.status !== "Booked" ||
      !queue ||
      queue.status !== "Waiting"
    ) {
      throw new AppError(
        409,
        "Only waiting bookings can be edited."
      );
    }

    if (input.crop !== undefined) {
      if (!centre.crops.includes(input.crop)) {
        throw new AppError(
          400,
          "The selected crop is not accepted at this centre."
        );
      }

      booking.crop = input.crop;
    }

    if (input.quantityKg !== undefined) {
      booking.quantityKg = input.quantityKg;
    }

    await booking.save({ session });
  });

  return getBookingDetails(user, bookingId);
}

async function cancelBooking(user, bookingId) {
  const initial = await Booking.findById(bookingId).lean();

  if (!initial) {
    throw new AppError(404, "Booking not found.");
  }

  assertBookingAccess(user, initial);

  const committed = await withTransaction(async (session) => {
    await lockCentre(initial.centre, session);

    const booking = await Booking.findById(bookingId).session(session);

    if (!booking) {
      throw new AppError(404, "Booking not found.");
    }

    assertBookingAccess(user, booking);

    // Idempotent cancellation: never release capacity twice.
    if (booking.status === "Cancelled") {
      return { notificationIds: [] };
    }

    const queue = await Queue.findOne({
      booking: booking._id
    }).session(session);

    if (
      booking.status !== "Booked" ||
      !queue ||
      !["Waiting", "Skipped"].includes(queue.status)
    ) {
      throw new AppError(
        409,
        "Only waiting or skipped bookings can be cancelled."
      );
    }

    const slot = await Slot.findById(booking.slot).session(session);

    if (!slot || slot.bookedCount < 1) {
      throw new AppError(
        409,
        "Slot capacity records are inconsistent. Contact the administrator."
      );
    }

    slot.bookedCount -= 1;
    await slot.save({ session });

    booking.status = "Cancelled";
    booking.active = false;
    booking.cancelledAt = new Date();
    await booking.save({ session });

    queue.status = "Cancelled";
    queue.activeService = false;
    await queue.save({ session });

    const notification = await createNotification(
      {
        user: booking.farmer,
        booking: booking._id,
        type: "booking",
        message:
          `MANDI LIVE: Your booking for ${booking.date}, ` +
          `${booking.startTime}-${booking.endTime} IST was cancelled. ` +
          "Its reserved place has been released."
      },
      session
    );

    /*
     * Procurement and payment documents remain as history.
     * Their status-update endpoints independently reject cancelled bookings.
     */
    return {
      notificationIds: [notification._id]
    };
  });

  await deliverNotifications(committed.notificationIds);
  return getBookingDetails(user, bookingId);
}

async function hydrateBookings(user, bookings) {
  if (!bookings.length) {
    return [];
  }

  const bookingIds = bookings.map((booking) => booking._id);

  const [tokens, procurements, payments] = await Promise.all([
    Token.find({ booking: { $in: bookingIds } }).lean(),

    Procurement.find({ booking: { $in: bookingIds } })
      .populate("verifiedBy", "name")
      .lean(),

    Payment.find({ booking: { $in: bookingIds } })
      .populate("updatedBy", "name")
      .lean()
  ]);

  const tokenMap = new Map(
    tokens.map((record) => [String(record.booking), record])
  );
  const procurementMap = new Map(
    procurements.map((record) => [String(record.booking), record])
  );
  const paymentMap = new Map(
    payments.map((record) => [String(record.booking), record])
  );

  const snapshots = new Map();

  for (const booking of bookings) {
    const centreId = String(booking.centre._id || booking.centre);
    const key = `${centreId}:${booking.date}`;

    if (!snapshots.has(key)) {
      snapshots.set(
        key,
        await getQueueSnapshot(user, centreId, booking.date)
      );
    }
  }

  return bookings.map((booking) => {
    const bookingId = String(booking._id);
    const centreId = String(booking.centre._id || booking.centre);
    const snapshot = snapshots.get(`${centreId}:${booking.date}`);

    const entry = snapshot.entries.find(
      (item) => String(item.booking || "") === bookingId
    );

    return {
      booking,
      token: tokenMap.get(bookingId) || null,
      queue: {
        entry: entry || null,
        position: entry?.position ?? null,
        currentToken: snapshot.currentToken,
        waitingCount: snapshot.waitingCount
      },
      procurement: procurementMap.get(bookingId) || null,
      payment: paymentMap.get(bookingId) || null
    };
  });
}

async function getBookingDetails(user, bookingId) {
  const booking = await populateBooking(
    Booking.findById(bookingId)
  ).lean();

  if (!booking) {
    throw new AppError(404, "Booking not found.");
  }

  assertBookingAccess(user, booking);

  if (!booking.centre || !booking.farmer || !booking.slot) {
    throw new AppError(
      409,
      "A related booking record is missing. Contact the administrator."
    );
  }

  const [bundle] = await hydrateBookings(user, [booking]);
  return bundle;
}

async function listBookings(user, filters = {}) {
  const filter = {
    ...recordScope(user),
    ...(filters.date ? { date: filters.date } : {}),
    ...(filters.status ? { status: filters.status } : {})
  };

  if (filters.centreId) {
    if (user.role === "staff") {
      assertCentreAccess(user, filters.centreId);
    }

    filter.centre = filters.centreId;
  }

  const page = filters.page || 1;
  const limit = filters.limit || 20;

  const [bookings, total] = await Promise.all([
    populateBooking(
      Booking.find(filter)
        .sort({ date: -1, startTime: 1, createdAt: 1 })
        .skip((page - 1) * limit)
        .limit(limit)
    ).lean(),

    Booking.countDocuments(filter)
  ]);

  if (
    bookings.some(
      (booking) => !booking.centre || !booking.farmer || !booking.slot
    )
  ) {
    throw new AppError(
      409,
      "A related booking record is missing. Contact the administrator."
    );
  }

  return {
    items: await hydrateBookings(user, bookings),
    total,
    page,
    limit
  };
}

module.exports = {
  createBooking,
  updateBooking,
  cancelBooking,
  getBookingDetails,
  listBookings
};