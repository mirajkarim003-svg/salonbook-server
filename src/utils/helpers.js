import { ObjectId } from "mongodb";

// ObjectId.isValid("any12chars") returns true, so we check the format ourselves.
export const isValidId = (id) => typeof id === "string" && /^[a-f\d]{24}$/i.test(id);

export const toObjectId = (id) => (isValidId(id) ? new ObjectId(id) : null);

// Find a user by id. Better Auth normally stores _id as ObjectId,
// but we also try the plain string so this works with either setup.
export async function findUserById(usersCol, id) {
  if (!id) return null;
  const conditions = [{ _id: id }, { id }];
  if (isValidId(String(id))) conditions.push({ _id: new ObjectId(String(id)) });
  return usersCol.findOne({ $or: conditions });
}

// Throw this inside a route to send a clean error response.
export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// Lets us use async/await in routes without try/catch everywhere.
export const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

// Escape user text before using it in a RegExp (for search)
export const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Only keep the fields we expect from the user
export const safeUser = (u) =>
  u && {
    _id: u._id,
    name: u.name,
    email: u.email,
    image: u.image || "",
    phone: u.phone || "",
    role: u.role,
    isBlocked: !!u.isBlocked,
    createdAt: u.createdAt,
  };
