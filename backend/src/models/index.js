const mongoose = require("mongoose");

const { Schema } = mongoose;
const objectId = Schema.Types.ObjectId;
const options = { timestamps: true, strict: "throw" };

const QUEUE_STATUSES = [
  "Waiting",
  "Called",
  "Serving",
  "Completed",
  "Skipped",
  "Cancelled"
];

const PROCUREMENT_STATUSES = [
  "Booked",
  "Waiting",
  "Under Verification",
  "Procurement Completed"
];

const PAYMENT_STATUSES = [
  "Pending",
  "Processing",
  "Completed",
  "Failed"
];

const phonePattern = /^\+[1-9]\d{7,14}$/;
const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;

function ref(model, required = true) {
  return {
    type: objectId,
    ref: model,
    required,
    index: true
  };
}

function finite(value) {
  return Number.isFinite(value);
}

// USERS

const userSchema = new Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 80
    },
    phone: {
      type: String,
      required: true,
      unique: true,
      match: phonePattern
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      maxlength: 160,
      match: /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    },
    passwordHash: {
      type: String,
      required: true,
      select: false
    },
    role: {
      type: String,
      enum: ["farmer", "staff", "admin"],
      default: "farmer",
      required: true
    },
    centre: ref("ProcurementCentre", false),
    village: {
      type: String,
      trim: true,
      maxlength: 100,
      default: ""
    },
    district: {
      type: String,
      trim: true,
      maxlength: 100,
      default: ""
    },
    address: {
      type: String,
      trim: true,
      maxlength: 250,
      default: ""
    },
    verified: {
      type: Boolean,
      default: false
    },
    active: {
      type: Boolean,
      default: true
    },
    isDemo: {
      type: Boolean,
      default: false
    },
    authVersion: {
      type: Number,
      default: 0,
      select: false
    }
  },
  { ...options, collection: "users" }
);

userSchema.pre("validate", function validateStaffAssignment(next) {
  if (this.role === "staff" && !this.centre) {
    this.invalidate("centre", "Staff must be assigned to a procurement centre.");
  }

  next();
});

userSchema.set("toJSON", {
  transform(_document, result) {
    delete result.passwordHash;
    delete result.authVersion;
    delete result.__v;
    return result;
  }
});

// PROCUREMENT CENTRES

const centreSchema = new Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 3,
      maxlength: 120
    },
    address: {
      type: String,
      required: true,
      trim: true,
      maxlength: 250
    },
    district: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100
    },
    phone: {
      type: String,
      required: true,
      match: phonePattern
    },
    workingHours: {
      type: String,
      required: true,
      maxlength: 100
    },
    crops: {
      type: [String],
      required: true,
      validate: {
        validator(value) {
          return (
            value.length > 0 &&
            value.length <= 20 &&
            new Set(value).size === value.length &&
            value.every((crop) => crop.length >= 2 && crop.length <= 60)
          );
        },
        message: "Provide 1–20 unique crop names."
      }
    },
    location: {
      type: {
        type: String,
        enum: ["Point"],
        default: "Point",
        required: true
      },
      coordinates: {
        type: [Number],
        required: true,
        validate: {
          validator(value) {
            return (
              value.length === 2 &&
              value.every(Number.isFinite) &&
              value[0] >= -180 &&
              value[0] <= 180 &&
              value[1] >= -90 &&
              value[1] <= 90
            );
          },
          message: "Coordinates must be [longitude, latitude]."
        }
      }
    },
    active: {
      type: Boolean,
      default: true
    },
    isDemo: {
      type: Boolean,
      default: false
    },
    operationVersion: {
      type: Number,
      default: 0
    }
  },
  { ...options, collection: "procurementCentres" }
);

centreSchema.index({ location: "2dsphere" });
centreSchema.index({ district: 1, active: 1 });

// SLOTS

const slotSchema = new Schema(
  {
    centre: ref("ProcurementCentre"),
    date: {
      type: String,
      required: true,
      match: datePattern
    },
    startTime: {
      type: String,
      required: true,
      match: timePattern
    },
    endTime: {
      type: String,
      required: true,
      match: timePattern
    },
    capacity: {
      type: Number,
      required: true,
      min: 1,
      max: 500,
      validate: Number.isInteger
    },
    bookedCount: {
      type: Number,
      default: 0,
      min: 0,
      validate: Number.isInteger
    },
    active: {
      type: Boolean,
      default: true
    }
  },
  { ...options, collection: "slots" }
);

