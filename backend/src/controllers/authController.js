const bcrypt = require("bcrypt");

const { User } = require("../models");
const { AppError } = require("../utils/errors");
const { ok } = require("../utils/responses");

const {
  createAccessToken,
  publicUser
} = require("../middleware/auth");

const otpService = require("../services/otpService");

async function register(req, res) {
  const {
    name,
    phone,
    email,
    password,
    village,
    district,
    address
  } = req.body;

  const existing = await User.exists({
    $or: [{ email }, { phone }]
  });

  if (existing) {
    throw new AppError(
      409,
      "An account with these contact details already exists. Please log in."
    );
  }

  const passwordHash = await bcrypt.hash(password, 12);

  const user = await User.create({
    name,
    phone,
    email,
    passwordHash,
    village,
    district,
    address,
    role: "farmer",
    verified: false,
    active: true,
    isDemo: false
  });

  let challenge;

  try {
    challenge = await otpService.issueOtp(user, "registration");
  } catch (error) {
    /*
     * Account creation may have succeeded even if OTP challenge creation failed.
     * Keep the account so the user can recover through password login.
     */
    if (error.isOperational) {
      throw error;
    }

    throw new AppError(
      503,
      "Your account was created, but an OTP could not be prepared. " +
      "Use Login with your password to request registration verification again."
    );
  }

  return ok(
    res,
    challenge,
    challenge.deliveryStatus === "failed"
      ? "Account created, but SMS delivery failed. Check the recipient setup and request another OTP."
      : "Account created. Verify the registration OTP.",
    201
  );
}

async function login(req, res) {
  const normalized = req.body.identifier.includes("@")
    ? req.body.identifier.toLowerCase()
    : req.body.identifier;

  const user = await User.findOne({
    $or: [
      { email: normalized },
      { phone: normalized }
    ]
  }).select("+passwordHash");

  if (!user || !user.active) {
    throw new AppError(
      401,
      "Invalid email/phone or password."
    );
  }

  const passwordMatches = await bcrypt.compare(
    req.body.password,
    user.passwordHash
  );

  if (!passwordMatches) {
    throw new AppError(
      401,
      "Invalid email/phone or password."
    );
  }

  const purpose = user.verified ? "login" : "registration";
  const challenge = await otpService.issueOtp(user, purpose);

  return ok(
    res,
    challenge,
    challenge.deliveryStatus === "failed"
      ? "Password verified, but SMS delivery failed. Check your Twilio recipient configuration."
      : purpose === "registration"
        ? "Verify your registration before continuing to login."
        : "Password verified. Enter the login OTP."
  );
}

async function verifyOtp(req, res) {
  const result = await otpService.consumeOtp(
    req.body.challengeId,
    req.body.otp
  );

  if (result.purpose === "registration") {
    return ok(
      res,
      {
        purpose: "registration",
        user: publicUser(result.user)
      },
      "Registration verified. Log in with your password and a fresh login OTP."
    );
  }

  return ok(
    res,
    {
      purpose: "login",
      token: createAccessToken(result.user),
      user: publicUser(result.user)
    },
    "Login successful."
  );
}

async function resendOtp(req, res) {
  const challenge = await otpService.resendOtp(
    req.body.challengeId
  );

  return ok(
    res,
    challenge,
    challenge.deliveryStatus === "failed"
      ? "A new OTP was prepared, but SMS delivery failed."
      : "A new OTP was sent. The previous challenge is no longer valid."
  );
}

async function logout(req, res) {
  await User.updateOne(
    { _id: req.user._id },
    { $inc: { authVersion: 1 } }
  );

  return ok(
    res,
    null,
    "Logged out. Existing access sessions for this account were revoked."
  );
}

module.exports = {
  register,
  login,
  verifyOtp,
  resendOtp,
  logout
};