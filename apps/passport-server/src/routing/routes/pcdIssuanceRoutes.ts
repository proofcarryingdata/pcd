import { EdDSAPublicKey } from "@pcd/eddsa-pcd";
import {
  CheckTicketByIdRequest,
  CheckTicketByIdResult,
  CheckTicketInByIdRequest,
  CheckTicketInByIdResult,
  IssuanceEnabledResponseValue,
  KnownTicketTypesResult,
  ListFeedsRequest,
  ListFeedsResponseValue,
  PollFeedRequest,
  PollFeedResponseValue,
  VerifyTicketByIdRequest,
  VerifyTicketByIdResult,
  VerifyTicketRequest,
  VerifyTicketResult
} from "@pcd/passport-interface";
import express, { Request, Response } from "express";
import { IssuanceService } from "../../services/issuanceService";
import { ApplicationContext, GlobalServices } from "../../types";
import { logger } from "../../util/logger";
import { checkUrlParam } from "../params";
import { PCDHTTPError } from "../pcdHttpError";

export function initPCDIssuanceRoutes(
  app: express.Application,
  _context: ApplicationContext,
  { issuanceService }: GlobalServices
): void {
  logger("[INIT] initializing PCD issuance routes");

  /**
   * Throws if we don't have an instance of {@link issuanceService}.
   */
  function checkIssuanceServiceStarted(
    issuanceService: IssuanceService | null
  ): asserts issuanceService {
    if (!issuanceService) {
      throw new PCDHTTPError(503, "issuance service not instantiated");
    }
  }

  /**
   * If either of the {@code process.env.SERVER_RSA_PRIVATE_KEY_BASE64} or
   * {@code process.env.SERVER_EDDSA_PRIVATE_KEY} are not initialized properly,
   * then this server won't have an {@link IssuanceService}. It'll continue
   * to work, except users won't get any 'issued' tickets - Devconnect,
   * Zuconnect, Zuzalu, etc.
   */
  app.get("/issue/enabled", async (req: Request, res: Response) => {
    const result = issuanceService != null;
    res.json(result satisfies IssuanceEnabledResponseValue);
  });

  /**
   * Gets the RSA public key this server is using for its attestations, so that
   * 3rd parties can verify whether users have proper attestations.
   */
  app.get("/issue/rsa-public-key", async (req: Request, res: Response) => {
    checkIssuanceServiceStarted(issuanceService);
    const result = issuanceService.getRSAPublicKey();
    res.send(result satisfies string);
  });

  /**
   * Gets the EdDSA public key this server is using for its attestations, so that
   * 3rd parties can verify whether users have proper attestations.
   */
  app.get("/issue/eddsa-public-key", async (req: Request, res: Response) => {
    checkIssuanceServiceStarted(issuanceService);
    const result = await issuanceService.getEdDSAPublicKey();
    res.send(result satisfies EdDSAPublicKey);
  });

  /**
   * Lets the Zupass client and 3rd parties inspect what feeds are available
   * for polling on this server.
   */
  app.get("/feeds", async (req: Request, res: Response) => {
    checkIssuanceServiceStarted(issuanceService);
    const result = await issuanceService.handleListFeedsRequest(
      req.body as ListFeedsRequest
    );
    res.json(result satisfies ListFeedsResponseValue);
  });

  /**
   * Lets a Zupass client (or even a 3rd-party-developed client get PCDs from a
   * particular feed that this server is hosting.
   */
  app.post("/feeds", async (req, res) => {
    checkIssuanceServiceStarted(issuanceService);
    const result = await issuanceService.handleFeedRequest(
      req.body as PollFeedRequest
    );
    res.json(result satisfies PollFeedResponseValue);
  });

  app.get("/feeds/:feedId", async (req: Request, res: Response) => {
    checkIssuanceServiceStarted(issuanceService);
    const feedId = checkUrlParam(req, "feedId");
    if (!issuanceService.hasFeedWithId(feedId)) {
      throw new PCDHTTPError(404);
    }
    res.json(await issuanceService.handleListSingleFeedRequest({ feedId }));
  });

  app.post("/issue/check-ticket-by-id", async (req: Request, res: Response) => {
    checkIssuanceServiceStarted(issuanceService);
    const result = await issuanceService.handleDevconnectCheckTicketByIdRequest(
      req.body as CheckTicketByIdRequest
    );
    res.json(result satisfies CheckTicketByIdResult);
  });

  /**
   * Works similarly to /issue/check-in, but instead of receiving a PCD
   * it receives a ticket ID and attempts to check in with it.
   */
  app.post("/issue/check-in-by-id", async (req: Request, res: Response) => {
    checkIssuanceServiceStarted(issuanceService);
    const result = await issuanceService.handleDevconnectCheckInByIdRequest(
      req.body as CheckTicketInByIdRequest
    );
    res.json(result satisfies CheckTicketInByIdResult);
  });

  /**
   * For non-Devconnect ticket PCDs, the standard QR code generates a link
   * to a verification screen in passport-client, which calls this endpoint
   * to verify the ticket. Tickets are only verified if they match criteria
   * known to belong to Zuconnect '23 or Zuzalu '23 tickets.
   */
  app.post("/issue/verify-ticket", async (req: Request, res: Response) => {
    checkIssuanceServiceStarted(issuanceService);
    const result = await issuanceService.handleVerifyTicketRequest(
      req.body as VerifyTicketRequest
    );
    return res.json(result satisfies VerifyTicketResult);
  });

  /**
   * As above, but using only the ticket ID.
   */
  app.post(
    "/issue/verify-ticket-by-id",
    async (req: Request, res: Response) => {
      checkIssuanceServiceStarted(issuanceService);
      const result = await issuanceService.handleVerifyTicketByIdRequest(
        req.body as VerifyTicketByIdRequest
      );
      return res.json(result satisfies VerifyTicketByIdResult);
    }
  );

  app.get("/issue/known-ticket-types", async (req: Request, res: Response) => {
    checkIssuanceServiceStarted(issuanceService);
    const result = await issuanceService.handleKnownTicketTypesRequest();
    return res.json(result satisfies KnownTicketTypesResult);
  });
}
