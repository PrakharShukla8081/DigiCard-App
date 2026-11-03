import multer from "multer";

/** Single image (photo / logo / gallery) kept in memory, validated by the storage adapter. */
export const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
}).single("file");

const SHEET_EXT = /\.(csv|xlsx)$/i;
/** Employee import file (CSV or XLSX), max 10 MB. */
export const sheetUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (!SHEET_EXT.test(file.originalname || "")) return cb(Object.assign(new Error("Upload a .csv or .xlsx file."), { statusCode: 400 }));
    cb(null, true);
  },
}).single("file");
