class AppError extends Error {
  constructor(message, status = 400, code = 'APPLICATION_ERROR') {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
  }
}

module.exports = { AppError };
