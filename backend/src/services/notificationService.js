const {
  Notification,
  User
} = require("../models");

const env = require("../config/env");
const { sendSMS } = require("./smsService");

async function createNotification(
  {
    user,
    booking,
    type,
    message,
    deliveryStatus = "pending"
  },
  session = null
) {
  const [notification] = await Notification.create(
    [{
      user,
      ...(booking ? { booking } : {}),
      type,
      message,
      deliveryStatus
    }],
    session ? { session } : {}
  );

  return notification;
}

/*
 * Call only after the business transaction commits.
 * A delivery failure must not turn a successful booking into a failed booking.
 *
 * An optional sender callback supports OTP and named SMS helper functions.
 */
async function deliverNotification(notificationId, sender = null) {
  try {
    const notification = await Notification.findOneAndUpdate(
      {
        _id: notificationId,
        deliveryStatus: "pending"
      },
      {
        $set: { deliveryStatus: "sending" }
      },
      { new: true }
    );

    if (!notification) {
      return {
        success: false,
        status: "not-pending"
      };
    }

    const recipient = await User.findById(notification.user)
      .select("phone isDemo")
      .lean();

    let result;

    if (!recipient) {
      result = {
        success: false,
        status: "failed",
        error: "Notification recipient is no longer available."
      };
    } else if (recipient.isDemo && env.smsMode === "twilio") {
      /*
       * Fictional seed phone numbers must never be sent to Twilio.
       * Seeded accounts work with mock OTP. For actual Twilio delivery,
       * register a real, consenting test recipient through the UI.
       */
      result = {
        success: false,
        status: "failed",
        error: "Real SMS is disabled for fictional DEMO accounts."
      };
    } else {
      result = sender
        ? await sender(recipient.phone)
        : await sendSMS(recipient.phone, notification.message);
    }

    await Notification.updateOne(
      { _id: notification._id },
      {
        $set: {
          deliveryStatus: result.status,
          providerMessageId: result.providerMessageId || "",
          deliveryError: result.error || "",
          ...(result.success ? { deliveredAt: new Date() } : {})
        }
      }
    );

    return result;
  } catch {
    console.error(
      "Notification delivery could not be completed. Saved business records were retained."
    );

    try {
      await Notification.updateOne(
        {
          _id: notificationId,
          deliveryStatus: "sending"
        },
        {
          $set: {
            deliveryStatus: "failed",
            deliveryError:
              "Delivery interrupted. Provider acceptance may be uncertain."
          }
        }
      );
    } catch {
      console.error("Notification delivery outcome could not be saved.");
    }

    return {
      success: false,
      status: "failed",
      error: "Notification delivery is temporarily unavailable."
    };
  }
}

async function deliverNotifications(notificationIds) {
  const outcomes = [];

  for (const notificationId of notificationIds) {
    outcomes.push(await deliverNotification(notificationId));
  }

  return outcomes;
}

module.exports = {
  createNotification,
  deliverNotification,
  deliverNotifications
};