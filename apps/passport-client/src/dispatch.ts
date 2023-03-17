import { ZuzaluParticipant } from "@pcd/passport-interface";
import { PCDCollection } from "@pcd/pcd-collection";
import { SemaphoreGroupPCDPackage } from "@pcd/semaphore-group-pcd";
import { SemaphoreIdentityPCDPackage } from "@pcd/semaphore-identity-pcd";
import { Identity } from "@semaphore-protocol/identity";
import { createContext } from "react";
import { saveSelf } from "./participant";
import { savePCDs, ZuError, ZuState } from "./state";

export type Dispatcher = (action: Action) => void;

export type Action =
  | {
      type: "new-passport";
      email: string;
    }
  | {
      type: "save-self";
      participant: ZuzaluParticipant;
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
    };

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
      return genPassport(action.email, update);
    case "save-self":
      return doSaveSelf(action.participant, state, update);
    case "error":
      return update({ error: action.error });
    case "clear-error":
      return clearError(update);
    case "reset-passport":
      return resetPassport(update);
    default:
      console.error("Unknown action type", action);
  }
}

async function genPassport(email: string, update: ZuUpdate) {
  // Generate a semaphore identity, save it to the local store, generate an
  // email magic link. In prod, send email, in dev, display the link.

  // Generate a fresh identity, save in local storage.
  const identity = new Identity();
  console.log("Created identity", identity.toString());
  window.localStorage["identity"] = identity.toString();

  update({ identity, pendingAction: { type: "new-passport", email } });
  window.location.hash = "#/new-passport";

  const identityPCD = await SemaphoreIdentityPCDPackage.prove({ identity });
  const pcds = new PCDCollection(
    [SemaphoreIdentityPCDPackage, SemaphoreGroupPCDPackage],
    [identityPCD]
  );

  await savePCDs(pcds);

  update({ pcds, pendingAction: { type: "new-passport", email } });
}

function doSaveSelf(
  participant: ZuzaluParticipant,
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
  saveSelf(participant);

  // Compute identity-revealing proof.
  update({ self: participant });

  // Redirect to the home page.
  window.location.hash = "#/";
}

function clearError(update: ZuUpdate) {
  window.location.hash = "#/";
  update({ error: undefined });
}

function resetPassport(update: ZuUpdate) {
  window.localStorage.clear();
  window.location.hash = "#/";
  update({ self: undefined });
}
