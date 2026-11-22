import { Router } from "express";
import { connectDB, collections } from "../config/db.js";
import { verifyJWT, requireRole } from "../middleware/auth.js";
import { TIME_SLOTS } from "../config/constants.js";
import { asyncHandler, HttpError, toObjectId } from "../utils/helpers.js";

const router = Router();
router.use(verifyJWT); // every appointment route needs a signed-in user

// Adds service + customer info to appointments (used by lists and details)
const withDetails = [
  { $lookup: { from: "services", localField: "serviceId", foreignField: "_id", as: "service" } },
  { $lookup: { from: "users", localField: "customerId", foreignField: "_id", as: "customer" } },
  { $unwind: { path: "$service", preserveNullAndEmptyArrays: true } },
  { $unwind: { path: "$customer", preserveNullAndEmptyArrays: true } },
  {
    $project: {
      serviceId: 1, customerId: 1, appointmentDate: 1, timeSlot: 1, message: 1,
      servicePrice: 1, paymentStatus: 1, status: 1, createdAt: 1,
      "service._id": 1, "service.serviceName": 1, "service.image": 1, "service.category": 1, "service.duration": 1,
      "customer._id": 1, "customer.name": 1, "customer.email": 1, "customer.image": 1, "customer.phone": 1,
    },
  },
  { $sort: { createdAt: -1 } },
];

// ---------- helper routes (must be above "/:id") ----------

// GET /api/appointments/booked-slots?date=YYYY-MM-DD
// Which slots are already taken on that date (pending or confirmed)
router.get(
  "/booked-slots",
  asyncHandler(async (req, res) => {
    const date = String(req.query.date || "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new HttpError(400, "Date must look like YYYY-MM-DD.");
    const db = await connectDB();
    const booked = await collections(db)
      .appointments.find({ appointmentDate: date, status: { $in: ["pending", "confirmed"] } })
      .project({ timeSlot: 1 })
      .toArray();
    res.json({ timeSlots: TIME_SLOTS, bookedSlots: booked.map((b) => b.timeSlot) });
  })
);

// GET /api/appointments/my  (customer)
router.get(
  "/my",
  requireRole("customer"),
  asyncHandler(async (req, res) => {
    const db = await connectDB();
    const list = await collections(db)
      .appointments.aggregate([{ $match: { customerId: req.user._id } }, ...withDetails])
      .toArray();
    res.json(list);
  })
);

// GET /api/appointments  (admin: all appointments)
router.get(
  "/",
  requireRole("admin"),
  asyncHandler(async (req, res) => {
    const db = await connectDB();
    const match = {};
    if (["pending", "confirmed", "cancelled"].includes(req.query.status)) match.status = req.query.status;
    const list = await collections(db)
      .appointments.aggregate([{ $match: match }, ...withDetails])
      .toArray();
    res.json(list);
  })
);

// ---------- create ----------

// POST /api/appointments  (customer only)
router.post(
  "/",
  requireRole("customer"),
  asyncHandler(async (req, res) => {
    const serviceId = toObjectId(req.body.serviceId);
    if (!serviceId) throw new HttpError(400, "Invalid service ID.");

    const appointmentDate = String(req.body.appointmentDate || "");
    const timeSlot = String(req.body.timeSlot || "");
    const message = String(req.body.message || "").trim().slice(0, 500);

    if (!/^\d{4}-\d{2}-\d{2}$/.test(appointmentDate) || Number.isNaN(Date.parse(appointmentDate))) {
      throw new HttpError(400, "Please choose a valid appointment date.");
    }
    // Reject past dates (we allow "yesterday" in UTC so time zones never cause a false error)
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    if (appointmentDate < yesterday) throw new HttpError(400, "Appointment date cannot be in the past.");
    if (!TIME_SLOTS.includes(timeSlot)) throw new HttpError(400, "Please choose a valid time slot.");

    const db = await connectDB();
    const { services, appointments } = collections(db);

    const service = await services.findOne({ _id: serviceId });
    if (!service) throw new HttpError(404, "Service not found.");
    if (service.status !== "active") throw new HttpError(400, "This service is inactive and cannot be booked.");

    // Prevent double booking: same date + time slot with a pending/confirmed appointment
    const conflict = await appointments.findOne({
      appointmentDate,
      timeSlot,
      status: { $in: ["pending", "confirmed"] },
    });
    if (conflict) {
      throw new HttpError(409, "This time slot is already booked. Please choose another time.");
    }

    const doc = {
      serviceId,
      customerId: req.user._id,
      appointmentDate,
      timeSlot,
      message,
      servicePrice: service.price, // price is saved at booking time
      paymentStatus: "unpaid",
      status: "pending",
      createdAt: new Date(),
    };
    const result = await appointments.insertOne(doc);
    res.status(201).json({ message: "Appointment request sent! The salon will confirm it soon.", _id: result.insertedId });
  })
);

// ---------- single appointment ----------

// GET /api/appointments/:id  (owner or admin)
router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const _id = toObjectId(req.params.id);
    if (!_id) throw new HttpError(400, "Invalid appointment ID.");
    const db = await connectDB();
    const [appointment] = await collections(db)
      .appointments.aggregate([{ $match: { _id } }, ...withDetails])
      .toArray();
    if (!appointment) throw new HttpError(404, "Appointment not found.");
    const isOwner = String(appointment.customerId) === String(req.user._id);
    if (!isOwner && req.user.role !== "admin") throw new HttpError(403, "You can only view your own appointments.");
    res.json(appointment);
  })
);

// PATCH /api/appointments/:id/cancel
// customer: own PENDING only.   admin: PENDING or CONFIRMED.
router.patch(
  "/:id/cancel",
  asyncHandler(async (req, res) => {
    const _id = toObjectId(req.params.id);
    if (!_id) throw new HttpError(400, "Invalid appointment ID.");
    const db = await connectDB();
    const { appointments } = collections(db);

    const appointment = await appointments.findOne({ _id });
    if (!appointment) throw new HttpError(404, "Appointment not found.");

    if (req.user.role === "customer") {
      if (String(appointment.customerId) !== String(req.user._id)) {
        throw new HttpError(403, "You can only cancel your own appointments.");
      }
      if (appointment.status !== "pending") {
        throw new HttpError(400, "Only pending appointment requests can be cancelled.");
      }
    } else if (req.user.role === "admin") {
      if (!["pending", "confirmed"].includes(appointment.status)) {
        throw new HttpError(400, "Only pending or confirmed appointments can be cancelled.");
      }
    } else {
      throw new HttpError(403, "Forbidden.");
    }

    await appointments.updateOne({ _id }, { $set: { status: "cancelled", cancelledAt: new Date() } });
    res.json({ message: "Appointment cancelled." });
  })
);

// PATCH /api/appointments/:id/confirm  (admin, pending only)
router.patch(
  "/:id/confirm",
  requireRole("admin"),
  asyncHandler(async (req, res) => {
    const _id = toObjectId(req.params.id);
    if (!_id) throw new HttpError(400, "Invalid appointment ID.");
    const db = await connectDB();
    const { appointments } = collections(db);

    const appointment = await appointments.findOne({ _id });
    if (!appointment) throw new HttpError(404, "Appointment not found.");
    if (appointment.status !== "pending") throw new HttpError(400, "Only pending appointments can be confirmed.");

    await appointments.updateOne({ _id }, { $set: { status: "confirmed", confirmedAt: new Date() } });
    res.json({ message: "Appointment confirmed." });
  })
);

export default router;
