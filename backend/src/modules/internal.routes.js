import crypto from "node:crypto";
import express from "express";
import { z } from "zod";
import { env } from "../config/env.js";
import { parse } from "../common/validate.js";
import { rateLimit } from "../common/rateLimit.js";
import { runJobs } from "../jobs/runner.js";
import { logger } from "../common/logger.js";

const router = express.Router();
const jobsBody = z.object({ jobs: z.array(z.enum(["reminders", "subscriptions"])).default(["reminders", "subscriptions"]) }).default({});

router.post(
  "/run",
  rateLimit({ windowMs: 60_000, max: 10 }),
  async (req, res, next) => {
    if (!env.cronSecret) return res.status(404).end();
    const supplied = Buffer.from(String(req.get("x-cron-secret") || ""));
    const expected = Buffer.from(env.cronSecret);
    if (supplied.length !== expected.length || !crypto.timingSafeEqual(supplied, expected)) return res.status(401).json({ success: false, message: "Unauthorized" });

    try {
      const { jobs } = parse(jobsBody, req.body);
      const started = Date.now();
      const result = await runJobs(jobs, { trigger: "cron" });
      const data = { ...result, durationMs: Date.now() - started };
      logger.info("External jobs run", { trigger: "cron", jobs, durationMs: data.durationMs });
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
