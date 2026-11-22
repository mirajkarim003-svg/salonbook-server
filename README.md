# SalonBook - Server (Express API)

REST API for **SalonBook**, a salon appointment booking platform. It handles services, appointments, users, payments (Stripe) and role-based security (JWT).

> The frontend lives in the separate **client** repository.

## Important Features
- JWT verification middleware (tokens are issued by Better Auth in the client and verified here with the public keys from `<AUTH_URL>/api/auth/jwks`)
- Server-side role checks (`admin` / `customer`) on every protected route - roles are always read from MongoDB, never trusted from the browser
- Blocked users are rejected on every protected request
- Services CRUD (admin), public search / category filter / price sorting (active services only)
- Appointments: create, view own, cancel own pending, admin confirm / cancel, double-booking protection
- Stripe Checkout + **verified webhook** - payment status becomes `paid` only after Stripe's signed event
- Transactions saved from the webhook only (read-only for admin)
- Dashboard statistics for customer and admin
- Profile update that can only change name, image and phone

## Technology Stack
Node.js, Express.js, MongoDB (official driver), jose (JWT verification), Stripe, CORS, dotenv

## Installation
```bash
cd server
npm install
cp .env.example .env     # then fill in the values (see below)
```

## How to Run Locally
```bash
npm run dev        # development (auto restart)  ->  http://localhost:5000
npm start          # normal start
```
Useful scripts:
```bash
npm run seed:services                      # add sample services
npm run make-admin -- your-email@mail.com  # turn a signed-up user into an admin
```
For the Stripe webhook locally, install the Stripe CLI and run:
```bash
stripe listen --forward-to localhost:5000/api/webhooks/stripe
```
Copy the `whsec_...` value it prints into `STRIPE_WEBHOOK_SECRET`.

## Required Environment Variables (names only)
| Name | Meaning |
|------|---------|
| `PORT` | Local port (default 5000) |
| `MONGODB_URI` | MongoDB Atlas connection string |
| `DB_NAME` | Database name (must match the client) |
| `CLIENT_URL` | Frontend URL(s) allowed by CORS (comma separated) |
| `AUTH_URL` | Frontend URL where Better Auth runs (used to download JWT public keys) |
| `STRIPE_SECRET_KEY` | Stripe secret key (test mode while developing) |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing secret |

Never commit the real `.env` file.

## API Overview
| Method | Route | Who |
|--------|-------|-----|
| GET | `/api/services`, `/api/services/categories` | Public |
| GET | `/api/services/:id` | Signed-in |
| GET/POST/PUT/PATCH/DELETE | `/api/services/manage/all`, `/api/services`, `/api/services/:id`, `/:id/status` | Admin |
| POST | `/api/appointments` | Customer |
| GET | `/api/appointments/my`, `/api/appointments/booked-slots` | Customer / signed-in |
| PATCH | `/api/appointments/:id/cancel` | Customer (own pending) / Admin |
| GET, PATCH | `/api/appointments`, `/api/appointments/:id/confirm` | Admin |
| GET, PATCH | `/api/users/me` | Signed-in |
| GET, PATCH | `/api/users`, `/api/users/:id`, `/:id/block`, `/:id/unblock` | Admin |
| POST | `/api/payments/checkout` | Customer |
| GET | `/api/payments/session/:sessionId` | Customer |
| POST | `/api/webhooks/stripe` | Stripe only (signature verified) |
| GET | `/api/transactions`, `/api/transactions/my` | Admin / Customer |
| GET | `/api/stats/admin`, `/api/stats/customer` | Admin / Customer |

## Booking rule
A time slot (date + time) can only have **one** pending or confirmed appointment. If it is taken, other customers get a clear "slot already booked" message.

## Links
- Live Website: _add your live link here_
- Live API: _add your server link here_
- Client Repository: _add your client GitHub link here_
- Server Repository: _add your server GitHub link here_
