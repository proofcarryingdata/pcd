import { ApplicationContext } from "../types";
import { logger } from "../util/logger";
import { Metric } from "./types";

const metrics: Metric[] = [];

export function startMetrics(context: ApplicationContext) {
  logger("[INIT] Starting metrics");

  for (const metric of metrics) {
    metric(context);
  }
}
