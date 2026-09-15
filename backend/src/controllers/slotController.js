const {
  ProcurementCentre,
  Slot,
  Booking
} = require("../models");

const { AppError } = require("../utils/errors");
const { ok } = require("../utils/responses");
const { withTransaction } = require("../utils/transaction");
const {
  assertCentreAccess,
  lockCentre
} = require("../utils/access");
const {
  todayIST,
  assertSlotTimes,
  slotInstant
} = require("../utils/dates");

function serializeSlot(slot) {
  const centreActive = Boolean(slot.centre?.active);
  const ended =
    slotInstant(slot.date, slot.endTime).getTime() <= Date.now();

  const availableCapacity = Math.max(
    0,
    slot.capacity - slot.bookedCount
  );

  return {
    ...slot,
    availableCapacity,
    bookable: Boolean(
      centreActive &&
      slot.active &&
      !ended &&
      availableCapacity > 0
    )
  };
}

async function assertNoOverlap(values, session, excludeId = null) {
  const overlap = await Slot.exists({
    centre: values.centre,
    date: values.date,
    active: true,
    startTime: { $lt: values.endTime },
    endTime: { $gt: values.startTime },
    ...(excludeId ? { _id: { $ne: excludeId } } : {})
  }).session(session);

  if (overlap) {
    throw new AppError(
      409,
      "This time range overlaps another active slot at the centre."
    );
  }
}

async function listSlots(req, res) {
  const centreId = req.params.centreId || req.query.centreId;

  const {
    date,
    includeInactive,
    page = 1,
    limit = 20
  } = req.query;

  const filter = {};

  if (centreId) {
    filter.centre = centreId;

    const centreExists = await ProcurementCentre.exists({
      _id: centreId
    });

    if (!centreExists) {
      throw new AppError(404, "Procurement centre not found.");
    }
  }

  if (req.user.role === "staff") {
    if (centreId) {
      assertCentreAccess(req.user, centreId);
    }

    if (!req.user.centre) {
      throw new AppError(
        403,
        "No procurement centre is assigned to your account."
      );
    }

    filter.centre = req.user.centre;
  }

  filter.date = date || { $gte: todayIST() };

  if (!(req.user.role === "admin" && includeInactive)) {
    filter.active = true;
  }

  const [slots, total] = await Promise.all([
    Slot.find(filter)
      .populate("centre", "name active")
      .sort({ date: 1, startTime: 1, _id: 1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),

    Slot.countDocuments(filter)
  ]);

  return ok(res, {
    items: slots.map(serializeSlot),
    total,
    page,
    limit
  });
}

async function createSlot(req, res) {
  const {
    centreId,
    date,
    startTime,
    endTime,
    capacity
  } = req.body;

  assertSlotTimes(date, startTime, endTime);

  if (slotInstant(date, endTime).getTime() <= Date.now()) {
    throw new AppError(
      400,
      "Cannot create a slot that has already ended."
    );
  }

  const slot = await withTransaction(async (session) => {
    await lockCentre(centreId, session, true);

    const values = {
      centre: centreId,
      date,
      startTime,
      endTime,
      capacity,
      bookedCount: 0,
      active: true
    };

    await assertNoOverlap(values, session);

    const [created] = await Slot.create(
      [values],
      { session }
    );

    return created;
  });

  return ok(
    res,
    slot,
    "Slot created.",
    201
  );
}

async function updateSlot(req, res) {
  const initial = await Slot.findById(req.params.id).lean();

  if (!initial) {
    throw new AppError(404, "Slot not found.");
  }

  const updated = await withTransaction(async (session) => {
    const centre = await lockCentre(
      initial.centre,
      session
    );

    const slot = await Slot.findById(req.params.id).session(session);

    if (!slot) {
      throw new AppError(404, "Slot not found.");
    }

    const proposed = {
      centre: slot.centre,
      date: req.body.date ?? slot.date,
      startTime: req.body.startTime ?? slot.startTime,
      endTime: req.body.endTime ?? slot.endTime,
      capacity: req.body.capacity ?? slot.capacity,
      active: req.body.active ?? slot.active
    };

    assertSlotTimes(
      proposed.date,
      proposed.startTime,
      proposed.endTime
    );

    const scheduleChanged =
      proposed.date !== slot.date ||
      proposed.startTime !== slot.startTime ||
      proposed.endTime !== slot.endTime;

    if (scheduleChanged) {
      const historyExists = await Booking.exists({
        slot: slot._id
      }).session(session);

      if (historyExists) {
        throw new AppError(
          409,
          "A slot with booking history cannot be rescheduled. Create a new slot."
        );
      }
    }

    if (proposed.capacity < slot.bookedCount) {
      throw new AppError(
        409,
        "Capacity cannot be lower than the reserved place count."
      );
    }

    if (!proposed.active) {
      const outstanding = await Booking.exists({
        slot: slot._id,
        status: "Booked",
        active: true
      }).session(session);

      if (outstanding) {
        throw new AppError(
          409,
          "Complete or cancel outstanding bookings before closing this slot."
        );
      }
    }

    if (proposed.active) {
      if (!centre.active) {
        throw new AppError(
          409,
          "Activate the centre before opening its slots."
        );
      }

      if (
        slotInstant(proposed.date, proposed.endTime).getTime() <= Date.now()
      ) {
        throw new AppError(
          400,
          "An ended slot cannot be edited as active. Close it to preserve history."
        );
      }

      await assertNoOverlap(
        proposed,
        session,
        slot._id
      );
    }

    slot.date = proposed.date;
    slot.startTime = proposed.startTime;
    slot.endTime = proposed.endTime;
    slot.capacity = proposed.capacity;
    slot.active = proposed.active;

    await slot.save({ session });
    return slot;
  });

  return ok(
    res,
    updated,
    "Slot updated."
  );
}

async function deleteSlot(req, res) {
  const initial = await Slot.findById(req.params.id).lean();

  if (!initial) {
    throw new AppError(404, "Slot not found.");
  }

  const updated = await withTransaction(async (session) => {
    await lockCentre(initial.centre, session);

    const slot = await Slot.findById(req.params.id).session(session);

    if (!slot) {
      throw new AppError(404, "Slot not found.");
    }

    const outstanding = await Booking.exists({
      slot: slot._id,
      status: "Booked",
      active: true
    }).session(session);

    if (outstanding) {
      throw new AppError(
        409,
        "Complete or cancel outstanding bookings before closing this slot."
      );
    }

    slot.active = false;
    await slot.save({ session });
    return slot;
  });

  return ok(
    res,
    updated,
    "Slot closed. Historical bookings were retained."
  );
}

module.exports = {
  listSlots,
  createSlot,
  updateSlot,
  deleteSlot
};