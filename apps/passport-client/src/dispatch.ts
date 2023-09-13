import { PCDCrypto } from "@pcd/passport-crypto";
import {
  applyActions,
  isSyncedEncryptedStorageV2,
  SyncedEncryptedStorage,
  User
} from "@pcd/passport-interface";
import { PCDCollection } from "@pcd/pcd-collection";
import { SerializedPCD } from "@pcd/pcd-types";
import {
  SemaphoreIdentityPCD,
  SemaphoreIdentityPCDPackage,
  SemaphoreIdentityPCDTypeName
} from "@pcd/semaphore-identity-pcd";
import { Identity } from "@semaphore-protocol/identity";
import { createContext } from "react";
import { logToServer } from "./api/logApi";
import {
  submitDeviceLogin,
  submitNewUser,
  verifyTokenServer
} from "./api/user";
import { appConfig } from "./appConfig";
import {
  loadEncryptionKey,
  saveEncryptionKey,
  saveIdentity,
  savePCDs,
  saveSelf,
  saveUserInvalid
} from "./localstorage";
import { getPackages } from "./pcdPackages";
import { AppError, AppState, GetState, StateEmitter } from "./state";
import { sanitizeDateRanges } from "./user";
import { downloadStorage, uploadStorage } from "./useSyncE2EEStorage";

export type Dispatcher = (action: Action) => void;

export type Action =
  | {
      type: "new-passport";
      email: string;
    }
  | {
      type: "login";
      email: string;
      password: string;
      token: string;
    }
  | {
      type: "verify-token";
      email: string;
      token: string;
    }
  | {
      type: "device-login";
      email: string;
      secret: string;
    }
  | { type: "new-device-login-passport" }
  | {
      type: "set-self";
      self: User;
    }
  | {
      type: "set-modal";
      modal: AppState["modal"];
    }
  | {
      type: "error";
      error: AppError;
    }
  | {
      type: "clear-error";
    }
  | {
      type: "reset-passport";
    }
  | { type: "participant-invalid" }
  | {
      type: "load-from-sync";
      storage: SyncedEncryptedStorage;
      encryptionKey: string;
    }
  | { type: "add-pcds"; pcds: SerializedPCD[]; upsert?: boolean }
  | { type: "remove-pcd"; id: string }
  | { type: "sync" };

export type StateContextState = {
  getState: GetState;
  stateEmitter: StateEmitter;
  dispatch: Dispatcher;
};
export const StateContext = createContext<StateContextState>({} as any);

export type ZuUpdate = (s: Partial<AppState>) => void;

export async function dispatch(
  action: Action,
  state: AppState,
  update: ZuUpdate
) {
  switch (action.type) {
    case "new-passport":
      return genPassport(state.identity, action.email, update);
    case "login":
      return login(action.email, action.token, action.password, state, update);
    case "verify-token":
      return verifyToken(action.email, action.token, state, update);
    case "device-login":
      return deviceLogin(action.email, action.secret, state, update);
    case "new-device-login-passport":
      return genDeviceLoginPassport(state.identity, update);
    case "set-self":
      return setSelf(action.self, state, update);
    case "error":
      return update({ error: action.error });
    case "clear-error":
      return clearError(state, update);
    case "reset-passport":
      return resetPassport(state);
    case "load-from-sync":
      return loadFromSync(action.encryptionKey, action.storage, state, update);
    case "set-modal":
      return update({
        modal: action.modal
      });
    case "add-pcds":
      return addPCDs(state, update, action.pcds, action.upsert);
    case "remove-pcd":
      return removePCD(state, update, action.id);
    case "participant-invalid":
      return userInvalid(update);
    case "sync":
      return sync(state, update);
    default:
      console.error("Unknown action type", action);
  }
}

async function genPassport(
  identity: Identity,
  email: string,
  update: ZuUpdate
) {
  // Show the NewPassportScreen.
  // This will save the sema identity & request email verification.
  update({ pendingAction: { type: "new-passport", email } });
  window.location.hash = "#/new-passport";

  const identityPCD = await SemaphoreIdentityPCDPackage.prove({ identity });
  const pcds = new PCDCollection(await getPackages(), [identityPCD]);

  await savePCDs(pcds);

  update({
    pcds,
    pendingAction: { type: "new-passport", email }
  });
}

