const ts = () => new Date().toISOString();
const silent = process.env.NODE_ENV === "test";

export const logger = {
  info: (...a) => !silent && console.log(`[INFO] ${ts()}`, ...a),
  warn: (...a) => !silent && console.warn(`[WARN] ${ts()}`, ...a),
  error: (...a) => console.error(`[ERROR] ${ts()}`, ...a),
};
