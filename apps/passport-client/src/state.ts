import {
  CredentialCache,
  FeedSubscriptionManager,
  KnownPublicKey,
  KnownTicketType,
  OfflineDevconnectTicket,
  OfflineTickets,
  User
} from "@pcd/passport-interface";
import { PCDCollection } from "@pcd/pcd-collection";
import { Identity } from "@semaphore-protocol/identity";
import { Emitter } from "./emitter";

export type GetState = () => AppState;
export type StateEmitter = Emitter<AppState>;

export interface AppState {
  // Zuzalu semaphore identity.
  identity: Identity;
  pcds: PCDCollection;
  subscriptions: FeedSubscriptionManager;
  encryptionKey?: string;
  credentialCache: CredentialCache;

  // View state
  modal:
    | { modalType: "info" }
    | { modalType: "settings" }
    | { modalType: "upgrade-account-modal" }
    | { modalType: "invalid-participant" }
    | { modalType: "changed-password" }
    | { modalType: "another-device-changed-password" }
    | { modalType: "resolve-subscription-error" }
    | { modalType: "require-add-password" }
    | { modalType: "privacy-notice" }
    | { modalType: "none" }
    | {
        modalType: "frogcrypto-update-telegram";
        revealed: boolean;
        refreshAll: () => Promise<void>;
      }
    | { modalType: "frogcrypto-export-pcds" };

  // User metadata.
  self?: User;

  // If set, shows an error popover.
  error?: AppError;

  // If set, show the error resolution screen for this subscription
  resolvingSubscriptionId?: string;

  // If set, the user has been invalidated server-side
  userInvalid?: boolean;
  // If set, the user has had their password changed from a different device
  anotherDeviceChangedPassword?: boolean;

  // Dynamic (in-memory-only) state-machine for sync of E2EE encrypted data.
  // The background sync will always perform all steps (download, fetch feeds,
  // upload) on its initial run, after which it will repeat each step only
  // when requested (for download and feeds), or when the hash of stored
  // state changes (for upload).
  // TODO(artwyman): The parts of this not needed by the rest of the app
  // might be better stored elsewhere, to avoid issues with reentrancy
  // and stale snapshots delivered via dispatch().

  // (Dynamic sync state) Output variable indicating whether the first attempt
  // to download from E2EE storage has completed (whether success or failure).
  // Also used within the sync engine to avoid repeating this attempt.
  downloadedPCDs?: boolean;

  // (Dynamic sync state) Output variable indicating whether the first attempt
  // to fetch PCDs from subscription feeds has completed (whether success or
  // failure).
  // Also used within the sync engine to avoid repeating this attempt.
  loadedIssuedPCDs?: boolean;

  // (Dynamic sync state) Output variable indicating when a fetch from
  // subscription feeds is in progress.
  // Only used to update UI, not to control the behavior of the sync itself.
  loadingIssuedPCDs?: boolean;

  // (Dynamic sync state) Output variable indicating when all stages of the
  // initial sync are complete.
  // Also used within the sync engine so that the behavior of future syncs
  // differs from the first.
  completedFirstSync?: boolean;

  // (Dynamic sync state) Input variable to indicate to the sync engine that
  // it should download again.  Will trigger at most one download, after which
  // it will be set back to false (whether the download succeeded or failed).
  extraDownloadRequested?: boolean;

  // (Dynamic sync state) Input variable to indicate to the sync engine that
  // it should fetch subscription feeds again.  Will trigger at most one fetch,
  // after which it will be set back to false (whether the fetch succeeded or
  // failed).
  extraSubscriptionFetchRequested?: boolean;

  // Persistent sync state-machine fields, saved in local storage as a
  // PersistentSyncStatus object.  This is structured to allow for more
  // fields to be added later.

  // (Persistent sync state) The revision (assigned by the server) of the most
  // recent storage uploaded or downloaded.  Represents the most recent
  // point where we know our state was the same as the server.
  serverStorageRevision?: string;

  // (Persistent sync state) The hash (calculated by the client) of the most
  // recent storage uploaded or downloaded.  Represents the most recent
  // point where we know our state was the same as the server.
  serverStorageHash?: string;

  knownTicketTypes?: KnownTicketType[];
  knownPublicKeys?: Record<string, Record<string, KnownPublicKey>>;

  offlineTickets: OfflineTickets;
  checkedinOfflineDevconnectTickets: OfflineDevconnectTicket[];
  offline: boolean;

  // @todo screen-specific data should perhaps have a structure similar to
  // that of modals
  importScreen?: {
    imported?: number;
    error?: string;
  };

  strichSDKstate: "initialized" | "error" | undefined;
}

export interface AppError {
  /** Big title, should be under 40 chars */
  title: string;
  /** Useful explanation, avoid "Something went wrong." */
  message: string | React.ReactNode;
  /** Optional stacktrace. */
  stack?: string;
  /** By default, user dismisses an error and returns to home screen. */
  dismissToCurrentPage?: boolean;
}
