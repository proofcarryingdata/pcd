import { EdDSATicketPCD } from "@pcd/eddsa-ticket-pcd";
import { PCDAction } from "@pcd/pcd-collection";
import { ArgsOf, PCDOf, PCDPackage, SerializedPCD } from "@pcd/pcd-types";
import { SemaphoreSignaturePCD } from "@pcd/semaphore-signature-pcd";
import { PendingPCDStatus } from "./PendingPCDUtils";
import { Feed } from "./SubscriptionManager";
import { NamedAPIError } from "./api/apiResult";

/**
 * Ask the server to prove a PCD. The server reponds with a {@link PendingPCD}
 */
export interface ServerProofRequest<T extends PCDPackage = PCDPackage> {
  pcdType: string;
  args: ArgsOf<T>;
}

/**
 * Ask the server for the status of a queued server-side proof.
 */
export interface ProofStatusRequest {
  hash: string;
}

/**
 * The server's response to a {@link ProofStatusRequest}.
 */
export interface ProofStatusResponseValue {
  status: PendingPCDStatus;

  /**
   * If status === COMPLETE, JSON.stringify(SerializedPCD), else undefined
   */
  serializedPCD: string | undefined;

  /**
   * If status === ERROR, error string from server, else undefined;
   */
  error: string | undefined;
}

/**
 * Ask the server what sorts of proofs it's able to instantiate for users.
 */
export interface SupportedPCDsResponseValue {
  names: string[];
}

/**
 * Ask the server to save e2ee a user's PCDs and other metadata.
 */
export interface UploadEncryptedStorageRequest {
  /**
   * On the server-side, encrypted storage is keyed by the hash of
   * the user's encryption key.
   */
  blobKey: string;

  /**
   * An encrypted and stringified version of {@link EncryptedStorage}
   */
  encryptedBlob: string;

  /**
   * Optional field allowing the client to detect and avoid conflicting
   * updates.
   *
   * If specified, this is the previous revision of stored data which the
   * client is aware of and has included in its updates.  If this does not match
   * the latest revision available on the server, the request will fail without
   * making any changes.
   *
   * If this field is absent, the new blob is always saved, overwriting any
   * existing revision.
   */
  knownRevision?: string;
}

/**
 * Response to {@link UploadEncryptedStorageRequest}
 */
export interface UploadEncryptedStorageResponseValue {
  /**
   * The revision assigned to identify the stored blob.  Revision is assigned by
   * the server and can be used later to identify this blob and avoid conflicts.
   */
  revision: string;
}

/**
 * Ask the server for an e2ee backup of a user's data given a `blobKey`.
 */
export interface DownloadEncryptedStorageRequest {
  /**
   * On the server-side, encrypted storage is keyed by the hash of
   * the encryption key.
   */
  blobKey: string;

  /**
   * Optional field indicating the revision of the latest blob already known to
   * the client.  If this matches the latest blob stored on the server, the
   * request will succeed, but the result will not contain any blob.
   */
  knownRevision?: string;
}

/**
 * Response to {@link DownloadEncryptedStorageRequest}
 */
export interface DownloadEncryptedStorageResponseValue {
  /**
   * The retrieved blob for the given key.  This will be absent if the request
   * included a `knownRevision` which matched the latest revision.
   */
  encryptedBlob?: string;

  /**
   * The revision identifying this blob on the server.  Revision is assigned by
   * the server and can be used later to identify this blob and avoid conflicts.
   */
  revision: string;
}

/**
 * Ask the server to change the salt, delete the storage at the old blob key,
 * and add a new encrypted storage entry encrypted with the new blob key.
 */
export interface ChangeBlobKeyRequest {
  /**
   * The original hashed encryption key to be deleted.
   */
  oldBlobKey: string;

  /**
   * The new hashed encryption key to be added.
   */
  newBlobKey: string;

  /**
   * UUID of the user making the request.
   */
  uuid: string;

  /**
   * The salt used in generating the new blob key.
   */
  newSalt: string;

  /**
   * The encrypted and stringified version of {@link EncryptedStorage} to save
   */
  encryptedBlob: string;

  /**
   * Optional field allowing the client to detect and avoid conflicting
   * updates.
   *
   * If specified, this is the previous revision of stored data which the
   * client is aware of and has included in its updates.  If this does not match
   * the latest revision available on the server, the request will fail without
   * making any changes.
   *
   * If this field is absent, the new blob is always saved, overwriting any
   * existing revision.
   */
  knownRevision?: string;
}

/**
 * Response to {@link ChangeBlobKeyRequest}
 */
export interface ChangeBlobKeyResponseValue {
  /**
   * The revision assigned to identify the stored blob.  Revision is assigned by
   * the server and can be used later to identify this blob and avoid conflicts.
   */
  revision: string;
}

/**
 * A {@link ChangeBlobKeyRequest} can fail with a few non-standard named errors:
 * PasswordIncorrect if there is no blob for the given key
 * UserNotFound if the user does not exist
 * RequiresNewSalt if the given salt is the same as the old salt
 * Conflict if knownRevision is specified and doesn't match
 */
export type ChangeBlobKeyError = NamedAPIError;

/**
 * Ask the server to check whether this ticket is still eligible to be checked in.
 */
export interface CheckTicketRequest {
  ticket: SerializedPCD<EdDSATicketPCD>;
}

/**
 * Happy-path the server has nothing to say in response to a {@link CheckTicketRequest}
 */
export type CheckTicketReponseValue = undefined;

/**
 * However, many problems can come up in {@link CheckTicketRequest}. This type
 * enumerates all the possible problems.
 */
