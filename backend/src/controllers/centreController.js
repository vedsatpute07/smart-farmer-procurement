const {
  ProcurementCentre,
  Slot,
  Booking
} = require("../models");

const { AppError } = require("../utils/errors");
const { ok } = require("../utils/responses");
const { withTransaction } = require("../utils/transaction");
const { lockCentre } = require("../utils/access");
const {
  todayIST,
  slotInstant
} = require("../utils/dates");

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function centreInput(body) {
  const fields = [
    "name",
    "address",
    "district",
    "phone",
    "workingHours",
    "crops"
  ];

  const result = {};

  for (const field of fields) {
    if (body[field] !== undefined) {
      result[field] = body[field];
    }
  }

  if (
    body.latitude !== undefined &&
    body.longitude !== undefined
  ) {
    result.location = {
      type: "Point",
      coordinates: [
        body.longitude,
        body.latitude
      ]
    };
  }

  return result;
}

async function addAvailability(centres, date) {
  if (!centres.length) {
    return [];
  }

  const ids = centres.map((centre) => centre._id);

  const slots = await Slot.find({
    centre: { $in: ids },
    date,
    active: true
  }).lean();

  const totals = new Map();

  for (const slot of slots) {
    if (
      slotInstant(slot.date, slot.endTime).getTime() <= Date.now()
    ) {
      continue;
    }

    const available = Math.max(
      0,
      slot.capacity - slot.bookedCount
    );

    if (available === 0) {
      continue;
    }

    const key = String(slot.centre);
    const current = totals.get(key) || {
      availableSlots: 0,
      availableCapacity: 0
    };

    current.availableSlots += 1;
    current.availableCapacity += available;
    totals.set(key, current);
  }

  return centres.map((centre) => ({
    ...centre,
    availabilityDate: date,
    ...(
      centre.active
        ? totals.get(String(centre._id)) || {
            availableSlots: 0,
            availableCapacity: 0
          }
        : {
            availableSlots: 0,
            availableCapacity: 0
          }
    )
  }));
}

async function listCentres(req, res) {
  const {
    search,
    district,
    includeInactive,
    page = 1,
    limit = 20
  } = req.query;

  const date = req.query.date || todayIST();
  const filter = {};

  if (!(req.user.role === "admin" && includeInactive)) {
    filter.active = true;
  }

  if (district) {
    filter.district = new RegExp(
      escapeRegex(district),
      "i"
    );
  }

  if (search) {
    const expression = new RegExp(
      escapeRegex(search),
      "i"
    );

    filter.$or = [
      { name: expression },
      { district: expression },
      { address: expression }
    ];
  }

  const [centres, total] = await Promise.all([
    ProcurementCentre.find(filter)
      .select("-operationVersion")
      .sort({ name: 1, _id: 1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),

    ProcurementCentre.countDocuments(filter)
  ]);

  return ok(res, {
    items: await addAvailability(centres, date),
    total,
    page,
    limit
  });
}

async function nearbyCentres(req, res) {
  const {
    latitude,
    longitude,
    radiusKm = 100,
    limit = 50
  } = req.query;

  const date = req.query.date || todayIST();

  const centres = await ProcurementCentre.aggregate([
    {
      $geoNear: {
        near: {
          type: "Point",
          coordinates: [longitude, latitude]
        },
        key: "location",
        distanceField: "distanceMeters",
        maxDistance: radiusKm * 1000,
        spherical: true,
        query: { active: true }
      }
    },
    { $limit: limit },
    {
      $addFields: {
        distanceKm: {
          $divide: ["$distanceMeters", 1000]
        }
      }
    },
    {
      $project: {
        operationVersion: 0
      }
    }
  ]);

  return ok(res, {
    items: await addAvailability(centres, date),
    radiusKm,
    origin: { latitude, longitude }
  });
}

async function getCentre(req, res) {
  const centre = await ProcurementCentre.findById(req.params.id)
    .select("-operationVersion")
    .lean();

  if (!centre) {
    throw new AppError(404, "Procurement centre not found.");
  }

  /*
   * Inactive centre details remain readable because existing bookings
   * may legitimately reference them.
   */
  const [details] = await addAvailability(
    [centre],
    req.query.date || todayIST()
  );

  return ok(res, details);
}

async function createCentre(req, res) {
  const centre = await ProcurementCentre.create({
    ...centreInput(req.body),
    active: true,
    isDemo: false
  });

  return ok(
    res,
    centre,
    "Procurement centre created.",
    201
  );
}

async function assertNoOutstandingBookings(centreId, session) {
  const outstanding = await Booking.exists({
    centre: centreId,
    status: "Booked",
    active: true
  }).session(session);

  if (outstanding) {
    throw new AppError(
      409,
      "Complete or cancel outstanding bookings before deactivating this centre."
    );
  }
}

async function updateCentre(req, res) {
  const updated = await withTransaction(async (session) => {
    const centre = await lockCentre(
      req.params.id,
      session
    );

    if (req.body.active === false) {
      await assertNoOutstandingBookings(centre._id, session);

      await Slot.updateMany(
        { centre: centre._id },
        { $set: { active: false } },
        { session }
      );
    }

    Object.assign(centre, centreInput(req.body));

    if (req.body.active !== undefined) {
      centre.active = req.body.active;
    }

    await centre.save({ session });
    return centre;
  });

  return ok(
    res,
    updated,
    "Centre updated. Reactivating a centre does not automatically reopen closed slots."
  );
}

async function deleteCentre(req, res) {
  const updated = await withTransaction(async (session) => {
    const centre = await lockCentre(
      req.params.id,
      session
    );

    await assertNoOutstandingBookings(centre._id, session);

    centre.active = false;
    await centre.save({ session });

    await Slot.updateMany(
      { centre: centre._id },
      { $set: { active: false } },
      { session }
    );

    return centre;
  });

  return ok(
    res,
    updated,
    "Centre deactivated and slots closed. Historical records were retained."
  );
}

module.exports = {
  listCentres,
  nearbyCentres,
  getCentre,
  createCentre,
  updateCentre,
  deleteCentre
};