async function verifyToken(
  email: string,
  token: string,
  state: AppState,
  update: ZuUpdate
) {
  // For Zupass, skip directly to login as we don't let users set their password
  if (appConfig.isZuzalu) {
    // Password can be empty string for the argon2 KDF. Random salt ensures that
    // this generated key is not less secure than generating a random key.
    return login(email, token, "", state, update);
  }
  const res = await verifyTokenServer(email, token);
  const { verified, message } = await res.json();
  if (verified) {
    window.location.hash = `#/create-password?email=${encodeURIComponent(
      email
    )}&token=${encodeURIComponent(token)}`;
  } else {
    update({
      error: {
        title: "Login failed",
        message,
        dismissToCurrentPage: true
      }
    });
  }
}

/**
 * Pretty much the same as genPassport, but without screen
 * navigation coupled to the email verification workflow
 */
async function genDeviceLoginPassport(identity: Identity, update: ZuUpdate) {
  const identityPCD = await SemaphoreIdentityPCDPackage.prove({ identity });
  const pcds = new PCDCollection(await getPackages(), [identityPCD]);

  const crypto = await PCDCrypto.newInstance();
  const encryptionKey = await crypto.generateRandomKey();

  await savePCDs(pcds);
  await saveEncryptionKey(encryptionKey);

  update({
    pcds,
    encryptionKey
  });
}

async function login(
  email: string,
  token: string,
  password: string,
  state: AppState,
  update: ZuUpdate
) {
  let user: User;
  try {
    const crypto = await PCDCrypto.newInstance();
    const salt = await crypto.generateSalt();
    const encryptionKey = await crypto.argon2(password, salt, 32);
    await saveEncryptionKey(encryptionKey);

    const res = await submitNewUser(
      email,
      token,
      state.identity.commitment.toString(),
      salt
    );
    if (!res.ok) throw new Error(await res.text());
    user = await res.json();
  } catch (e) {
    update({
      error: {
        title: "Login failed",
        message: "Couldn't log in. " + e.message,
        dismissToCurrentPage: true
      }
    });
    return;
  }

  return finishLogin(user, state, update);
}

async function deviceLogin(
  email: string,
  secret: string,
  state: AppState,
  update: ZuUpdate
) {
  let user: User;
  try {
    const res = await submitDeviceLogin(
      email,
      secret,
      state.identity.commitment.toString()
    );
    if (!res.ok) throw new Error(await res.text());
    user = await res.json();
  } catch (e) {
    update({
      error: {
        title: "Login failed",
        message: "Couldn't log in. " + e.message,
        dismissToCurrentPage: true
      }
    });
    return;
  }

  return finishLogin(user, state, update);
}

/**
 * Runs the first time the user logs in with their email
 */
async function finishLogin(user: User, state: AppState, update: ZuUpdate) {
  // Verify that the identity is correct.
  const { identity } = state;
  console.log("Save self", identity, user);
  if (identity == null || identity.commitment.toString() !== user.commitment) {
    update({
      error: {
        title: "Invalid identity",
        message: "Something went wrong saving your passport. Contact support."
      }
    });
  }

  window.location.hash = "#/login-interstitial";

  // Save to local storage.
  setSelf(user, state, update);

  // Save PCDs to E2EE storage.
  await uploadStorage();

  // If on Zupass legacy login, ask user to save their Master Password
  if (appConfig.isZuzalu) {
    update({ modal: "save-sync" });
  }
}

// Runs periodically, whenever we poll new participant info.
async function setSelf(self: User, state: AppState, update: ZuUpdate) {
  let userMismatched = false;

  if (BigInt(self.commitment) !== state.identity.commitment) {
    console.log("Identity commitment mismatch");
    userMismatched = true;
    logToServer("invalid-user", {
      oldCommitment: state.identity.commitment.toString(),
      newCommitment: self.commitment.toString()
    });
  } else if (state.self && state.self.uuid !== self.uuid) {
    console.log("User UUID mismatch");
    userMismatched = true;
    logToServer("invalid-user", {
      oldUUID: state.self.uuid,
      newUUID: self.uuid
    });
  }

  if (userMismatched) {
    userInvalid(update);
    return;
  }

  if (self.visitor_date_ranges) {
    self.visitor_date_ranges = sanitizeDateRanges(self.visitor_date_ranges);
  }

  saveSelf(self); // Save to local storage.
  update({ self }); // Update in-memory state.
}

function clearError(state: AppState, update: ZuUpdate) {
  if (!state.error?.dismissToCurrentPage) {
    window.location.hash = "#/";
  }
  update({ error: undefined });
}

async function resetPassport(state: AppState) {
  await logToServer("logout", {
    uuid: state.self?.uuid,
    email: state.self?.email,
    commitment: state.self?.commitment
  });
  // Clear saved state.
  window.localStorage.clear();
  // Reload to clear in-memory state.
  window.location.hash = "#/";
  window.location.reload();
}

