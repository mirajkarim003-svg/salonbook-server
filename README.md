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

## Booking rule
A time slot (date + time) can only have **one** pending or confirmed appointment. If it is taken, other customers get a clear "slot already booked" message.

## Links
-Live Website: https://salonbook-client-lilac.vercel.app
-Client Repository: https://github.com/mirajkarim003-svg/salonbook-client
-Server Repository: https://github.com/mirajkarim003-svg/salonbook-server
-Admin email / password for evaluators: Admin credentials: provided in the submission form.
