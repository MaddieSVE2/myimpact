import { vi } from "vitest";

/**
 * Stateful in-memory fake of the bits of `@workspace/db` that
 * `aiUsage.ts` and `aiSpendAlert.ts` actually touch.
 *
 * Tests push canned responses onto `dbState.selectResults` (one entry per
 * `db.select(...).from(...).where(...)` call, in order). `db.execute(sql)`
 * calls are recorded into `dbState.executes` so tests can assert which
 * upserts ran. `dbState.alertState` controls what
 * `db.query.aiAlertStateTable.findFirst` returns.
 */
export const dbState = {
  selectResults: [] as unknown[][],
  executes: [] as { chunks: unknown[]; values: unknown[] }[],
  alertState: null as { key: string; lastSentAt: Date } | null,
};

export function resetDbState(): void {
  dbState.selectResults.length = 0;
  dbState.executes.length = 0;
  dbState.alertState = null;
}

function flattenSql(sql: { queryChunks?: unknown[] }): { chunks: unknown[]; values: unknown[] } {
  const chunks: unknown[] = [];
  const values: unknown[] = [];
  for (const c of sql.queryChunks ?? []) {
    if (typeof c === "string" || typeof c === "number" || typeof c === "boolean" || typeof c === "bigint") {
      chunks.push(typeof c === "string" ? c : "?");
      values.push(c);
    } else if (c && typeof c === "object") {
      // StringChunk has `.value` as string[]; primitive params (strings)
      // are inlined as raw strings (handled above). Numeric and boolean
      // params are wrapped as boxed primitives (Number/Boolean instances)
      // whose `.valueOf()` returns the underlying value.
      const cc = c as { value?: unknown; valueOf?: () => unknown };
      if (Array.isArray(cc.value)) {
        chunks.push(cc.value.join(""));
      } else if (c instanceof Number || c instanceof Boolean) {
        chunks.push("?");
        values.push(c.valueOf());
      } else if (cc.value !== undefined) {
        chunks.push("?");
        values.push(cc.value);
      } else {
        chunks.push("?");
        values.push(undefined);
      }
    }
  }
  return { chunks, values };
}

function makeWhereBuilder(data: unknown[]) {
  // Awaitable AND chainable to .groupBy() — both resolve to the same data.
  const builder = {
    then(resolve: (v: unknown[]) => unknown, reject?: (e: unknown) => unknown) {
      return Promise.resolve(data).then(resolve, reject);
    },
    catch(reject: (e: unknown) => unknown) {
      return Promise.resolve(data).catch(reject);
    },
    finally(cb: () => void) {
      return Promise.resolve(data).finally(cb);
    },
    groupBy() {
      return Promise.resolve(data);
    },
  };
  return builder;
}

function shiftResult(): unknown[] {
  return dbState.selectResults.shift() ?? [];
}

const select = vi.fn((_cols?: unknown) => ({
  from: (_table: unknown) => ({
    where: (..._args: unknown[]) => makeWhereBuilder(shiftResult()),
  }),
}));

const execute = vi.fn(async (sqlObj: { queryChunks?: unknown[] }) => {
  dbState.executes.push(flattenSql(sqlObj));
  return { rows: [] };
});

const findFirst = vi.fn(async (_opts?: unknown) => dbState.alertState);

export const db = {
  select,
  execute,
  query: {
    aiAlertStateTable: { findFirst },
  },
};

export const aiUsageTable = { _: "ai_usage" } as unknown;
export const aiAlertStateTable = { _: "ai_alert_state" } as unknown;

export const dbMocks = { select, execute, findFirst };