async function addPCDs(
  state: AppState,
  update: ZuUpdate,
  pcds: SerializedPCD[],
  upsert?: boolean
) {
  await state.pcds.deserializeAllAndAdd(pcds, { upsert });
  await savePCDs(state.pcds);
  update({ pcds: state.pcds });
}

async function removePCD(state: AppState, update: ZuUpdate, pcdId: string) {
  state.pcds.remove(pcdId);
  await savePCDs(state.pcds);
  update({ pcds: state.pcds });
}

async function loadFromSync(
  encryptionKey: string,
  storage: SyncedEncryptedStorage,
  currentState: AppState,
  update: ZuUpdate
) {
  console.log("loading from sync", storage);

  let pcds: PCDCollection;

  if (isSyncedEncryptedStorageV2(storage)) {
    pcds = await PCDCollection.deserialize(await getPackages(), storage.pcds);
  } else {
    pcds = await new PCDCollection(await getPackages());
    await pcds.deserializeAllAndAdd(storage.pcds);
  }

  // assumes that we only have one semaphore identity in the passport.
  const identityPCD = pcds.getPCDsByType(
    SemaphoreIdentityPCDTypeName
  )[0] as SemaphoreIdentityPCD;

  if (!identityPCD) {
    // TODO: handle error gracefully
    throw new Error("no identity found in encrypted storage");
  }

  await savePCDs(pcds);
  saveEncryptionKey(encryptionKey);
  saveSelf(storage.self);
  saveIdentity(identityPCD.claim.identity);

  update({
    encryptionKey,
    pcds,
    identity: identityPCD.claim.identity,
    self: storage.self
  });

  console.log("Loaded from sync key, redirecting to home screen...");
  window.localStorage["savedSyncKey"] = "true";
  window.location.hash = "#/login-interstitial";
}

function userInvalid(update: ZuUpdate) {
  saveUserInvalid(true);
  update({
    userInvalid: true,
    modal: "invalid-participant"
  });
}

/**
 * This sync function can be called any amount of times, and it will
 * function properly. It does the following:
 *
 * - if PCDs have not been downloaded yet, and are not in the
 *   process of being downloaded, kicks off the process of downloading
 *   them from e2ee.
 *
 * - if the PCDs have been downloaded, and the current set of PCDs
 *   in the passport does not equal the downloaded set, and if the
 *   passport is not currently uploading the current set of PCDs
 *   to e2ee, then uploads then to e2ee.
 */
async function sync(state: AppState, update: ZuUpdate) {
  if ((await loadEncryptionKey()) == null) {
    console.log("[SYNC] no encryption key, can't sync");
    return;
  }

  if (!state.downloadedPCDs && !state.downloadingPCDs) {
    console.log("[SYNC] sync action: download");
    update({
      downloadingPCDs: true
    });

    const pcds = await downloadStorage();

    if (pcds != null) {
      update({
        downloadedPCDs: true,
        downloadingPCDs: false,
        pcds: pcds,
        uploadedUploadId: await pcds.getHash()
      });
    } else {
      console.log(`[SYNC] skipping download`);
      update({
        downloadedPCDs: true,
        downloadingPCDs: false
      });
    }

    return;
  }

  if (state.downloadingPCDs || !state.downloadedPCDs) {
    return;
  }

  if (
    !appConfig.isZuzalu &&
    !state.loadedIssuedPCDs &&
    !state.loadingIssuedPCDs
  ) {
    update({
      loadingIssuedPCDs: true
    });

    try {
      console.log("[SYNC] loading issued pcds");
      const actions = await state.subscriptions.pollSubscriptions();
      await applyActions(state.pcds, actions);
      await savePCDs(state.pcds);
      console.log("[SYNC] loaded and saved issued pcds");
    } catch (e) {
      console.log(`[SYNC] failed to load issued PCDs, skipping this step`, e);
    }

    update({
      loadingIssuedPCDs: false,
      loadedIssuedPCDs: true,
      pcds: state.pcds
    });
    return;
  }

  if (
    !appConfig.isZuzalu &&
    !state.loadedIssuedPCDs &&
    state.loadingIssuedPCDs
  ) {
    return;
  }

  const uploadId = await state.pcds.getHash();

  if (
    state.uploadedUploadId === uploadId ||
    state.uploadingUploadId === uploadId
  ) {
    console.log("[SYNC] sync action: no-op");
    return;
  }

  console.log("[SYNC] sync action: upload");
  update({
    uploadingUploadId: uploadId
  });
  await uploadStorage();
  update({
    uploadingUploadId: undefined,
    uploadedUploadId: uploadId
  });
}
