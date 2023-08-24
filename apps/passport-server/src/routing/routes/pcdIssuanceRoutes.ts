import {
  CheckInRequest,
  CheckTicketRequest,
  IssuedPCDsRequest
} from "@pcd/passport-interface";
import express, { Request, Response } from "express";
import { ApplicationContext, GlobalServices } from "../../types";
import { logger } from "../../util/logger";

export function initPCDIssuanceRoutes(
  app: express.Application,
  _context: ApplicationContext,
  { rollbarService, issuanceService }: GlobalServices
): void {
  logger("[INIT] initializing PCD issuance routes");

  app.get("/issue/enabled", async (req: Request, res: Response) => {
    res.json(issuanceService != null);
  });

  app.get("/issue/rsa-public-key", async (req: Request, res: Response) => {
    try {
      if (!issuanceService) {
        throw new Error("issuance service not instantiated");
      }
      res.send(issuanceService.getRSAPublicKey());
    } catch (e) {
      rollbarService?.reportError(e);
      logger(e);
      res.sendStatus(500);
    }
  });

  app.get("/issue/eddsa-public-key", async (req: Request, res: Response) => {
    try {
      if (!issuanceService) {
        throw new Error("issuance service not instantiated");
      }
      res.send(await issuanceService.getEdDSAPublicKey());
    } catch (e) {
      rollbarService?.reportError(e);
      logger(e);
      res.sendStatus(500);
    }
  });

  app.post("/issue/", async (req: Request, res: Response) => {
    try {
      if (!issuanceService) {
        throw new Error("issuance service not instantiated");
      }

      const request = req.body as IssuedPCDsRequest;
      const response = await issuanceService.handleIssueRequest(request);
      res.status(200).json(response);
    } catch (e) {
      rollbarService?.reportError(e);
      logger(e);
      res.sendStatus(500);
    }
  });

  app.post("/issue/check-ticket", async (req: Request, res: Response) => {
    try {
      if (!issuanceService) {
        throw new Error("issuance service not instantiated");
      }

      const request = req.body as CheckTicketRequest;
      const response = await issuanceService.handleCheckTicketRequest(request);
      res.status(200).json(response);
    } catch (e) {
      rollbarService?.reportError(e);
      logger(e);
      res.sendStatus(500);
    }
  });

  app.post("/issue/check-in", async (req: Request, res: Response) => {
    try {
      if (!issuanceService) {
        throw new Error("issuance service not instantiated");
      }

      const request = req.body as CheckInRequest;
      const response = await issuanceService.handleCheckInRequest(request);
      res.status(200).json(response);
    } catch (e) {
      rollbarService?.reportError(e);
      logger(e);
      res.sendStatus(500);
    }
  });
}
