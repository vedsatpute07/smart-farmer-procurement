const mongoose = require("mongoose");
const env = require("./env");

async function connectDatabase() {
  mongoose.set("strictQuery", true);

  /*
   * Filters are constructed by application code from strictly validated inputs.
   * Do not enable sanitizeFilter here: it would rewrite legitimate internal
   * operators such as $gt and $in unless every internal filter were marked trusted.
   */
  mongoose.set("sanitizeFilter", false);

  await mongoose.connect(env.mongodbUri, {
    dbName: "farmer_procurement",
    serverSelectionTimeoutMS: 10000,
    autoIndex: true
  });

  const hello = await mongoose.connection.db.admin().command({ hello: 1 });

  if (!hello.setName && hello.msg !== "isdbgrid") {
    await mongoose.disconnect();

    throw new Error(
      "MongoDB transactions require a replica set. Start mongod with " +
      "--replSet rs0 and run npm run db:init, or use MongoDB Atlas."
    );
  }

  const models = require("../models");

  for (const candidate of Object.values(models)) {
    if (candidate?.modelName && typeof candidate.init === "function") {
      await candidate.init();
    }
  }

  console.log("MongoDB connected: farmer_procurement");
  return mongoose.connection;
}

module.exports = { connectDatabase };