/**
 * Bulk employee import (CSV / XLSX).
 *
 * Flow: parse → normalise headers → validate each row → detect duplicates
 * (inside the file and against the database) → enforce plan seat limit →
 * write in batches of 500 → keep row-level errors for the downloadable report.
 *
 * The job runs in the background inside the API process and reports progress
 * on the ImportJob document. For very large or frequent imports, move
 * runImport() to a queue worker (e.g. BullMQ) — the function is self-contained.
 */
import ExcelJS from "exceljs";
import { Readable } from "node:stream";
import { parse as parseCsv } from "csv-parse/sync";
import { Employee, ImportJob } from "../models/index.js";
import { isValidPhone, normalizePhone } from "../common/validate.js";
import { slugify, uniqueSlug } from "../common/slug.js";
import { logger } from "../common/logger.js";

export const MAX_ROWS = 20000;
const BATCH = 500;
const MAX_STORED_ERRORS = 10000;

/** Canonical columns, in template order. */
export const COLUMNS = [
  { key: "employeeCode", label: "Employee ID", required: true, example: "EMP-0001" },
  { key: "firstName", label: "First Name", required: true, example: "Rahul" },
  { key: "lastName", label: "Last Name", example: "Sharma" },
  { key: "designation", label: "Designation", example: "Senior Sales Manager" },
  { key: "department", label: "Department", example: "Sales" },
  { key: "workEmail", label: "Work Email", example: "rahul.sharma@company.com" },
  { key: "mobile", label: "Mobile Number", example: "+91 98765 43210" },
  { key: "whatsapp", label: "WhatsApp Number", example: "+91 98765 43210" },
  { key: "photoUrl", label: "Profile Photo URL", example: "" },
  { key: "linkedin", label: "LinkedIn URL", example: "https://www.linkedin.com/in/rahul-sharma" },
  { key: "bio", label: "Short Bio", example: "Helping plants cut energy costs." },
  { key: "location", label: "Location", example: "Pune, Maharashtra" },
  { key: "cardStatus", label: "Card Status", example: "active" },
];

const ALIASES = {
  employeeCode: ["employee id", "employee code", "emp id", "emp code", "employeeid", "employee_id", "id", "staff id"],
  firstName: ["first name", "firstname", "first_name", "given name"],
  lastName: ["last name", "lastname", "last_name", "surname"],
  designation: ["designation", "title", "job title", "position"],
  department: ["department", "dept", "team"],
  workEmail: ["work email", "email", "email id", "official email", "work_email", "e-mail"],
  mobile: ["mobile number", "mobile", "phone", "phone number", "contact number", "mobile no", "mobile_number"],
  whatsapp: ["whatsapp number", "whatsapp", "whatsapp no", "whatsapp_number"],
  photoUrl: ["profile photo url", "photo url", "photo", "profile photo", "image url", "photo_url"],
  linkedin: ["linkedin url", "linkedin", "linkedin profile", "linkedin_url"],
  bio: ["short bio", "bio", "about", "summary"],
  location: ["location", "city", "office", "base location"],
  cardStatus: ["card status", "status", "card_status"],
  fullName: ["name", "full name", "employee name", "fullname"],
};
const HEADER_MAP = {};
for (const [k, list] of Object.entries(ALIASES)) for (const a of list) HEADER_MAP[a] = k;
const normHeader = (h) => String(h || "").trim().toLowerCase().replace(/\s+/g, " ").replace(/[*:]/g, "").trim();

function cellToString(v) {
  if (v === null || v === undefined) return "";
  if (typeof v === "object") {
    if (v.text) return String(v.text);
    if (v.hyperlink) return String(v.hyperlink).replace(/^mailto:/i, "");
    if (Array.isArray(v.richText)) return v.richText.map((r) => r.text).join("");
    if (v.result !== undefined) return String(v.result);
    if (v instanceof Date) return v.toISOString().slice(0, 10);
    return "";
  }
  if (typeof v === "number") return Number.isInteger(v) ? String(v) : String(v);
  return String(v);
}

