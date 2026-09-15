# Database

MongoDB database: `farmer_procurement` by default. Local development uses a single-node replica set named `rs0` so MongoDB transactions are available.

## Collections / models
- `users` — farmer/staff/admin accounts, role, verification, centre assignment.
- `procurementCentres` — centre details and GeoJSON coordinates.
- `slots` — centre/date/time/capacity schedules.
- `bookings` — farmer reservations.
- `tokens` — unique token per booking.
- `queues` — queue state for a booking/token.
- `procurements` — operational procurement record.
- `payments` — procurement payment-status monitoring.
- `notifications` — persistent in-app/SMS delivery records.
- `otpVerifications` — short-lived OTP challenges.

## Important constraints
- Unique active booking per farmer/date using a partial unique index.
- Unique slot for centre/date/start/end.
- One active queue counter per centre/date using a partial unique index.
- Unique booking/token relationships.
- Centre coordinates use a `2dsphere` index for nearby discovery.

## Transactions
Booking, queue, and other centre-affecting operations use MongoDB transactions and a centre-operation version update to serialize competing operations. External SMS/Razorpay calls are kept outside business transactions.

## Statuses
Queue: Waiting, Called, Serving, Completed, Skipped, Cancelled.
Procurement: Booked, Waiting, Under Verification, Procurement Completed.
Payment: Pending, Processing, Completed, Failed.
