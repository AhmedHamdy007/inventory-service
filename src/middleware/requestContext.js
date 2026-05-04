function requestContext(logger) {
  return (req, res, next) => {
    req.id = req.headers["x-request-id"] || crypto.randomUUID();
    req.logger = logger;
    res.setHeader("x-request-id", req.id);
    next();
  };
}

const crypto = require("crypto");

module.exports = requestContext;
