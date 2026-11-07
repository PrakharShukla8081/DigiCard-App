import { Router } from "express";
import { notFound } from "../../common/errors.js";
import { ROLES } from "../../common/constants.js";
import { authenticate, requireRole, tenantContext, requireFeature } from "../../middleware/auth.js";
import { directoryPage } from "../../services/directory.js";

const router = Router();
router.use(authenticate, requireRole(ROLES.COMPANY_ADMIN, ROLES.EMPLOYEE), tenantContext(), requireFeature("companyDirectory", "Company directory"));

router.get("/", async (req, res) => {
  const { org } = req.tenant;
  if (!org.directory?.enabled) throw notFound("Company directory is not available.");
  const result = await directoryPage(org, req.query);
  res.json({ success: true, ...result });
});

export default router;
