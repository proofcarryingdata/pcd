import { EDdSAPublicKey, getEdDSAPublicKey } from "@pcd/eddsa-pcd";
import {
  EdDSATicketPCD,
  EdDSATicketPCDPackage,
  ITicketData,
  getEdDSATicketData
} from "@pcd/eddsa-ticket-pcd";
import { getHash } from "@pcd/passport-crypto";
import {
  CheckInRequest,
  CheckInResponse,
  CheckTicketRequest,
  CheckTicketResponse,
  ISSUANCE_STRING,
  IssuedPCDsRequest,
  IssuedPCDsResponse
} from "@pcd/passport-interface";
import { ArgumentTypeName, SerializedPCD } from "@pcd/pcd-types";
import {
  SemaphoreSignaturePCD,
  SemaphoreSignaturePCDPackage
} from "@pcd/semaphore-signature-pcd";
import _ from "lodash";
import NodeRSA from "node-rsa";
import { CommitmentRow } from "../database/models";
import { fetchCommitmentByPublicCommitment } from "../database/queries/commitments";
import {
  fetchDevconnectPretixTicketByTicketId,
  fetchDevconnectPretixTicketsByEmail,
  fetchDevconnectSuperusersForEmail
} from "../database/queries/devconnect_pretix_tickets/fetchDevconnectPretixTicket";
import { consumeDevconnectPretixTicket } from "../database/queries/devconnect_pretix_tickets/updateDevconnectPretixTicket";
import { ApplicationContext } from "../types";
import { logger } from "../util/logger";

export class IssuanceService {
  private readonly context: ApplicationContext;

  private readonly eddsaPrivateKey: string;
  private readonly rsaPrivateKey: NodeRSA;
  private readonly exportedRSAPrivateKey: string;
  private readonly exportedRSAPublicKey: string;

  public constructor(
    context: ApplicationContext,
    rsaPrivateKey: NodeRSA,
    eddsaPrivateKey: string
  ) {
    this.context = context;
    this.rsaPrivateKey = rsaPrivateKey;
    this.exportedRSAPrivateKey = this.rsaPrivateKey.exportKey("private");
    this.exportedRSAPublicKey = this.rsaPrivateKey.exportKey("public");
    this.eddsaPrivateKey = eddsaPrivateKey;
  }

  public getRSAPublicKey(): string {
    return this.exportedRSAPublicKey;
  }

  public getEdDSAPublicKey(): EDdSAPublicKey {
    return getEdDSAPublicKey(this.eddsaPrivateKey);
  }

  public async handleIssueRequest(
    request: IssuedPCDsRequest
  ): Promise<IssuedPCDsResponse> {
    const pcds = await this.issueDevconnectPretixTicketPCDs(request);
    const serialized = await Promise.all(
      pcds.map((pcd) => EdDSATicketPCDPackage.serialize(pcd))
    );

    return { pcds: serialized, folder: "Devconnect" };
  }

  public async handleCheckInRequest(
    request: CheckInRequest
  ): Promise<CheckInResponse> {
    try {
      const ticketPCD = await EdDSATicketPCDPackage.deserialize(
        request.ticket.pcd
      );

      const ticketValid = await this.checkTicket(ticketPCD);

      if (!ticketValid.success) {
        return ticketValid;
      }

      const ticketData = getEdDSATicketData(ticketPCD);

      if (!ticketData) {
        return {
          success: false,
          error: { name: "InvalidTicket" }
        };
      }

      const checker = await this.checkUserExists(request.checkerProof);

      if (!checker) {
        return {
          success: false,
          error: { name: "NotSuperuser" }
        };
      }

      const checkerSuperUserPermissions =
        await fetchDevconnectSuperusersForEmail(
          this.context.dbPool,
          checker.email
        );

      const relevantSuperUserPermission = checkerSuperUserPermissions.find(
        (perm) => perm.pretix_events_config_id === ticketData.eventId
      );

      if (!relevantSuperUserPermission) {
        return { success: false, error: { name: "NotSuperuser" } };
      }

      const successfullyConsumed = await consumeDevconnectPretixTicket(
        this.context.dbPool,
        ticketData.ticketId ?? "",
        checker.email
      );

      if (successfullyConsumed) {
        return {
          success: true
        };
      }

      return {
        success: false,
        error: { name: "ServerError" }
      };
    } catch (e) {
      logger("Error when consuming devconnect ticket", { error: e });
      throw new Error("failed to check in", { cause: e });
    }
  }

  public async handleCheckTicketRequest(
    request: CheckTicketRequest
  ): Promise<CheckTicketResponse> {
    try {
      const ticketPCD = await EdDSATicketPCDPackage.deserialize(
        request.ticket.pcd
      );
      return this.checkTicket(ticketPCD);
    } catch (e) {
      return {
        success: false,
        error: { name: "ServerError" }
      };
    }
  }

