import { createRemoteJWKSet, jwtVerify } from "jose";
import { connectDB, collections } from "../config/db.js";
import { findUserById, HttpError } from "../utils/helpers.js";

// The Next.js client (Better Auth) publishes its public keys here.
// jose downloads + caches them, then checks every token's signature.
let jwks;
function getJWKS() {
  if (!jwks) {
    const base = (process.env.AUTH_URL || "").replace(/\/$/, "");
    if (!base) throw new Error("AUTH_URL is missing in the server .env file.");
    jwks = createRemoteJWKSet(new URL(`${base}/api/auth/jwks`));
  }
  return jwks;
}

// 1) Checks the JWT   2) loads the user from MongoDB   3) blocks "blocked" users
// After this, routes can use  req.user  (always fresh data from the database).
export async function verifyJWT(req, res, next) {
  try {
    const header = req.headers.authorization || "";
    if (!header.startsWith("Bearer ")) {
      throw new HttpError(401, "Unauthorized: please sign in first.");
    }
    const token = header.slice(7);

    let payload;
    try {
      const result = await jwtVerify(token, getJWKS());
      payload = result.payload;
    } catch (err) {
      console.error("JWT verify failed:", err.code || err.message);
      throw new HttpError(401, "Your session is invalid or expired. Please sign in again.");
    }

    const db = await connectDB();
    const user = await findUserById(collections(db).users, payload.sub || payload.id);
    if (!user) throw new HttpError(401, "User not found. Please sign in again.");
    if (user.isBlocked) throw new HttpError(403, "Your account has been blocked. Contact the salon.");

    req.user = user; // role always comes from the database, never from the client
    next();
  } catch (err) {
    next(err);
  }
}

// Usage: router.get("/", verifyJWT, requireRole("admin"), handler)
export const requireRole =
  (...roles) =>
  (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return next(new HttpError(403, "Forbidden: you do not have permission to do this."));
    }
    next();
  };
