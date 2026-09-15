const {
  ProcurementCentre,
  Booking,
  Queue,
  Procurement
} = require("../models");

const { AppError } = require("../utils/errors");
const { withTransaction } = require("../utils/transaction");
const {
  sameId,
  assertCentreAccess,
  lockCentre
} = require("../utils/access");
const { todayIST } = require("../utils/dates");

const {
  createNotification,
  deliverNotifications
} = require("./notificationService");

const queueOrder = {
  startTime: 1,
  createdAt: 1,
  _id: 1
};

async function getQueueSnapshot(user, centreId, date = todayIST()) {
  const centre = await ProcurementCentre.findById(centreId)
    .select("name")
    .lean();

  if (!centre) {
    throw new AppError(404, "Procurement centre not found.");
  }

  if (user.role === "staff") {
    assertCentreAccess(user, centreId);
  }

  const rows = await Queue.find({
    centre: centreId,
    date
  })
    .sort(queueOrder)
    .populate("token", "number")
    .populate("farmer", "name phone")
    .lean();

  const active = rows.find((row) => row.activeService);

  /*
   * Position 0: currently Called or Serving.
   * Waiting positions start at 1 and count only waiting farmers.
   * waitingAhead counts earlier Waiting entries.
   * peopleAhead additionally includes the active counter token.
   *
   * This avoids describing the first waiting farmer as "position 2".
   */
  let waitingPosition = 0;

  const entries = rows.map((row) => {
    const isMine = sameId(row.farmer, user._id);
    const operator = ["staff", "admin"].includes(user.role);

    let position = null;
    let waitingAhead = null;
    let peopleAhead = null;

    if (row.activeService) {
      position = 0;
      waitingAhead = 0;
      peopleAhead = 0;
    } else if (row.status === "Waiting") {
      waitingPosition += 1;
      position = waitingPosition;
      waitingAhead = waitingPosition - 1;
      peopleAhead = waitingAhead + (active ? 1 : 0);
    }

    const entry = {
      token: row.token
        ? {
            number: row.token.number,
            ...(isMine || operator ? { _id: row.token._id } : {})
          }
        : null,
      date: row.date,
      startTime: row.startTime,
      status: row.status,
      activeService: row.activeService,
      position,
      waitingAhead,
      peopleAhead,
      isMine
    };

    // Farmers can see public token state, not another user's record identifiers.
    if (isMine || operator) {
      entry._id = row._id;
      entry.booking = row.booking;
      entry.calledAt = row.calledAt || null;
      entry.completedAt = row.completedAt || null;
      entry.createdAt = row.createdAt;
    }

    if (operator) {
      entry.farmer = row.farmer;
    }

    return entry;
  });

  return {
    centre: {
      _id: centre._id,
      name: centre.name
    },
    date,
    currentToken: active
      ? {
          number: active.token?.number || "",
          status: active.status,
          ...(
            ["staff", "admin"].includes(user.role) ||
            sameId(active.farmer, user._id)
              ? { queueId: active._id }
              : {}
          )
        }
      : null,
    waitingCount: rows.filter((row) => row.status === "Waiting").length,
    myEntries: entries.filter((entry) => entry.isMine),
    entries
  };
}

