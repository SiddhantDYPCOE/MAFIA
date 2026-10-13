
export function errorMiddleware(error, req, res, next) {
  if (res.headersSent) {
    return next(error);
  }

  const status = error.statusCode || 500;

  if (status >= 500) {
    console.error(error);
  }

  res.status(status).json({
    success: false,
    message:
      status >= 500
        ? "Internal server error"
        : error.message,
  });
}