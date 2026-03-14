const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const {
  attachCheckoutSession,
  createOrUpdateWaitlistEntry,
  enforceRateLimit,
  resetCheckoutStatus
} = require("../lib/waitlist-store");
const { getAppUrl, hasAllowedOrigin, parseJsonBody, sanitizeEmail, sanitizeText, sendJson, setApiHeaders, extractClientIp } = require("../lib/request-utils");
const { getStripe } = require("../lib/stripe");
const { getWaitlistTier } = require("../lib/waitlist-config");
const { sendWaitlistSignupNotification } = require("../lib/notifications");

module.exports = async function handler(req, res) {
  setApiHeaders(res);

  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }

  if (req.method !== "POST") {
    sendJson(res, 405, { status: "error", message: "Method not allowed." });
    return;
  }

  if (!hasAllowedOrigin(req)) {
    sendJson(res, 403, { status: "error", message: "Origin not allowed." });
    return;
  }

  const body = parseJsonBody(req.body);
  if (!body) {
    sendJson(res, 400, { status: "error", message: "Invalid request body." });
    return;
  }

  const name = sanitizeText(body.name, 120);
  const email = sanitizeEmail(body.email);
  const tierKey = typeof body.tier === "string" ? body.tier.trim() : "";
  const company = sanitizeText(body.company, 120);
  const tier = getWaitlistTier(tierKey);

  if (company) {
    sendJson(res, 202, { status: "ok", mode: "ignored" });
    return;
  }

  if (!name) {
    sendJson(res, 400, { status: "error", message: "Name is required." });
    return;
  }

  if (!email || !EMAIL_PATTERN.test(email)) {
    sendJson(res, 400, { status: "error", message: "A valid email address is required." });
    return;
  }

  if (!tier) {
    sendJson(res, 400, { status: "error", message: "A valid reservation tier is required." });
    return;
  }

  try {
    await enforceRateLimit(extractClientIp(req));

    const entry = await createOrUpdateWaitlistEntry({
      name,
      email,
      tier,
      source: "website"
    });

    if (entry.alreadyPaid) {
      sendJson(res, 409, {
        status: "error",
        message: "This email already has a completed VFORCE priority reservation."
      });
      return;
    }

    if (entry.soldOut) {
      sendJson(res, 409, {
        status: "error",
        code: "tier_sold_out",
        message: "That priority tier is sold out.",
        availability: entry.availability || null
      });
      return;
    }

    if (tier.amountCents === 0) {
      await fireAndForgetNotification(() =>
        sendWaitlistSignupNotification({
          entryId: entry.id,
          name,
          email,
          tier,
          mode: "free",
          checkoutStatus: "free_waitlist",
          amountCents: tier.amountCents
        })
      );

      sendJson(res, 200, { status: "ok", mode: "free" });
      return;
    }

    const stripe = getStripe();
    const appUrl = getAppUrl(req);
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      billing_address_collection: "auto",
      cancel_url: `${appUrl}/waitlist?checkout=cancelled`,
      client_reference_id: String(entry.id),
      customer_email: email,
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: tier.stripeProductName,
              description: tier.stripeDescription
            },
            unit_amount: tier.amountCents
          },
          quantity: 1
        }
      ],
      metadata: {
        email,
        selection_id: tier.id,
        waitlist_entry_id: String(entry.id)
      },
      payment_intent_data: {
        metadata: {
          email,
          selection_id: tier.id,
          waitlist_entry_id: String(entry.id)
        }
      },
      payment_method_types: ["card"],
      success_url: `${appUrl}/waitlist?checkout=success&session_id={CHECKOUT_SESSION_ID}`
    });

    if (!session.url) {
      await resetCheckoutStatus(entry.id);
      sendJson(res, 502, {
        status: "error",
        message: "Unable to start Stripe checkout right now."
      });
      return;
    }

    await attachCheckoutSession({
      entryId: entry.id,
      sessionId: session.id
    });

    await fireAndForgetNotification(() =>
      sendWaitlistSignupNotification({
        entryId: entry.id,
        name,
        email,
        tier,
        mode: "paid",
        checkoutStatus: "pending_payment",
        amountCents: tier.amountCents
      })
    );

    sendJson(res, 200, {
      status: "ok",
      mode: "paid",
      redirectUrl: session.url
    });
  } catch (error) {
    const isRateLimitError = typeof error.message === "string" && error.message.includes("Too many submissions");
    if (isRateLimitError) {
      res.setHeader("Retry-After", String((Number.parseInt(process.env.WAITLIST_RATE_LIMIT_WINDOW_MINUTES, 10) || 15) * 60));
      sendJson(res, 429, {
        status: "error",
        message: error.message
      });
      return;
    }

    sendJson(res, 500, {
      status: "error",
      message: "Unable to save your reservation right now."
    });
  }
};

async function fireAndForgetNotification(fn) {
  try {
    await fn();
  } catch (error) {
    console.error("Waitlist notification error:", error && error.message ? error.message : error);
  }
}
