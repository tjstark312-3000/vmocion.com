const { getStripe } = require("../lib/stripe");
const { getWaitlistEntryBySessionId, markWaitlistPaidById } = require("../lib/waitlist-store");
const { sendJson, setApiHeaders } = require("../lib/request-utils");

module.exports = async function handler(req, res) {
  setApiHeaders(res);

  if (req.method !== "GET") {
    sendJson(res, 405, { status: "error", message: "Method not allowed." });
    return;
  }

  const sessionId = typeof req.query.session_id === "string" ? req.query.session_id.trim() : "";
  if (!sessionId) {
    sendJson(res, 400, { status: "error", message: "Missing session id." });
    return;
  }

  try {
    const entry = await getWaitlistEntryBySessionId(sessionId);
    if (!entry) {
      sendJson(res, 404, { status: "error", message: "Reservation not found." });
      return;
    }

    if (entry.checkout_status === "paid") {
      sendJson(res, 200, { status: "ok", checkoutStatus: "paid" });
      return;
    }

    const stripe = getStripe();
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    if (session.payment_status === "paid") {
      await markWaitlistPaidById({
        entryId: entry.id,
        sessionId: session.id,
        paymentIntentId: session.payment_intent || null,
        customerId: session.customer || null
      });

      sendJson(res, 200, { status: "ok", checkoutStatus: "paid" });
      return;
    }

    sendJson(res, 200, {
      status: "ok",
      checkoutStatus: entry.checkout_status === "pending_payment" ? "pending_payment" : session.status || "open"
    });
  } catch (error) {
    sendJson(res, 500, {
      status: "error",
      message: "Unable to verify checkout status right now."
    });
  }
};
