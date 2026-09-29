const errorHandler = (err, req, res, next) => {
  let error = { ...err };
  error.message = err.message;

  // Log error to console for developers
  if (process.env.NODE_ENV !== 'production') {
    console.error(err);
    require('fs').appendFileSync('error_log.txt', new Date().toISOString() + '\\n' + String(err.stack) + '\\n\\n');
  }

  // Mongoose bad ObjectId CastError
  if (err.name === 'CastError') {
    const message = `Resource not found with ID of ${err.value}`;
    error = new Error(message);
    error.statusCode = 404;
  }

  // Mongoose duplicate key
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue)[0];
    const message = `Duplicate value entered for field: ${field}. This record already exists.`;
    error = new Error(message);
    error.statusCode = 400;
  }

  // Mongoose validation error
  if (err.name === 'ValidationError') {
    const message = Object.values(err.errors).map(val => val.message).join(', ');
    error = new Error(message);
    error.statusCode = 400;
  }

  // JsonWebTokenError
  if (err.name === 'JsonWebTokenError') {
    const message = 'Invalid authentication token';
    error = new Error(message);
    error.statusCode = 401;
  }

  // TokenExpiredError
  if (err.name === 'TokenExpiredError') {
    const message = 'Authentication token has expired';
    error = new Error(message);
    error.statusCode = 401;
  }

  res.status(error.statusCode || 500).json({
    success: false,
    message: error.message || 'Internal Server Error'
  });
};

module.exports = errorHandler;
