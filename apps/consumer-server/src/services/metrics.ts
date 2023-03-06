import { ApplicationContext } from "../types";
import { Metric } from "./types";

const metrics: Metric[] = [];

export async function startMetrics(context: ApplicationContext) {
  console.log("[INIT] Starting metrics");

  for (const metric of metrics) {
    metric(context);
  }
}
