import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Neon severs idle connections after ~5 minutes. Setting idleTimeoutMillis
  // to 30 s means the pool proactively closes idle clients before Neon cuts
  // them, preventing "Connection terminated unexpectedly" on the next query.
  idleTimeoutMillis: 30_000,
  // Limit pool size — Neon's free tier has a low concurrent-connection cap.
  max: 10,
});

// Absorb connection-level errors (e.g. Neon cutting an idle socket) so they
// don't become unhandled rejections that crash the process or Sentry noise.
pool.on("error", (err) => {
  console.error("[db] idle client error — connection will be discarded:", err.message);
});

export const db = drizzle(pool, { schema });

export * from "./schema";
