# Windows Setup

## 1. Requirements
Install Node.js 22+ and MongoDB Server. `mongosh` is also required for replica-set initialization. MongoDB Compass is optional and useful for viewing data, but it is not a replacement for the MongoDB Server.

## 2. Start MongoDB as a replica set
Start the MongoDB server with replica set `rs0` and then initialize it with `mongosh`. The exact service/start command depends on your MongoDB Windows installation.

Example shell initialization:
```javascript
rs.initiate({ _id: "rs0", members: [{ _id: 0, host: "127.0.0.1:27017" }] })
```
Confirm with `rs.status()`.

## 3. Backend environment
Copy `backend/.env.example` to `backend/.env`. Generate two different strong secrets for `JWT_SECRET` and `OTP_HASH_SECRET`. Keep actual Twilio/Razorpay credentials only in `.env`.

Default safe settings:
- `SMS_MODE=mock`
- `PAYMENT_MODE=monitoring`

For Twilio trial testing, set `SMS_MODE=twilio` and provide a valid Twilio Account SID, Auth Token, and E.164 sender number. Use a permitted consenting test recipient.

For Razorpay demo testing, use only `rzp_test_...` credentials and set `PAYMENT_MODE=razorpay_test`. Webhooks are not used by this MVP.

## 4. Frontend environment
Copy `frontend/.env.example` to `frontend/.env` and set the backend API URL and, if maps are desired, `VITE_GOOGLE_MAPS_API_KEY`.

## 5. Install and run
From `backend`:
```powershell
npm install
npm run db:init
npm run seed
npm run dev
```
From `frontend` in another terminal:
```powershell
npm install
npm run dev
```

Open the Vite URL shown by the frontend (normally `http://localhost:5173`).

## 6. Demo mode
Mock SMS prints OTP messages in the backend terminal. Seed data uses fictional demo records. Do not use fictional seed phone numbers with real Twilio delivery.

## 7. Security
Never commit `backend/.env` or `frontend/.env`. `.env.example` files contain placeholders only. Do not use live Razorpay keys in this project.


