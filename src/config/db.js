import { MongoClient } from "mongodb";
import dns from "node:dns";
dns.setServers(["8.8.8.8", "1.1.1.1"]);

// We keep ONE connection and reuse it (important for Vercel serverless too).
let client;
let db;
let connecting;

export async function connectDB() {
  if (db) return db;
  if (!connecting) {
    connecting = (async () => {
      if (!process.env.MONGODB_URI) {
        throw new Error("MONGODB_URI is missing. Add it to your .env file.");
      }
      client = new MongoClient(process.env.MONGODB_URI);
      await client.connect();
      db = client.db(process.env.DB_NAME || "salonbook");

      // Indexes (safe to run many times)
      await db.collection("transactions").createIndex({ stripeSessionId: 1 }, { unique: true });
      await db.collection("appointments").createIndex({ customerId: 1 });
      await db.collection("appointments").createIndex({ appointmentDate: 1, timeSlot: 1 });
      await db.collection("services").createIndex({ status: 1, category: 1 });
      return db;
    })().catch((err) => {
      connecting = null; // allow retry on the next request
      throw err;
    });
  }
  return connecting;
}

// Small helpers so route files stay short and readable
export const collections = (db) => ({
  users: db.collection("users"), // created by Better Auth (client app)
  services: db.collection("services"),
  appointments: db.collection("appointments"),
  transactions: db.collection("transactions"),
});
