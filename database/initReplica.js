const path = require("node:path");
const { createRequire } = require("node:module");

const requireBackend = createRequire(
  path.resolve(__dirname, "../backend/package.json")
);

const dotenv = requireBackend("dotenv");
const mongoose = requireBackend("mongoose");
const { MongoClient } = mongoose.mongo;

dotenv.config({
  path: path.resolve(__dirname, "../backend/.env")
});

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function main() {
  const configuredUri =
    process.env.MONGODB_URI ||
    "mongodb://127.0.0.1:27017/farmer_procurement?replicaSet=rs0";

  if (configuredUri.startsWith("mongodb+srv://")) {
    console.log(
      "Atlas manages its replica set. No local replica initialization is needed."
    );
    return;
  }

  let parsed;

  try {
    parsed = new URL(configuredUri);
  } catch {
    throw new Error("SETUP: MONGODB_URI is not a valid local MongoDB URI.");
  }

  if (
    parsed.protocol !== "mongodb:" ||
    !["localhost", "127.0.0.1"].includes(parsed.hostname)
  ) {
    throw new Error(
      "SETUP: This script initializes only localhost/127.0.0.1. " +
      "Remote replica sets must be configured by their administrator."
    );
  }

  const replicaSetName = parsed.searchParams.get("replicaSet") || "rs0";
  const port = parsed.port || "27017";

  if (!/^[A-Za-z0-9_-]{1,50}$/.test(replicaSetName)) {
    throw new Error("SETUP: Invalid replica-set name.");
  }

  parsed.searchParams.delete("replicaSet");
  parsed.searchParams.set("directConnection", "true");
  parsed.pathname = "/admin";

  const client = new MongoClient(parsed.toString(), {
    serverSelectionTimeoutMS: 5000
  });

  try {
    await client.connect();

    const admin = client.db("admin");
    let hello = await admin.command({ hello: 1 });

    if (!hello.setName) {
      try {
        await admin.command({
          replSetInitiate: {
            _id: replicaSetName,
            members: [{
              _id: 0,
              host: `127.0.0.1:${port}`
            }]
          }
        });

        console.log(`Replica set ${replicaSetName} initialization requested.`);
      } catch (error) {
        if (error.codeName !== "AlreadyInitialized" && error.code !== 23) {
          throw new Error(
            `SETUP: Start mongod with --replSet ${replicaSetName}, ` +
            "then rerun npm run db:init."
          );
        }
      }
    } else if (hello.setName !== replicaSetName) {
      throw new Error(
        `SETUP: MongoDB uses replica set "${hello.setName}", but the URI requests ` +
        `"${replicaSetName}". Update the URI to match.`
      );
    }

    for (let attempt = 0; attempt < 45; attempt += 1) {
      hello = await admin.command({ hello: 1 });

      if (hello.isWritablePrimary) {
        console.log(`Replica set ready: ${hello.setName}`);
        console.log("Next: npm run seed");
        return;
      }

      await wait(1000);
    }

    throw new Error(
      "SETUP: MongoDB did not become primary. Inspect the mongod terminal."
    );
  } finally {
    await client.close();
  }
}

main().catch((error) => {
  console.error(
    error.message?.startsWith("SETUP:")
      ? error.message
      : "Local MongoDB initialization failed. Check mongod, its port and replica-set configuration."
  );

  process.exitCode = 1;
});