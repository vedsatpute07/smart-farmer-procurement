const path = require("node:path");
const readline = require("node:readline");
const readlinePromises = require("node:readline/promises");
const { createRequire } = require("node:module");
const { randomUUID } = require("node:crypto");

const requireBackend = createRequire(
  path.resolve(__dirname, "../backend/package.json")
);

const mongoose = requireBackend("mongoose");
const bcrypt = requireBackend("bcrypt");

const resetRequested = process.argv.includes("--reset");
const configureContacts = process.argv.includes("--contacts");

let models;
let env;
let withTransaction;
let dates;

function setupError(message) {
  return new Error(`SEED: ${message}`);
}

async function ask(question) {
  const terminal = readlinePromises.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  try {
    return (await terminal.question(question)).trim();
  } finally {
    terminal.close();
  }
}

function askHidden(question) {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw setupError(
      "Run this seed interactively in a VS Code/PowerShell terminal."
    );
  }

  return new Promise((resolve, reject) => {
    const input = process.stdin;
    const output = process.stdout;
    const wasRaw = Boolean(input.isRaw);
    const characters = [];

    readline.emitKeypressEvents(input);
    output.write(question);
    input.setRawMode(true);
    input.resume();

    function finish(error = null) {
      input.removeListener("keypress", onKeypress);
      input.setRawMode(wasRaw);
      input.pause();
      output.write("\n");

      if (error) {
        reject(error);
      } else {
        resolve(characters.join(""));
      }
    }

    function onKeypress(text, key = {}) {
      if (key.ctrl && key.name === "c") {
        finish(setupError("Seeding cancelled."));
        return;
      }

      if (key.name === "return" || key.name === "enter") {
        finish();
        return;
      }

      if (key.name === "backspace") {
        if (characters.length) {
          characters.pop();
          output.write("\b \b");
        }
        return;
      }

      if (key.ctrl || key.meta || !text) {
        return;
      }

      // Ignore navigation/control escape sequences.
      if (/[\u0000-\u001f\u007f]/.test(text)) {
        return;
      }

      for (const character of text) {
        characters.push(character);
        output.write("*");
      }
    }

    input.on("keypress", onKeypress);
  });
}

function validatePassword(value) {
  return (
    value.length >= 8 &&
    Buffer.byteLength(value, "utf8") <= 72 &&
    /[a-z]/.test(value) &&
    /[A-Z]/.test(value) &&
    /\d/.test(value)
  );
}

const centreDefinitions = [
  {
    name: "Nagpur DEMO Procurement Centre",
    address: "Fictional demonstration procurement campus, Nagpur, Maharashtra",
    district: "Nagpur",
    phone: "+12025550111",
    workingHours: "DEMO slots: 00:00-23:59 IST",
    crops: ["Wheat", "Rice", "Soybean", "Cotton"],
    location: {
      type: "Point",
      coordinates: [79.0882, 21.1458]
    }
  },
  {
    name: "Wardha DEMO Procurement Centre",
    address: "Fictional demonstration agricultural campus, Wardha, Maharashtra",
    district: "Wardha",
    phone: "+12025550112",
    workingHours: "DEMO slots: 00:00-23:59 IST",
    crops: ["Wheat", "Soybean", "Cotton"],
    location: {
      type: "Point",
      coordinates: [78.6022, 20.7453]
    }
  },
  {
    name: "Bhandara DEMO Procurement Centre",
    address: "Fictional demonstration market campus, Bhandara, Maharashtra",
    district: "Bhandara",
    phone: "+12025550113",
    workingHours: "DEMO slots: 00:00-23:59 IST",
    crops: ["Rice", "Wheat"],
    location: {
      type: "Point",
      coordinates: [79.65, 21.17]
    }
  }
];

