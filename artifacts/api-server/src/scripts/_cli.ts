import { pool } from "@workspace/db";

/**
 * Runs a job (src/jobs) from the command line: sets exit code 1 when it
 * fails or throws, then closes the database pool so the process can exit.
 */
export function runCli(name: string, run: (args: string[]) => Promise<boolean>): void {
  run(process.argv.slice(2))
    .then((ok) => {
      if (!ok) process.exitCode = 1;
    })
    .catch((err) => {
      console.error(`[${name}] failed:`, err);
      process.exitCode = 1;
    })
    .finally(() => pool.end().catch(() => {}));
}
