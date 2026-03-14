const crypto = require("crypto");
const { ensureSchema, getSql } = require("./db");
const { WAITLIST_TIERS, getPaidTierIds } = require("./waitlist-config");

const ACTIVE_RESERVATION_STATUSES = ["pending_payment", "paid"];
const QUOTA_LOCK_ID = 982451653;

async function enforceRateLimit(ipAddress) {
  if (!ipAddress) {
    return;
  }

  await ensureSchema();
  const sql = getSql();
  const ipHash = crypto.createHash("sha256").update(ipAddress).digest("hex");
  const windowMinutes = clampInteger(process.env.WAITLIST_RATE_LIMIT_WINDOW_MINUTES, 15, 1, 120);
  const maxAttempts = clampInteger(process.env.WAITLIST_RATE_LIMIT_MAX, 10, 1, 100);

  const rows = await sql`
    WITH inserted AS (
      INSERT INTO submission_attempts (ip_hash)
      VALUES (${ipHash})
      RETURNING id
    )
    SELECT COUNT(*)::int AS attempt_count
    FROM submission_attempts
    WHERE ip_hash = ${ipHash}
      AND created_at > NOW() - (${windowMinutes} * INTERVAL '1 minute')
  `;

  if (rows[0] && rows[0].attempt_count > maxAttempts) {
    throw new Error("Too many submissions from this address. Please try again later.");
  }
}

async function createOrUpdateWaitlistEntry({ name, email, tier, source }) {
  await ensureSchema();
  const sql = getSql();
  const paidTierStatus = await getAvailabilitySnapshot({ excludeEmail: email });
  const currentTierStatus = paidTierStatus.tiers[tier.id] || null;

  const rows = await sql`
    WITH quota_lock AS (
      SELECT pg_advisory_xact_lock(${QUOTA_LOCK_ID})
    ),
    existing AS (
      SELECT id, selection_id, checkout_status
      FROM waitlist_entries
      WHERE email = ${email}
      LIMIT 1
    ),
    counts AS (
      SELECT
        COUNT(*) FILTER (
          WHERE selection_id = 'priority_10000'
            AND checkout_status IN ('pending_payment', 'paid')
            AND email <> ${email}
        )::int AS count_10000,
        COUNT(*) FILTER (
          WHERE selection_id IN ('priority_10000', 'priority_100000')
            AND checkout_status IN ('pending_payment', 'paid')
            AND email <> ${email}
        )::int AS count_100000,
        COUNT(*) FILTER (
          WHERE selection_id IN ('priority_10000', 'priority_100000', 'priority_1000000')
            AND checkout_status IN ('pending_payment', 'paid')
            AND email <> ${email}
        )::int AS count_1000000
      FROM waitlist_entries, quota_lock
    ),
    decision AS (
      SELECT
        COALESCE((SELECT checkout_status = 'paid' FROM existing), false) AS already_paid,
        CASE
          WHEN ${tier.id} = 'priority_10000' THEN (SELECT count_10000 < 10000 FROM counts)
          WHEN ${tier.id} = 'priority_100000' THEN (SELECT count_100000 < 100000 FROM counts)
          WHEN ${tier.id} = 'priority_1000000' THEN (SELECT count_1000000 < 1000000 FROM counts)
          ELSE true
        END AS can_reserve
    ),
    upsert AS (
      INSERT INTO waitlist_entries (
        name,
        email,
        selection_id,
        selection_label,
        amount_cents,
        access_type,
        checkout_status,
        source,
        last_checkout_started_at
      )
      SELECT
        ${name},
        ${email},
        ${tier.id},
        ${tier.label},
        ${tier.amountCents},
        ${tier.accessType},
        ${tier.amountCents === 0 ? "free_waitlist" : "pending_payment"},
        ${source},
        ${tier.amountCents > 0 ? new Date().toISOString() : null}
      FROM decision
      WHERE NOT already_paid AND can_reserve
      ON CONFLICT (email)
      DO UPDATE SET
        name = EXCLUDED.name,
        selection_id = EXCLUDED.selection_id,
        selection_label = EXCLUDED.selection_label,
        amount_cents = EXCLUDED.amount_cents,
        access_type = EXCLUDED.access_type,
        checkout_status = EXCLUDED.checkout_status,
        source = EXCLUDED.source,
        stripe_session_id = CASE
          WHEN EXCLUDED.checkout_status = 'pending_payment' THEN NULL
          ELSE waitlist_entries.stripe_session_id
        END,
        stripe_payment_intent_id = CASE
          WHEN EXCLUDED.checkout_status = 'pending_payment' THEN NULL
          ELSE waitlist_entries.stripe_payment_intent_id
        END,
        stripe_customer_id = CASE
          WHEN EXCLUDED.checkout_status = 'pending_payment' THEN NULL
          ELSE waitlist_entries.stripe_customer_id
        END,
        last_checkout_started_at = CASE
          WHEN EXCLUDED.checkout_status = 'pending_payment' THEN NOW()
          ELSE waitlist_entries.last_checkout_started_at
        END,
        updated_at = NOW()
      WHERE waitlist_entries.checkout_status <> 'paid'
      RETURNING id, email, selection_id, selection_label, amount_cents, checkout_status
    )
    SELECT
      decision.already_paid,
      decision.can_reserve,
      upsert.id,
      upsert.selection_id,
      upsert.selection_label,
      upsert.amount_cents,
      upsert.checkout_status
    FROM decision
    LEFT JOIN upsert ON true
  `;

  const row = rows[0];
  if (row.already_paid) {
    return {
      id: row.id || null,
      alreadyPaid: true,
      soldOut: false,
      selectionId: row.selection_id || tier.id
    };
  }

  if (!row.can_reserve || !row.id) {
    return {
      id: null,
      alreadyPaid: false,
      soldOut: true,
      availability: currentTierStatus
    };
  }

  return {
    id: row.id,
    alreadyPaid: false,
    soldOut: false,
    selectionId: row.selection_id,
    selectionLabel: row.selection_label,
    amountCents: row.amount_cents,
    checkoutStatus: row.checkout_status
  };
}

