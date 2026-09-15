const jwt = require("jsonwebtoken");

const env = require("../config/env");
const { User } = require("../models");
const { AppError, asyncHandler } = require("../utils/errors");

const authenticate = asyncHandler(async (req, _res, next) => {
  const authorization = req.headers.authorization || "";

  if (!authorization.startsWith("Bearer ")) {
    throw new AppError(401, "Please log in to continue.");
  }

  const token = authorization.slice(7).trim();

  if (!token || token.length > 4096) {
    throw new AppError(401, "Invalid authentication token.");
  }

  let payload;

  try {
    payload = jwt.verify(token, env.jwtSecret, {
      algorithms: ["HS256"],
      issuer: "mandi-live",
      audience: "mandi-live-web"
    });
  } catch {
    throw new AppError(
      401,
      "Your session is invalid or expired. Please log in again."
    );
  }

  if (
    typeof payload !== "object" ||
    payload.type !== "access" ||
    typeof payload.sub !== "string" ||
    !/^[a-f\d]{24}$/i.test(payload.sub) ||
    !Number.isInteger(payload.version)
  ) {
    throw new AppError(401, "Invalid authentication token.");
  }

  const user = await User.findById(payload.sub).select("+authVersion");

  if (
    !user ||
    !user.active ||
    !user.verified ||
    user.authVersion !== payload.version
  ) {
    throw new AppError(
      401,
      "Your session is no longer available. Please log in again."
    );
  }

  req.user = user;
  next();
});

function authorize(...roles) {
  return (req, _res, next) => {
    if (!req.user) {
      return next(new AppError(401, "Please log in to continue."));
    }

    if (!roles.includes(req.user.role)) {
      return next(
        new AppError(403, "Your role cannot perform this operation.")
      );
    }

    next();
  };
}

function createAccessToken(user) {
  if (!Number.isInteger(user.authVersion)) {
    throw new Error("Authentication version must be loaded before issuing a JWT.");
  }

  return jwt.sign(
    {
      type: "access",
      version: user.authVersion
    },
    env.jwtSecret,
    {
      algorithm: "HS256",
      subject: String(user._id),
      issuer: "mandi-live",
      audience: "mandi-live-web",
      expiresIn: env.jwtExpiresIn
    }
  );
}

function publicUser(user) {
  return {
    _id: String(user._id),
    name: user.name,
    email: user.email,
    phone: user.phone,
    role: user.role,
    centre: user.centre ? String(user.centre._id || user.centre) : null,
    village: user.village,
    district: user.district,
    address: user.address,
    verified: user.verified,
    active: user.active,
    isDemo: user.isDemo
  };
}

module.exports = {
  authenticate,
  authorize,
  createAccessToken,
  publicUser
};