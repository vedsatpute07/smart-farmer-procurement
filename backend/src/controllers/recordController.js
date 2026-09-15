const {
  createHmac,
  timingSafeEqual,
  randomUUID
} = require("node:crypto");
const Razorpay = require("razorpay");

const env = require("../config/env");
const {
  Booking,
  Queue,
  Procurement,
  Payment
} = require("../models");

const { AppError } = require("../utils/errors");
const { ok } = require("../utils/responses");
const { withTransaction } = require("../utils/transaction");
const {
  recordScope,
  assertBookingAccess,
  assertCentreAccess,
  lockCentre
} = require("../utils/access");
const { todayIST } = require("../utils/dates");
const { changeQueueStatus } = require("../services/queueService");
const {
  createNotification,
  deliverNotifications
} = require("../services/notificationService");

/*
 * The sandbox checkout is a separate admin demonstration.
 * It does not represent a procurement payout and never changes Payment.status.
 *
 * Fixed server-owned demo amount: INR 100.
 * The browser cannot supply or override the amount.
 */
const SANDBOX_AMOUNT_PAISE = 10000;
const SANDBOX_CURRENCY = "INR";
const MAX_SANDBOX_ORDERS = 20;

let razorpayClient;

function requireSandbox() {
  if (env.paymentMode !== "razorpay_test") {
    throw new AppError(
      409,
      "Sandbox checkout is disabled. Payment-status monitoring remains available."
    );
  }

  if (!razorpayClient) {
    razorpayClient = new Razorpay({
      key_id: env.razorpayKeyId,
      key_secret: env.razorpayKeySecret
    });
  }

  return razorpayClient;
}

function populateRecord(query) {
  return query
    .populate("farmer", "name phone email isDemo")
    .populate("centre", "name district")
    .populate(
      "booking",
      "date startTime endTime crop quantityKg status active"
    );
}

async function buildRecordFilter(user, input) {
  const filter = {
    ...recordScope(user),
    ...(input.status ? { status: input.status } : {})
  };

  if (input.centreId) {
    if (user.role === "staff") {
      assertCentreAccess(user, input.centreId);
    }

    filter.centre = input.centreId;
  }

  if (input.bookingId) {
    const booking = await Booking.findById(input.bookingId).lean();

    if (!booking) {
      throw new AppError(404, "Booking not found.");
    }

    assertBookingAccess(user, booking);
    filter.booking = booking._id;
  }

  if (input.date) {
    const bookings = await Booking.find({
      ...recordScope(user),
      date: input.date,
      ...(input.centreId ? { centre: input.centreId } : {}),
      ...(input.bookingId ? { _id: input.bookingId } : {})
    })
      .select("_id")
      .lean();

    filter.booking = {
      $in: bookings.map((booking) => booking._id)
    };
  }

  return filter;
}

