# Smart Farmer Procurement Platform

A full-stack web application designed to help farmers manage procurement-centre visits through digital registration, slot booking, token generation, queue tracking, procurement status, payment-status monitoring, and notifications.

The main goal of the platform is to reduce unnecessary waiting at procurement centres and improve transparency in the procurement process.

---

## Features

### Farmer

- Farmer registration
- Secure login
- OTP verification
- OTP resend
- Farmer profile management
- Find nearby procurement centres
- Google Maps integration
- View procurement-centre details
- View available slots
- Book procurement slots
- Token generation
- Queue status tracking
- Booking status tracking
- Procurement status tracking
- Payment status tracking
- Notifications
- Booking history
- Booking cancellation

### Staff

- Staff login
- Staff dashboard
- View centre bookings
- View daily queue
- Manage queue
- Update procurement status
- Update payment status
- Manage booking and slot operations

### Admin

- Admin dashboard
- Manage farmers
- Manage staff
- Manage procurement centres
- Manage slots
- View bookings
- View queues
- Manage procurement records
- Monitor payment status
- Optional Razorpay TEST checkout demonstration

---

## Technology Stack

### Frontend

- React
- Vite
- JavaScript
- JSX
- React Router
- Google Maps

### Backend

- Node.js
- Express.js
- MongoDB
- Mongoose
- JWT Authentication
- Zod Validation

### External Services

- Twilio - SMS notifications
- Google Maps - Procurement-centre locations
- Razorpay - Optional TEST payment demonstration

---

## Project Architecture

```text
smart-farmer-procurement/
│
├── backend/
│   ├── package.json
│   ├── .env.example
│   └── src/
│
├── database/
│   ├── initReplica.js
│   └── seed.js
│
├── frontend/
│   ├── package.json
│   ├── .env.example
│   ├── index.html
│   ├── vite.config.js
│   ├── public/
│   └── src/
│
├── docs/
│   ├── API.md
│   ├── DATABASE.md
│   └── SETUP.md
│
├── README.md
└── .gitignore

Farmer
   ↓
Register
   ↓
OTP Verification
   ↓
Login
   ↓
Find Procurement Centre
   ↓
View Centre Details
   ↓
Select Date & Slot
   ↓
Book Slot
   ↓
Token Generated
   ↓
Track Queue
   ↓
Procurement
   ↓
Payment Status
   ↓
Notifications / History

User Roles
Farmer

The farmer can register, verify the account, find procurement centres, book slots, receive a token, track the queue and monitor procurement and payment status.

Staff

Staff members manage centre operations, bookings, queues and procurement/payment status.

Admin

Administrators manage users, procurement centres, slots, bookings, queues and administrative operations.

Database

The project uses a local MongoDB database.

The development environment uses a single-node MongoDB replica set named:

rs0

The replica set is required for MongoDB transactions used by the application.

Environment Configuration

Backend environment variables are configured through:

backend/.env

The template is provided in:

backend/.env.example

Frontend environment variables are configured through:

frontend/.env

The template is provided in:

frontend/.env.example

Actual credentials and secrets must never be hardcoded into the source code.

SMS

The application supports a mock SMS mode for development.

SMS_MODE=mock

Twilio can be enabled for testing by configuring:

SMS_MODE=twilio

and providing the required Twilio credentials through the backend environment file.

Google Maps

Google Maps is used to display procurement-centre locations.

The frontend uses:

VITE_GOOGLE_MAPS_API_KEY

The basic centre-map functionality does not require Places, Geocoding or Directions APIs.

Payment Demonstration

The main application feature is procurement payment-status monitoring.

An optional Razorpay TEST checkout demonstration is provided separately.

Razorpay must be used only in TEST mode for development and demonstration.

The Razorpay demonstration must not falsely mark a farmer's procurement payment as paid.

Booking Policy

The platform is designed to prevent duplicate active bookings.

A farmer can have:

One non-cancelled booking per farmer per date

Booking operations use database constraints and transaction-aware logic where required.

Queue Policy

Queue ordering is based on:

Slot Time
    ↓
Booking Time

The system supports one active counter per procurement centre and date.

Notifications

The platform can generate notifications for:

Booking confirmation
Token generation
Queue updates
Procurement updates
Payment updates
Booking cancellation

Notifications can be stored in the application and optionally delivered through SMS.

Security

The application includes:

JWT-based authentication
Role-based authorization
Password hashing
OTP hashing
Request validation
Rate limiting
Centralized error handling
Security headers
Environment-based secrets

Never commit the following file:

.env

The environment template:

.env.example

may be committed.

Development Data

The project includes development seed functionality.

Only fictional/demo data should be used during development and demonstration.

Do not use:

Real farmer information
Real passwords
Production API keys
Production payment credentials
Private personal information
Documentation

Detailed project documentation is available in:

docs/API.md
docs/DATABASE.md
docs/SETUP.md

These documents describe the API, database design and local setup.

Project Purpose

The Smart Farmer Procurement Platform is designed to make procurement-centre visits more organized and transparent by allowing farmers to digitally book slots, receive tokens, monitor queues and track procurement-related information.

The system focuses on reducing waiting time, reducing congestion and improving transparency between farmers and procurement-centre operations.