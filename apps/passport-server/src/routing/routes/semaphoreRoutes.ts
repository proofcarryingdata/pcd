import express, { Request, Response } from "express";
import { semaphoreService } from "../../services/semaphore";
import { ApplicationContext } from "../../types";
import { decodeString } from "../../util/util";

export function initSemaphoreRoutes(
  app: express.Application,
  context: ApplicationContext
) {
  app.get(
    "/semaphore/valid-historic/:id/:root",
    async (req: Request, res: Response) => {
      const id = decodeString(req.params.id, "id");
      const root = decodeString(req.params.root, "root");

      const historicGroupValid =
        await semaphoreService.getHistoricSemaphoreGroupValid(id, root);

      res.json({
        valid: historicGroupValid,
      });
    }
  );

  app.get(
    "/semaphore/historic/:id/:root",
    async (req: Request, res: Response) => {
      const id = decodeString(req.params.id, "id");
      const root = decodeString(req.params.root, "root");

      const historicGroup = await semaphoreService.getHistoricSemaphoreGroup(
        id,
        root
      );

      if (historicGroup === undefined) {
        res.status(404);
        res.send("not found");
        return;
      }

      res.json(JSON.parse(historicGroup.serializedGroup));
    }
  );

  app.get("/semaphore/latest-root/:id", async (req: Request, res: Response) => {
    const id = decodeString(req.params.id, "id");

    const latestGroups = await semaphoreService.getLatestSemaphoreGroups();
    const matchingGroup = latestGroups.find((g) => g.groupId.toString() === id);

    if (matchingGroup === undefined) {
      res.status(404).send("not found");
      return;
    }

    res.json(matchingGroup.rootHash);
  });
}
