import express, { Request, Response } from "express";
import { fetchStatus } from "../../database/queries/fetchStatus";
import { PretixSyncStatus } from "../../services/types";
import { ApplicationContext, GlobalServices } from "../../types";
import { logger } from "../../util/logger";

export function initStatusRoutes(
  app: express.Application,
  { dbPool }: ApplicationContext,
  { semaphoreService, pretixSyncService, rollbarService }: GlobalServices
): void {
  logger("[INIT] initializing status routes");

  app.get("/pretix/status", async (req: Request, res: Response) => {
    try {
      if (pretixSyncService) {
        res.send(
          pretixSyncService.hasCompletedSyncSinceStarting
            ? PretixSyncStatus.Synced
            : PretixSyncStatus.NotSynced
        );
      } else {
        res.send(PretixSyncStatus.NoPretix);
      }
    } catch (e: any) {
      logger(e);
      rollbarService?.error(e);
      res.sendStatus(500);
    }
  });

  app.get("/zuzalu/status", async (req: Request, res: Response) => {
    try {
      res.setHeader("Access-Control-Allow-Origin", "*");
      const db = await fetchStatus(dbPool);
      const db_pool = {
        total: dbPool.totalCount,
        idle: dbPool.idleCount,
        waiting: dbPool.waitingCount,
      };
      const semaphore = {
        n_participants:
          semaphoreService.groupParticipants().group.members.length,
        n_residents: semaphoreService.groupResidents().group.members.length,
        n_visitors: semaphoreService.groupVisitors().group.members.length,
      };
      const time = new Date().toISOString();

      const status = { time, db, db_pool, semaphore };

      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify(status, null, 2));
    } catch (e: any) {
      logger(e);
      rollbarService?.error(e);
      res.sendStatus(500);
    }
  });

  app.get("/pcdpass/status", async (req: Request, res: Response) => {
    try {
      res.setHeader("Access-Control-Allow-Origin", "*");
      const db = await fetchStatus(dbPool);
      const db_pool = {
        total: dbPool.totalCount,
        idle: dbPool.idleCount,
        waiting: dbPool.waitingCount,
      };
      const semaphore = {
        n_participants:
          semaphoreService.groupParticipants().group.members.length,
        n_residents: semaphoreService.groupResidents().group.members.length,
        n_visitors: semaphoreService.groupVisitors().group.members.length,
      };
      const time = new Date().toISOString();

      const status = { time, db, db_pool, semaphore };

      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify(status, null, 2));
    } catch (e: any) {
      logger(e);
      rollbarService?.error(e);
      res.sendStatus(500);
    }
  });
}