const accountDefinitions = [
  {
    name: "DEMO Administrator",
    email: "admin@example.com",
    phone: "+12025550101",
    role: "admin"
  },
  {
    name: "DEMO Centre Staff",
    email: "staff@example.com",
    phone: "+12025550102",
    role: "staff"
  },
  {
    name: "DEMO Farmer One",
    email: "farmer@example.com",
    phone: "+12025550103",
    role: "farmer"
  },
  {
    name: "DEMO Farmer Two",
    email: "farmer2@example.com",
    phone: "+12025550104",
    role: "farmer"
  }
];

async function configureAccountDefinitions() {
  const result = accountDefinitions.map((account) => ({
    ...account,
    isDemo: true
  }));

  if (!configureContacts) {
    return result;
  }

  console.log("");
  console.log("Optional local Twilio test contacts");
  console.log("Enter only numbers belonging to consenting, permitted test recipients.");
  console.log("Each account needs a different phone number.");
  console.log("Blank phone keeps that account fictional and usable only in mock SMS mode.");
  console.log("Email defaults are fictional; you may keep them for local login.");
  console.log("");

  for (const account of result) {
    const phone = await ask(
      `${account.role} (${account.email}) test phone in +countrycode format, or blank: `
    );

    if (phone) {
      if (!/^\+[1-9]\d{7,14}$/.test(phone)) {
        throw setupError("A supplied test phone is not valid international format.");
      }

      if (accountDefinitions.some((item) => item.phone === phone)) {
        throw setupError(
          "Fictional seed phone numbers cannot be enabled for real Twilio delivery."
        );
      }

      account.phone = phone;
      /*
       * isDemo is the fictional-contact safety flag used by the SMS service.
       * The account name still clearly identifies it as a DEMO account.
       */
      account.isDemo = false;
    }

    const email = await ask(
      `${account.role} login email [${account.email}]: `
    );

    if (email) {
      const normalized = email.toLowerCase();

      if (
        normalized.length > 160 ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)
      ) {
        throw setupError("A supplied email address is invalid.");
      }

      account.email = normalized;
    }
  }

  if (new Set(result.map((account) => account.phone)).size !== result.length) {
    throw setupError("Every demo account must have a unique phone number.");
  }

  if (new Set(result.map((account) => account.email)).size !== result.length) {
    throw setupError("Every demo account must have a unique email address.");
  }

  return result;
}

async function createCentres() {
  const results = [];

  for (const definition of centreDefinitions) {
    let centre = await models.ProcurementCentre.findOne({
      name: definition.name
    });

    if (!centre) {
      centre = await models.ProcurementCentre.create({
        ...definition,
        active: true,
        isDemo: true
      });
    }

    results.push(centre);
  }

  return results;
}

async function createUsers(definitions, passwordHash, assignedCentre) {
  const users = [];

  for (const definition of definitions) {
    let user = await models.User.findOne({
      email: definition.email
    });

    if (user) {
      if (user.role !== definition.role) {
        throw setupError(
          "An existing account has a conflicting role. Use a fresh development database."
        );
      }

      if (
        configureContacts &&
        (
          user.phone !== definition.phone ||
          user.isDemo !== definition.isDemo
        )
      ) {
        throw setupError(
          "An existing account has different test contacts. " +
          "Use --reset --contacts only if deleting this development dataset is acceptable."
        );
      }

      console.log(`Preserved existing ${definition.role} account: ${definition.email}`);
    } else {
      user = await models.User.create({
        ...definition,
        passwordHash,
        verified: true,
        active: true,
        village: definition.role === "farmer" ? "DEMO Village" : "",
        district: "Nagpur",
        address: "Development demonstration account",
        ...(definition.role === "staff"
          ? { centre: assignedCentre._id }
          : {})
      });

      console.log(`Created ${definition.role} account: ${definition.email}`);
    }

    users.push(user);
  }

  return users;
}

