import { PCDCollection } from "@pcd/pcd-collection";
import { ArgumentTypeName } from "@pcd/pcd-types";
import { decodePrivateKey } from "@pcd/pod";
import { PODPCDPackage } from "@pcd/pod-pcd";
import {
  IdentityV3,
  SemaphoreIdentityPCD,
  SemaphoreIdentityPCDPackage
} from "@pcd/semaphore-identity-pcd";
import {
  SemaphoreIdentityV4PCDPackage,
  v3tov4IdentityPCD,
  v4PrivateKey,
  v4PublicKey
} from "@pcd/semaphore-identity-v4";
import { SemaphoreSignaturePCDPackage } from "@pcd/semaphore-signature-pcd";
import { randomUUID } from "@pcd/util";

import { expect } from "chai";
import "mocha";
import * as path from "path";
import {
  makeUpgradeUserWithV4CommitmentRequest,
  V4MigrationVerification,
  verifyAddV4CommitmentRequestPCD
} from "../src/api/requestUpgradeUserWithV4Commitment";

const zkeyFilePath: string = path.join(
  __dirname,
  "../../../pcd/semaphore-signature-pcd/artifacts/16.zkey"
);
const wasmFilePath: string = path.join(
  __dirname,
  "../../../pcd/semaphore-signature-pcd/artifacts/16.wasm"
);

describe("V3ToV4Migration", async function () {
  this.beforeAll(async function () {
    await SemaphoreSignaturePCDPackage.init?.({
      zkeyFilePath,
      wasmFilePath
    });
  });

  it("V3ToV4Migration", async function () {
    const v3Id = new SemaphoreIdentityPCD(randomUUID(), {
      identity: new IdentityV3()
    });
    const v4Id = v3tov4IdentityPCD(v3Id);
    const v4Id2 = v3tov4IdentityPCD(v3Id); // check it's deterministic
    expect(v4Id.claim.identity.export()).to.eq(v4Id2.claim.identity.export());

    const rightPCDs = new PCDCollection(
      [SemaphoreIdentityPCDPackage, SemaphoreIdentityV4PCDPackage],
      [v3Id, v4Id]
    );

    const migrationRequest =
      await makeUpgradeUserWithV4CommitmentRequest(rightPCDs);
    const migrationPCD = await SemaphoreSignaturePCDPackage.deserialize(
      migrationRequest.pcd.pcd
    );
    const verified = await verifyAddV4CommitmentRequestPCD(migrationPCD);
    expect(verified).to.deep.eq({
      v3Commitment: v3Id.claim.identity.commitment.toString(),
      v4PublicKey: v4PublicKey(v4Id.claim.identity),
      v4Commitment: v4Id.claim.identity.commitment.toString()
    } satisfies V4MigrationVerification);
  });

  it("V3ToV4Migration wrong v3 identity should not verify", async function () {
    const v3Id = new SemaphoreIdentityPCD(randomUUID(), {
      identity: new IdentityV3()
    });
    const v4Id = v3tov4IdentityPCD(v3Id);

    const v4SigOfV3Claim = await PODPCDPackage.prove({
      entries: {
        argumentType: ArgumentTypeName.Object,
        value: {
          mySemaphoreV3Commitment: {
            type: "cryptographic",
            value: 1n
          },
          pod_type: {
            type: "string",
            value: "zupass_semaphore_v4_migration"
          }
        }
      },
      privateKey: {
        argumentType: ArgumentTypeName.String,
        value: v4PrivateKey(v4Id.claim.identity)
      },
      id: {
        argumentType: ArgumentTypeName.String,
        value: randomUUID()
      }
    });

    const migrationPCD = await SemaphoreSignaturePCDPackage.prove({
      identity: {
        argumentType: ArgumentTypeName.PCD,
        value: await SemaphoreIdentityPCDPackage.serialize(v3Id)
      },
      signedMessage: {
        argumentType: ArgumentTypeName.String,
        value: JSON.stringify(await PODPCDPackage.serialize(v4SigOfV3Claim))
      }
    });

    const verified = await verifyAddV4CommitmentRequestPCD(migrationPCD);
    expect(verified).to.deep.eq(undefined);
  });

  it("V3ToV4Migration wrong pod type should not verify", async function () {
    const v3Id = new SemaphoreIdentityPCD(randomUUID(), {
      identity: new IdentityV3()
    });
    const v4Id = v3tov4IdentityPCD(v3Id);

    const v4SigOfV3Claim = await PODPCDPackage.prove({
      entries: {
        argumentType: ArgumentTypeName.Object,
        value: {
          mySemaphoreV3Commitment: {
            type: "cryptographic",
            value: v3Id.claim.identity.commitment
          },
          pod_type: {
            type: "string",
            value: "zupass_semaphore_v4_migration XD"
          }
        }
      },
      privateKey: {
        argumentType: ArgumentTypeName.String,
        value: v4PrivateKey(v4Id.claim.identity)
      },
      id: {
        argumentType: ArgumentTypeName.String,
        value: randomUUID()
      }
    });

    const migrationPCD = await SemaphoreSignaturePCDPackage.prove({
      identity: {
        argumentType: ArgumentTypeName.PCD,
        value: await SemaphoreIdentityPCDPackage.serialize(v3Id)
      },
      signedMessage: {
        argumentType: ArgumentTypeName.String,
        value: JSON.stringify(await PODPCDPackage.serialize(v4SigOfV3Claim))
      }
    });

    const verified = await verifyAddV4CommitmentRequestPCD(migrationPCD);
    expect(verified).to.deep.eq(undefined);
  });

  it("V3ToV4Migration is deterministic", async function () {
    const serializedV3Identity =
      '["0xb3003134d5aeaca667168d3e53e12fa7eb683e67d6bb9ce33e0e106417a875","0x349f66df87b20e111f1cb7c14fc527a386afd74f4d345850269c1eb0b3ae9b"]';
    const parsedV3Identity = new IdentityV3(serializedV3Identity);
    const uuid = "bd5a2ee5-dde2-43df-9642-9d50dea10c4e";

    expect(serializedV3Identity).to.eq(parsedV3Identity.toString());

    const v3Id = new SemaphoreIdentityPCD(uuid, {
      identity: parsedV3Identity
    });

    const v4Id = v3tov4IdentityPCD(v3Id);
    expect(v4Id.claim.identity.export()).to.eq(
      "T2UZ7xc1/IG8ipSzJGvlSBJiN5eylpAhgII2vWA44sI="
    );

    const privateKey = decodePrivateKey(v4Id.claim.identity.export());
    expect(privateKey.length).to.eq(32);
  });
});