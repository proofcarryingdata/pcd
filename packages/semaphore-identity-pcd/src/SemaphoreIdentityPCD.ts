import { PCD, PCDPackage, SerializedPCD } from "@pcd/pcd-types";
import { Identity } from "@semaphore-protocol/identity";
import JSONBig from "json-bigint";
import { v4 as uuid } from "uuid";

export const SemaphoreIdentityPCDTypeName = "semaphore-identity-pcd";

export interface SemaphoreIdentityPCDArgs {
  identity: Identity;
}

export interface SemaphoreIdentityPCDClaim {
  identity: Identity;
}

export type SemaphoreIdentityPCDProof = undefined;

export class SemaphoreIdentityPCD
  implements PCD<SemaphoreIdentityPCDClaim, SemaphoreIdentityPCDProof>
{
  id = uuid();
  type = SemaphoreIdentityPCDTypeName;
  claim: SemaphoreIdentityPCDClaim;
  proof: SemaphoreIdentityPCDProof;

  public constructor(claim: SemaphoreIdentityPCDClaim) {
    this.claim = claim;
    this.proof = undefined;
  }
}

export async function prove(
  args: SemaphoreIdentityPCDArgs
): Promise<SemaphoreIdentityPCD> {
  return new SemaphoreIdentityPCD({ identity: args.identity });
}

export async function verify(pcd: SemaphoreIdentityPCD): Promise<boolean> {
  return pcd?.claim?.identity !== undefined;
}

export async function serialize(
  pcd: SemaphoreIdentityPCD
): Promise<SerializedPCD> {
  return {
    type: SemaphoreIdentityPCDTypeName,
    pcd: JSONBig.stringify({
      type: pcd.type,
      identity: pcd.claim.identity.toString(),
    }),
  };
}

export async function deserialize(
  serialized: string
): Promise<SemaphoreIdentityPCD> {
  const parsed = JSONBig.parse(serialized);
  return new SemaphoreIdentityPCD({
    identity: new Identity(parsed.identity),
  });
}

/**
 * PCD-conforming wrapper for the Semaphore zero-knowledge protocol. You can
 * find documentation of Semaphore here: https://semaphore.appliedzkp.org/docs/introduction
 */
export const SemaphoreIdentityPCDPackage: PCDPackage<
  SemaphoreIdentityPCDClaim,
  SemaphoreIdentityPCDProof,
  SemaphoreIdentityPCDArgs
> = {
  name: SemaphoreIdentityPCDTypeName,
  prove,
  verify,
  serialize,
  deserialize,
};
