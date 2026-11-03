import mongoose from "mongoose";
import { env } from "./env.js";
import { logger } from "../common/logger.js";

mongoose.set("strictQuery", true);

export async function connectDB(uri = env.mongoUri) {
  await mongoose.connect(uri, { autoIndex: true, serverSelectionTimeoutMS: 10000 });
  logger.info(`MongoDB connected: ${mongoose.connection.host}/${mongoose.connection.name}`);
  return mongoose.connection;
}

export async function disconnectDB() {
  await mongoose.disconnect();
}
