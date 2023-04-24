import { EthereumOwnershipPCDPackage } from "@pcd/ethereum-ownership-pcd";
import { PCDCrypto } from "@pcd/passport-crypto";
import { EncryptedStorage, ZuParticipant } from "@pcd/passport-interface";
import { PCDCollection } from "@pcd/pcd-collection";
import { SerializedPCD } from "@pcd/pcd-types";
import { SemaphoreGroupPCDPackage } from "@pcd/semaphore-group-pcd";
import {
  SemaphoreIdentityPCD,
  SemaphoreIdentityPCDPackage,
  SemaphoreIdentityPCDTypeName,
} from "@pcd/semaphore-identity-pcd";
import { SemaphoreSignaturePCDPackage } from "@pcd/semaphore-signature-pcd";
import { Identity } from "@semaphore-protocol/identity";
import { createContext } from "react";
import { config } from "./config";
import {
  saveEncryptionKey,
  saveIdentity,
  saveParticipantInvalid,
  savePCDs,
  saveSelf,
} from "./localstorage";
import { getPackages } from "./pcdLoader";
import { ZuError, ZuState } from "./state";
import { uploadStorage } from "./useSyncE2EEStorage";

export type Dispatcher = (action: Action) => void;

export type Action =
  | {
      type: "new-passport";
      email: string;
    }
  | {
      type: "login";
      email: string;
      token: string;
    }
  | {
      type: "set-self";
      self: ZuParticipant;
    }
  | {
      type: "set-modal";
      modal: ZuState["modal"];
    }
  | {
      type: "error";
      error: ZuError;
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
      storage: EncryptedStorage;
      encryptionKey: string;
    }
  | { type: "add-pcd"; pcd: SerializedPCD }
  | { type: "remove-pcd"; id: string };

export const DispatchContext = createContext<[ZuState, Dispatcher]>([] as any);

export type ZuUpdate = (s: Partial<ZuState>) => void;

export async function dispatch(
  action: Action,
  state: ZuState,
  update: ZuUpdate
) {
  console.log(`Dispatching ${action.type}`, action);

  switch (action.type) {
    case "new-passport":
      return genPassport(state.identity, action.email, update);
    case "login":
      return login(action.email, action.token, state, update);
    case "set-self":
      return setSelf(action.self, state, update);
    case "error":
      return update({ error: action.error });
    case "clear-error":
      return clearError(state, update);
    case "reset-passport":
      return resetPassport();
    case "load-from-sync":
      return loadFromSync(action.encryptionKey, action.storage, state, update);
    case "set-modal":
      return update({
        modal: action.modal,
      });
    case "add-pcd":
      return addPCD(state, update, action.pcd);
    case "remove-pcd":
      return removePCD(state, update, action.id);
    case "participant-invalid":
      return participantInvalid(update);
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
  const pcds = new PCDCollection(
    [
      SemaphoreIdentityPCDPackage,
      SemaphoreGroupPCDPackage,
      SemaphoreSignaturePCDPackage,
      EthereumOwnershipPCDPackage,
    ],
    [identityPCD]
  );

  const crypto = await PCDCrypto.newInstance();
  const encryptionKey = await crypto.generateRandomKey();

  await savePCDs(pcds);
  await saveEncryptionKey(encryptionKey);

  update({
    pcds,
    encryptionKey,
    pendingAction: { type: "new-passport", email },
  });
}

async function login(
  email: string,
  token: string,
  state: ZuState,
  update: ZuUpdate
) {
  // Verify the token, save the participant to local storage, redirect to
  // the home page.
  const query = new URLSearchParams({
    email,
    token,
    commitment: state.identity.commitment.toString(),
  }).toString();
  const loginUrl = `${config.passportServer}/zuzalu/new-participant?${query}`;

  let participant: ZuParticipant;
  try {
    const res = await fetch(loginUrl);
    if (!res.ok) throw new Error(await res.text());
    participant = await res.json();
  } catch (e) {
    update({
      error: {
        title: "Login failed",
        message: "Couldn't log in. " + e.message,
        dismissToCurrentPage: true,
      },
    });
    return;
  }

  finishLogin(participant, state, update);
}

/**
 * Runs the first time the user logs in with their email
 */
async function finishLogin(
  participant: ZuParticipant,
  state: ZuState,
  update: ZuUpdate
) {
  // Verify that the identity is correct.
  const { identity } = state;
  console.log("Save self", identity, participant);
  if (
    identity == null ||
    identity.commitment.toString() !== participant.commitment
  ) {
    update({
      error: {
        title: "Invalid identity",
        message: "Something went wrong saving your passport. Contact support.",
      },
    });
  }

  // Save to local storage.
  setSelf(participant, state, update);

  window.location.hash = "#/";

  // Ask user to save their sync key
  update({ modal: "save-sync" });

  // Save PCDs to E2EE storage.
  return uploadStorage();
}

// Runs periodically, whenever we poll new participant info.
async function setSelf(self: ZuParticipant, state: ZuState, update: ZuUpdate) {
  let participantMismatched = false;

  if (BigInt(self.commitment) !== state.identity.commitment) {
    console.log("Identity commitment mismatch");
    participantMismatched = true;
  } else if (state.self && state.self.uuid !== self.uuid) {
    console.log("Participant UUID mismatch");
    participantMismatched = true;
  }

  if (participantMismatched) {
    participantInvalid(update);
    return;
  }

  saveSelf(self); // Save to local storage.
  update({ self }); // Update in-memory state.
}

function clearError(state: ZuState, update: ZuUpdate) {
  if (!state.error?.dismissToCurrentPage) {
    window.location.hash = "#/";
  }
  update({ error: undefined });
}

function resetPassport() {
  // Clear saved state.
  window.localStorage.clear();
  // Reload to clear in-memory state.
  window.location.hash = "#/";
  window.location.reload();
}

async function addPCD(state: ZuState, update: ZuUpdate, pcd: SerializedPCD) {
  if (state.pcds.hasPackage(pcd.type)) {
    const newPCD = await state.pcds.deserialize(pcd);
    if (state.pcds.hasPCDWithId(newPCD.id)) {
      throw new Error("This PCD has already been added to your passport");
    }
    await state.pcds.deserializeAndAdd(pcd);
    await savePCDs(state.pcds);
    update({ pcds: state.pcds });
  } else {
    throw new Error(`Can't add PCD: missing package ${pcd.type}`);
  }
}

async function removePCD(state: ZuState, update: ZuUpdate, pcdId: string) {
  state.pcds.remove(pcdId);
  await savePCDs(state.pcds);
  update({ pcds: state.pcds });
}

async function loadFromSync(
  encryptionKey: string,
  storage: EncryptedStorage,
  state: ZuState,
  update: ZuUpdate
) {
  console.log("loading from sync", storage);

  const pcds = new PCDCollection(await getPackages(), []);

  await pcds.deserializeAllAndAdd(storage.pcds);
  // assumes that we only have one semaphore identity in the passport.
  // todo: some metadata that identifies the zuzalu semaphore id as
  // some sort of unique one
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
    self: storage.self,
  });

  console.log("Loaded from sync key, redirecting to home screen...");
  window.localStorage["savedSyncKey"] = "true";
  window.location.hash = "#/";
}

function participantInvalid(update: ZuUpdate) {
  saveParticipantInvalid(true);
  update({
    participantInvalid: true,
    modal: "invalid-participant",
  });
}
