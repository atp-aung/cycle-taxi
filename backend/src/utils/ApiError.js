class ApiError extends Error {
  constructor(statusCode, message, errors = undefined) {
    super(message);

    this.statusCode = statusCode;
    this.errors = errors;
    this.isOperational = true;

    Error.captureStackTrace(this, this.constructor);
  }
}

export default ApiError;