/** Parse the uploaded buffer into [{ rowNumber, data: {canonicalKey: value} }]. */
export async function parseSheet(buffer, fileName) {
  let headers = [];
  let rows = [];
  if (/\.xlsx$/i.test(fileName)) {
    // Streaming reader: lower memory for big files, and it ignores cell comments/notes,
    // drawings and styles. Some ExcelJS versions cannot stream workbooks with multiple
    // sheets, so retain a compatible full-loader fallback.
    try {
      const reader = new ExcelJS.stream.xlsx.WorkbookReader(Readable.from(buffer), {
        worksheets: "emit",
        sharedStrings: "cache",
        hyperlinks: "cache",
        styles: "ignore",
        entries: "emit",
      });
      for await (const ws of reader) {
        const sheetRows = [];
        let sheetHeaders = [];
        for await (const row of ws) {
          const vals = [];
          row.eachCell({ includeEmpty: true }, (cell, col) => (vals[col - 1] = cellToString(cell.value).trim()));
          if (!vals.some((v) => v)) continue;
          if (!sheetHeaders.length) sheetHeaders = vals.map(normHeader);
          else sheetRows.push({ rowNumber: row.number, cells: vals });
        }
        if (!sheetHeaders.length) continue;
        if (sheetHeaders.some((h) => HEADER_MAP[h] === "employeeCode")) {
          headers = sheetHeaders;
          rows = sheetRows;
          break;
        }
        if (!headers.length) {
          headers = sheetHeaders;
          rows = sheetRows;
        }
      }
    } catch (error) {
      logger.warn("XLSX streaming parse failed; using compatible workbook loader:", error.message);
      headers = [];
      rows = [];
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(buffer);
      for (const worksheet of workbook.worksheets) {
        const sheetRows = [];
        let sheetHeaders = [];
        worksheet.eachRow((row) => {
          const vals = [];
          row.eachCell({ includeEmpty: true }, (cell, col) => (vals[col - 1] = cellToString(cell.value).trim()));
          if (!vals.some((v) => v)) return;
          if (!sheetHeaders.length) sheetHeaders = vals.map(normHeader);
          else sheetRows.push({ rowNumber: row.number, cells: vals });
        });
        if (!sheetHeaders.length) continue;
        if (sheetHeaders.some((h) => HEADER_MAP[h] === "employeeCode")) {
          headers = sheetHeaders;
          rows = sheetRows;
          break;
        }
        if (!headers.length) {
          headers = sheetHeaders;
          rows = sheetRows;
        }
      }
    }
    if (!headers.length) throw new Error("The Excel file has no data. Put the employees on the first sheet with a header row.");
  } else {
    const text = buffer.toString("utf8");
    const records = parseCsv(text, { bom: true, skip_empty_lines: true, relax_column_count: true, trim: true });
    if (!records.length) throw new Error("The file is empty.");
    headers = records[0].map(normHeader);
    rows = records.slice(1).map((cells, i) => ({ rowNumber: i + 2, cells }));
  }
  const keys = headers.map((h) => HEADER_MAP[h] || null);
  if (!keys.includes("employeeCode")) throw new Error('Column "Employee ID" was not found. Download the sample template to see the expected columns.');
  if (!keys.includes("firstName") && !keys.includes("fullName")) throw new Error('Column "First Name" was not found.');
  const parsed = [];
  for (const r of rows) {
    const data = {};
    keys.forEach((k, i) => {
      if (k && r.cells[i] !== undefined && r.cells[i] !== "") data[k] = String(r.cells[i]).trim();
    });
    if (Object.keys(data).length === 0) continue; // blank row
    if (!data.firstName && data.fullName) {
      const [f, ...l] = data.fullName.split(/\s+/);
      data.firstName = f;
      if (!data.lastName) data.lastName = l.join(" ");
    }
    delete data.fullName;
    parsed.push({ rowNumber: r.rowNumber, data });
  }
  return parsed;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const URL_RE = /^https?:\/\/[^\s]+$/i;

/** Validate + normalise one row. Returns { value } or { errors: [{field,message}] }. */
export function validateRow(d) {
  const errors = [];
  const v = {};
  const str = (k, max) => {
    const s = (d[k] || "").trim();
    if (s.length > max) errors.push({ field: k, message: `${k} is longer than ${max} characters` });
    return s.slice(0, max);
  };
  v.employeeCode = str("employeeCode", 50);
  v.firstName = str("firstName", 60);
  v.lastName = str("lastName", 60);
  v.designation = str("designation", 100);
  v.department = str("department", 100);
  v.bio = str("bio", 600);
  v.location = str("location", 120);
  if (!v.employeeCode) errors.push({ field: "employeeCode", message: "Employee ID is required" });
  if (!v.firstName) errors.push({ field: "firstName", message: "First Name is required" });

  const email = (d.workEmail || "").trim().toLowerCase();
  if (email && !EMAIL_RE.test(email)) errors.push({ field: "workEmail", message: `Invalid email "${email}"` });
  v.workEmail = email;

  for (const k of ["mobile", "whatsapp"]) {
    const raw = (d[k] || "").trim();
    if (raw && !isValidPhone(raw)) errors.push({ field: k, message: `Invalid ${k === "mobile" ? "mobile" : "WhatsApp"} number "${raw}" (use 10-15 digits)` });
    v[k] = raw ? normalizePhone(raw) : "";
  }
  if (!v.whatsapp && v.mobile) v.whatsapp = v.mobile;

  const photo = (d.photoUrl || "").trim();
  if (photo && !/^https:\/\//i.test(photo)) errors.push({ field: "photoUrl", message: "Profile Photo URL must start with https://" });
  v.photoUrl = photo;

  const li = (d.linkedin || "").trim();
  if (li && !URL_RE.test(li) && !/^(www\.)?linkedin\.com\//i.test(li)) errors.push({ field: "linkedin", message: "LinkedIn URL is not a valid link" });
  v.linkedin = li;

  const status = (d.cardStatus || "active").trim().toLowerCase();
  if (!["active", "inactive"].includes(status)) errors.push({ field: "cardStatus", message: 'Card Status must be "active" or "inactive"' });
  v.cardStatus = status === "inactive" ? "inactive" : "active";

  return errors.length ? { errors } : { value: v };
}

/** Run an import job end to end. Never throws — failures are written to the job. */
export async function runImport({ jobId, organizationId, rows, mode, seatsAvailable }) {
  const job = await ImportJob.findOne({ _id: jobId, organizationId });
  const errs = [];
  let failedCount = 0;
  const addErr = (row, employeeCode, field, message) => {
    failedCount++;
    if (errs.length < MAX_STORED_ERRORS) errs.push({ row, employeeCode: employeeCode || "", field, message });
  };
  try {
    job.status = "processing";
    job.startedAt = new Date();
    job.total = rows.length;
    await job.save();

    // 1) Validate + in-file duplicates
    const seenCode = new Map();
    const seenEmail = new Map();
    const valid = [];
    for (const r of rows) {
      const res = validateRow(r.data);
      if (res.errors) {
        res.errors.forEach((e) => addErr(r.rowNumber, r.data.employeeCode, e.field, e.message));
        continue;
      }
      const v = res.value;
      const codeKey = v.employeeCode.toLowerCase();
      if (seenCode.has(codeKey)) {
        addErr(r.rowNumber, v.employeeCode, "employeeCode", `Duplicate Employee ID in this file (first seen on row ${seenCode.get(codeKey)})`);
        continue;
      }
      if (v.workEmail && seenEmail.has(v.workEmail)) {
        addErr(r.rowNumber, v.employeeCode, "workEmail", `Duplicate email in this file (first seen on row ${seenEmail.get(v.workEmail)})`);
        continue;
      }
      seenCode.set(codeKey, r.rowNumber);
      if (v.workEmail) seenEmail.set(v.workEmail, r.rowNumber);
      valid.push({ rowNumber: r.rowNumber, v });
    }

    // 2) Compare with existing employees of THIS organization
    const existing = await Employee.find({ organizationId }).select("_id employeeCode workEmail slug").lean();
    const byCode = new Map(existing.map((e) => [e.employeeCode.toLowerCase(), e]));
    const emailOwner = new Map(existing.filter((e) => e.workEmail).map((e) => [e.workEmail, e]));
    const slugs = new Set(existing.map((e) => e.slug));

    const toCreate = [];
    const toUpdate = [];
    let duplicates = 0;
    let seats = seatsAvailable;
    for (const { rowNumber, v } of valid) {
      const found = byCode.get(v.employeeCode.toLowerCase());
      const owner = v.workEmail ? emailOwner.get(v.workEmail) : null;
      if (found) {
        if (mode !== "upsert") {
          duplicates++;
          addErr(rowNumber, v.employeeCode, "employeeCode", "Employee ID already exists (skipped). Choose 'Update existing' to overwrite.");
          failedCount--; // duplicates are reported separately, not as failures
          continue;
        }
        if (owner && String(owner._id) !== String(found._id)) {
          addErr(rowNumber, v.employeeCode, "workEmail", "This email belongs to another employee");
          continue;
        }
        toUpdate.push({ rowNumber, v, id: found._id });
      } else {
        if (owner) {
          addErr(rowNumber, v.employeeCode, "workEmail", "This email belongs to another employee");
          continue;
        }
        if (seats <= 0) {
          addErr(rowNumber, v.employeeCode, "plan", "Plan employee limit reached — upgrade the plan to add more employees");
          continue;
        }
        seats--;
        toCreate.push({ rowNumber, v });
      }
    }

    job.duplicates = duplicates;
    job.processed = rows.length - toCreate.length - toUpdate.length;
    await job.save();

    // 3) Write in batches
    let created = 0;
    let updated = 0;
    const docOf = (v) => ({
      employeeCode: v.employeeCode,
      firstName: v.firstName,
      lastName: v.lastName,
      designation: v.designation,
      department: v.department,
      workEmail: v.workEmail,
      mobile: v.mobile,
      whatsapp: v.whatsapp,
      photoUrl: v.photoUrl,
      bio: v.bio,
      location: v.location,
      cardStatus: v.cardStatus,
    });

    for (let i = 0; i < toCreate.length; i += BATCH) {
      const chunk = toCreate.slice(i, i + BATCH);
      const docs = chunk.map(({ v }) => ({
        organizationId,
        ...docOf(v),
        social: { linkedin: v.linkedin },
        slug: uniqueSlug(slugify(`${v.firstName} ${v.lastName}`) || slugify(v.employeeCode), slugs),
        isPublished: true,
        publishedAt: new Date(),
        importJobId: job._id,
      }));
      try {
        const inserted = await Employee.insertMany(docs, { ordered: false });
        created += inserted.length;
      } catch (e) {
        const writeErrors = e.writeErrors || e.result?.writeErrors || [];
        created += Array.isArray(e.insertedDocs) ? e.insertedDocs.length : Math.max(0, docs.length - writeErrors.length);
        for (const we of writeErrors) {
          const idx = we.index ?? we.err?.index;
          const src = chunk[idx];
          addErr(src?.rowNumber || 0, src?.v.employeeCode, "employeeCode", we.code === 11000 || we.err?.code === 11000 ? "Duplicate Employee ID" : we.errmsg || "Could not save row");
        }
        if (!writeErrors.length) throw e;
      }
      job.processed += chunk.length;
      job.created = created;
      await job.save();
    }

    for (let i = 0; i < toUpdate.length; i += BATCH) {
      const chunk = toUpdate.slice(i, i + BATCH);
      const ops = chunk.map(({ v, id }) => {
        const set = docOf(v);
        if (v.linkedin) set["social.linkedin"] = v.linkedin;
        // Do not wipe existing values with blanks from the sheet
        for (const k of Object.keys(set)) if (set[k] === "" || set[k] === undefined) delete set[k];
        return { updateOne: { filter: { _id: id, organizationId }, update: { $set: set } } };
      });
      const r = await Employee.bulkWrite(ops, { ordered: false });
      updated += r.matchedCount ?? chunk.length;
      job.processed += chunk.length;
      job.updated = updated;
      await job.save();
    }

    errs.sort((a, b) => a.row - b.row);
    job.created = created;
    job.updated = updated;
    job.failed = failedCount;
    job.rowErrors = errs;
    job.processed = rows.length;
    job.status = "completed";
    job.finishedAt = new Date();
    await job.save();
  } catch (e) {
    logger.error("import failed", e);
    job.status = "failed";
    job.errorMessage = e.message || "Import failed";
    job.rowErrors = errs;
    job.failed = failedCount;
    job.finishedAt = new Date();
    await job.save().catch(() => {});
  }
}

/** Build the sample template as XLSX (with an Instructions sheet). */
export async function templateXlsx() {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Employees");
  ws.columns = COLUMNS.map((c) => ({ header: c.label, key: c.key, width: Math.max(16, c.label.length + 4) }));
  ws.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF4F46E5" } };
  ws.addRow(Object.fromEntries(COLUMNS.map((c) => [c.key, c.example])));
  ws.getColumn("mobile").numFmt = "@";
  ws.getColumn("whatsapp").numFmt = "@";
  const info = wb.addWorksheet("Instructions");
  info.columns = [
    { header: "Column", key: "c", width: 22 },
    { header: "Required", key: "r", width: 10 },
    { header: "Notes", key: "n", width: 80 },
  ];
  info.getRow(1).font = { bold: true };
  const notes = {
    employeeCode: "Unique per employee. Used to detect duplicates and to update existing employees.",
    workEmail: "Optional, must be a valid email. Needed for employee login and email reminders.",
    mobile: "10-15 digits, country code recommended (e.g. +91 98765 43210).",
    whatsapp: "Optional. If empty, the mobile number is used.",
    photoUrl: "Optional public https:// link to a photo. Photos can also be uploaded later.",
    cardStatus: '"active" (default) or "inactive".',
  };
  for (const c of COLUMNS) info.addRow({ c: c.label, r: c.required ? "Yes" : "No", n: notes[c.key] || "" });
  info.addRow({});
  info.addRow({ c: "Tip", n: "Delete the example row before uploading. Up to 20,000 rows per file." });
  return wb.xlsx.writeBuffer();
}

export function templateCsv() {
  const head = COLUMNS.map((c) => c.label).join(",");
  const ex = COLUMNS.map((c) => (c.example.includes(",") ? `"${c.example}"` : c.example)).join(",");
  return "﻿" + head + "\r\n" + ex + "\r\n";
}