async function listRecords(Model, req, res) {
  const filter = await buildRecordFilter(req.user, req.query);
  const page = req.query.page || 1;
  const limit = req.query.limit || 20;

  const [items, total] = await Promise.all([
    populateRecord(
      Model.find(filter)
        .sort({ createdAt: -1, _id: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
    ).lean(),

    Model.countDocuments(filter)
  ]);

  return ok(res, { items, total, page, limit });
}

async function getRecord(Model, req, res) {
  const record = await populateRecord(
    Model.findById(req.params.id)
  ).lean();

  if (!record || !record.booking) {
    throw new AppError(404, "Record not found.");
  }

  // The record's farmer and centre carry ownership independently of booking.
  assertBookingAccess(req.user, record);
  return ok(res, record);
}

async function listProcurements(req, res) {
  return listRecords(Procurement, req, res);
}

async function getProcurement(req, res) {
  return getRecord(Procurement, req, res);
}

async function listPayments(req, res) {
  return listRecords(Payment, req, res);
}

async function getPayment(req, res) {
  return getRecord(Payment, req, res);
}

async function updateProcurementStatus(req, res) {
  const initial = await Procurement.findById(req.params.id).lean();

  if (!initial) {
    throw new AppError(404, "Procurement record not found.");
  }

  assertCentreAccess(req.user, initial.centre);

  const requestedStatus = req.body.status;

  if (requestedStatus === "Booked") {
    throw new AppError(
      409,
      "Booked is the initial status. Procurement cannot move backwards to Booked."
    );
  }

  if (requestedStatus === "Waiting") {
    const committed = await withTransaction(async (session) => {
      await lockCentre(initial.centre, session);

      const procurement = await Procurement.findById(req.params.id)
        .session(session);

      if (!procurement) {
        throw new AppError(404, "Procurement record not found.");
      }

      const booking = await Booking.findById(procurement.booking)
        .session(session);

      const queue = await Queue.findOne({
        booking: procurement.booking
      }).session(session);

      if (
        !booking ||
        !queue ||
        !booking.active ||
        booking.status !== "Booked"
      ) {
        throw new AppError(409, "This booking cannot be processed.");
      }

      if (booking.date !== todayIST()) {
        throw new AppError(
          409,
          "Mark arrival only on the booking date."
        );
      }

      if (
        !["Booked", "Waiting"].includes(procurement.status) ||
        !["Waiting", "Called"].includes(queue.status)
      ) {
        throw new AppError(
          409,
          "This procurement cannot move to Waiting."
        );
      }

      const changed = procurement.status !== "Waiting";
      procurement.status = "Waiting";

      if (req.body.notes !== undefined) {
        procurement.notes = req.body.notes;
      }

      await procurement.save({ session });

      const notificationIds = [];

      if (changed) {
        const notification = await createNotification(
          {
            user: booking.farmer,
            booking: booking._id,
            type: "procurement",
            message:
              "MANDI LIVE: Your arrival has been recorded. Procurement status: Waiting."
          },
          session
        );

        notificationIds.push(notification._id);
      }

      return { notificationIds };
    });

    await deliverNotifications(committed.notificationIds);
  } else {
    const queue = await Queue.findOne({
      booking: initial.booking
    }).lean();

    if (!queue) {
      throw new AppError(404, "Related queue entry not found.");
    }

    await changeQueueStatus(
      req.user,
      queue._id,
      requestedStatus === "Under Verification" ? "Serving" : "Completed",
      {
        actualQuantityKg: req.body.actualQuantityKg,
        notes: req.body.notes
      }
    );
  }

  const updated = await populateRecord(
    Procurement.findById(req.params.id)
  )
    .populate("verifiedBy", "name")
    .lean();

  return ok(res, updated, "Procurement status updated.");
}

async function updatePaymentStatus(req, res) {
  const initial = await Payment.findById(req.params.id).lean();

  if (!initial) {
    throw new AppError(404, "Payment record not found.");
  }

  assertCentreAccess(req.user, initial.centre);

  const committed = await withTransaction(async (session) => {
    await lockCentre(initial.centre, session);

    const payment = await Payment.findById(req.params.id).session(session);

    if (!payment) {
      throw new AppError(404, "Payment record not found.");
    }

    const booking = await Booking.findById(payment.booking).session(session);
    const procurement = await Procurement.findById(payment.procurement)
      .session(session);

    if (!booking || !procurement || !booking.active) {
      throw new AppError(
        409,
        "Cancelled or invalid bookings cannot receive payment-status updates."
      );
    }

    if (
      booking.status !== "Completed" ||
      procurement.status !== "Procurement Completed"
    ) {
      throw new AppError(
        409,
        "Complete procurement before updating its payment record."
      );
    }

    if (payment.status === "Completed") {
      throw new AppError(409, "Completed payment records are read-only.");
    }

    const allowed = {
      Pending: ["Processing"],
      Processing: ["Completed", "Failed"],
      Failed: ["Processing"],
      Completed: []
    };

    const requested = req.body.status;
    const changed = requested !== payment.status;

    if (changed && !allowed[payment.status].includes(requested)) {
      throw new AppError(
        409,
        `Payment cannot move from ${payment.status} to ${requested}.`
      );
    }

    const amount = req.body.amountRupees ?? payment.amountRupees;

    if (["Processing", "Completed"].includes(requested) && amount <= 0) {
      throw new AppError(400, "Enter a positive recorded amount in rupees.");
    }

    const nextNotes = req.body.notes ?? payment.notes;

    if (requested === "Failed" && !nextNotes.trim()) {
      throw new AppError(400, "Enter a reason for the failed payment status.");
    }

    payment.status = requested;
    payment.amountRupees = amount;
    payment.updatedBy = req.user._id;
    payment.notes = nextNotes;

    if (req.body.reference !== undefined) {
      payment.reference = req.body.reference;
    }

    if (requested === "Completed") {
      payment.completedAt = new Date();
    }

    await payment.save({ session });

    const notificationIds = [];

    if (changed) {
      const notification = await createNotification(
        {
          user: payment.farmer,
          booking: payment.booking,
          type: "payment",
          message:
            `MANDI LIVE: Procurement payment record is now ${payment.status}. ` +
            `Recorded amount: INR ${payment.amountRupees.toFixed(2)}. ` +
            "This is a monitoring update; MANDI LIVE does not transfer procurement money."
        },
        session
      );

      notificationIds.push(notification._id);
    }

    return { notificationIds };
  });

  await deliverNotifications(committed.notificationIds);

  const updated = await populateRecord(
    Payment.findById(req.params.id)
  )
    .populate("updatedBy", "name")
    .lean();

  return ok(
    res,
    updated,
    "Payment monitoring record updated. No procurement money was transferred."
  );
}

async function getSandboxContext(paymentId) {
  const payment = await Payment.findById(paymentId)
    .select("+sandboxOrders");

  if (!payment) {
    throw new AppError(404, "Payment record not found.");
  }

  const booking = await Booking.findById(payment.booking).lean();

  if (!booking || !booking.active || booking.status !== "Completed") {
    throw new AppError(
      409,
      "The separate sandbox demonstration is available only on completed, non-cancelled bookings."
    );
  }

  return { payment, booking };
}

async function listTestOrders(req, res) {
  const payment = await Payment.findById(req.params.id)
    .select("+sandboxOrders")
    .lean();

  if (!payment) {
    throw new AppError(404, "Payment record not found.");
  }

  return ok(res, {
    enabled: env.paymentMode === "razorpay_test",
    demoAmountPaise: SANDBOX_AMOUNT_PAISE,
    currency: SANDBOX_CURRENCY,
    items: payment.sandboxOrders || [],
    notice:
      "Sandbox checkout records are not farmer payouts and do not change procurement payment status."
  });
}

async function createTestOrder(req, res) {
  const client = requireSandbox();
  const { payment } = await getSandboxContext(req.params.id);

  if (payment.sandboxOrders.length >= MAX_SANDBOX_ORDERS) {
    throw new AppError(
      409,
      "The sandbox order limit for this record has been reached."
    );
  }

  let providerOrder;

  try {
    providerOrder = await client.orders.create({
      amount: SANDBOX_AMOUNT_PAISE,
      currency: SANDBOX_CURRENCY,
      receipt: `demo_${randomUUID().replaceAll("-", "")}`,
      notes: {
        purpose: "MANDI LIVE sandbox checkout only",
        procurementPaymentRecord: String(payment._id)
      }
    });
  } catch {
    throw new AppError(
      502,
      "Razorpay could not create a test order. Check the TEST credentials and provider availability."
    );
  }

  if (
    !providerOrder?.id ||
    Number(providerOrder.amount) !== SANDBOX_AMOUNT_PAISE ||
    providerOrder.currency !== SANDBOX_CURRENCY
  ) {
    throw new AppError(
      502,
      "The sandbox provider returned an unexpected order."
    );
  }

  const sandboxOrder = {
    orderId: providerOrder.id,
    amountPaise: SANDBOX_AMOUNT_PAISE,
    currency: SANDBOX_CURRENCY,
    status: "Created",
    createdBy: req.user._id
  };

  /*
   * The provider call cannot participate in a MongoDB transaction.
   * Append atomically with a database-side length condition.
   *
   * If this save fails, the unexposed remote order may remain unused at
   * Razorpay. No Checkout information is returned until the local save succeeds.
   */
  const saved = await Payment.updateOne(
    {
      _id: payment._id,
      $expr: {
        $lt: [
          { $size: { $ifNull: ["$sandboxOrders", []] } },
          MAX_SANDBOX_ORDERS
        ]
      }
    },
    {
      $push: { sandboxOrders: sandboxOrder }
    },
    { runValidators: true }
  );

  if (saved.modifiedCount !== 1) {
    throw new AppError(
      409,
      "The local sandbox order limit changed. Refresh before trying again."
    );
  }

  return ok(
    res,
    {
      keyId: env.razorpayKeyId,
      orderId: providerOrder.id,
      amountPaise: SANDBOX_AMOUNT_PAISE,
      currency: SANDBOX_CURRENCY,
      name: "MANDI LIVE",
      description: "TEST checkout demonstration — not a farmer payout",
      notice:
        "Use Razorpay test payment details only. This cannot update procurement payment status."
    },
    "Sandbox order created by the backend.",
    201
  );
}

async function verifyTestPayment(req, res) {
  const client = requireSandbox();
  const { payment } = await getSandboxContext(req.params.id);

  const {
    razorpay_order_id: orderId,
    razorpay_payment_id: paymentId,
    razorpay_signature: signature
  } = req.body;

  const storedOrder = payment.sandboxOrders.find(
    (order) => order.orderId === orderId
  );

  if (!storedOrder) {
    throw new AppError(
      400,
      "This order does not belong to the selected local payment record."
    );
  }

  if (
    storedOrder.status === "Verified" &&
    storedOrder.paymentId !== paymentId
  ) {
    throw new AppError(
      409,
      "This sandbox order was already verified with another payment."
    );
  }

  const expected = createHmac("sha256", env.razorpayKeySecret)
    .update(`${storedOrder.orderId}|${paymentId}`)
    .digest();

  const supplied = Buffer.from(signature, "hex");

  if (
    supplied.length !== expected.length ||
    !timingSafeEqual(supplied, expected)
  ) {
    throw new AppError(400, "Invalid Razorpay test payment signature.");
  }

  let providerPayment;

  try {
    providerPayment = await client.payments.fetch(paymentId);
  } catch {
    throw new AppError(
      502,
      "The signature could not be checked against the payment provider. Retry verification."
    );
  }

  if (
    providerPayment.order_id !== storedOrder.orderId ||
    Number(providerPayment.amount) !== storedOrder.amountPaise ||
    providerPayment.currency !== storedOrder.currency
  ) {
    throw new AppError(
      400,
      "The provider payment does not match the stored sandbox order."
    );
  }

  if (!["authorized", "captured"].includes(providerPayment.status)) {
    throw new AppError(
      409,
      "This sandbox payment has not been authorized. Complete the test Checkout first."
    );
  }

  const committed = await withTransaction(async (session) => {
    await lockCentre(payment.centre, session);

    const current = await Payment.findById(payment._id)
      .select("+sandboxOrders")
      .session(session);

    if (!current) {
      throw new AppError(404, "Payment record not found.");
    }

    const order = current.sandboxOrders.find(
      (item) => item.orderId === orderId
    );

    if (!order) {
      throw new AppError(404, "Stored sandbox order not found.");
    }

    if (order.status === "Verified") {
      if (order.paymentId !== paymentId) {
        throw new AppError(409, "Sandbox order verification conflict.");
      }

      return { notificationIds: [] };
    }

    order.status = "Verified";
    order.paymentId = paymentId;
    order.verifiedAt = new Date();

    // Deliberately do not update current.status or current.amountRupees.
    await current.save({ session });

    const notification = await createNotification(
      {
        user: req.user._id,
        booking: current.booking,
        type: "general",
        message:
          "MANDI LIVE: A Razorpay TEST checkout signature was verified. " +
          "This is not a farmer payout and did not change procurement payment status.",
        deliveryStatus: "not_requested"
      },
      session
    );

    return { notificationIds: [notification._id] };
  });

  return ok(
    res,
    {
      orderId,
      paymentId,
      verified: true,
      providerStatus: providerPayment.status,
      notificationIds: committed.notificationIds,
      procurementPaymentStatusUnchanged: true
    },
    "Sandbox signature and provider payment verified. No farmer payout was performed."
  );
}

module.exports = {
  listProcurements,
  getProcurement,
  updateProcurementStatus,
  listPayments,
  getPayment,
  updatePaymentStatus,
  listTestOrders,
  createTestOrder,
  verifyTestPayment
};