async function ensureSlot(centre, date, startTime, endTime) {
  let slot = await models.Slot.findOne({
    centre: centre._id,
    date,
    startTime,
    endTime
  });

  if (slot) {
    return slot;
  }

  const overlap = await models.Slot.exists({
    centre: centre._id,
    date,
    active: true,
    startTime: { $lt: endTime },
    endTime: { $gt: startTime }
  });

  if (overlap) {
    return null;
  }

  slot = await models.Slot.create({
    centre: centre._id,
    date,
    startTime,
    endTime,
    capacity: 12,
    bookedCount: 0,
    active: true
  });

  return slot;
}

async function createSlots(centres, today) {
  let added = 0;

  const timeRanges = [
    ["00:00", "08:00"],
    ["08:00", "12:00"],
    ["12:00", "16:00"],
    ["16:00", "23:59"]
  ];

  for (const centre of centres) {
    if (!centre.active) {
      continue;
    }

    for (let offset = 0; offset < 7; offset += 1) {
      const date = dates.addDays(today, offset);

      for (const [startTime, endTime] of timeRanges) {
        const existed = await models.Slot.exists({
          centre: centre._id,
          date,
          startTime,
          endTime
        });

        const slot = await ensureSlot(centre, date, startTime, endTime);

        if (!existed && slot) {
          added += 1;
        }
      }
    }
  }

  return added;
}

async function createSampleBundle({
  farmer,
  centre,
  slot,
  staff,
  completed,
  amountRupees = 0
}) {
  return withTransaction(async (session) => {
    await models.ProcurementCentre.updateOne(
      { _id: centre._id },
      { $inc: { operationVersion: 1 } },
      { session }
    );

    const existing = await models.Booking.exists({
      farmer: farmer._id,
      date: slot.date,
      active: true
    }).session(session);

    if (existing) {
      return false;
    }

    const currentSlot = await models.Slot.findById(slot._id).session(session);

    if (
      !currentSlot ||
      !currentSlot.active ||
      currentSlot.bookedCount >= currentSlot.capacity
    ) {
      return false;
    }

    currentSlot.bookedCount += 1;
    await currentSlot.save({ session });

    const bookingId = new mongoose.Types.ObjectId();
    const tokenId = new mongoose.Types.ObjectId();
    const queueId = new mongoose.Types.ObjectId();
    const procurementId = new mongoose.Types.ObjectId();

    const tokenNumber =
      `AGRI-${slot.date.replaceAll("-", "")}-` +
      randomUUID().replaceAll("-", "").slice(0, 16).toUpperCase();

    const eventTime = completed
      ? dates.slotInstant(slot.date, slot.startTime)
      : new Date();

    const completedAt = completed
      ? new Date(eventTime.getTime() + 20 * 60 * 1000)
      : undefined;

    await models.Booking.create(
      [{
        _id: bookingId,
        farmer: farmer._id,
        centre: centre._id,
        slot: slot._id,
        date: slot.date,
        startTime: slot.startTime,
        endTime: slot.endTime,
        crop: centre.crops[0],
        quantityKg: 100,
        status: completed ? "Completed" : "Booked",
        active: true,
        createdAt: eventTime
      }],
      { session }
    );

    await models.Token.create(
      [{
        _id: tokenId,
        number: tokenNumber,
        farmer: farmer._id,
        centre: centre._id,
        booking: bookingId,
        queue: queueId,
        createdAt: eventTime
      }],
      { session }
    );

    await models.Queue.create(
      [{
        _id: queueId,
        farmer: farmer._id,
        centre: centre._id,
        booking: bookingId,
        token: tokenId,
        date: slot.date,
        startTime: slot.startTime,
        status: completed ? "Completed" : "Waiting",
        activeService: false,
        ...(completed ? {
          calledAt: eventTime,
          completedAt
        } : {}),
        createdAt: eventTime
      }],
      { session }
    );

    await models.Procurement.create(
      [{
        _id: procurementId,
        booking: bookingId,
        farmer: farmer._id,
        centre: centre._id,
        status: completed ? "Procurement Completed" : "Booked",
        notes: "Explicitly seeded DEMO record; not a real procurement transaction.",
        ...(completed ? {
          verifiedBy: staff._id,
          verifiedAt: eventTime,
          completedAt,
          actualQuantityKg: 98
        } : {}),
        createdAt: eventTime
      }],
      { session }
    );

    await models.Payment.create(
      [{
        booking: bookingId,
        procurement: procurementId,
        farmer: farmer._id,
        centre: centre._id,
        status: completed ? "Completed" : "Pending",
        amountRupees: completed ? amountRupees : 0,
        reference: completed ? "DEMO-HISTORY-ONLY" : "",
        notes: "Seeded monitoring record. No money was transferred.",
        ...(completed ? {
          updatedBy: staff._id,
          completedAt
        } : {}),
        createdAt: eventTime
      }],
      { session }
    );

    const messages = [
      {
        type: "booking",
        message:
          `DEMO seed: Booking at ${centre.name} on ${slot.date}. ` +
          `Token ${tokenNumber}. This is sample development data.`
      },
      {
        type: "token",
        message:
          `DEMO seed: Token ${tokenNumber} is ${completed ? "Completed" : "Waiting"}.`
      }
    ];

    if (completed) {
      messages.push(
        {
          type: "procurement",
          message: "DEMO seed: Historical procurement completed with 98 kg accepted."
        },
        {
          type: "payment",
          message:
            `DEMO seed: Historical payment record marked Completed for INR ${amountRupees}. ` +
            "No actual money was transferred."
        }
      );
    }

    await models.Notification.create(
      messages.map((message) => ({
        ...message,
        user: farmer._id,
        booking: bookingId,
        deliveryStatus: "not_requested",
        createdAt: eventTime
      })),
      { session }
    );

    return true;
  });
}

