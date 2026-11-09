import { sendError } from "../utils/apiResponse.js";

const errorMiddleware = (err, req, res, next) => {
  if (res.headersSent) {
    return next(err);
  }

  const statusCode = err.statusCode || 500;

  const message =
    statusCode >= 500
      ? "Internal server error"
      : err.message || "Request failed";

  if (process.env.NODE_ENV !== "production") {
    console.error(err);
  }

  return sendError(res, {
    statusCode,
    message,
    errors: err.errors,
  });
};

export default errorMiddleware;
