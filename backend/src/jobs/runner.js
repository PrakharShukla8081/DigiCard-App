import crypto from "node:crypto";
import { JobLock } from "../models/index.js";
import { logger } from "../common/logger.js";
import { runDueReminders, runSubscriptionJobs } from "./scheduler.js";

const JOBS = {
  reminders: runDueReminders,
  subscriptions: runSubscriptionJobs,
};
const LOCK_MS = 10 * 60_000;

function smallSummary(result) {
  if (Array.isArray(result)) return { organizations: result.length };
  if (!result || typeof result !== "object") return { result };
  return Object.fromEntries(Object.entries(result).filter(([, value]) => typeof value !== "object" || value === null));
}

async function acquire(name, owner, now) {
  try {
    return await JobLock.findOneAndUpdate(
      { name, lockedUntil: { $lt: now } },
      { $set: { lockedUntil: new Date(now.getTime() + LOCK_MS), lockedBy: owner }, $setOnInsert: { name } },
      { upsert: true, returnDocument: "after" }
    ).lean();
  } catch (error) {
    if (error?.code === 11000) return null;
    throw error;
  }
}

export async function runJobs(names = ["reminders", "subscriptions"], { trigger = "unknown" } = {}) {
  const results = {};
  for (const name of names) {
    if (!JOBS[name]) {
      results[name] = { status: "failed", error: "Unknown job" };
      continue;
    }

    const now = new Date();
    const owner = crypto.randomUUID();
    const lock = await acquire(name, owner, now);
    if (!lock) {
      results[name] = { status: "skipped: already running" };
      continue;
    }

    try {
      const summary = await JOBS[name](now, { trigger });
      results[name] = { status: "completed", ...summary };
      await JobLock.updateOne({ name, lockedBy: owner }, { $set: { lockedUntil: new Date(), lastRunAt: new Date(), lastResult: smallSummary(summary) } });
    } catch (error) {
      results[name] = { status: "failed", error: "Job failed" };
      logger.error(`${name} job failed`, error);
      await JobLock.updateOne({ name, lockedBy: owner }, { $set: { lockedUntil: new Date(), lastRunAt: new Date(), lastResult: { status: "failed" } } });
    } finally {
      await JobLock.updateOne({ name, lockedBy: owner }, { $set: { lockedUntil: new Date() } });
    }
  }
  return results;
}
