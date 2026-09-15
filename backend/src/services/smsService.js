const twilio = require("twilio");
const env = require("../config/env");

let client;

function getClient() {
  if (!client) {
    client = twilio(
      env.twilioAccountSid,
      env.twilioAuthToken,
      {
        autoRetry: false,
        timeout: 10000
      }
    );
  }

  return client;
}

async function sendSMS(phoneNumber, message) {
  if (!/^\+[1-9]\d{7,14}$/.test(phoneNumber)) {
    return {
      success: false,
      status: "failed",
      error: "Recipient phone number is invalid."
    };
  }

  if (
    typeof message !== "string" ||
    !message.trim() ||
    message.length > 1000
  ) {
    return {
      success: false,
      status: "failed",
      error: "SMS message is invalid."
    };
  }

  if (env.smsMode === "mock") {
    console.log(`[MOCK SMS] To ${phoneNumber}: ${message}`);

    return {
      success: true,
      status: "mock",
      providerMessageId: ""
    };
  }

  try {
    const response = await getClient().messages.create({
      from: env.twilioPhoneNumber,
      to: phoneNumber,
      body: message
    });

    return {
      success: true,
      status: "sent",
      providerMessageId: response.sid
    };
  } catch {
    console.error("Twilio could not accept an SMS message.");

    return {
      success: false,
      status: "failed",
      error:
        "SMS delivery was not accepted. Check sender, permitted recipient and Twilio configuration."
    };
  }
}

async function sendOTP(phoneNumber, otp) {
  const minutes = Math.ceil(env.otpTtlSeconds / 60);

  return sendSMS(
    phoneNumber,
    `MANDI LIVE: Your OTP is ${otp}. ` +
    `It expires in ${minutes} minute(s). Do not share this code.`
  );
}

async function sendBookingConfirmation(phoneNumber, bookingDetails) {
  return sendSMS(
    phoneNumber,
    `MANDI LIVE: Booking confirmed at ${bookingDetails.centreName} on ` +
    `${bookingDetails.date}, ${bookingDetails.startTime}-${bookingDetails.endTime} IST. ` +
    `Token: ${bookingDetails.tokenNumber}.`
  );
}

async function sendTokenNotification(phoneNumber, tokenDetails) {
  return sendSMS(
    phoneNumber,
    `MANDI LIVE: Token ${tokenDetails.tokenNumber}. ` +
    `${tokenDetails.message || "Check your dashboard for the latest queue status."}`
  );
}

async function sendQueueNotification(phoneNumber, queuePosition) {
  const text = typeof queuePosition === "number"
    ? `Your current queue position is ${queuePosition}.`
    : String(queuePosition);

  return sendSMS(phoneNumber, `MANDI LIVE: ${text}`);
}

async function sendProcurementNotification(phoneNumber, procurementStatus) {
  return sendSMS(
    phoneNumber,
    `MANDI LIVE: Procurement status: ${procurementStatus}.`
  );
}

async function sendPaymentNotification(phoneNumber, paymentStatus) {
  return sendSMS(
    phoneNumber,
    `MANDI LIVE: Payment monitoring status: ${paymentStatus}. ` +
    "This platform records status; it does not transfer procurement money."
  );
}

module.exports = {
  sendSMS,
  sendOTP,
  sendBookingConfirmation,
  sendTokenNotification,
  sendQueueNotification,
  sendProcurementNotification,
  sendPaymentNotification
};