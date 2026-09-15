const mongoose = require("mongoose");

/*
 * The MongoDB driver retries transient transaction conflicts.
 * Do not send SMS, call Razorpay or perform other external side effects
 * inside the callback.
 */
async function withTransaction(operation) {
  const session = await mongoose.startSession();

  try {
    let result;

    await session.withTransaction(
      async () => {
        result = await operation(session);
      },
      {
        readPreference: "primary",
        readConcern: { level: "snapshot" },
        writeConcern: { w: "majority" }
      }
    );

    return result;
  } finally {
    await session.endSession();
  }
}

module.exports = { withTransaction };