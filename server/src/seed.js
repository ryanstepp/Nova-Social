import { seedData, writeDb } from "./db.js";

await writeDb(await seedData());
console.log("Nova Social demo database seeded.");
