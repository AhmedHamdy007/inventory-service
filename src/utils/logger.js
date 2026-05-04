class Logger {
  constructor(service, level = "INFO") {
    this.service = service;
    this.level = level;
  }

  log(level, message, meta = {}) {
    console.log(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        service: this.service,
        level,
        message,
        ...meta,
      })
    );
  }

  info(message, meta) {
    this.log("INFO", message, meta);
  }

  warn(message, meta) {
    this.log("WARN", message, meta);
  }

  error(message, meta) {
    this.log("ERROR", message, meta);
  }
}

module.exports = {
  Logger,
};
