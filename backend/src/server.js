const mongoose = require("mongoose");

let server;
let stopping = false;

async function shutdown(exitCode = 0) {
  if (stopping) {
    return;
  }

  stopping = true;

  const forcedExit = setTimeout(() => {
    process.exit(exitCode || 1);
  }, 10000);

  forcedExit.unref();

  try {
    if (server?.listening) {
      await new Promise((resolve) => server.close(resolve));
    }

    await mongoose.disconnect();
    clearTimeout(forcedExit);
    process.exit(exitCode);
  } catch {
    process.exit(1);
  }
}

async function start() {
  /*
   * Load validated configuration inside start so configuration failures
   * receive a controlled startup message rather than an uncaught stack trace.
   */
  const env = require("./config/env");
  const { connectDatabase } = require("./config/db");
  const app = require("./app");

  await connectDatabase();

  const { Notification } = require("./models");

  /*
   * An interrupted provider request may already have been accepted.
   * Do not automatically resend after restart and risk duplicate messages.
   */
  await Notification.updateMany(
    { deliveryStatus: "sending" },
    {
      $set: {
        deliveryStatus: "failed",
        deliveryError:
          "Server restarted during delivery. Provider acceptance is uncertain."
      }
    }
  );

  server = app.listen(env.port, () => {
    console.log(`MANDI LIVE API: http://localhost:${env.port}/api`);
    console.log(`Allowed frontend: ${env.frontendUrl}`);
    console.log(`SMS mode: ${env.smsMode}`);
    console.log(`Payment mode: ${env.paymentMode}`);
    console.log("Procurement payments are monitored, not transferred.");
  });

  server.on("error", (error) => {
    console.error(
      error.code === "EADDRINUSE"
        ? `Port ${env.port} is already in use. Stop the conflicting process.`
        : "The HTTP server could not start."
    );

    shutdown(1);
  });
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

process.on("unhandledRejection", () => {
  console.error("An unhandled server operation failed. Shutting down safely.");
  shutdown(1);
});

process.on("uncaughtException", () => {
  console.error("An unexpected server error occurred. Shutting down safely.");
  shutdown(1);
});

start().catch(async (error) => {
  const safePrefixes = [
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

  if (
    safePrefixes.some((prefix) =>
      typeof error.message === "string" &&
      error.message.startsWith(prefix)
    )
  ) {
    console.error(error.message);
  } else {
    console.error(
      "Backend startup failed. Check MongoDB connectivity, replica-set setup, " +
      "database permissions and backend/.env. Private connection details were not logged."
    );
  }

  await mongoose.disconnect().catch(() => {});
  process.exitCode = 1;
});