async function main() {
  env = require("../backend/src/config/env");
  models = require("../backend/src/models");
  dates = require("../backend/src/utils/dates");
  ({ withTransaction } = require("../backend/src/utils/transaction"));

  const { connectDatabase } = require("../backend/src/config/db");

  if (env.nodeEnv === "production") {
    throw setupError("Development seed is disabled in production.");
  }

  if (!process.stdin.isTTY) {
    throw setupError("Run the seed interactively in a terminal.");
  }

  console.log("MANDI LIVE development seed");
  console.log("Stop the API server before running this script.");
  console.log("No SMS will be sent. Razorpay will not be contacted.");

  if (resetRequested) {
    const confirmation = await ask(
      "This deletes application records in farmer_procurement. Type RESET to continue: "
    );

    if (confirmation !== "RESET") {
      throw setupError("Reset cancelled.");
    }
  }

  const password = await askHidden(
    "Development password for newly created accounts (hidden): "
  );

  if (!validatePassword(password)) {
    throw setupError(
      "Use at least eight characters with uppercase, lowercase and a number; maximum 72 UTF-8 bytes."
    );
  }

  const repeated = await askHidden("Confirm development password: ");

  if (password !== repeated) {
    throw setupError("Passwords do not match.");
  }

  const definitions = await configureAccountDefinitions();
  const passwordHash = await bcrypt.hash(password, 12);

  await connectDatabase();

  if (resetRequested) {
    for (const Model of [
      models.Notification,
      models.OtpVerification,
      models.Payment,
      models.Procurement,
      models.Queue,
      models.Token,
      models.Booking,
      models.Slot,
      models.User,
      models.ProcurementCentre
    ]) {
      await Model.deleteMany({});
    }

    console.log("Development application records removed.");
  }

  const centres = await createCentres();
  const users = await createUsers(
    definitions,
    passwordHash,
    centres[0]
  );

  const staff = users.find((user) => user.role === "staff");
  const farmers = users.filter((user) => user.role === "farmer");
  const today = dates.todayIST();

  const addedSlots = await createSlots(centres, today);

  const currentSlots = await models.Slot.find({
    centre: centres[0]._id,
    date: today,
    active: true
  }).sort({ startTime: 1 });

  const availableToday = currentSlots.find(
    (slot) =>
      dates.slotInstant(slot.date, slot.endTime).getTime() > Date.now() &&
      slot.bookedCount < slot.capacity
  );

  const sampleSlot = availableToday || await models.Slot.findOne({
    centre: centres[0]._id,
    date: dates.addDays(today, 1),
    active: true
  }).sort({ startTime: 1 });

  let sampleBundles = 0;

  if (centres[0].active && sampleSlot) {
    for (const farmer of farmers) {
      const created = await createSampleBundle({
        farmer,
        centre: centres[0],
        slot: sampleSlot,
        staff,
        completed: false
      });

      if (created) {
        sampleBundles += 1;
      }
    }
  }

  if (centres[0].active) {
    const yesterday = dates.addDays(today, -1);
    const historicalSlot = await ensureSlot(
      centres[0],
      yesterday,
      "09:00",
      "10:00"
    );

    if (historicalSlot) {
      const created = await createSampleBundle({
        farmer: farmers[0],
        centre: centres[0],
        slot: historicalSlot,
        staff,
        completed: true,
        amountRupees: 2450
      });

      if (created) {
        sampleBundles += 1;
      }
    }
  }

  for (const user of users.filter((item) => item.role !== "farmer")) {
    const exists = await models.Notification.exists({
      user: user._id,
      type: "general",
      message: "DEMO setup: Your MANDI LIVE development account is ready."
    });

    if (!exists) {
      await models.Notification.create({
        user: user._id,
        type: "general",
        message: "DEMO setup: Your MANDI LIVE development account is ready.",
        deliveryStatus: "not_requested"
      });
    }
  }

  console.log("");
  console.log("Seed completed.");
  console.log(`New slots: ${addedSlots}`);
  console.log(`New connected sample bookings: ${sampleBundles}`);
  console.log(`Schedule dates: ${today} through ${dates.addDays(today, 6)} IST`);
  console.log(`Staff centre: ${centres[0].name}`);
  console.log("");

  for (const user of users) {
    console.log(
      `${user.role}: ${user.email} — ` +
      (user.isDemo ? "fictional contact; mock SMS only" : "locally configured test contact")
    );
  }

  console.log("");
  console.log("Password: the value you entered locally; it is not printed or stored in source.");
  console.log("Existing accounts retain their previous passwords.");
  console.log("Login still requires a fresh OTP.");
  console.log("Sample bookings are explicitly marked DEMO and use real linked database records.");
  console.log("Centre coordinates identify demo towns, not verified operating facilities.");
  console.log("Use a new farmer account or another date to demonstrate a fresh booking.");

  if (env.smsMode === "twilio" && users.some((user) => user.isDemo)) {
    console.log("");
    console.log(
      "Twilio is enabled, but some accounts have fictional contacts. " +
      "They cannot receive real login OTPs. Use mock mode or configure unique, " +
      "consenting test contacts with --contacts on a fresh/reset development dataset."
    );
  }
}

main()
  .catch((error) => {
    const safePrefixes = [
      "SEED:",
      "Invalid backend environment",
      "FRONTEND_URL must",
      "MONGODB_URI must",
      "JWT_SECRET and",
      "OTP_RESEND_COOLDOWN_SECONDS must",
      "Twilio mode requires",
      "razorpay_test mode requires",
      "Live Razorpay keys",
      "Mock SMS and",
      "MongoDB transactions require"
    ];

    console.error(
      safePrefixes.some((prefix) => error.message?.startsWith(prefix))
        ? error.message
        : "Seed failed. Check MongoDB, environment configuration and conflicting existing records. " +
          "No private database URI or contact value was logged."
    );

    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });