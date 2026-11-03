export class AppError extends Error {
  constructor(statusCode, message, code, details) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

export const badRequest = (msg, details) => new AppError(400, msg, "BAD_REQUEST", details);
export const unauthorized = (msg = "Please log in to continue.", code = "UNAUTHORIZED") => new AppError(401, msg, code);
export const forbidden = (msg = "You do not have permission to do this.", code = "FORBIDDEN") => new AppError(403, msg, code);
export const notFound = (msg = "Not found.") => new AppError(404, msg, "NOT_FOUND");
export const conflict = (msg, code = "CONFLICT") => new AppError(409, msg, code);
export const paymentRequired = (msg, code = "SUBSCRIPTION_INACTIVE") => new AppError(402, msg, code);
export const tooMany = (msg = "Too many requests. Please wait a moment and try again.") => new AppError(429, msg, "RATE_LIMITED");
