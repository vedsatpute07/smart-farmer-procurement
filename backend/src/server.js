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
  const env = require("./config/env");
  const { connectDatabase } = require("./config/db");
  const app = require("./app");

  await connectDatabase();
  console.log("DATABASE CONNECTION SUCCESS");

  const { Notification } = require("./models");

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

process.on("unhandledRejection", (error) => {
  console.error("Unhandled rejection:", error?.message || error);
  shutdown(1);
});

process.on("uncaughtException", (error) => {
  console.error("Uncaught exception:", error?.message || error);
  shutdown(1);
});

start().catch(async (error) => {
  console.error("ACTUAL ERROR:", error);
  console.error(error?.stack || "");
  
  await mongoose.disconnect().catch(() => {});
  process.exitCode = 1;
});