  public async checkTicket(
    ticketPCD: EdDSATicketPCD
  ): Promise<CheckTicketResponse> {
    try {
      const proofPublicKey = ticketPCD.proof.eddsaPCD.claim.publicKey;
      if (!proofPublicKey) {
        return {
          success: false,
          error: { name: "InvalidSignature" }
        };
      }

      const serverPublicKey = await this.getEdDSAPublicKey();
      if (!_.isEqual(serverPublicKey, proofPublicKey)) {
        return {
          success: false,
          error: { name: "InvalidSignature" }
        };
      }

      const ticket = getEdDSATicketData(ticketPCD);

      if (!ticket || !ticket.ticketId) {
        return {
          success: false,
          error: { name: "InvalidTicket" }
        };
      }

      const ticketInDb = await fetchDevconnectPretixTicketByTicketId(
        this.context.dbPool,
        ticket.ticketId
      );

      if (!ticketInDb) {
        return {
          success: false,
          error: { name: "InvalidTicket" }
        };
      }

      if (ticketInDb.is_deleted) {
        return {
          success: false,
          error: { name: "TicketRevoked", revokedTimestamp: Date.now() }
        };
      }

      if (ticketInDb.is_consumed) {
        return {
          success: false,
          error: {
            name: "AlreadyCheckedIn",
            checker: ticketInDb.checker ?? undefined,
            checkinTimestamp: (
              ticketInDb.pcdpass_checkin_timestamp ?? new Date()
            ).toISOString()
          }
        };
      }

      return { success: true };
    } catch (e) {
      logger("Error when checking ticket", { error: e });

      return {
        success: false,
        error: { name: "ServerError" }
      };
    }
  }

  private async checkUserExists(
    proof: SerializedPCD<SemaphoreSignaturePCD>
  ): Promise<CommitmentRow | null> {
    const deserializedSignature =
      await SemaphoreSignaturePCDPackage.deserialize(proof.pcd);
    const isValid = await SemaphoreSignaturePCDPackage.verify(
      deserializedSignature
    );
    if (!isValid) {
      logger(
        `can't issue PCDs for ${deserializedSignature.claim.identityCommitment} because ` +
          `the requester's PCD didn't verify`
      );
      return null;
    }

    if (deserializedSignature.claim.signedMessage !== ISSUANCE_STRING) {
      logger(`can't issue PCDs, wrong message signed by user`);
      return null;
    }

    const requestingFor = deserializedSignature.claim.identityCommitment;
    const storedCommitment = await fetchCommitmentByPublicCommitment(
      this.context.dbPool,
      requestingFor
    );

    if (storedCommitment == null) {
      logger(
        `can't issue PCDs for ${deserializedSignature.claim.identityCommitment} because ` +
          `we don't have a user with that commitment in the database`
      );
      return null;
    }

    return storedCommitment;
  }

  private async ticketDataToTicketPCD(
    ticketData: ITicketData
  ): Promise<EdDSATicketPCD> {
    const stableId = await getHash("issued-ticket-" + ticketData.ticketId);

    const ticketPCD = await EdDSATicketPCDPackage.prove({
      ticket: {
        value: ticketData,
        argumentType: ArgumentTypeName.Object
      },
      privateKey: {
        value: this.eddsaPrivateKey,
        argumentType: ArgumentTypeName.String
      },
      id: {
        value: stableId,
        argumentType: ArgumentTypeName.String
      }
    });

    return ticketPCD;
  }

  /**
   * Fetch all DevconnectPretixTicket entities under a given user's email.
   */
  private async issueDevconnectPretixTicketPCDs(
    request: IssuedPCDsRequest
  ): Promise<EdDSATicketPCD[]> {
    const commitment = await this.checkUserExists(request.userProof);
    const email = commitment?.email;

    if (commitment == null || email == null) {
      return [];
    }

    const ticketsDB = await fetchDevconnectPretixTicketsByEmail(
      this.context.dbPool,
      email
    );

    const tickets = await Promise.all(
      ticketsDB
        // convert to ITicketData
        .map(
          (t) =>
            ({
              // unsigned fields
              attendeeName: t.full_name,
              attendeeEmail: t.email,
              eventName: t.event_name,
              ticketName: t.item_name,
              checkerEmail: t.checker ?? undefined,

              // signed fields
              ticketId: t.id,
              eventId: t.pretix_events_config_id,
              productId: t.devconnect_pretix_items_info_id,
              timestampConsumed:
                t.pcdpass_checkin_timestamp == null
                  ? 0
                  : new Date(t.pcdpass_checkin_timestamp).getTime(),
              timestampSigned: Date.now(),
              attendeeSemaphoreId: commitment.commitment,
              isConsumed: t.is_consumed,
              isRevoked: t.is_deleted
            }) satisfies ITicketData
        )
        // convert to serialized ticket PCD
        .map((ticketData) => this.ticketDataToTicketPCD(ticketData))
    );

    return tickets;
  }
}

export function startIssuanceService(
  context: ApplicationContext
): IssuanceService | null {
  if (context.isZuzalu) {
    logger("[INIT] not starting issuance service for zuzalu");
    return null;
  }

  const rsaKey = loadRSAPrivateKey();
  const eddsaKey = loadEdDSAPrivateKey();

  if (rsaKey == null || eddsaKey == null) {
    logger("[INIT] can't start issuance service, missing private key");
    return null;
  }

  const issuanceService = new IssuanceService(context, rsaKey, eddsaKey);
  return issuanceService;
}

function loadRSAPrivateKey(): NodeRSA | null {
  const pkeyEnv = process.env.SERVER_RSA_PRIVATE_KEY_BASE64;

  if (pkeyEnv == null) {
    logger("[INIT] missing environment variable SERVER_RSA_PRIVATE_KEY_BASE64");
    return null;
  }

  try {
    const key = new NodeRSA(
      Buffer.from(pkeyEnv, "base64").toString("utf-8"),
      "private"
    );
    return key;
  } catch (e) {
    logger("failed to parse RSA private key", e);
  }

  return null;
}

function loadEdDSAPrivateKey(): string | null {
  const pkeyEnv = process.env.SERVER_EDDSA_PRIVATE_KEY;

  if (pkeyEnv == null) {
    logger("[INIT] missing environment variable SERVER_EDDSA_PRIVATE_KEY");
    return null;
  }

  return pkeyEnv;
}
