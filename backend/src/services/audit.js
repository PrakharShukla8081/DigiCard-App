import { AuditLog } from "../models/index.js";
import { logger } from "../common/logger.js";

/** Record an action. Never throws: an audit failure must not break the request. */
export async function audit(req, { action, entity = "", entityId = "", summary = "", organizationId }) {
  try {
    const a = req?.auth || {};
    await AuditLog.create({
      organizationId: organizationId !== undefined ? organizationId : a.organizationId || null,
      actorId: a.userId || null,
      actorName: a.name || "",
      actorRole: a.role || "",
      action,
      entity,
      entityId: entityId ? String(entityId) : "",
      summary,
      ip: req?.ip || "",
    });
  } catch (e) {
    logger.warn("audit log failed:", e.message);
  }
}
