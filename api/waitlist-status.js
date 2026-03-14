const { getAvailabilitySnapshot } = require("../lib/waitlist-store");
const { sendJson, setApiHeaders } = require("../lib/request-utils");

module.exports = async function handler(req, res) {
  setApiHeaders(res);

  if (req.method !== "GET") {
    sendJson(res, 405, { status: "error", message: "Method not allowed." });
    return;
  }

  try {
    const snapshot = await getAvailabilitySnapshot();
    sendJson(res, 200, {
      status: "ok",
      tiers: snapshot.tiers
    });
  } catch (error) {
    sendJson(res, 500, {
      status: "error",
      message: "Unable to load waitlist availability right now."
    });
  }
};
