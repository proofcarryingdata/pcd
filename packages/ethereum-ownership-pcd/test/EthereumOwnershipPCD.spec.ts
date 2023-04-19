/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { ArgumentTypeName } from "@pcd/pcd-types";
import {
  SemaphoreIdentityPCDPackage,
  SemaphoreIdentityPCDTypeName,
} from "@pcd/semaphore-identity-pcd";
import { SemaphoreSignaturePCDPackage } from "@pcd/semaphore-signature-pcd";
import { Identity } from "@semaphore-protocol/identity";
import { ethers } from "ethers";
import * as path from "path";
import { EthereumOwnershipPCDPackage } from "../src/EthereumOwnershipPCD";

const zkeyFilePath: string = path.join(__dirname, "../artifacts/16.zkey");
const wasmFilePath: string = path.join(__dirname, "../artifacts/16.wasm");

describe("semaphore signature PCD should work", function () {
  this.beforeAll(async function () {
    await SemaphoreSignaturePCDPackage.init!({
      zkeyFilePath,
      wasmFilePath,
    });
  });

  it("should work", async function () {
    const wallet = ethers.Wallet.createRandom(null);
    const identity = await SemaphoreIdentityPCDPackage.prove({
      identity: new Identity(),
    });
    const serializedIdentity = await SemaphoreIdentityPCDPackage.serialize(
      identity
    );
    const signatureOfIdentityCommitment = await wallet.signMessage(
      new TextEncoder().encode(identity.claim.identity.commitment.toString())
    );

    const proof = await EthereumOwnershipPCDPackage.prove({
      ethereumAddress: {
        argumentType: ArgumentTypeName.String,
        value: wallet.address,
      },
      ethereumSignatureOfCommitment: {
        argumentType: ArgumentTypeName.String,
        value: signatureOfIdentityCommitment,
      },
      identity: {
        argumentType: ArgumentTypeName.PCD,
        pcdType: SemaphoreIdentityPCDTypeName,
        value: serializedIdentity,
      },
      identityCommitment: {
        argumentType: ArgumentTypeName.String,
        value: identity.claim.identity.commitment.toString(),
      },
    });

    console.log(proof);
  });
});
