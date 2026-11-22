import { Router } from "express";
import { connectDB, collections } from "../config/db.js";
import { verifyJWT, requireRole } from "../middleware/auth.js";
import { asyncHandler } from "../utils/helpers.js";

const router = Router();
router.use(verifyJWT);

// Adds customer / appointment / service info to transactions
const withDetails = [
  { $lookup: { from: "users", localField: "customerId", foreignField: "_id", as: "customer" } },
  { $lookup: { from: "appointments", localField: "appointmentId", foreignField: "_id", as: "appointment" } },
  { $unwind: { path: "$customer", preserveNullAndEmptyArrays: true } },
  { $unwind: { path: "$appointment", preserveNullAndEmptyArrays: true } },
  { $lookup: { from: "services", localField: "appointment.serviceId", foreignField: "_id", as: "service" } },
  { $unwind: { path: "$service", preserveNullAndEmptyArrays: true } },
  {
    $project: {
      amount: 1, currency: 1, stripeSessionId: 1, status: 1, createdAt: 1, appointmentId: 1,
      "customer.name": 1, "customer.email": 1,
      "service.serviceName": 1,
      "appointment.appointmentDate": 1, "appointment.timeSlot": 1,
    },
  },
  { $sort: { createdAt: -1 } },
];

// GET /api/transactions  (admin: all payments - read only, there is no edit route on purpose)
router.get(
  "/",
  requireRole("admin"),
  asyncHandler(async (req, res) => {
    const db = await connectDB();
    const list = await collections(db).transactions.aggregate(withDetails).toArray();
    res.json(list);
  })
);

// GET /api/transactions/my  (customer: own payment history)
router.get(
  "/my",
  requireRole("customer"),
  asyncHandler(async (req, res) => {
    const db = await connectDB();
    const list = await collections(db)
      .transactions.aggregate([{ $match: { customerId: req.user._id } }, ...withDetails])
      .toArray();
    res.json(list);
  })
);

export default router;
