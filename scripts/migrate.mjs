import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";
const db = new DatabaseSync("prisma/demo.db");
db.exec("CREATE TABLE IF NOT EXISTS _local_migrations (name TEXT PRIMARY KEY)");
for (const file of readdirSync("prisma/migrations")
  .filter((x) => x.endsWith(".sql"))
  .sort()) {
  if (db.prepare("SELECT name FROM _local_migrations WHERE name = ?").get(file))
    continue;
  db.exec("BEGIN");
  try {
    db.exec(readFileSync("prisma/migrations/" + file, "utf8"));
    db.prepare("INSERT INTO _local_migrations VALUES (?)").run(file);
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}
db.close();
