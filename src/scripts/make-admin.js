// Usage:  npm run make-admin -- your-email@example.com
// 1) Sign up on the website with that email first.  2) Run this command.
// This is the secure way to create an admin (public sign up can never create one).
import "dotenv/config";
import { connectDB, collections } from "../config/db.js";

const email = (process.argv[2] || "").trim().toLowerCase();
if (!email) {
  console.error("Please give an email:  npm run make-admin -- your-email@example.com");
  process.exit(1);
}

const db = await connectDB();
const result = await collections(db).users.updateOne({ email }, { $set: { role: "admin", isBlocked: false } });
if (result.matchedCount === 0) {
  console.error(`No user found with email "${email}". Sign up on the website first.`);
  process.exit(1);
}
console.log(`Done! ${email} is now an admin.`);
process.exit(0);
