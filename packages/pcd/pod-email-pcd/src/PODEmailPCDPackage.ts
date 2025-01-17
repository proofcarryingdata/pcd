import { DisplayOptions, PCDPackage, SerializedPCD } from "@pcd/pcd-types";
import { POD, PODEntries } from "@pcd/pod";
import {
  PODEmailPCD,
  PODEmailPCDArgs,
  PODEmailPCDClaim,
  PODEmailPCDProof,
  PODEmailPCDRequiredEntries,
  PODEmailPCDTypeName
} from "./PODEmailPCD";

/**
 * Loads POD values from a PODEmailPCD.
 *
 * @param pcd - The PODEmailPCD to load.
 * @returns The POD.
 */
function loadPOD(pcd: PODEmailPCD): POD {
  return POD.load(
    pcd.claim.podEntries,
    pcd.proof.signature,
    pcd.claim.signerPublicKey
  );
}

/**
 * Creates a PODEmailPCD from the given arguments.
 *
 * @param args - The arguments for the PODEmailPCD.
 * @returns The PODEmailPCD.
 */
export async function prove(args: PODEmailPCDArgs): Promise<PODEmailPCD> {
  if (!args.privateKey.value) {
    throw new Error("missing private key");
  }

  if (!args.emailAddress.value) {
    throw new Error("missing email value");
  }

  if (!args.semaphoreV4PublicKey.value) {
    throw new Error("missing semaphore v4 public key");
  }

  const podEntries: PODEmailPCDRequiredEntries = {
    emailAddress: {
      type: "string",
      value: args.emailAddress.value
    },
    semaphoreV4PublicKey: {
      type: "eddsa_pubkey",
      value: args.semaphoreV4PublicKey.value
    },
    pod_type: {
      type: "string",
      value: "zupass.email"
    }
  };

  const pod = POD.sign(podEntries, args.privateKey.value);

  // The POD signature is used as the ID if no ID is provided.
  const id = args.id.value ?? pod.signature;

  return new PODEmailPCD(
    id,
    {
      podEntries,
      signerPublicKey: pod.signerPublicKey
    },
    {
      signature: pod.signature
    }
  );
}

/**
 * Verifies a PODEmailPCD.
 *
 * This checks that the required entries are present and valid, then verifies
 * the POD signature.
 *
 * @param pcd - The PODEmailPCD to verify.
 * @returns Whether the PODEmailPCD is valid.
 */
export async function verify(pcd: PODEmailPCD): Promise<boolean> {
  try {
    checkPODEntries(pcd.claim.podEntries);
  } catch (e) {
    return false;
  }

  return loadPOD(pcd).verifySignature();
}

/**
 * Serializes a PODEmailPCD.
 *
 * @param pcd - The PODEmailPCD to serialize.
 * @returns The serialized PODEmailPCD.
 */
export async function serialize(
  pcd: PODEmailPCD
): Promise<SerializedPCD<PODEmailPCD>> {
  return {
    type: PODEmailPCDTypeName,
    pcd: JSON.stringify({
      id: pcd.id,
      pod: loadPOD(pcd).toJSON()
    })
  };
}

/**
 * Checks that the required entries are present and valid.
 *
 * This is used both to check the entries when creating a PODEmailPCD and to
 * check the entries when deserializing a PODEmailPCD.
 *
 * Note that this does not ensure that there are no additional entries. This allows
 * for compatibility with future extensions to the POD.
 *
 * @param podEntries - The POD entries to check.
 * @returns Whether the POD entries are valid.
 * @throws If the POD entries are invalid.
 */
function checkPODEntries(
  podEntries: PODEntries
): podEntries is PODEntries & PODEmailPCDRequiredEntries {
  if (!podEntries.emailAddress) {
    throw new TypeError("emailAddress entry is missing");
  }

  if (!podEntries.semaphoreV4PublicKey) {
    throw new TypeError("semaphoreV4PublicKey entry is missing");
  }

  if (!podEntries.pod_type) {
    throw new TypeError("pod_type entry is missing");
  }

  if (typeof podEntries.emailAddress.value !== "string") {
    throw new TypeError("emailAddress entry is not a string");
  }

  if (podEntries.semaphoreV4PublicKey.type !== "eddsa_pubkey") {
    throw new TypeError(
      "semaphoreV4PublicKey entry is not an eddsa public key"
    );
  }

  if (
    podEntries.pod_type.type !== "string" ||
    podEntries.pod_type.value !== "zupass.email"
  ) {
    throw new TypeError(
      "pod_type entry is not a string with value 'zupass.email'"
    );
  }

  return true;
}

/**
 * Deserializes a PODEmailPCD.
 *
 * @param serialized - The serialized PODEmailPCD.
 * @returns The deserialized PODEmailPCD.
 * @throws If the deserialized PODEmailPCD is invalid.
 */
export async function deserialize(serialized: string): Promise<PODEmailPCD> {
  const wrapper = JSON.parse(serialized);
  const pod = POD.fromJSON(wrapper.pod);
  const podEntries = pod.content.asEntries();

  if (!checkPODEntries(podEntries)) {
    // This will never throw because `checkPODEntries` will either throw an
    // error or return true. However, it is necessary to include this for
    //the type checker.
    throw new Error("invalid pod entries");
  }

  return new PODEmailPCD(
    wrapper.id,
    {
      podEntries: podEntries,
      signerPublicKey: pod.signerPublicKey
    },
    { signature: pod.signature }
  );
}

/**
 * Gets the display options for a PODEmailPCD.
 *
 * @param pcd - The PODEmailPCD to get the display options for.
 * @returns The display options.
 */
export function getDisplayOptions(pcd: PODEmailPCD): DisplayOptions {
  return {
    header: "Verified Email",
    displayName: pcd.claim.podEntries.emailAddress.value
  };
}

/**
 * The PCD package for PODEmailPCD.
 */
export const PODEmailPCDPackage: PCDPackage<
  PODEmailPCDClaim,
  PODEmailPCDProof,
  PODEmailPCDArgs,
  undefined
> = {
  name: PODEmailPCDTypeName,
  getDisplayOptions,
  prove,
  verify,
  serialize,
  deserialize
};
