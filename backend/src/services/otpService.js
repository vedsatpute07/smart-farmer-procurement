const {
  randomInt,
  randomUUID,
  createHmac,
  timingSafeEqual
} = require("node:crypto");

const env = require("../config/env");

const {
  User,
  OtpVerification
} = require("../models");

const { AppError } = require("../utils/errors");
const { withTransaction } = require("../utils/transaction");

const {
  createNotification,
  deliverNotification
} = require("./notificationService");

const { sendOTP } = require("./smsService");

function hashOtp(challengeId, otp) {
  return createHmac("sha256", env.otpHashSecret)
    .update(`mandi-live:otp:${challengeId}:${otp}`)
    .digest("hex");
}

function assertSmsEligible(user) {
  if (user.isDemo && env.smsMode === "twilio") {
    throw new AppError(
      409,
      "This fictional DEMO account cannot receive real SMS. " +
      "Use mock mode or configure a consenting test account through the seed setup."
    );
  }
}

async function issueOtp(user, purpose, previousChallengeId = null) {
  if (!["registration", "login"].includes(purpose)) {
    throw new AppError(400, "Invalid OTP purpose.");
  }

  assertSmsEligible(user);

  const otp = String(randomInt(100000, 1000000));
  const challengeId = randomUUID();

  const result = await withTransaction(async (session) => {
    const now = new Date();

    const account = await User.findOne({
      _id: user._id,
      active: true
    }).session(session);

    if (!account) {
      throw new AppError(403, "This account is not available.");
    }

    assertSmsEligible(account);

    if (purpose === "login" && !account.verified) {
      throw new AppError(403, "Verify registration before logging in.");
    }

    if (purpose === "registration" && account.verified) {
      throw new AppError(409, "Registration is already verified. Please log in.");
    }

    const current = await OtpVerification.findOne({
      user: account._id
    }).session(session);

    if (
      previousChallengeId &&
      (!current || current.challengeId !== previousChallengeId)
    ) {
      throw new AppError(
        400,
        "This OTP challenge is no longer valid. Start from Login again."
      );
    }

    const cooldownMs = env.otpResendCooldownSeconds * 1000;

    if (
      current &&
      now.getTime() - current.lastSentAt.getTime() < cooldownMs
    ) {
      const remaining = Math.ceil(
        (
          cooldownMs -
          (now.getTime() - current.lastSentAt.getTime())
        ) / 1000
      );

      throw new AppError(
        429,
        `Please wait ${remaining} seconds before requesting another OTP.`
      );
    }

    const expiresAt = new Date(
      now.getTime() + env.otpTtlSeconds * 1000
    );

    const values = {
      user: account._id,
      challengeId,
      purpose,
      otpHash: hashOtp(challengeId, otp),
      attempts: 0,
      expiresAt,
      lastSentAt: now
    };

    if (current) {
      await OtpVerification.updateOne(
        { _id: current._id },
        { $set: values },
        { session, runValidators: true }
      );
    } else {
      await OtpVerification.create([values], { session });
    }

    const notification = await createNotification(
      {
        user: account._id,
        type: "otp",
        message:
          `A ${purpose} OTP was requested for your MANDI LIVE account. ` +
          "Never share your code. The code itself is not stored in this notification."
      },
      session
    );

    return {
      notificationId: notification._id,
      expiresAt,
      phone: account.phone
    };
  });

  const delivery = await deliverNotification(
    result.notificationId,
    (phoneNumber) => sendOTP(phoneNumber, otp)
  );

  return {
    challengeId,
    purpose,
    expiresAt: result.expiresAt,
    resendAfterSeconds: env.otpResendCooldownSeconds,
    maxAttempts: env.otpMaxAttempts,
    deliveryStatus: delivery.status,
    maskedPhone:
      `${result.phone.slice(0, 3)}******${result.phone.slice(-3)}`
  };
}

async function resendOtp(challengeId) {
  const challenge = await OtpVerification.findOne({ challengeId });

  if (!challenge) {
    throw new AppError(
      400,
      "OTP challenge expired or was used. Start from Login again."
    );
  }

  const user = await User.findById(challenge.user);

  if (!user || !user.active) {
    throw new AppError(400, "This OTP challenge is no longer available.");
  }

  return issueOtp(user, challenge.purpose, challengeId);
}

async function consumeOtp(challengeId, otp) {
  /*
   * Atomically increment before comparing so concurrent wrong attempts
   * cannot bypass the limit.
   */
  const challenge = await OtpVerification.findOneAndUpdate(
    {
      challengeId,
      expiresAt: { $gt: new Date() },
      attempts: { $lt: env.otpMaxAttempts }
    },
    {
      $inc: { attempts: 1 }
    },
    { new: true }
  ).select("+otpHash");

  if (!challenge) {
    throw new AppError(
      400,
      "OTP expired, already used or attempt limit reached. Request a new OTP."
    );
  }

  const suppliedHash = Buffer.from(
    hashOtp(challengeId, otp),
    "hex"
  );

  const storedHash = Buffer.from(challenge.otpHash, "hex");

  if (
    suppliedHash.length !== storedHash.length ||
    !timingSafeEqual(suppliedHash, storedHash)
  ) {
    throw new AppError(400, "Invalid OTP. Please check the latest code.");
  }

  return withTransaction(async (session) => {
    const consumed = await OtpVerification.findOneAndDelete(
      {
        _id: challenge._id,
        challengeId,
        otpHash: challenge.otpHash,
        expiresAt: { $gt: new Date() }
      },
      { session }
    );

    if (!consumed) {
      throw new AppError(
        400,
        "This OTP was already used, replaced or expired."
      );
    }

    const user = await User.findById(consumed.user)
      .select("+authVersion")
      .session(session);

    if (!user || !user.active) {
      throw new AppError(403, "Your account is not available.");
    }

    if (consumed.purpose === "registration") {
      if (user.verified) {
        throw new AppError(409, "Registration is already verified.");
      }

      user.verified = true;
      await user.save({ session });
    } else if (!user.verified) {
      throw new AppError(
        403,
        "Registration verification must be completed before login."
      );
    }

    return {
      user,
      purpose: consumed.purpose
    };
  });
}

module.exports = {
  issueOtp,
  resendOtp,
  consumeOtp
};