async function attachCheckoutSession({ entryId, sessionId }) {
  await ensureSchema();
  const sql = getSql();

  await sql`
    UPDATE waitlist_entries
    SET stripe_session_id = ${sessionId},
        updated_at = NOW()
    WHERE id = ${entryId}
  `;
}

async function resetCheckoutStatus(entryId) {
  await ensureSchema();
  const sql = getSql();

  await sql`
    UPDATE waitlist_entries
    SET checkout_status = 'not_started',
        stripe_session_id = NULL,
        stripe_payment_intent_id = NULL,
        stripe_customer_id = NULL,
        updated_at = NOW()
    WHERE id = ${entryId}
  `;
}

async function recordStripeEvent(eventId, eventType) {
  await ensureSchema();
  const sql = getSql();

  const rows = await sql`
    INSERT INTO stripe_events (event_id, type)
    VALUES (${eventId}, ${eventType})
    ON CONFLICT (event_id) DO NOTHING
    RETURNING event_id
  `;

  return rows.length > 0;
}

async function markWaitlistPaidById({ entryId, sessionId, paymentIntentId, customerId }) {
  await ensureSchema();
  const sql = getSql();

  const rows = await sql`
    UPDATE waitlist_entries
    SET checkout_status = 'paid',
        stripe_session_id = ${sessionId},
        stripe_payment_intent_id = ${paymentIntentId || null},
        stripe_customer_id = ${customerId || null},
        updated_at = NOW()
    WHERE id = ${entryId}
    RETURNING id, name, email, selection_id, selection_label, amount_cents, checkout_status, stripe_session_id, stripe_payment_intent_id
  `;

  return rows[0] || null;
}

async function markWaitlistExpiredById({ entryId, sessionId }) {
  await ensureSchema();
  const sql = getSql();

  await sql`
    UPDATE waitlist_entries
    SET checkout_status = 'checkout_expired',
        stripe_session_id = ${sessionId || null},
        updated_at = NOW()
    WHERE id = ${entryId}
  `;
}

