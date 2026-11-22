import { Router } from "express";
import { connectDB, collections } from "../config/db.js";
import { verifyJWT, requireRole } from "../middleware/auth.js";
import { CATEGORIES } from "../config/constants.js";
import { asyncHandler, HttpError, toObjectId, escapeRegex } from "../utils/helpers.js";

const router = Router();

// ---------- validation shared by "add" and "update" ----------
function validateServiceBody(body) {
  const serviceName = String(body.serviceName || "").trim();
  const category = String(body.category || "").trim();
  const description = String(body.description || "").trim();
  const price = Number(body.price);
  const duration = Number(body.duration);
  const image = String(body.image || "").trim();
  const status = body.status === "inactive" ? "inactive" : "active";

  if (serviceName.length < 3) throw new HttpError(400, "Service name must be at least 3 characters.");
  if (!CATEGORIES.includes(category)) throw new HttpError(400, "Please choose a valid category.");
  if (description.length < 10) throw new HttpError(400, "Description must be at least 10 characters.");
  if (!Number.isFinite(price) || price <= 0) throw new HttpError(400, "Price must be a positive number.");
  if (!Number.isFinite(duration) || duration <= 0) throw new HttpError(400, "Duration must be a positive number.");
  if (!image) throw new HttpError(400, "Please upload a service image.");

  return { serviceName, category, description, price, duration, image, status };
}

// ---------- PUBLIC ----------

// GET /api/services?search=&category=&sort=price_asc|price_desc|newest&limit=
// Only ACTIVE services are returned.
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const db = await connectDB();
    const { services } = collections(db);

    const filter = { status: "active" };
    if (req.query.search) {
      filter.serviceName = { $regex: escapeRegex(String(req.query.search).trim()), $options: "i" };
    }
    if (req.query.category) filter.category = String(req.query.category);

    const sortMap = {
      price_asc: { price: 1 },
      price_desc: { price: -1 },
      newest: { createdAt: -1 },
    };
    const sort = sortMap[req.query.sort] || sortMap.newest;
    const limit = Math.min(parseInt(req.query.limit, 10) || 100, 100);

    const list = await services.find(filter).sort(sort).limit(limit).toArray();
    res.json(list);
  })
);

// GET /api/services/categories  -> every category with how many active services it has
router.get(
  "/categories",
  asyncHandler(async (req, res) => {
    const db = await connectDB();
    const { services } = collections(db);
    const counts = await services
      .aggregate([{ $match: { status: "active" } }, { $group: { _id: "$category", count: { $sum: 1 } } }])
      .toArray();
    const countMap = Object.fromEntries(counts.map((c) => [c._id, c.count]));
    res.json(CATEGORIES.map((name) => ({ name, count: countMap[name] || 0 })));
  })
);

// ---------- ADMIN ----------

// GET /api/services/manage/all  -> every service (active + inactive)
router.get(
  "/manage/all",
  verifyJWT,
  requireRole("admin"),
  asyncHandler(async (req, res) => {
    const db = await connectDB();
    const list = await collections(db).services.find().sort({ createdAt: -1 }).toArray();
    res.json(list);
  })
);

// ---------- PROTECTED (any signed-in user) ----------

// GET /api/services/:id
router.get(
  "/:id",
  verifyJWT,
  asyncHandler(async (req, res) => {
    const _id = toObjectId(req.params.id);
    if (!_id) throw new HttpError(400, "Invalid service ID.");
    const db = await connectDB();
    const service = await collections(db).services.findOne({ _id });
    if (!service) throw new HttpError(404, "Service not found.");
    // Customers cannot see inactive services (admins can, to edit them)
    if (service.status !== "active" && req.user.role !== "admin") {
      throw new HttpError(404, "This service is not available right now.");
    }
    res.json(service);
  })
);

// POST /api/services
router.post(
  "/",
  verifyJWT,
  requireRole("admin"),
  asyncHandler(async (req, res) => {
    const data = validateServiceBody(req.body);
    const db = await connectDB();
    const result = await collections(db).services.insertOne({ ...data, createdAt: new Date() });
    res.status(201).json({ message: "Service added successfully.", _id: result.insertedId });
  })
);

// PUT /api/services/:id
router.put(
  "/:id",
  verifyJWT,
  requireRole("admin"),
  asyncHandler(async (req, res) => {
    const _id = toObjectId(req.params.id);
    if (!_id) throw new HttpError(400, "Invalid service ID.");
    const data = validateServiceBody(req.body);
    const db = await connectDB();
    const result = await collections(db).services.updateOne({ _id }, { $set: { ...data, updatedAt: new Date() } });
    if (result.matchedCount === 0) throw new HttpError(404, "Service not found.");
    res.json({ message: "Service updated successfully." });
  })
);

// PATCH /api/services/:id/status   body: { status: "active" | "inactive" }
router.patch(
  "/:id/status",
  verifyJWT,
  requireRole("admin"),
  asyncHandler(async (req, res) => {
    const _id = toObjectId(req.params.id);
    if (!_id) throw new HttpError(400, "Invalid service ID.");
    const status = req.body.status;
    if (!["active", "inactive"].includes(status)) throw new HttpError(400, "Status must be active or inactive.");
    const db = await connectDB();
    const result = await collections(db).services.updateOne({ _id }, { $set: { status } });
    if (result.matchedCount === 0) throw new HttpError(404, "Service not found.");
    res.json({ message: `Service is now ${status}.` });
  })
);

// DELETE /api/services/:id
router.delete(
  "/:id",
  verifyJWT,
  requireRole("admin"),
  asyncHandler(async (req, res) => {
    const _id = toObjectId(req.params.id);
    if (!_id) throw new HttpError(400, "Invalid service ID.");
    const db = await connectDB();
    const { services, appointments } = collections(db);

    // Do not delete a service that still has live appointments
    const live = await appointments.countDocuments({ serviceId: _id, status: { $in: ["pending", "confirmed"] } });
    if (live > 0) {
      throw new HttpError(409, "This service has pending/confirmed appointments. Deactivate it instead of deleting.");
    }
    const result = await services.deleteOne({ _id });
    if (result.deletedCount === 0) throw new HttpError(404, "Service not found.");
    res.json({ message: "Service deleted successfully." });
  })
);

export default router;
