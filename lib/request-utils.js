function setApiHeaders(res) {
  res.setHeader("Cache-Control", "no-store, max-age=0");
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("X-Content-Type-Options", "nosniff");
}

function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.end(JSON.stringify(payload));
}

function parseJsonBody(body) {
  if (!body) {
    return {};
  }

  if (typeof body === "object") {
    return body;
  }

  if (typeof body === "string") {
    try {
      return JSON.parse(body);
    } catch (error) {
      return null;
    }
  }

  return null;
}

function sanitizeText(value, maxLength) {
  if (typeof value !== "string") {
    return "";
  }

  return value.replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function sanitizeEmail(value) {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim().toLowerCase().slice(0, 254);
}

function headerValue(value) {
  if (Array.isArray(value)) {
    return value[0] || "";
  }

  if (typeof value !== "string") {
    return "";
  }

  return value.split(",")[0].trim();
}

function hasAllowedOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) {
    return true;
  }

  try {
    const originUrl = new URL(origin);
    const forwardedHost = headerValue(req.headers["x-forwarded-host"]);
    const host = forwardedHost || headerValue(req.headers.host);

    if (!host) {
      return true;
    }

    return originUrl.host === host;
  } catch (error) {
    return false;
  }
}

function extractClientIp(req) {
  const forwardedFor = headerValue(req.headers["x-forwarded-for"]);
  if (forwardedFor) {
    return forwardedFor;
  }

  return req.socket && req.socket.remoteAddress ? req.socket.remoteAddress : "";
}

function getAppUrl(req) {
  const configured = normalizePublicUrl(process.env.PUBLIC_APP_URL || "");
  if (configured) {
    return configured;
  }

  const protocol = headerValue(req.headers["x-forwarded-proto"]) || "http";
  const host = headerValue(req.headers["x-forwarded-host"]) || headerValue(req.headers.host);

  if (!host) {
    throw new Error("Unable to determine the application URL.");
  }

  return `${protocol}://${host}`;
}

async function readRawBody(req) {
  if (Buffer.isBuffer(req.body)) {
    return req.body;
  }

  if (typeof req.body === "string") {
    return Buffer.from(req.body);
  }

  if (req.body && typeof req.body === "object") {
    return Buffer.from(JSON.stringify(req.body));
  }

  const chunks = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  return Buffer.concat(chunks);
}

function normalizePublicUrl(value) {
  if (typeof value !== "string" || !value.trim()) {
    return "";
  }

  try {
    const url = new URL(value.trim());
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      return "";
    }

    return url.toString().replace(/\/$/, "");
  } catch (error) {
    return "";
  }
}

module.exports = {
  extractClientIp,
  getAppUrl,
  hasAllowedOrigin,
  headerValue,
  parseJsonBody,
  readRawBody,
  sanitizeEmail,
  sanitizeText,
  sendJson,
  setApiHeaders
};
