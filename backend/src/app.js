import express from "express";
import helmet from "helmet";
import cors from "cors";
import morgan from "morgan";
import cookieParser from "cookie-parser";
import path from "node:path";
import multer from "multer";
import { env } from "./config/env.js";
import { logger } from "./common/logger.js";
import authRoutes from "./modules/auth/auth.routes.js";
import platformRoutes from "./modules/platform/platform.routes.js";
import orgRoutes from "./modules/org/org.routes.js";
import orgDirectoryRoutes from "./modules/org/directory.routes.js";
import meRoutes from "./modules/me/me.routes.js";
import publicRoutes from "./modules/public/public.routes.js";
import publicSiteRoutes from "./modules/public/site.routes.js";
import platformLeadsRoutes from "./modules/platform/leads.routes.js";
import platformTestimonialsRoutes from "./modules/platform/testimonials.routes.js";
import internalRoutes from "./modules/internal.routes.js";
import mongoose from "mongoose";

export function createApp() {
  const app = express();
  app.disable("x-powered-by");
  app.set("etag", false);
  if (env.trustProxy) app.set("trust proxy", env.trustProxy);

  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: "cross-origin" }, // uploaded images are shown on the web app's origin
    })
  );

  const allowed = new Set([env.frontendUrl, env.publicCardBaseUrl, ...env.corsOrigins]);
  app.use(
    cors({
      origin: (origin, cb) => (!origin || allowed.has(origin) ? cb(null, true) : cb(null, false)),
      credentials: true,
    })
  );

  if (!env.isTest) app.use(morgan(env.isProd ? "combined" : "dev"));
  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ extended: false, limit: "1mb" }));
  app.use(cookieParser());

  if (env.storageDriver === "local") {
    app.use(
      "/uploads",
      express.static(path.resolve(env.uploadDir), {
        maxAge: "30d",
        fallthrough: false,
        setHeaders: (res) => res.setHeader("X-Content-Type-Options", "nosniff"),
      })
    );
  }

  app.get("/health", (_req, res) => res.json({ success: true, status: "ok" }));
  app.get("/api/health", async (req, res) => {
    if (req.query.deep !== "1") return res.json({ success: true, status: "ok" });
    try {
      await mongoose.connection.db.admin().ping({ maxTimeMS: 3000 });
      return res.status(200).json({ status: "ok", db: "ok", uptimeSec: Math.floor(process.uptime()) });
    } catch {
      return res.status(503).json({ status: "degraded", db: "down" });
    }
  });
  app.use("/api/internal/jobs", internalRoutes);

  app.use("/api/auth", authRoutes);
  app.use("/api/public/site", publicSiteRoutes);
  app.use("/api/platform/leads", platformLeadsRoutes);
  app.use("/api/platform/testimonials", platformTestimonialsRoutes);
  app.use("/api/platform", platformRoutes);
  app.use("/api/org/directory", orgDirectoryRoutes);
  app.use("/api/org", orgRoutes);
  app.use("/api/me", meRoutes);
  app.use("/api/public", publicRoutes);

  app.use((req, res) => res.status(404).json({ success: false, message: `Route not found: ${req.method} ${req.path}` }));

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, _next) => {
    let status = err.statusCode || err.status || 500;
    let message = err.message || "Something went wrong.";
    let code = err.code;
    let details = err.details;

    if (err.name === "ValidationError") {
      status = 400;
      details = Object.values(err.errors || {}).map((e) => ({ field: e.path, message: e.message }));
      message = details[0]?.message || "Invalid data.";
    } else if (err.name === "CastError") {
      status = 400;
      message = `Invalid value for ${err.path}.`;
    } else if (err.code === 11000) {
      status = 409;
      const field = Object.keys(err.keyPattern || err.keyValue || {}).filter((k) => k !== "organizationId")[0] || "value";
      message = `This ${field} is already in use.`;
      code = "DUPLICATE";
    } else if (err instanceof multer.MulterError) {
      status = 400;
      message = err.code === "LIMIT_FILE_SIZE" ? "File is too large." : err.message;
    } else if (err.type === "entity.too.large") {
      status = 413;
      message = "Request is too large.";
    } else if (err.type === "entity.parse.failed") {
      status = 400;
      message = "Invalid JSON body.";
    }

    if (status >= 500) {
      logger.error(`${req.method} ${req.originalUrl}`, err);
      if (env.isProd) message = "Something went wrong on our side. Please try again.";
    }
    res.status(status).json({ success: false, message, ...(typeof code === "string" ? { code } : {}), ...(details ? { details } : {}) });
  });

  return app;
}
