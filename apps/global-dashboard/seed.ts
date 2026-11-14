import { db } from "./lib/db";
import { seedDatabase } from "./lib/datasource";
seedDatabase(db)
  .then(() => console.log("Global Impact deterministic demo seed ready"))
  .finally(() => db.$disconnect());
