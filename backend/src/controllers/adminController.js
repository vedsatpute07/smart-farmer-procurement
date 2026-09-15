const {
  User,
  ProcurementCentre,
  Booking,
  Queue,
  Procurement,
  Payment
} = require("../models");

const { AppError } = require("../utils/errors");
const { ok } = require("../utils/responses");
const { todayIST } = require("../utils/dates");
const { publicUser } = require("../middleware/auth");

const bookingController = require("./bookingController");
const recordController = require("./recordController");

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function countPaymentStatus(status) {
  const result = await Payment.aggregate([
    {
      $match: { status }
    },
    {
      $lookup: {
        from: "bookings",
        localField: "booking",
        foreignField: "_id",
        as: "bookingRecord"
      }
    },
    {
      $match: {
        "bookingRecord.active": true
      }
    },
    {
      $count: "total"
    }
  ]);

  return result[0]?.total || 0;
}

async function dashboard(_req, res) {
  const date = todayIST();

  const [
    totalFarmers,
    activeFarmers,
    totalCentres,
    activeCentres,
    todaysBookings,
    waitingFarmers,
    completedProcurements,
    pendingPayments,
    processingPayments,
    failedPayments
  ] = await Promise.all([
    User.countDocuments({ role: "farmer" }),
    User.countDocuments({ role: "farmer", active: true }),
    ProcurementCentre.countDocuments(),
    ProcurementCentre.countDocuments({ active: true }),
    Booking.countDocuments({ date, active: true }),
    Queue.countDocuments({ date, status: "Waiting" }),
    Procurement.countDocuments({ status: "Procurement Completed" }),
    countPaymentStatus("Pending"),
    countPaymentStatus("Processing"),
    countPaymentStatus("Failed")
  ]);

  return ok(res, {
    date,
    timeZone: "Asia/Kolkata",
    totalFarmers,
    activeFarmers,
    totalCentres,
    activeCentres,
    todaysBookings,
    waitingFarmers,
    completedProcurements,
    pendingPayments,
    processingPayments,
    failedPayments
  });
}

async function listFarmers(req, res) {
  const page = req.query.page || 1;
  const limit = req.query.limit || 20;
  const filter = { role: "farmer" };

  if (req.query.search) {
    const expression = new RegExp(
      escapeRegex(req.query.search),
      "i"
    );

    filter.$or = [
      { name: expression },
      { email: expression },
      { phone: expression },
      { village: expression },
      { district: expression }
    ];
  }

  const [users, total] = await Promise.all([
    User.find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .skip((page - 1) * limit)
      .limit(limit),

    User.countDocuments(filter)
  ]);

  return ok(res, {
    items: users.map(publicUser),
    total,
    page,
    limit
  });
}

async function updateFarmer(req, res) {
  const updates = {};

  for (const field of ["name", "village", "district", "address", "active"]) {
    if (req.body[field] !== undefined) {
      updates[field] = req.body[field];
    }
  }

  const change = {
    $set: updates
  };

  if (req.body.active !== undefined) {
    change.$inc = { authVersion: 1 };
  }

  const user = await User.findOneAndUpdate(
    {
      _id: req.params.id,
      role: "farmer"
    },
    change,
    {
      new: true,
      runValidators: true
    }
  );

  if (!user) {
    throw new AppError(404, "Farmer not found.");
  }

  return ok(
    res,
    publicUser(user),
    "Farmer account updated. Account-status changes revoke existing sessions."
  );
}

module.exports = {
  dashboard,
  stats: dashboard,
  listFarmers,
  updateFarmer,
  listBookings: bookingController.listBookings,
  listProcurements: recordController.listProcurements,
  listPayments: recordController.listPayments
};