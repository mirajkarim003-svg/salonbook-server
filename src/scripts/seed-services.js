// Usage:  npm run seed:services
// Adds sample services so the website is not empty. Safe to run again (skips existing names).
// The images are sample photos - replace them later from the Admin dashboard.
import "dotenv/config";
import { connectDB, collections } from "../config/db.js";

const img = (id) => `https://images.unsplash.com/${id}?auto=format&fit=crop&w=800&q=80`;

const samples = [
  ["Signature Haircut", "Haircut & Styling", "A consultation, wash, precision cut and blow-dry tailored to your face shape and daily routine.", 35, 45, img("photo-1560066984-138dadb4c035")],
  ["Bridal Hair Styling", "Haircut & Styling", "Elegant updos and soft waves for your big day, including a trial-style consultation before styling.", 90, 90, img("photo-1522337360788-8b13dee7a37e")],
  ["Full Color & Gloss", "Hair Coloring", "Single-process color with a shine-boosting gloss. Great for covering greys or refreshing your shade.", 85, 120, img("photo-1562322140-8baeececf3df")],
  ["Balayage Highlights", "Hair Coloring", "Hand-painted highlights for a natural, sun-kissed look that grows out softly.", 140, 180, img("photo-1560869713-7d0a29430803")],
  ["Deep Conditioning Treatment", "Hair Treatment", "A nourishing mask and scalp massage that restores softness to dry or damaged hair.", 40, 40, img("photo-1595476108010-b4d1f102b1b1")],
  ["Keratin Smoothing", "Hair Treatment", "Long-lasting smoothing treatment that reduces frizz and makes styling much easier.", 150, 150, img("photo-1580618672591-eb180b1a973f")],
  ["Hydrating Facial", "Facial & Skincare", "Deep cleanse, gentle exfoliation and a hydrating mask to leave your skin fresh and glowing.", 60, 60, img("photo-1570172619644-dfd03ed5d881")],
  ["Anti-Aging Facial", "Facial & Skincare", "Targeted serums and facial massage designed to smooth fine lines and improve skin tone.", 85, 75, img("photo-1596755389378-c31d21fd1273")],
  ["Evening Makeup", "Makeup", "Full-glam makeup application for parties, photoshoots and special evenings.", 55, 60, img("photo-1487412947147-5cebf100ffc2")],
  ["Classic Manicure", "Manicure & Pedicure", "Nail shaping, cuticle care, hand massage and polish in your favorite color.", 25, 35, img("photo-1604654894610-df63bc536371")],
  ["Spa Pedicure", "Manicure & Pedicure", "A relaxing foot soak, scrub, massage and polish to keep your feet soft and healthy.", 40, 50, img("photo-1519014816548-bf5fe059798b")],
  ["Relaxing Full Body Massage", "Spa & Massage", "A calming full-body massage with warm oil to melt away stress and muscle tension.", 95, 60, img("photo-1544161515-4ab6ce6db874")],
];

const db = await connectDB();
const { services } = collections(db);
let added = 0;
for (const [serviceName, category, description, price, duration, image] of samples) {
  const exists = await services.findOne({ serviceName });
  if (exists) continue;
  await services.insertOne({ serviceName, category, description, price, duration, image, status: "active", createdAt: new Date() });
  added++;
}
console.log(`Done! Added ${added} sample services.`);
process.exit(0);
