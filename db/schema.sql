CREATE TABLE IF NOT EXISTS waitlist_entries (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  selection_id TEXT NOT NULL CHECK (selection_id IN ('priority_10000', 'priority_100000', 'priority_1000000', 'free')),
  selection_label TEXT NOT NULL,
  amount_cents INTEGER NOT NULL CHECK (amount_cents >= 0),
  access_type TEXT NOT NULL CHECK (access_type IN ('paid-priority', 'free')),
  checkout_status TEXT NOT NULL DEFAULT 'not_started' CHECK (
    checkout_status IN ('not_started', 'pending_payment', 'paid', 'free_waitlist', 'checkout_expired', 'payment_failed')
  ),
  stripe_session_id TEXT,
  stripe_payment_intent_id TEXT,
  stripe_customer_id TEXT,
  source TEXT NOT NULL DEFAULT 'website',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_checkout_started_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS stripe_events (
  event_id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS submission_attempts (
  id BIGSERIAL PRIMARY KEY,
  ip_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS waitlist_entries_checkout_status_idx ON waitlist_entries (checkout_status);
CREATE INDEX IF NOT EXISTS waitlist_entries_created_at_idx ON waitlist_entries (created_at DESC);
CREATE INDEX IF NOT EXISTS submission_attempts_ip_created_at_idx ON submission_attempts (ip_hash, created_at DESC);
