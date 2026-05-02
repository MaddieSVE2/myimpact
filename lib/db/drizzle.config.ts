import { defineConfig } from "drizzle-kit";
import path from "path";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL, ensure the database is provisioned");
}

export default defineConfig({
  schema: path.join(__dirname, "./src/schema/index.ts"),
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
  // Hide our homemade SQL-migration tracking table from drizzle. Without
  // this, drizzle sees `_migrations` as a foreign table and offers it as a
  // potential rename source for every new schema table, blocking the post-
  // merge script on an interactive prompt that never gets answered.
  tablesFilter: ["!_migrations"],
});
