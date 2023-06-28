import { ParticipantRole, ZuParticipant } from "@pcd/passport-interface";
import { Response } from "express";
import next from "next";
import { PretixParticipant } from "../database/models";
import { fetchCommitment } from "../database/queries/fetchCommitment";
import {
  fetchAllPretixParticipants,
  fetchPretixParticipant,
} from "../database/queries/pretix_users/fetchPretixParticipant";
import { insertPretixParticipant } from "../database/queries/pretix_users/insertParticipant";
import { insertCommitment } from "../database/queries/saveCommitment";
import { ApplicationContext } from "../types";
import { logger } from "../util/logger";
import { EmailService } from "./emailService";
import { EmailTokenService } from "./emailTokenService";
import { SemaphoreService } from "./semaphoreService";
import { RollbarService } from "./types";

/**
 * Responsible for high-level user-facing functionality like logging in.
 */
export class UserService {
  private context: ApplicationContext;
  private semaphoreService: SemaphoreService;
  private emailTokenService: EmailTokenService;
  private emailService: EmailService;
  private rollbarService: RollbarService;
  private _bypassEmail: boolean;

  public get bypassEmail() {
    return this._bypassEmail;
  }

  public constructor(
    context: ApplicationContext,
    semaphoreService: SemaphoreService,
    emailTokenService: EmailTokenService,
    emailService: EmailService,
    rollbarService: RollbarService
  ) {
    this.context = context;
    this.semaphoreService = semaphoreService;
    this.emailTokenService = emailTokenService;
    this.emailService = emailService;
    this.rollbarService = rollbarService;
    this._bypassEmail =
      process.env.BYPASS_EMAIL_REGISTRATION === "true" &&
      process.env.NODE_ENV !== "production";
  }

  public async getZuzaluPassportHolder(
    email: string
  ): Promise<PretixParticipant | null> {
    return fetchPretixParticipant(this.context.dbPool, email);
  }

  public async getZuzaluTicketHolders(): Promise<
    Array<PretixParticipant & { commitment?: string }>
  > {
    return fetchAllPretixParticipants(this.context.dbPool);
  }

  public async handleSendZuzaluEmail(
    email: string,
    commitment: string,
    force: boolean,
    response: Response
  ) {
    logger(
      `[ZUID] send-login-email ${JSON.stringify({ email, commitment, force })}`
    );

    const { dbPool } = this.context;

    const token = await this.emailTokenService.saveNewTokenForEmail(email);

    if (this._bypassEmail) {
      await insertPretixParticipant(dbPool, {
        email: email,
        name: "Test User",
        order_id: "",
        residence: "atlantis",
        role: ParticipantRole.Resident,
        visitor_date_ranges: undefined,
      });
    }

    const participant = await fetchPretixParticipant(dbPool, email);

    if (participant == null) {
      throw new Error(`${email} doesn't have a ticket.`);
    } else if (
      participant.commitment != null &&
      participant.commitment !== commitment &&
      !force
    ) {
      throw new Error(`${email} already registered.`);
    }
    const stat = participant.commitment == null ? "NEW" : "EXISTING";
    logger(
      `Saved login token for ${stat} email=${email} commitment=${commitment}`
    );

    // Send an email with the login token.
    if (this._bypassEmail) {
      logger("[DEV] Bypassing email, returning token");

      response.json({ token });
    } else {
      const { name } = participant;
      logger(`[ZUID] Sending token=${token} to email=${email} name=${name}`);
      await this.emailService.sendPretixEmail(email, name, token);

      response.sendStatus(200);
    }
  }

