import { fetchCommitmentsCount } from "../database/queries/commitments";
import { fetchE2EEStorageCount } from "../database/queries/e2ee";
import {
  fetchLoggedInZuzaluUserCount,
  fetchSyncedZuzaluTicketCount,
} from "../database/queries/zuzalu_pretix_tickets/fetchZuzaluUser";
import { ApplicationContext } from "../types";
import { logger } from "../util/logger";
import { RollbarService } from "./rollbarService";
import { traced } from "./telemetryService";

interface Metrics {
  commitmentsCount: number;
  e2eeCount: number;
  loggedInZuzaluUsersCount: number;
  zuzaluTicketsCount: number;
}

export class MetricsService {
  private static readonly COLLECTION_INTERVAL_MS = 1000 * 60;
  private timeout: NodeJS.Timeout | undefined;
  private rollbarService: RollbarService | null;
  private context: ApplicationContext;

  public constructor(
    context: ApplicationContext,
    rollbarService: RollbarService | null
  ) {
    this.context = context;
    this.rollbarService = rollbarService;
  }

  public async start(): Promise<void> {
    await this.collectAndReportMetrics();
    this.timeout = setTimeout(
      () => this.start(),
      MetricsService.COLLECTION_INTERVAL_MS
    );
  }

  public stop(): void {
    if (this.timeout) {
      clearTimeout(this.timeout);
    }
  }

  private async collectAndReportMetrics(): Promise<void> {
    try {
      logger("[METRICS] collecting metrics");
      const metrics = await this.collectMetrics();
      logger("[METRICS] collected metrics", metrics);
      await this.reportMetrics(metrics);
    } catch (e) {
      logger("[METRICS] error", e);
      this.rollbarService?.reportError(e);
    }
  }

  private async collectMetrics(): Promise<Metrics> {
    const db = this.context.dbPool;

    const metrics: Metrics = {
      commitmentsCount: await fetchCommitmentsCount(db),
      e2eeCount: await fetchE2EEStorageCount(db),
      loggedInZuzaluUsersCount: await fetchLoggedInZuzaluUserCount(db),
      zuzaluTicketsCount: await fetchSyncedZuzaluTicketCount(db),
    };

    return metrics;
  }

  private async reportMetrics(metrics: Metrics): Promise<void> {
    traced("Metrics", "reportMetrics", async (span) => {
      if (!span) {
        logger("[METRICS] couldn't report metrics - missing honeycomb client");
        return;
      } else {
        logger("[METRICS] reporting metrics");
      }

      for (const [metricName, metricValue] of Object.entries(metrics)) {
        span.setAttribute(metricName, metricValue);
      }
    });
  }
}

/**
 * Responsible for uploading metrics. Currently unused.
 */
export async function startMetricsService(
  context: ApplicationContext,
  rollbarService: RollbarService | null
): Promise<MetricsService> {
  logger("[INIT] Starting metrics");
  const metricsService = new MetricsService(context, rollbarService);
  metricsService.start();
  return metricsService;
}
