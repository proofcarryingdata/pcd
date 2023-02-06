import {
  bytesToBigInt,
  stringToBytes,
  toCircomBigIntBytes,
} from "../binaryFormat";
import {
  MAGIC_DOUBLE_BLIND_BASE_MESSAGE,
  MAGIC_DOUBLE_BLIND_BASE_MESSAGE_LEN,
  CIRCOM_FIELD_MODULUS,
} from "../constants";
import { initializePoseidon, poseidon, poseidonK } from "../poseidonHash";
import { verifyRSA } from "../rsa";
import { shaHash } from "../shaHash";
import { getRawSignature, sshSignatureToPubKey } from "../sshFormat";
import { IGroupMessage, IGroupSignature, IIdentityRevealer } from "./types";
// @ts-ignore
import * as snarkjs from "snarkjs";
import localforage from "localforage";
import { resolveGroupIdentifierTree } from "./resolveGroupIdentifier";
import { getMerkleProof } from "../merkle";

interface ICircuitInputs {
  modulus: string[];
  signature: string[];
  base_message: string[];
}

export async function getCircuitInputs(
  sshSignature: string
): Promise<ICircuitInputs> {
  await initializePoseidon();
  let rawSignature: any, pubKeyParts: any;

  const rawSig = getRawSignature(sshSignature);
  rawSignature = rawSig.rawSignature;
  pubKeyParts = rawSig.pubKeyParts;

  const modulusBigInt = bytesToBigInt(pubKeyParts[2]);
  const signatureBigInt = bytesToBigInt(rawSignature);
  const baseMessageBigInt = MAGIC_DOUBLE_BLIND_BASE_MESSAGE;

  return {
    modulus: toCircomBigIntBytes(modulusBigInt),
    signature: toCircomBigIntBytes(signatureBigInt),
    base_message: toCircomBigIntBytes(baseMessageBigInt),
  };
}

export async function generateGroupSignature(
  circuitInputs: ICircuitInputs,
  groupMessage: IGroupMessage,
  signerId: string
): Promise<IGroupSignature> {
  const wasmFile = "rsa_group_sig_verify.wasm";
  const zkeyBuff: ArrayBuffer | null = await localforage.getItem(
    "rsa_group_sig_verify_0000.zkey"
  );
  if (!zkeyBuff) {
    throw new Error("Must complete setup to generate signatures.");
  }

  const { proof, publicSignals } = await snarkjs.groth16.fullProve(
    circuitInputs,
    wasmFile,
    new Uint8Array(zkeyBuff) // See https://github.dev/iden3/fastfile/blob/d02262bce0b74357e86aac143a0b6330a8ab0897/src/fastfile.js#L51-L52 for formats
  );
  console.log(publicSignals);
  return {
    zkProof: proof,
    signerId: signerId,
    groupMessage,
  };
}
