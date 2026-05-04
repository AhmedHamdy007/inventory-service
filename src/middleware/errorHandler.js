class ValidationError extends Error {
  constructor(message, field) {
    super(message);
    this.name = "ValidationError";
    this.field = field;
    this.statusCode = 400;
  }
}

function errorHandler(error, req, res, next) {
  if (res.headersSent) return next(error);

  if (error instanceof ValidationError) {
    return res.status(error.statusCode).json({
      success: false,
      error: error.message,
      field: error.field,
      request_id: req.id,
    });
  }

  req.logger?.error?.("Unhandled inventory-service error", {
    requestId: req.id,
    error: error.message,
    stack: error.stack,
  });

  return res.status(error.statusCode || 500).json({
    success: false,
    error: error.statusCode ? error.message : "Internal server error",
    request_id: req.id,
  });
}

module.exports = {
  ValidationError,
  errorHandler,
};
