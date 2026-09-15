const { User } = require("../models");
const { AppError } = require("../utils/errors");
const { ok } = require("../utils/responses");
const { publicUser } = require("../middleware/auth");

async function getProfile(req, res) {
  return ok(res, publicUser(req.user));
}

async function updateProfile(req, res) {
  const allowedFields = [
    "name",
    "village",
    "district",
    "address"
  ];

  const updates = {};

  for (const field of allowedFields) {
    if (req.body[field] !== undefined) {
      updates[field] = req.body[field];
    }
  }

  const user = await User.findOneAndUpdate(
    {
      _id: req.user._id,
      active: true
    },
    {
      $set: updates
    },
    {
      new: true,
      runValidators: true
    }
  );

  if (!user) {
    throw new AppError(404, "Profile not found.");
  }

  return ok(
    res,
    publicUser(user),
    "Profile updated."
  );
}

module.exports = {
  getProfile,
  updateProfile
};