  public async handleNewZuzaluParticipant(
    emailToken: string,
    email: string,
    commitment: string,
    res: Response
  ) {
    const { dbPool } = this.context;
    logger(
      `[ZUID] new-participant ${JSON.stringify({
        emailToken,
        email,
        commitment,
      })}`
    );

    try {
      const pretix = await fetchPretixParticipant(dbPool, email);

      if (pretix == null) {
        throw new Error(`Ticket for ${email} not found`);
      } else if (
        !(await this.emailTokenService.checkTokenCorrect(email, emailToken))
      ) {
        throw new Error(
          `Wrong token. If you got more than one email, use the latest one.`
        );
      } else if (pretix.email !== email) {
        throw new Error(`Email mismatch.`);
      }

      // Save commitment to DB.
      logger(`[ZUID] Saving new commitment: ${commitment}`);
      const uuid = await insertCommitment(dbPool, {
        email,
        commitment,
      });

      // Reload Merkle trees
      await this.semaphoreService.reload();
      const participant = this.semaphoreService.getParticipant(uuid);
      if (participant == null) {
        throw new Error(`${uuid} not found`);
      } else if (participant.commitment !== commitment) {
        throw new Error(`Commitment mismatch`);
      }

      // Return participant, including UUID, back to Passport
      const zuParticipant = participant as ZuParticipant;
      const jsonP = JSON.stringify(zuParticipant);
      logger(`[ZUID] Added new Zuzalu participant: ${jsonP}`);

      res.json(zuParticipant);
    } catch (e: any) {
      e.message = "Can't add Zuzalu Passport: " + e.message;
      next(e);
    }
  }

  public async handleGetZuzaluParticipant(uuid: string, res: Response) {
    logger(`[ZUID] Fetching participant ${uuid}`);
    const participant = this.semaphoreService.getParticipant(uuid);
    if (!participant) res.status(404);
    res.json(participant || null);
  }

  public async handleSendPcdPassEmail(
    email: string,
    commitment: string,
    force: boolean,
    res: Response
  ) {
    logger(
      `[ZUID] send-login-email ${JSON.stringify({ email, commitment, force })}`
    );

    const devBypassEmail =
      process.env.BYPASS_EMAIL_REGISTRATION === "true" &&
      process.env.NODE_ENV !== "production";

    const token = await this.emailTokenService.saveNewTokenForEmail(email);

    const existingCommitment = await fetchCommitment(
      this.context.dbPool,
      email
    );

    if (existingCommitment != null && !force) {
      throw new Error(`${email} already registered.`);
    }

    logger(
      `Saved login token for ${
        existingCommitment === null ? "NEW" : "EXISTING"
      } email=${email} commitment=${commitment}`
    );

    // Send an email with the login token.
    if (devBypassEmail) {
      logger("[DEV] Bypassing email, returning token");
      res.json({ token });
    } else {
      logger(`[ZUID] Sending token=${token} to email=${email}`);
      await this.emailService.sendPCDPassEmail(email, token);
      res.sendStatus(200);
    }
  }

  public async handleNewPcdPassUser(
    token: string,
    email: string,
    commitment: string,
    res: Response
  ) {
    logger(
      `[ZUID] new-participant ${JSON.stringify({
        token,
        email,
        commitment,
      })}`
    );

    try {
      if (!(await this.emailTokenService.checkTokenCorrect(email, token))) {
        throw new Error(
          `Wrong token. If you got more than one email, use the latest one.`
        );
      }

      // Save commitment to DB.
      logger(`[ZUID] Saving new commitment: ${commitment}`);
      await insertCommitment(this.context.dbPool, { email, commitment });

      // Reload Merkle trees
      await this.semaphoreService.reload();

      // Return participant, including UUID, back to Passport
      const zuParticipant = await fetchCommitment(this.context.dbPool, email);
      const jsonP = JSON.stringify(zuParticipant);
      logger(`[ZUID] Added new Zuzalu participant: ${jsonP}`);

      res.json(zuParticipant);
    } catch (e: any) {
      e.message = "Can't add Zuzalu Passport: " + e.message;
      next(e);
    }
  }

  public async handleGetPcdPassUser(uuid: string, res: Response) {
    logger(`[ZUID] Fetching participant ${uuid}`);
    res.setHeader("Access-Control-Allow-Origin", "*");
    const participant = this.semaphoreService.getParticipant(uuid);
    if (!participant) res.status(404);
    res.json(participant || null);
  }
}

export function startUserService(
  context: ApplicationContext,
  semaphoreService: SemaphoreService,
  emailTokenService: EmailTokenService,
  emailService: EmailService,
  rollbarService: RollbarService
): UserService {
  const userService = new UserService(
    context,
    semaphoreService,
    emailTokenService,
    emailService,
    rollbarService
  );
  return userService;
}
