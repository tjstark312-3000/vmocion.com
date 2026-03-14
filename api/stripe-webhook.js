const { getStripe } = require("../lib/stripe");
const {
  markWaitlistExpiredById,
  markWaitlistPaidById,
  markWaitlistPaymentFailedById,
  recordStripeEvent
} = require("../lib/waitlist-store");
const { headerValue, readRawBody, sendJson, setApiHeaders } = require("../lib/request-utils");
const { sendWaitlistPaidNotification } = require("../lib/notifications");

module.exports = async function handler(req, res) {
  setApiHeaders(res);

  if (req.method !== "POST") {
    sendJson(res, 405, { status: "error", message: "Method not allowed." });
    return;
  }

  const signature = headerValue(req.headers["stripe-signature"]);
  if (!signature) {
    sendJson(res, 400, { status: "error", message: "Missing Stripe signature." });
    return;
  }

  if (!process.env.STRIPE_WEBHOOK_SECRET) {
    sendJson(res, 503, { status: "error", message: "STRIPE_WEBHOOK_SECRET is not configured." });
    return;
  }

  try {
    const stripe = getStripe();
    const rawBody = await readRawBody(req);
    const event = stripe.webhooks.constructEvent(rawBody, signature, process.env.STRIPE_WEBHOOK_SECRET);
    const shouldProcess = await recordStripeEvent(event.id, event.type);

    if (!shouldProcess) {
      sendJson(res, 200, { received: true, duplicate: true });
      return;
    }

    if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
      await handlePaidSession(event.data.object);
    }

    if (event.type === "checkout.session.async_payment_failed") {
      await handleFailedSession(event.data.object);
    }

    if (event.type === "checkout.session.expired") {
      await handleExpiredSession(event.data.object);
    }

    sendJson(res, 200, { received: true });
  } catch (error) {
    sendJson(res, 400, { status: "error", message: "Webhook error." });
  }
};

async function handlePaidSession(session) {
  if (!session || session.payment_status !== "paid") {
    return;
  }

  const entryId = parseEntryId(session.metadata);
  if (!entryId) {
    return;
  }

  const updatedEntry = await markWaitlistPaidById({
    entryId,
    sessionId: session.id,
    paymentIntentId: session.payment_intent || null,
    customerId: session.customer || null
  });

  if (!updatedEntry) {
    return;
  }

  try {
    await sendWaitlistPaidNotification({
      entryId: updatedEntry.id,
      name: updatedEntry.name,
      email: updatedEntry.email,
      selectionLabel: updatedEntry.selection_label,
      amountCents: updatedEntry.amount_cents,
      sessionId: updatedEntry.stripe_session_id,
      paymentIntentId: updatedEntry.stripe_payment_intent_id
    });
  } catch (error) {
    console.error("Payment notification error:", error && error.message ? error.message : error);
  }
}

async function handleFailedSession(session) {
  const entryId = parseEntryId(session.metadata);
  if (!entryId) {
    return;
  }

  await markWaitlistPaymentFailedById({
    entryId,
    sessionId: session.id
  });
}

async function handleExpiredSession(session) {
  const entryId = parseEntryId(session.metadata);
  if (!entryId) {
    return;
  }

  await markWaitlistExpiredById({
    entryId,
    sessionId: session.id
  });
}

function parseEntryId(metadata) {
  const rawId = metadata && metadata.waitlist_entry_id;
  const entryId = Number.parseInt(rawId, 10);
  return Number.isInteger(entryId) ? entryId : 0;
}