async function applyTransition(
  user,
  queue,
  nextStatus,
  session,
  procurementInput = {}
) {
  const booking = await Booking.findById(queue.booking).session(session);

  const procurement = await Procurement.findOne({
    booking: queue.booking
  }).session(session);

  if (!booking || !procurement) {
    throw new AppError(
      409,
      "The related booking or procurement record is missing."
    );
  }

  if (!booking.active || booking.status !== "Booked") {
    throw new AppError(
      409,
      "Only active, uncompleted bookings can be processed."
    );
  }

  const allowed = {
    Waiting: ["Called", "Skipped"],
    Called: ["Serving", "Skipped"],
    Serving: ["Completed"],
    Skipped: ["Waiting"],
    Completed: [],
    Cancelled: []
  };

  if (!allowed[queue.status]?.includes(nextStatus)) {
    throw new AppError(
      409,
      `Queue cannot move from ${queue.status} to ${nextStatus}.`
    );
  }

  if (queue.date !== todayIST()) {
    throw new AppError(
      409,
      "Queue processing is available only on the booking date."
    );
  }

  if (["Called", "Serving"].includes(nextStatus)) {
    const otherActive = await Queue.exists({
      centre: queue.centre,
      date: queue.date,
      activeService: true,
      _id: { $ne: queue._id }
    }).session(session);

    if (otherActive) {
      throw new AppError(
        409,
        "Finish or skip the current token before calling another."
      );
    }
  }

  /*
   * Even the direct queue status endpoint must respect queue ordering.
   * It cannot be used to call an arbitrary later Waiting token.
   */
  if (nextStatus === "Called") {
    const firstWaiting = await Queue.findOne({
      centre: queue.centre,
      date: queue.date,
      status: "Waiting"
    })
      .sort(queueOrder)
      .select("_id")
      .session(session);

    if (!firstWaiting || !sameId(firstWaiting._id, queue._id)) {
      throw new AppError(
        409,
        "Call the first waiting token. Use Call Next to preserve queue order."
      );
    }
  }

  const previousProcurementStatus = procurement.status;

  queue.status = nextStatus;
  queue.activeService = ["Called", "Serving"].includes(nextStatus);

  if (nextStatus === "Called") {
    queue.calledAt = new Date();
    procurement.status = "Waiting";
  }

  if (nextStatus === "Waiting") {
    queue.calledAt = undefined;
    procurement.status = "Waiting";
  }

  if (nextStatus === "Serving") {
    if (!["Booked", "Waiting"].includes(procurement.status)) {
      throw new AppError(409, "The procurement record cannot enter verification.");
    }

    procurement.status = "Under Verification";
    procurement.verifiedBy = user._id;
    procurement.verifiedAt = new Date();
  }

  if (nextStatus === "Completed") {
    if (procurement.status !== "Under Verification") {
      throw new AppError(
        409,
        "Verify the farmer before completing procurement."
      );
    }

    procurement.status = "Procurement Completed";
    procurement.completedAt = new Date();
    procurement.actualQuantityKg =
      procurementInput.actualQuantityKg ?? booking.quantityKg;

    queue.completedAt = new Date();
    booking.status = "Completed";

    // active remains true: completion is not a cancellation.
    await booking.save({ session });
  }

  if (procurementInput.notes !== undefined) {
    procurement.notes = procurementInput.notes;
  }

  await queue.save({ session });
  await procurement.save({ session });

  await queue.populate({
    path: "token",
    select: "number",
    options: { session }
  });

  if (!queue.token) {
    throw new AppError(409, "The queue's token record is missing.");
  }

  const tokenNumber = queue.token.number;

  const queueNotice = await createNotification(
    {
      user: booking.farmer,
      booking: booking._id,
      type: "queue",
      message:
        `MANDI LIVE: Token ${tokenNumber} is now ${nextStatus}. ` +
        (
          nextStatus === "Called"
            ? "Please approach the procurement counter."
            : "Check your dashboard for the latest information."
        )
    },
    session
  );

  const notificationIds = [queueNotice._id];

  if (procurement.status !== previousProcurementStatus) {
    const procurementNotice = await createNotification(
      {
        user: booking.farmer,
        booking: booking._id,
        type: "procurement",
        message:
          `MANDI LIVE: Procurement status for token ${tokenNumber}: ` +
          `${procurement.status}.`
      },
      session
    );

    notificationIds.push(procurementNotice._id);
  }

  return notificationIds;
}

async function callNextToken(user, centreId, date = todayIST()) {
  assertCentreAccess(user, centreId);

  if (date !== todayIST()) {
    throw new AppError(
      400,
      "Call Next is available only for today's queue."
    );
  }

  const committed = await withTransaction(async (session) => {
    await lockCentre(centreId, session);

    const active = await Queue.exists({
      centre: centreId,
      date,
      activeService: true
    }).session(session);

    if (active) {
      throw new AppError(
        409,
        "A token is already Called or Serving. Finish or skip it first."
      );
    }

    const queue = await Queue.findOne({
      centre: centreId,
      date,
      status: "Waiting"
    })
      .sort(queueOrder)
      .session(session);

    if (!queue) {
      throw new AppError(
        409,
        "There are no waiting tokens for this date."
      );
    }

    const notificationIds = await applyTransition(
      user,
      queue,
      "Called",
      session
    );

    return { notificationIds };
  });

  await deliverNotifications(committed.notificationIds);
  return getQueueSnapshot(user, centreId, date);
}

async function changeQueueStatus(
  user,
  queueId,
  nextStatus,
  procurementInput = {}
) {
  const initial = await Queue.findById(queueId).lean();

  if (!initial) {
    throw new AppError(404, "Queue entry not found.");
  }

  assertCentreAccess(user, initial.centre);

  if (nextStatus === "Cancelled") {
    throw new AppError(
      400,
      "Use booking cancellation so reserved slot capacity is also released."
    );
  }

  const committed = await withTransaction(async (session) => {
    await lockCentre(initial.centre, session);

    const queue = await Queue.findById(queueId).session(session);

    if (!queue) {
      throw new AppError(404, "Queue entry not found.");
    }

    // Repeated status submissions are harmless and do not send duplicate SMS.
    if (queue.status === nextStatus) {
      return { notificationIds: [] };
    }

    const notificationIds = await applyTransition(
      user,
      queue,
      nextStatus,
      session,
      procurementInput
    );

    return { notificationIds };
  });

  await deliverNotifications(committed.notificationIds);

  return getQueueSnapshot(
    user,
    initial.centre,
    initial.date
  );
}

module.exports = {
  getQueueSnapshot,
  callNextToken,
  changeQueueStatus
};