slotSchema.pre("validate", function validateSlot(next) {
  if (this.startTime >= this.endTime) {
    this.invalidate("endTime", "End time must be later than start time.");
  }

  if (this.bookedCount > this.capacity) {
    this.invalidate("capacity", "Capacity cannot be below booked count.");
  }

  next();
});

slotSchema.index(
  { centre: 1, date: 1, startTime: 1, endTime: 1 },
  { unique: true }
);

// BOOKINGS

const bookingSchema = new Schema(
  {
    farmer: ref("User"),
    centre: ref("ProcurementCentre"),
    slot: ref("Slot"),
    date: {
      type: String,
      required: true,
      match: datePattern
    },
    startTime: {
      type: String,
      required: true,
      match: timePattern
    },
    endTime: {
      type: String,
      required: true,
      match: timePattern
    },
    crop: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 60
    },
    quantityKg: {
      type: Number,
      required: true,
      min: 1,
      max: 1000000,
      validate: finite
    },
    status: {
      type: String,
      enum: ["Booked", "Cancelled", "Completed"],
      default: "Booked"
    },
    active: {
      type: Boolean,
      default: true
    },
    cancelledAt: Date
  },
  { ...options, collection: "bookings" }
);

bookingSchema.index(
  { farmer: 1, date: 1 },
  {
    unique: true,
    partialFilterExpression: { active: true },
    name: "one_non_cancelled_booking_per_farmer_per_date"
  }
);

bookingSchema.index({ centre: 1, date: 1, createdAt: 1 });

// TOKENS

const tokenSchema = new Schema(
  {
    number: {
      type: String,
      required: true,
      unique: true
    },
    farmer: ref("User"),
    centre: ref("ProcurementCentre"),
    booking: {
      ...ref("Booking"),
      unique: true
    },
    queue: {
      ...ref("Queue"),
      unique: true
    }
  },
  { ...options, collection: "tokens" }
);

// QUEUES

const queueSchema = new Schema(
  {
    farmer: ref("User"),
    centre: ref("ProcurementCentre"),
    booking: {
      ...ref("Booking"),
      unique: true
    },
    token: {
      ...ref("Token"),
      unique: true
    },
    date: {
      type: String,
      required: true,
      match: datePattern
    },
    startTime: {
      type: String,
      required: true,
      match: timePattern
    },
    status: {
      type: String,
      enum: QUEUE_STATUSES,
      default: "Waiting"
    },
    activeService: {
      type: Boolean,
      default: false
    },
    calledAt: Date,
    completedAt: Date
  },
  { ...options, collection: "queues" }
);

queueSchema.pre("validate", function validateActiveService(next) {
  const expected = ["Called", "Serving"].includes(this.status);

  if (this.activeService !== expected) {
    this.invalidate(
      "activeService",
      "Only Called or Serving entries can be active at the counter."
    );
  }

  next();
});

queueSchema.index({
  centre: 1,
  date: 1,
  status: 1,
  startTime: 1,
  createdAt: 1,
  _id: 1
});

queueSchema.index(
  { centre: 1, date: 1 },
  {
    unique: true,
    partialFilterExpression: { activeService: true },
    name: "one_active_counter_per_centre_per_date"
  }
);

// PROCUREMENT RECORDS

const procurementSchema = new Schema(
  {
    booking: {
      ...ref("Booking"),
      unique: true
    },
    farmer: ref("User"),
    centre: ref("ProcurementCentre"),
    status: {
      type: String,
      enum: PROCUREMENT_STATUSES,
      default: "Booked"
    },
    verifiedBy: ref("User", false),
    verifiedAt: Date,
    completedAt: Date,
    actualQuantityKg: {
      type: Number,
      min: 1,
      max: 1000000,
      validate: finite
    },
    notes: {
      type: String,
      default: "",
      maxlength: 500
    }
  },
  { ...options, collection: "procurements" }
);

// OPTIONAL SANDBOX CHECKOUT
// This is not a procurement payout. Its state never sets Payment.status.

