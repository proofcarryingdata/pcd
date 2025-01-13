import { arrayBufferToBase64, base64ToArrayBuffer } from "@pcd/passport-crypto";
import { DisplayOptions, PCDPackage, SerializedPCD } from "@pcd/pcd-types";
import { requireDefinedParameter } from "@pcd/util";
import { startAuthentication } from "@simplewebauthn/browser";
import {
  generateAuthenticationOptions,
  verifyAuthenticationResponse
} from "@simplewebauthn/server";
import JSONBig from "json-bigint";
import { v4 as uuid } from "uuid";
import {
  WebAuthnPCD,
  WebAuthnPCDArgs,
  WebAuthnPCDClaim,
  WebAuthnPCDProof,
  WebAuthnPCDTypeName
} from "./WebAuthnPCD";

export async function prove(args: WebAuthnPCDArgs): Promise<WebAuthnPCD> {
  const authenticationOptions = await generateAuthenticationOptions({
    rpID: args.rpID,
    challenge: args.challenge,
    allowCredentials: [
      // {
      //   id: args.authenticator.credentialID,
      //   type: "public-key"
      // }
    ]
  });
  const authenticationResponseJSON = await startAuthentication(
    authenticationOptions
  );
  const claim: WebAuthnPCDClaim = {
    rpID: args.rpID,
    origin: args.origin,
    credentialDetails: {
      credentialID: arrayBufferToBase64(args.authenticator.credentialID),
      credentialPublicKey: arrayBufferToBase64(
        args.authenticator.credentialPublicKey
      ),
      counter: args.authenticator.counter,
      transports: args.authenticator.transports
    },
    challenge: args.challenge
  };
  const proof = authenticationResponseJSON;
  return new WebAuthnPCD(uuid(), claim, proof);
}

export async function verify(pcd: WebAuthnPCD): Promise<boolean> {
  const { verified } = await verifyAuthenticationResponse({
    response: pcd.proof,
    expectedChallenge: Buffer.from(pcd.claim.challenge)
      .toString("base64")
      .replace(/=+$/, ""),
    expectedOrigin: pcd.claim.origin,
    expectedRPID: pcd.claim.rpID,
    authenticator: {
      credentialID: base64ToArrayBuffer(
        pcd.claim.credentialDetails.credentialID
      ),
      credentialPublicKey: base64ToArrayBuffer(
        pcd.claim.credentialDetails.credentialPublicKey
      ),
      counter: pcd.claim.credentialDetails.counter,
      transports: pcd.claim.credentialDetails.transports
    }
  });
  return verified;
}

export async function serialize(
  pcd: WebAuthnPCD
): Promise<SerializedPCD<WebAuthnPCD>> {
  return {
    type: WebAuthnPCDTypeName,
    pcd: JSONBig().stringify(pcd)
  } as SerializedPCD<WebAuthnPCD>;
}

export async function deserialize(serialized: string): Promise<WebAuthnPCD> {
  const { id, claim, proof } = JSONBig().parse(serialized);

  requireDefinedParameter(id, "id");
  requireDefinedParameter(claim, "claim");
  requireDefinedParameter(proof, "proof");

  return new WebAuthnPCD(id, claim, proof);
}

export function getDisplayOptions(pcd: WebAuthnPCD): DisplayOptions {
  return {
    header: "WebAuthn Credential Signature",
    displayName: "webauthn-" + pcd.id.substring(0, 4)
  };
}

/**
 * PCD-conforming wrapper for the Semaphore zero-knowledge protocol. You can
 * find documentation of Semaphore here: https://semaphore.appliedzkp.org/docs/introduction
 */
export const WebAuthnPCDPackage: PCDPackage<
  WebAuthnPCDClaim,
  WebAuthnPCDProof,
  // @ts-expect-error https://github.com/proofcarryingdata/zupass/issues/830
  WebAuthnPCDArgs
> = {
  name: WebAuthnPCDTypeName,
  prove,
  verify,
  serialize,
  deserialize,
  getDisplayOptions
};
