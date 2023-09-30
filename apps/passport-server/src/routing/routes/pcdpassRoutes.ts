import {
  ConfirmEmailRequest,
  CreateNewUserRequest,
  DeviceLoginRequest,
  SaltResponseValue,
  VerifyTokenRequest,
  VerifyTokenResponseValue
} from "@pcd/passport-interface";
import express, { Request, Response } from "express";
import { ApplicationContext, GlobalServices } from "../../types";
import { logger } from "../../util/logger";
import { normalizeEmail } from "../../util/util";
import { checkBody, checkQueryParam, checkUrlParam } from "../params";
import { PCDHTTPError } from "../pcdHttpError";

export function initPCDpassRoutes(
  app: express.Application,
  _context: ApplicationContext,
  { userService, emailTokenService }: GlobalServices
): void {
  logger("[INIT] initializing PCDpass routes");

  /**
   * Always returns 200 OK.
   */
  app.get("/pcdpass/", (req: Request, res: Response) => {
    res.sendStatus(200);
  });

  /**
   * Gets the password salt for a given email address.
   *
   * Returns an instance of {@link SaltResponseValue} if no errors occurred.
   *
   * This route is not access-controlled in any way.
   *
   * @todo access-control?
   */
  app.get("/pcdpass/salt", async (req: Request, res: Response) => {
    const email = normalizeEmail(checkQueryParam(req, "email"));
    const salt = await userService.getSaltByEmail(email);
    res.send(salt satisfies SaltResponseValue);
  });

  /**
   * Step 1 of account creation on PCDpass.
   *
   * If a user already exists with the given email address, and the `force` option
   * is not set to true, returns a 403 server error with the message
   * "<email address> already registered."
   *
   * If `force` *is* true, then calling this api creates and sends a new token to the
   * given email, which can be used in step 2 (/pcdpass/verify-token) to proceed
   * with account creation.
   *
   * If this is the first time this user is calling this route, then the `force`
   * parameter is not neccessary to set to `true`.
   *
   * In development mode the server can be configured to bypass sending an actual
   * email (check out the .env.local.example file for more details). If that is
   * the case, then this route returns the token directly from this route, so that
   * the client can auto-plug-it-in for the user (or, rather, the developer: me).
   * The token is encoded in an {@link ConfirmEmailResponseValue}.
   *
   * In the case that an email *was* successfully sent, just returns a 200 OK.
   */
  app.post("/pcdpass/send-login-email", async (req: Request, res: Response) => {
    const email = normalizeEmail(
      checkBody<ConfirmEmailRequest, "email">(req, "email")
    );
    const commitment = checkBody<ConfirmEmailRequest, "commitment">(
      req,
      "commitment"
    );
    const force =
      checkBody<ConfirmEmailRequest, "force">(req, "force") === "true";

    await userService.handleSendPCDpassEmail(email, commitment, force, res);
  });

  /**
   * Step 2 of account creation.
   *
   * If the token is valid, returns a 200 OK.
   *
   * If the token is invalid, returns a 403 error.
   */
  app.post("/pcdpass/verify-token", async (req: Request, res: Response) => {
    const token = checkBody<VerifyTokenRequest, "token">(req, "token");
    const email = checkBody<VerifyTokenRequest, "email">(req, "email");

    const tokenCorrect = await emailTokenService.checkTokenCorrect(
      email,
      token
    );

    if (!tokenCorrect) {
      throw new PCDHTTPError(
        403,
        "Wrong token. If you got more than one email, use the latest one."
      );
    }

    const encryptionKey = await userService.getEncryptionKeyForUser(email);

    res.status(200).json({ encryptionKey } satisfies VerifyTokenResponseValue);
  });

  /**
   * Step 3 of account creation.
   *
   * Creates a new PCDpass user. The user must call this route with the token
   * they received in their email. They must also upload the public component
   * of their semaphore identity (via the `commitment` parameter), as well as
   * the `salt` their PCDpass client generated for them, so that they can use
   * it again later on. Finally, they must also include the token they got in
   * their email inbox (or via the `devToken` feature described in the comment
   * of the /pcdpass/send-login-email route).
   *
   * If the token is incorrect, returns a 403 server error.
   *
   * If the token *is* correct, proceeds with user creation.
   *
   * Creating a user overwrites important user data, like their salt and semaphore
   * commitment. In the case a user already existed for this email, this route
   * is effectively an 'account reset' feature.
   *
   * In the successful case, returns a {@link PCDpassUserJson}.
   */
  app.post("/pcdpass/new-participant", async (req: Request, res: Response) => {
    const email = normalizeEmail(
      checkBody<CreateNewUserRequest, "email">(req, "email")
    );
    const { salt, encryptionKey } =
      req.body as CreateNewUserRequest as CreateNewUserRequest;
    const token = checkBody<CreateNewUserRequest, "token">(req, "token");
    const commitment = checkBody<CreateNewUserRequest, "commitment">(
      req,
      "commitment"
    );

    await userService.handleNewPCDpassUser(
      token,
      email,
      commitment,
      salt,
      encryptionKey,
      res
    );
  });

  /**
   * Allows users to login as a particular email without having to go through
   * the email verification flow.
   *
   * Caller must provide a `secret`, which corresponds to the `secret` on a valid
   * ticket stored in pretix for the given email that is a superuser ticket.
   *
   * In the case that no such ticket exists, returns a 403 server error.
   *
   * In the case that a user has already signed in with that email, overwrites
   * their account.
   *
   * If logging in was successful, returns a {@link PCDpassUserJson}, otherwise
   * a 500 server error.
   */
  app.post("/pcdpass/device-login", async (req: Request, res: Response) => {
    const secret = checkBody<DeviceLoginRequest, "secret">(req, "secret");
    const email = normalizeEmail(
      checkBody<DeviceLoginRequest, "email">(req, "email")
    );
    const commitment = checkBody<DeviceLoginRequest, "commitment">(
      req,
      "commitment"
    );

    await userService.handleNewDeviceLogin(secret, email, commitment, res);
  });

  /**
   * Gets a PCDpass user by their uuid.
   * If the service is not ready, returns a 503 server error.
   * If the user does not exist, returns a 404.
   * Otherwise returns the user as a {@link PCDpassUserJson}
   *
   * @todo - should we censor part of this unless you're the given user? eg.
   * should we be returning the `salt` here?
   */
  app.get("/pcdpass/participant/:uuid", async (req: Request, res: Response) => {
    await userService.handleGetPCDpassUser(checkUrlParam(req, "uuid"), res);
  });
}
