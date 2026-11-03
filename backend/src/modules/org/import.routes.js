import { Router } from "express";
import { z } from "zod";
import { ImportJob } from "../../models/index.js";
import { parse, assertId } from "../../common/validate.js";
import { badRequest, notFound } from "../../common/errors.js";
import { toCsv } from "../../common/csv.js";
import { sheetUpload } from "../../middleware/upload.js";
import { requireFeature } from "../../middleware/auth.js";
import { seatsLeft } from "../../services/entitlements.js";
import { parseSheet, runImport, MAX_ROWS, templateXlsx, templateCsv, COLUMNS } from "../../services/importer.js";
import { audit } from "../../services/audit.js";

const router = Router();
router.use(requireFeature("bulkUpload", "Bulk upload"));

router.get("/template", async (req, res) => {
  if (req.query.format === "csv") {
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", 'attachment; filename="employee-import-template.csv"');
    return res.send(templateCsv());
  }
  const buf = await templateXlsx();
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", 'attachment; filename="employee-import-template.xlsx"');
  res.send(Buffer.from(buf));
});

router.get("/columns", (_req, res) => res.json({ success: true, data: COLUMNS }));

router.post("/", sheetUpload, async (req, res) => {
  const { org, ent } = req.tenant;
  if (!req.file) throw badRequest("Choose a CSV or Excel file to upload.");
  const { mode } = parse(z.object({ mode: z.enum(["create", "upsert"]).default("create") }), req.body);
  const running = await ImportJob.exists({ organizationId: org._id, status: { $in: ["queued", "processing"] } });
  if (running) throw badRequest("Another import is still running. Wait for it to finish.");

  let rows;
  try {
    rows = await parseSheet(req.file.buffer, req.file.originalname);
  } catch (e) {
    throw badRequest(e.message || "Could not read this file. Make sure it is a valid CSV or .xlsx file.");
  }
  if (!rows.length) throw badRequest("The file has no employee rows.");
  if (rows.length > MAX_ROWS) throw badRequest(`The file has ${rows.length} rows. The maximum is ${MAX_ROWS} per upload — split it into smaller files.`);

  const job = await ImportJob.create({ organizationId: org._id, createdBy: req.auth.userId, fileName: req.file.originalname.slice(0, 200), mode, total: rows.length });
  const seats = await seatsLeft(org._id, ent);
  audit(req, { action: "import.started", entity: "ImportJob", entityId: job._id, summary: `${job.fileName}: ${rows.length} rows (${mode})` });
  // Run after the response so the browser can start polling progress straight away.
  setImmediate(() => runImport({ jobId: job._id, organizationId: org._id, rows, mode, seatsAvailable: seats }));
  res.status(202).json({ success: true, data: job });
});

router.get("/jobs", async (req, res) => {
  const jobs = await ImportJob.find({ organizationId: req.tenant.organizationId }).select("-rowErrors").sort({ createdAt: -1 }).limit(20).lean();
  res.json({ success: true, data: jobs });
});

router.get("/jobs/:id", async (req, res) => {
  assertId(req.params.id);
  const job = await ImportJob.findOne({ _id: req.params.id, organizationId: req.tenant.organizationId }).lean();
  if (!job) throw notFound("Import not found.");
  const preview = (job.rowErrors || []).slice(0, 100);
  res.json({ success: true, data: { ...job, rowErrors: preview, errorCount: (job.rowErrors || []).length } });
});

router.get("/jobs/:id/errors.csv", async (req, res) => {
  assertId(req.params.id);
  const job = await ImportJob.findOne({ _id: req.params.id, organizationId: req.tenant.organizationId }).lean();
  if (!job) throw notFound("Import not found.");
  const csv = toCsv(["Row", "Employee ID", "Field", "Problem"], (job.rowErrors || []).map((e) => [e.row, e.employeeCode, e.field, e.message]));
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="import-errors-${job._id}.csv"`);
  res.send(csv);
});

export default router;
