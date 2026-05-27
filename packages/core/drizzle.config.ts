import type { Config } from "drizzle-kit";

const url = process.env.TENT_DATABASE_URL;
if (!url) {
  throw new Error("TENT_DATABASE_URL is required to run drizzle-kit. Source /etc/tent/env first.");
}

export default {
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url },
  strict: true,
  verbose: true,
} satisfies Config;