async function markWaitlistPaymentFailedById({ entryId, sessionId }) {
  await ensureSchema();
  const sql = getSql();

  await sql`
    UPDATE waitlist_entries
    SET checkout_status = 'payment_failed',
        stripe_session_id = ${sessionId || null},
        updated_at = NOW()
    WHERE id = ${entryId}
  `;
}

async function getAvailabilitySnapshot({ excludeEmail } = {}) {
  await ensureSchema();
  const sql = getSql();
  const excluded = typeof excludeEmail === "string" ? excludeEmail.trim().toLowerCase() : "";
  const rows = await sql`
    SELECT
      COUNT(*) FILTER (
        WHERE selection_id = 'priority_10000'
          AND checkout_status IN ('pending_payment', 'paid')
          AND (${excluded} = '' OR email <> ${excluded})
      )::int AS count_10000,
      COUNT(*) FILTER (
        WHERE selection_id IN ('priority_10000', 'priority_100000')
          AND checkout_status IN ('pending_payment', 'paid')
          AND (${excluded} = '' OR email <> ${excluded})
      )::int AS count_100000,
      COUNT(*) FILTER (
        WHERE selection_id IN ('priority_10000', 'priority_100000', 'priority_1000000')
          AND checkout_status IN ('pending_payment', 'paid')
          AND (${excluded} = '' OR email <> ${excluded})
      )::int AS count_1000000
    FROM waitlist_entries
  `;

  const counts = rows[0] || { count_10000: 0, count_100000: 0, count_1000000: 0 };

  return {
    tiers: {
      priority_10000: {
        selectionId: "priority_10000",
        label: WAITLIST_TIERS.priority_10000.label,
        capacity: WAITLIST_TIERS.priority_10000.limit,
        reserved: counts.count_10000,
        remaining: Math.max(0, WAITLIST_TIERS.priority_10000.limit - counts.count_10000),
        soldOut: counts.count_10000 >= WAITLIST_TIERS.priority_10000.limit
      },
      priority_100000: {
        selectionId: "priority_100000",
        label: WAITLIST_TIERS.priority_100000.label,
        capacity: WAITLIST_TIERS.priority_100000.limit,
        reserved: counts.count_100000,
        remaining: Math.max(0, WAITLIST_TIERS.priority_100000.limit - counts.count_100000),
        soldOut: counts.count_100000 >= WAITLIST_TIERS.priority_100000.limit
      },
      priority_1000000: {
        selectionId: "priority_1000000",
        label: WAITLIST_TIERS.priority_1000000.label,
        capacity: WAITLIST_TIERS.priority_1000000.limit,
        reserved: counts.count_1000000,
        remaining: Math.max(0, WAITLIST_TIERS.priority_1000000.limit - counts.count_1000000),
        soldOut: counts.count_1000000 >= WAITLIST_TIERS.priority_1000000.limit
      },
      free: {
        selectionId: "free",
        label: WAITLIST_TIERS.free.label,
        capacity: null,
        reserved: null,
        remaining: null,
        soldOut: false
      }
    }
  };
}

async function getWaitlistEntryBySessionId(sessionId) {
  await ensureSchema();
  const sql = getSql();
  const rows = await sql`
    SELECT id, email, selection_id, checkout_status, stripe_session_id
    FROM waitlist_entries
    WHERE stripe_session_id = ${sessionId}
    LIMIT 1
  `;

  return rows[0] || null;
}

function clampInteger(value, fallback, min, max) {
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, parsed));
}

module.exports = {
  attachCheckoutSession,
  createOrUpdateWaitlistEntry,
  enforceRateLimit,
  getAvailabilitySnapshot,
  getWaitlistEntryBySessionId,
  markWaitlistExpiredById,
  markWaitlistPaidById,
  markWaitlistPaymentFailedById,
  recordStripeEvent,
  resetCheckoutStatus
};
