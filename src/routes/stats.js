import { Router } from "express";
import { connectDB, collections } from "../config/db.js";
import { verifyJWT, requireRole } from "../middleware/auth.js";
import { asyncHandler } from "../utils/helpers.js";

const router = Router();
router.use(verifyJWT);

// GET /api/stats/customer
router.get(
  "/customer",
  requireRole("customer"),
  asyncHandler(async (req, res) => {
    const db = await connectDB();
    const { appointments } = collections(db);
    const mine = { customerId: req.user._id };
    const [total, pending, confirmed, cancelled] = await Promise.all([
      appointments.countDocuments(mine),
      appointments.countDocuments({ ...mine, status: "pending" }),
      appointments.countDocuments({ ...mine, status: "confirmed" }),
      appointments.countDocuments({ ...mine, status: "cancelled" }),
    ]);
    res.json({ total, pending, confirmed, cancelled });
  })
);

// GET /api/stats/admin
router.get(
  "/admin",
  requireRole("admin"),
  asyncHandler(async (req, res) => {
    const db = await connectDB();
    const { users, services, appointments, transactions } = collections(db);
    const [customers, activeServices, totalAppointments, pending, confirmed, successfulPayments] = await Promise.all([
      users.countDocuments({ role: "customer" }),
      services.countDocuments({ status: "active" }),
      appointments.countDocuments(),
      appointments.countDocuments({ status: "pending" }),
      appointments.countDocuments({ status: "confirmed" }),
      transactions.countDocuments({ status: "paid" }),
    ]);
    res.json({ customers, activeServices, totalAppointments, pending, confirmed, successfulPayments });
  })
);

export default router;
