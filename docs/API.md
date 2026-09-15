# API Reference

Base URL: `http://localhost:5000/api` (unless configured otherwise). Responses use `{ success, message, data }`.

## Public authentication
- `GET /health` — health/database status.
- `POST /auth/register` — create farmer account and issue registration OTP.
- `POST /auth/login` — verify credentials and issue login OTP challenge.
- `POST /auth/verify-otp` — consume OTP and return JWT access token.
- `POST /auth/resend-otp` — issue a replacement OTP.

## Authenticated
- `POST /auth/logout` — invalidate current JWT version.
- `GET /config` — public-to-authenticated-client runtime configuration.
- `GET /users/profile`, `PUT /users/profile` — profile.

## Centres
- `GET /centres`, `GET /centres/nearby`, `GET /centres/:id`, `GET /centres/:centreId/slots`
- `POST /centres`, `PUT /centres/:id`, `DELETE /centres/:id` — admin only.

## Slots
- `GET /slots` — authenticated discovery.
- `POST /slots`, `PUT /slots/:id`, `DELETE /slots/:id` — admin only.

## Bookings and tokens
- `POST /bookings` — farmer only.
- `GET /bookings`, `GET /bookings/:id` — authenticated, scoped by role.
- `PUT /bookings/:id` — farmer/admin.
- `DELETE /bookings/:id` — authenticated with record access checks.
- `GET /tokens/my-token` — farmer.
- `GET /tokens/:id` — authenticated with record access checks.

## Queue
- `GET /queue/status`, `GET /queue/:centreId` — authenticated.
- `POST /queue/next`, `PUT /queue/:id/status` — staff/admin.

## Procurement and payment monitoring
- `GET /procurements`, `GET /procurements/:id` — authenticated/scoped.
- `PUT /procurements/:id/status` — staff/admin.
- `GET /payments`, `GET /payments/:id` — authenticated/scoped.
- `PUT /payments/:id/status` — staff/admin.

### Razorpay TEST demonstration
- `GET /payments/:id/test-orders` — admin only.
- `POST /payments/:id/test-orders` — admin only and payment rate limited.
- `POST /payments/:id/verify-test-payment` — admin only and payment rate limited.
This demonstration does not mark procurement payment records as paid.

## Notifications
- `GET /notifications`, `PUT /notifications/:id/read` — authenticated user.
- `POST /notifications/send-sms` — staff/admin and SMS rate limited.

## Admin
- `GET /admin/dashboard`, `GET /admin/stats`
- `GET /admin/farmers`, `PUT /admin/farmers/:id`
- `GET /admin/bookings`, `GET /admin/procurements`, `GET /admin/payments`

Validation is performed by Zod schemas; malformed IDs are rejected before controllers. Authentication uses Bearer JWTs with issuer/audience and database-backed `authVersion`.


