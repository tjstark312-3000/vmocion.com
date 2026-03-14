# Vercel Production Setup

## Required environment variables

Set these in Vercel before deploying:

- `DATABASE_URL`
- `RESEND_API_KEY`
- `RESEND_FROM_EMAIL`
- `NOTIFICATION_EMAIL_TO`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `PUBLIC_APP_URL`
- `WAITLIST_RATE_LIMIT_WINDOW_MINUTES`
- `WAITLIST_RATE_LIMIT_MAX`

## Database

Use a Postgres database such as Neon and provide its connection string as `DATABASE_URL`.
The app creates the required tables automatically on first request.
The reference schema is in `db/schema.sql`.

## Stripe

This site uses server-created Stripe Checkout sessions.
The publishable key is not required for the current flow.

Create a Stripe webhook endpoint that points to:

- `https://your-domain.com/api/stripe-webhook`

Subscribe these events:

- `checkout.session.completed`
- `checkout.session.async_payment_succeeded`
- `checkout.session.async_payment_failed`
- `checkout.session.expired`

Copy the resulting webhook signing secret into `STRIPE_WEBHOOK_SECRET`.

## Notification Emails

This project can send internal waitlist notifications to `bradleyjr@vmocion.com`.

Set:

- `RESEND_API_KEY`
- `RESEND_FROM_EMAIL`
- `NOTIFICATION_EMAIL_TO`

The current implementation uses Resend. For production, `RESEND_FROM_EMAIL` should be a verified sender on your domain.

## Vercel

Deploy the repo to Vercel as a standard static site with Serverless Functions.
`vercel.json` already includes the security headers and the `/waitlist` rewrite.
