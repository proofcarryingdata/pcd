import { ArgumentTypeName } from "@pcd/pcd-types";
import { decodePrivateKey, encodePublicKey } from "@pcd/pod";
import { derivePublicKey } from "@zk-kit/eddsa-poseidon";
import { expect } from "chai";
import crypto from "crypto";
import "mocha";
import { PODEmailPCD } from "../src/PODEmailPCD";
import { PODEmailPCDPackage } from "../src/PODEmailPCDPackage";

function generateRandomHex(byteLength: number): string {
  const randomBytes = crypto.randomBytes(byteLength);
  return randomBytes.toString("hex");
}

function generateKeyPair(): { privateKey: string; publicKey: string } {
  const privateKey = generateRandomHex(32);
  const publicKey = encodePublicKey(
    derivePublicKey(decodePrivateKey(privateKey))
  );
  return { privateKey, publicKey };
}

describe("POD Email PCD should work", function () {
  let podEmailPCD: PODEmailPCD;
  let stableEmailPCD: PODEmailPCD;

  const prvKey = generateKeyPair().privateKey;
  const emailAddress = "user@test.com";
  const semaphoreV4PublicKey = generateKeyPair().publicKey;
  const otherEmail = "someuser@example.com";
  const otherSemaphoreV4PublicKey = generateKeyPair().publicKey;
  const stableId = "pod-attested-email-" + otherEmail;

  this.beforeAll(async () => {
    podEmailPCD = await PODEmailPCDPackage.prove({
      emailAddress: {
        value: emailAddress,
        argumentType: ArgumentTypeName.String
      },
      semaphoreV4PublicKey: {
        value: semaphoreV4PublicKey,
        argumentType: ArgumentTypeName.String
      },
      privateKey: {
        value: prvKey,
        argumentType: ArgumentTypeName.String
      },
      id: {
        value: undefined,
        argumentType: ArgumentTypeName.String
      }
    });
  });

  it("should reflect prove args", async function () {
    expect(podEmailPCD.claim.podEntries.emailAddress.type).to.eq("string");
    expect(podEmailPCD.claim.podEntries.emailAddress.value).to.eq(emailAddress);
    expect(podEmailPCD.claim.podEntries.semaphoreV4PublicKey.type).to.eq(
      "eddsa_pubkey"
    );
    expect(podEmailPCD.claim.podEntries.semaphoreV4PublicKey.value).to.eq(
      semaphoreV4PublicKey
    );

    expect(podEmailPCD.claim.podEntries.pod_type.type).to.eq("string");
    expect(podEmailPCD.claim.podEntries.pod_type.value).to.eq("zupass.email");
    expect(podEmailPCD.id).to.not.be.empty;
  });

  it("should be able to create and verify a signed email", async function () {
    expect(await PODEmailPCDPackage.verify(podEmailPCD)).to.be.true;
  });

  it("should be possible to serialize and deserialize the pcd", async function () {
    const serialized = await PODEmailPCDPackage.serialize(podEmailPCD);
    const deserialized = await PODEmailPCDPackage.deserialize(serialized.pcd);
    expect(deserialized).to.deep.eq(podEmailPCD);
  });

  it("should accept stable ID", async function () {
    stableEmailPCD = await PODEmailPCDPackage.prove({
      emailAddress: {
        value: otherEmail,
        argumentType: ArgumentTypeName.String
      },
      semaphoreV4PublicKey: {
        value: otherSemaphoreV4PublicKey,
        argumentType: ArgumentTypeName.String
      },
      privateKey: {
        value: prvKey,
        argumentType: ArgumentTypeName.String
      },
      id: {
        value: stableId,
        argumentType: ArgumentTypeName.String
      }
    });

    expect(stableEmailPCD.id).to.eq(stableId);
    expect(stableEmailPCD.claim.podEntries.emailAddress.value).to.eq(
      otherEmail
    );
    expect(stableEmailPCD.claim.podEntries.semaphoreV4PublicKey.value).to.eq(
      otherSemaphoreV4PublicKey
    );

    const serialized = await PODEmailPCDPackage.serialize(stableEmailPCD);
    const deserialized = await PODEmailPCDPackage.deserialize(serialized.pcd);
    expect(deserialized).to.deep.eq(stableEmailPCD);
  });

  it("should be identical with same stable ID", async function () {
    const stableEmailPCD2 = await PODEmailPCDPackage.prove({
      emailAddress: {
        value: otherEmail,
        argumentType: ArgumentTypeName.String
      },
      semaphoreV4PublicKey: {
        value: otherSemaphoreV4PublicKey,
        argumentType: ArgumentTypeName.String
      },
      privateKey: {
        value: prvKey,
        argumentType: ArgumentTypeName.String
      },
      id: {
        value: stableId,
        argumentType: ArgumentTypeName.String
      }
    });

    expect(stableEmailPCD2.id).to.eq(stableId);
    expect(stableEmailPCD2.claim.podEntries.emailAddress.value).to.eq(
      otherEmail
    );
    expect(stableEmailPCD2.claim.podEntries.semaphoreV4PublicKey.value).to.eq(
      otherSemaphoreV4PublicKey
    );
    expect(stableEmailPCD2).to.deep.eq(stableEmailPCD);

    const serialized1 = await PODEmailPCDPackage.serialize(stableEmailPCD);
    const serialized2 = await PODEmailPCDPackage.serialize(stableEmailPCD2);
    expect(serialized1).to.deep.eq(serialized2);
    const deserialized1 = await PODEmailPCDPackage.deserialize(serialized1.pcd);
    const deserialized2 = await PODEmailPCDPackage.deserialize(serialized2.pcd);
    expect(deserialized2).to.deep.eq(deserialized1);
  });
});
