import { QueryResult } from "pg";
import { Pool } from "postgres-pool";
import { traced } from "../services/telemetryService";

/**
 * This function executes a sql query against the database, and traces
 * its performance.
 */
export function sqlQuery(
  client: Pool,
  query: string,
  args?: any[]
): Promise<QueryResult> {
  return traced("DB", "query", async (span) => {
    span?.setAttribute("query", query);
    try {
      return await client.query(query, args);
    } catch (e) {
      span?.setAttribute("error", e + "");
      throw e;
    }
  });
}

export function timestampStringToDate(
  timestamp: Date | string | null
): Date | null {
  if (timestamp === "" || timestamp === null) {
    return null;
  }

  if (typeof timestamp === "string") {
    return new Date(Date.parse(timestamp));
  }

  return new Date(timestamp);
}
