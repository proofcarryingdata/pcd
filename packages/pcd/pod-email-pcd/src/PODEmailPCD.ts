import type { PCD, StringArgument } from "@pcd/pcd-types";
import type {
  PODEdDSAPublicKeyValue,
  PODEntries,
  PODStringValue
} from "@pcd/pod";

export const PODEmailPCDTypeName = "pod-email-pcd";

export type PODEmailPCDArgs = {
  /**
   * The signer's EdDSA private key.  This is a 32-byte value used to sign the
   * message.  See {@link @pcd/pod!decodePrivateKey} in `@pcd/pod` if you need
   * to manipulate or convert this value.
   */
  privateKey: StringArgument;

  /**
   * The verified email address
   */
  emailAddress: StringArgument;

  /**
   * The signer's semaphore v4 public key
   * See {@link @pcd/pod!encodePublicKey} for details of the string format.
   */
  semaphoreV4PublicKey: StringArgument;

  /**
   * A unique string identifying the PCD
   */
  id: StringArgument;
};

/**
 * A concrete POD value which indicates that this is an email POD.
 */
interface EmailPODTypeValue extends PODStringValue {
  value: "zupass.email";
}

/**
 * The POD entries which must be present in a PODEmailPCD.
 * By extending `PODEntries`, we allow for additional entries beyond those
 * required by the email POD.
 */
export interface PODEmailPCDRequiredEntries extends PODEntries {
  emailAddress: PODStringValue;
  semaphoreV4PublicKey: PODEdDSAPublicKeyValue;
  pod_type: EmailPODTypeValue;
}

/**
 * The claim for a PODEmailPCD.
 *
 * We include the `podEntries` field to allow for extensions to the POD in the
 * future. The type indicates that certain entries are required, but does not
 * indicate that there are no additional entries.
 *
 * Because our PCD includes the full set of entries, it is always possible to
 * reconstruct the POD that was used to produce the signature, even if other
 * logic changes.
 */
export interface PODEmailPCDClaim {
  podEntries: PODEmailPCDRequiredEntries;
  signerPublicKey: string;
}

export interface PODEmailPCDProof {
  signature: string;
}

export class PODEmailPCD implements PCD<PODEmailPCDClaim, PODEmailPCDProof> {
  type = PODEmailPCDTypeName;
  claim: PODEmailPCDClaim;
  proof: PODEmailPCDProof;
  id: string;

  constructor(id: string, claim: PODEmailPCDClaim, proof: PODEmailPCDProof) {
    this.id = id;
    this.claim = claim;
    this.proof = proof;
  }
}