export type TicketError = { detailedMessage?: string } & (
  | { name: "NotSuperuser" }
  | {
      name: "AlreadyCheckedIn";
      checkinTimestamp: string | undefined;
      checker: string | undefined;
    }
  | { name: "InvalidSignature" }
  | { name: "InvalidTicket" }
  | { name: "TicketRevoked"; revokedTimestamp: number }
  | { name: "NetworkError" }
  | { name: "ServerError" }
);

/**
 * A particular 'superuser' ticket-holder can request to check in
 * another ticket that belongs to the same event.
 */
export interface CheckTicketInRequest {
  /**
   * A semaphore signature from the checker, used by the server to
   * determine whether the checker has the required permissions
   * to check this ticket in.
   */
  checkerProof: SerializedPCD<SemaphoreSignaturePCD>;

  /**
   * The ticket to attempt to check in.
   */
  ticket: SerializedPCD<EdDSATicketPCD>;
}

/**
 * On the happy path, {@link CheckTicketInRequest} has nothing to say and
 * just succeeds.
 */
export type CheckTicketInResponseValue = undefined;

/**
 * A {@link CheckTicketInRequest} can fail for a number of reasons.
 */
export type CheckTicketInError = TicketError;

/**
 * Ask the Zupass server, or a 3rd party server to return the list of feeds
 * that it is hosting.
 */
export type ListFeedsRequest = unknown;

/**
 * Response to {@link ListFeedsRequest}.
 */
export interface ListFeedsResponseValue {
  providerUrl: string;
  providerName: string;
  feeds: Feed[];
}

export interface ListSingleFeedRequest {
  feedId: string;
}

/**
 * Ask the Zupass server, or a 3rd party server, to give the user
 * some PCDs, given the particular feed and credential that the
 * user supplies.
 */
export interface PollFeedRequest<T extends PCDPackage = PCDPackage> {
  feedId: string;
  pcd?: SerializedPCD<PCDOf<T>>;
}

/**
 * Response to {@link PollFeedRequest}.
 */
export interface PollFeedResponseValue {
  actions: PCDAction[];
}

/**
 * The Zupass server returns this data structure to users
 * to represent Zupass users.
 */
export interface ZupassUserJson {
  uuid: string;
  commitment: string;
  email: string;
  salt: string | null;
}

/**
 * Ask the Zupass server to send a confirmation email with a
 * log-in token to the given email.
 */
export type ConfirmEmailRequest = {
  /**
   * Each email can have one account on Zupass.
   */
  email: string;

  /**
   * Public semaphore commitment of this user. The server never learns
   * the user's private semaphore details.
   */
  commitment: string;

  /**
   * Whether or not to overwrite an existing user, if one is present.
   * Required to be 'true' if a user with the same email already exists.
   */
  force: "true" | "false";
};

/**
 * Response to {@link ConfirmEmailRequest}
 */
export type ConfirmEmailResponseValue =
  | {
      /**
       * In development mode, the server can return a token
       * to the client rather than sending it via an email,
       * speeding up software development iteration. Check
       * out the `BYPASS_EMAIL_REGISTRATION` environment variable
       * elsewhere in this codebase to learn more.
       */
      devToken: string;
    }
  | undefined;

/**
 * Ask the Zupass server for the salt of a particular user.
 */
export type SaltRequest = { email: string };

/**
 * Response to {@link SaltRequest}.
 */
export type SaltResponseValue = string | null;

/**
 * Ask the server to let us know if the given token is valid and
 * OK to use for logging in / overwriting an existing account.
 */
export type VerifyTokenRequest = {
  email: string;
  token: string;
};

/**
 * Returns the encryption_key of the account, if the user has opted to not set
 * a password and store their encryption key on our server.
 * {@link VerifyTokenRequest}.
 */
export type VerifyTokenResponseValue = { encryptionKey: string | null };

/**
 * Ask the server to log us in using a special login flow designed
 * for use by the coworking space organizers.
 */
export type DeviceLoginRequest = {
  email: string;
  secret: string;
  commitment: string;
};

/**
 * Ask the Zupass server to create a new account with
 * the given details, overwriting an existing account if one is
 * present.
 */
export type CreateNewUserRequest = {
  email: string;
  token: string;
  commitment: string;
  /**
   * Zupass users don't have a salt.
   */
  salt: string | undefined;
  encryptionKey: string | undefined;
};

/**
 * Zupass responds with this when you ask it if it is able to
 * issue tickets. Used primarily for testing.
 */
export type IssuanceEnabledResponseValue = boolean;

/**
 * Zupass responds with this when you ask it whether it has
 * synced the Zuzalu users yet.
 */
export type PretixSyncStatusResponseValue = string;

/**
 * In the case that loading an existing Zupass user fails,
 * we can determine if it failed because the user does not exist,
 * or due to some other error, such as intermittent network error,
 * or the backend being down.
 */
export type LoadUserError =
  | { userMissing: true; errorMessage?: never }
  | { userMissing?: never; errorMessage: string };

/**
 * When you ask Zupass for a user, it will respond with this type.
 */
export type UserResponseValue = ZupassUserJson;

/**
 * Zupass responds with this when you ask it if it knows of a given
 * (id, rootHash) tuple.
 */
export type SemaphoreValidRootResponseValue = { valid: boolean };

/**
 * The string the client must sign with the user's semaphore identity
 * in order to be able to request the PCDs that the server wants to
 * issue the user.
 */
export const ISSUANCE_STRING = "Issue me PCDs please.";
