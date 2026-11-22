import Stripe from "stripe";
import { connectDB, collections } from "../config/db.js";
import { toObjectId } from "../utils/helpers.js";

// POST /api/webhooks/stripe
// This is the ONLY place where a payment becomes "paid".
// Stripe signs every request, so nobody can fake it without the webhook secret.
export async function stripeWebhook(req, res) {
  if (!process.env.STRIPE_SECRET_KEY || !process.env.STRIPE_WEBHOOK_SECRET) {
    return res.status(500).send("Stripe keys are not configured.");
  }

  let event;
  try {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    event = stripe.webhooks.constructEvent(
      req.body, // raw body (see index.js)
      req.headers["stripe-signature"],
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error("Webhook signature check failed:", err.message);
    return res.status(400).send("Webhook signature verification failed.");
  }

  try {
    const type = event.type;
    if (type === "checkout.session.completed" || type === "checkout.session.async_payment_succeeded" || type === "checkout.session.async_payment_failed") {
      const session = event.data.object;
      const appointmentId = toObjectId(session.metadata?.appointmentId);
      if (!appointmentId) return res.json({ received: true });

      const db = await connectDB();
      const { appointments, transactions } = collections(db);
      const appointment = await appointments.findOne({ _id: appointmentId });
      if (!appointment) return res.json({ received: true });

      const paid = type !== "checkout.session.async_payment_failed" && session.payment_status === "paid";
      const failed = type === "checkout.session.async_payment_failed";

      if (paid || failed) {
        // upsert = safe even if Stripe sends the same event twice
        await transactions.updateOne(
          { stripeSessionId: session.id },
          {
            $set: { status: paid ? "paid" : "failed" },
            $setOnInsert: {
              appointmentId: appointment._id,
              customerId: appointment.customerId,
              amount: (session.amount_total || 0) / 100,
              currency: session.currency || "usd",
              createdAt: new Date(),
            },
          },
          { upsert: true }
        );
        if (paid) {
          await appointments.updateOne({ _id: appointment._id }, { $set: { paymentStatus: "paid", paidAt: new Date() } });
        }
      }
    }
    res.json({ received: true });
  } catch (err) {
    console.error("Webhook handler error:", err);
    res.status(500).send("Webhook handler failed."); // Stripe will retry
  }
}
