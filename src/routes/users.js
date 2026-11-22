import { Router } from "express";
import { connectDB, collections } from "../config/db.js";
import { verifyJWT, requireRole } from "../middleware/auth.js";
import { asyncHandler, HttpError, findUserById, safeUser, escapeRegex } from "../utils/helpers.js";

const router = Router();
router.use(verifyJWT);

// GET /api/users/me
router.get("/me", (req, res) => res.json(safeUser(req.user)));

// PATCH /api/users/me
// Only name, image and phone can be changed. role / isBlocked / email are ignored on purpose.
router.patch(
  "/me",
  asyncHandler(async (req, res) => {
    const updates = {};

    if (req.body.name !== undefined) {
      const name = String(req.body.name).trim();
      if (name.length < 2) throw new HttpError(400, "Name must be at least 2 characters.");
      updates.name = name;
    }
    if (req.body.image !== undefined) {
      const image = String(req.body.image).trim();
      if (image && !/^https?:\/\//i.test(image)) throw new HttpError(400, "Image must be a valid http(s) URL.");
      updates.image = image;
    }
    if (req.body.phone !== undefined) {
      const phone = String(req.body.phone).trim();
      if (phone && !/^[0-9+\-\s()]{6,20}$/.test(phone)) throw new HttpError(400, "Please enter a valid phone number.");
      updates.phone = phone;
    }
    if (Object.keys(updates).length === 0) throw new HttpError(400, "Nothing to update.");

    updates.updatedAt = new Date();
    const db = await connectDB();
    const { users } = collections(db);
    // The id comes from the verified token (req.user), NOT from the request body,
    // so nobody can update another person's profile.
    await users.updateOne({ _id: req.user._id }, { $set: updates });
    const fresh = await users.findOne({ _id: req.user._id });
    res.json({ message: "Profile updated successfully.", user: safeUser(fresh) });
  })
);

// ---------- ADMIN ----------

// GET /api/users  -> all registered customers
router.get(
  "/",
  requireRole("admin"),
  asyncHandler(async (req, res) => {
    const db = await connectDB();
    const filter = { role: "customer" };
    if (req.query.search) {
      const rx = { $regex: escapeRegex(String(req.query.search).trim()), $options: "i" };
      filter.$or = [{ name: rx }, { email: rx }];
    }
    const list = await collections(db).users.find(filter).sort({ createdAt: -1 }).toArray();
    res.json(list.map(safeUser));
  })
);

// GET /api/users/:id  -> user details + their appointment numbers
router.get(
  "/:id",
  requireRole("admin"),
  asyncHandler(async (req, res) => {
    const db = await connectDB();
    const { users, appointments } = collections(db);
    const user = await findUserById(users, req.params.id);
    if (!user) throw new HttpError(404, "User not found.");
    const [total, paid] = await Promise.all([
      appointments.countDocuments({ customerId: user._id }),
      appointments.countDocuments({ customerId: user._id, paymentStatus: "paid" }),
    ]);
    res.json({ ...safeUser(user), totalAppointments: total, paidAppointments: paid });
  })
);

async function setBlocked(req, res, blocked) {
  const db = await connectDB();
  const { users } = collections(db);
  const user = await findUserById(users, req.params.id);
  if (!user) throw new HttpError(404, "User not found.");
  if (user.role === "admin") throw new HttpError(400, "Admin accounts cannot be blocked.");
  await users.updateOne({ _id: user._id }, { $set: { isBlocked: blocked } });
  res.json({ message: blocked ? "User blocked." : "User unblocked." });
}

router.patch("/:id/block", requireRole("admin"), asyncHandler((req, res) => setBlocked(req, res, true)));
router.patch("/:id/unblock", requireRole("admin"), asyncHandler((req, res) => setBlocked(req, res, false)));

export default router;
