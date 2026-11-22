import "dotenv/config";
import express from "express";
import cors from "cors";
import { connectDB } from "./src/config/db.js";
import { stripeWebhook } from "./src/routes/webhook.js";
import servicesRoutes from "./src/routes/services.js";
import appointmentsRoutes from "./src/routes/appointments.js";
import usersRoutes from "./src/routes/users.js";
import paymentsRoutes from "./src/routes/payments.js";
import transactionsRoutes from "./src/routes/transactions.js";
import statsRoutes from "./src/routes/stats.js";
import { notFound, errorHandler } from "./src/middleware/errorHandler.js";

const app = express();

// CORS: only your frontend(s) may call this API
const allowedOrigins = (process.env.CLIENT_URL || "http://localhost:3000")
  .split(",")
  .map((o) => o.trim().replace(/\/$/, ""));
app.use(
  cors({
    origin: (origin, callback) => {
      // allow tools like Postman / server-to-server (no origin) and our frontend(s)
      if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
      callback(null, false); // browser will block it (no CORS headers sent)
    },
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

// Stripe webhook needs the RAW body, so it must be registered BEFORE express.json()
app.post("/api/webhooks/stripe", express.raw({ type: "application/json" }), stripeWebhook);

app.use(express.json({ limit: "1mb" }));

app.get("/", (req, res) => res.json({ message: "SalonBook API is running" }));
app.get("/api/health", (req, res) => res.json({ ok: true }));

app.use("/api/services", servicesRoutes);
app.use("/api/appointments", appointmentsRoutes);
app.use("/api/users", usersRoutes);
app.use("/api/payments", paymentsRoutes);
app.use("/api/transactions", transactionsRoutes);
app.use("/api/stats", statsRoutes);

app.use(notFound);
app.use(errorHandler);

// Local development: start the server. On Vercel the exported app is used instead.
if (!process.env.VERCEL) {
  const port = process.env.PORT || 5000;
  app.listen(port, () => {
    console.log(`SalonBook server running on http://localhost:${port}`);
    connectDB()
      .then(() => console.log("MongoDB connected"))
      .catch((err) => console.error("MongoDB connection failed:", err.message));
  });
}

export default app;
