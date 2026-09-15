const {
  User,
  Booking,
  Notification
} = require("../models");

const { AppError } = require("../utils/errors");
const { ok } = require("../utils/responses");
const {
  sameId,
  assertCentreAccess
} = require("../utils/access");
const {
  createNotification,
  deliverNotification
} = require("../services/notificationService");

async function listNotifications(req, res) {
  const page = req.query.page || 1;
  const limit = req.query.limit || 20;

  const filter = {
    user: req.user._id,
    ...(req.query.unreadOnly ? { read: false } : {})
  };

  const [items, total, unreadCount] = await Promise.all([
    Notification.find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),

    Notification.countDocuments(filter),

    Notification.countDocuments({
      user: req.user._id,
      read: false
    })
  ]);

  return ok(res, {
    items,
    total,
    unreadCount,
    page,
    limit
  });
}

async function markRead(req, res) {
  const notification = await Notification.findOneAndUpdate(
    {
      _id: req.params.id,
      user: req.user._id
    },
    {
      $set: { read: true }
    },
    { new: true }
  );

  if (!notification) {
    throw new AppError(404, "Notification not found.");
  }

  return ok(res, notification, "Notification marked as read.");
}

async function sendManualSms(req, res) {
  const recipient = await User.findOne({
    _id: req.body.userId,
    role: "farmer",
    active: true,
    verified: true
  }).lean();

  if (!recipient) {
    throw new AppError(404, "Active verified farmer not found.");
  }

  let booking = null;

  if (req.body.bookingId) {
    booking = await Booking.findById(req.body.bookingId).lean();

    if (!booking || !sameId(booking.farmer, recipient._id)) {
      throw new AppError(
        400,
        "The selected booking does not belong to this farmer."
      );
    }
  }

  if (req.user.role === "staff") {
    if (!booking) {
      throw new AppError(
        400,
        "Staff notifications must reference a booking."
      );
    }

    assertCentreAccess(req.user, booking.centre);
  }

  const notification = await createNotification({
    user: recipient._id,
    booking: booking?._id,
    type: "general",
    message: `MANDI LIVE: ${req.body.message}`
  });

  const delivery = await deliverNotification(notification._id);
  const saved = await Notification.findById(notification._id).lean();

  return ok(
    res,
    {
      notification: saved,
      deliveryStatus: delivery.status
    },
    delivery.success
      ? "Notification saved and SMS accepted."
      : "Notification saved, but SMS delivery was not accepted.",
    201
  );
}

module.exports = {
  listNotifications,
  markRead,
  sendManualSms
};