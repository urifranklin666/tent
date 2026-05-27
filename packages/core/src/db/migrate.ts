import { migrate } from "drizzle-orm/node-postgres/migrator";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { getDb, closeDb } from "./index.js";

async function main() {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const migrationsFolder = path.resolve(here, "../../drizzle");
  console.log(`Running migrations from ${migrationsFolder}…`);
  await migrate(getDb(), { migrationsFolder });
  console.log("Migrations applied.");
  await closeDb();
}

main().catch(async (err) => {
  console.error(err);
  await closeDb();
  process.exit(1);
});
