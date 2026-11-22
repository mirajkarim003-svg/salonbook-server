import { Router } from "express";
import Stripe from "stripe";
import { connectDB, collections } from "../config/db.js";
import { verifyJWT, requireRole } from "../middleware/auth.js";
import { CURRENCY } from "../config/constants.js";
import { asyncHandler, HttpError, toObjectId } from "../utils/helpers.js";

const router = Router();
router.use(verifyJWT, requireRole("customer"));

function getStripe() {
  if (!process.env.STRIPE_SECRET_KEY) throw new HttpError(500, "Stripe is not configured on the server.");
  return new Stripe(process.env.STRIPE_SECRET_KEY);
}

// POST /api/payments/checkout   body: { appointmentId }
// Creates a Stripe Checkout page and returns its URL.
// IMPORTANT: this does NOT mark anything as paid. Only the webhook does that.
router.post(
  "/checkout",
  asyncHandler(async (req, res) => {
    const _id = toObjectId(req.body.appointmentId);
    if (!_id) throw new HttpError(400, "Invalid appointment ID.");

    const db = await connectDB();
    const { appointments, services } = collections(db);
    const appointment = await appointments.findOne({ _id });
    if (!appointment) throw new HttpError(404, "Appointment not found.");
    if (String(appointment.customerId) !== String(req.user._id)) {
      throw new HttpError(403, "You can only pay for your own appointments.");
    }
    if (appointment.status !== "confirmed") {
      throw new HttpError(400, "You can only pay for confirmed appointments.");
    }
    if (appointment.paymentStatus === "paid") throw new HttpError(400, "This appointment is already paid.");

    const service = await services.findOne({ _id: appointment.serviceId });
    const clientUrl = (process.env.CLIENT_URL || "http://localhost:3000").split(",")[0].trim().replace(/\/$/, "");

    const session = await getStripe().checkout.sessions.create({
      mode: "payment",
      customer_email: req.user.email,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: CURRENCY,
            unit_amount: Math.round(appointment.servicePrice * 100), // Stripe uses cents
            product_data: {
              name: service?.serviceName || "Salon appointment",
              description: `${appointment.appointmentDate} at ${appointment.timeSlot}`,
            },
          },
        },
      ],
      // The webhook reads these to know which appointment was paid
      metadata: { appointmentId: String(appointment._id), customerId: String(req.user._id) },
      success_url: `${clientUrl}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${clientUrl}/payment/cancel`,
    });

    res.json({ url: session.url });
  })
);

// GET /api/payments/session/:sessionId
// The success page asks "did the webhook save my payment yet?"
router.get(
  "/session/:sessionId",
  asyncHandler(async (req, res) => {
    const db = await connectDB();
    const { transactions, appointments, services } = collections(db);
    const transaction = await transactions.findOne({
      stripeSessionId: req.params.sessionId,
      customerId: req.user._id,
    });
    if (!transaction) return res.json({ confirmed: false }); // webhook has not arrived yet

    const appointment = await appointments.findOne({ _id: transaction.appointmentId });
    const service = appointment ? await services.findOne({ _id: appointment.serviceId }) : null;
    res.json({
      confirmed: transaction.status === "paid",
      status: transaction.status,
      amount: transaction.amount,
      currency: transaction.currency,
      serviceName: service?.serviceName,
      appointmentDate: appointment?.appointmentDate,
      timeSlot: appointment?.timeSlot,
    });
  })
);

export default router;