const sandboxOrderSchema = new Schema(
  {
    orderId: {
      type: String,
      required: true
    },
    amountPaise: {
      type: Number,
      required: true,
      min: 100,
      max: 1000000,
      validate: Number.isSafeInteger
    },
    currency: {
      type: String,
      enum: ["INR"],
      default: "INR"
    },
    status: {
      type: String,
      enum: ["Created", "Verified"],
      default: "Created"
    },
    paymentId: {
      type: String,
      default: ""
    },
    createdBy: {
      type: objectId,
      ref: "User",
      required: true
    },
    verifiedAt: Date
  },
  { timestamps: true, strict: "throw" }
);

// PAYMENT MONITORING

const paymentSchema = new Schema(
  {
    booking: {
      ...ref("Booking"),
      unique: true
    },
    procurement: {
      ...ref("Procurement"),
      unique: true
    },
    farmer: ref("User"),
    centre: ref("ProcurementCentre"),
    status: {
      type: String,
      enum: PAYMENT_STATUSES,
      default: "Pending"
    },
    amountRupees: {
      type: Number,
      default: 0,
      min: 0,
      max: 100000000,
      validate: {
        validator(value) {
          return (
            Number.isFinite(value) &&
            Math.abs(value * 100 - Math.round(value * 100)) < 0.00001
          );
        },
        message: "Amount must have at most two decimal places."
      }
    },
    reference: {
      type: String,
      default: "",
      maxlength: 100
    },
    notes: {
      type: String,
      default: "",
      maxlength: 500
    },
    updatedBy: ref("User", false),
    completedAt: Date,
    sandboxOrders: {
      type: [sandboxOrderSchema],
      default: [],
      select: false,
      validate: {
        validator(value) {
          return value.length <= 20;
        },
        message: "Sandbox order limit reached for this record."
      }
    }
  },
  { ...options, collection: "payments" }
);

// NOTIFICATIONS

const notificationSchema = new Schema(
  {
    user: ref("User"),
    booking: ref("Booking", false),
    type: {
      type: String,
      enum: [
        "otp",
        "booking",
        "token",
        "queue",
        "procurement",
        "payment",
        "general"
      ],
      required: true
    },
    message: {
      type: String,
      required: true,
      maxlength: 1000
    },
    read: {
      type: Boolean,
      default: false
    },
    deliveryStatus: {
      type: String,
      enum: [
        "pending",
        "sending",
        "mock",
        "sent",
        "failed",
        "not_requested"
      ],
      default: "pending"
    },
    providerMessageId: {
      type: String,
      default: ""
    },
    deliveryError: {
      type: String,
      default: "",
      maxlength: 200
    },
    deliveredAt: Date
  },
  { ...options, collection: "notifications" }
);

notificationSchema.index({ user: 1, createdAt: -1 });

// OTP CHALLENGES

const otpSchema = new Schema(
  {
    user: {
      ...ref("User"),
      unique: true
    },
    challengeId: {
      type: String,
      required: true,
      unique: true
    },
    purpose: {
      type: String,
      enum: ["registration", "login"],
      required: true
    },
    otpHash: {
      type: String,
      required: true,
      select: false
    },
    attempts: {
      type: Number,
      default: 0,
      min: 0
    },
    expiresAt: {
      type: Date,
      required: true
    },
    lastSentAt: {
      type: Date,
      required: true
    }
  },
  { ...options, collection: "otpVerifications" }
);

otpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const User = mongoose.model("User", userSchema);
const ProcurementCentre = mongoose.model("ProcurementCentre", centreSchema);
const Slot = mongoose.model("Slot", slotSchema);
const Booking = mongoose.model("Booking", bookingSchema);
const Token = mongoose.model("Token", tokenSchema);
const Queue = mongoose.model("Queue", queueSchema);
const Procurement = mongoose.model("Procurement", procurementSchema);
const Payment = mongoose.model("Payment", paymentSchema);
const Notification = mongoose.model("Notification", notificationSchema);
const OtpVerification = mongoose.model("OtpVerification", otpSchema);

module.exports = {
  User,
  ProcurementCentre,
  Slot,
  Booking,
  Token,
  Queue,
  Procurement,
  Payment,
  Notification,
  OtpVerification,
  QUEUE_STATUSES,
  PROCUREMENT_STATUSES,
  PAYMENT_STATUSES
};