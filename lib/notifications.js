const { Resend } = require("resend");

let resendClient;
let missingConfigLogged = false;

function getResendClient() {
  if (!process.env.RESEND_API_KEY) {
    if (!missingConfigLogged) {
      console.warn("RESEND_API_KEY is not configured. Waitlist notifications are disabled.");
      missingConfigLogged = true;
    }

    return null;
  }

  if (!resendClient) {
    resendClient = new Resend(process.env.RESEND_API_KEY);
  }

  return resendClient;
}

async function sendWaitlistSignupNotification({ entryId, name, email, tier, mode, checkoutStatus, amountCents }) {
  const resend = getResendClient();
  if (!resend) return;

  const from = getNotificationSender();
  const to = getNotificationRecipient();
  const subjectPrefix = mode === "free" ? "New free waitlist signup" : "New paid waitlist reservation started";

  const { error } = await resend.emails.send({
    from,
    to: [to],
    subject: `[VFORCE] ${subjectPrefix}`,
    replyTo: email,
    html: buildNotificationHtml({
      title: subjectPrefix,
      entryId,
      name,
      email,
      tierLabel: tier.label,
      amountCents,
      checkoutStatus,
      eventType: mode === "free" ? "free_waitlist_signup" : "paid_waitlist_started"
    }),
    text: buildNotificationText({
      title: subjectPrefix,
      entryId,
      name,
      email,
      tierLabel: tier.label,
      amountCents,
      checkoutStatus,
      eventType: mode === "free" ? "free_waitlist_signup" : "paid_waitlist_started"
    })
  });

  if (error) {
    throw new Error(error.message || "Unable to send signup notification email.");
  }
}

async function sendWaitlistPaidNotification({ entryId, name, email, selectionLabel, amountCents, sessionId, paymentIntentId }) {
  const resend = getResendClient();
  if (!resend) return;

  const from = getNotificationSender();
  const to = getNotificationRecipient();

  const { error } = await resend.emails.send({
    from,
    to: [to],
    subject: "[VFORCE] Paid priority reservation confirmed",
    replyTo: email,
    html: buildNotificationHtml({
      title: "Paid priority reservation confirmed",
      entryId,
      name: name || "(not stored)",
      email,
      tierLabel: selectionLabel,
      amountCents,
      checkoutStatus: "paid",
      eventType: "paid_waitlist_confirmed",
      sessionId,
      paymentIntentId
    }),
    text: buildNotificationText({
      title: "Paid priority reservation confirmed",
      entryId,
      name: name || "(not stored)",
      email,
      tierLabel: selectionLabel,
      amountCents,
      checkoutStatus: "paid",
      eventType: "paid_waitlist_confirmed",
      sessionId,
      paymentIntentId
    })
  });

  if (error) {
    throw new Error(error.message || "Unable to send payment confirmation notification email.");
  }
}

function getNotificationRecipient() {
  return process.env.NOTIFICATION_EMAIL_TO || "bradleyjr@vmocion.com";
}

function getNotificationSender() {
  return process.env.RESEND_FROM_EMAIL || "VMOCION Waitlist <onboarding@resend.dev>";
}

function buildNotificationHtml({ title, entryId, name, email, tierLabel, amountCents, checkoutStatus, eventType, sessionId, paymentIntentId }) {
  const amountLabel = typeof amountCents === "number" ? `$${(amountCents / 100).toFixed(2)}` : "N/A";

  return `
    <div style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto;padding:24px;background:#0d0d1a;color:#f4f4fb;">
      <h2 style="margin:0 0 16px;color:#9b4dff;">${escapeHtml(title)}</h2>
      <table style="width:100%;border-collapse:collapse;">
        ${row("Event", eventType)}
        ${row("Entry ID", String(entryId || ""))}
        ${row("Name", name)}
        ${row("Email", email)}
        ${row("Tier", tierLabel)}
        ${row("Amount", amountLabel)}
        ${row("Checkout status", checkoutStatus)}
        ${sessionId ? row("Stripe session", sessionId) : ""}
        ${paymentIntentId ? row("Payment intent", paymentIntentId) : ""}
      </table>
    </div>
  `;
}

function buildNotificationText({ title, entryId, name, email, tierLabel, amountCents, checkoutStatus, eventType, sessionId, paymentIntentId }) {
  const amountLabel = typeof amountCents === "number" ? `$${(amountCents / 100).toFixed(2)}` : "N/A";

  return [
    title,
    "",
    `Event: ${eventType}`,
    `Entry ID: ${entryId || ""}`,
    `Name: ${name}`,
    `Email: ${email}`,
    `Tier: ${tierLabel}`,
    `Amount: ${amountLabel}`,
    `Checkout status: ${checkoutStatus}`,
    sessionId ? `Stripe session: ${sessionId}` : "",
    paymentIntentId ? `Payment intent: ${paymentIntentId}` : ""
  ].filter(Boolean).join("\n");
}

function row(label, value) {
  return `
    <tr>
      <td style="padding:8px 0;color:#9ea2bd;width:180px;vertical-align:top;">${escapeHtml(label)}</td>
      <td style="padding:8px 0;font-weight:600;vertical-align:top;">${escapeHtml(value)}</td>
    </tr>
  `;
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

module.exports = {
  sendWaitlistPaidNotification,
  sendWaitlistSignupNotification
};
