import { PCDCrypto } from "@pcd/passport-crypto";
import { ZupassUserJson } from "@pcd/passport-interface";
import { PCDCollection } from "@pcd/pcd-collection";
import { SemaphoreIdentityPCDPackage } from "@pcd/semaphore-identity-pcd";
import { Identity } from "@semaphore-protocol/identity";
import { v4 as uuid } from "uuid";
import { randomEmail } from "../src/util";
import { validateAppState } from "../src/validateState";

describe("validateAppState", async function () {
  const crypto = await PCDCrypto.newInstance();
  const pcdPackages = [SemaphoreIdentityPCDPackage];

  it("validateState works properly", async function () {
    const identity = new Identity();
    const saltAndEncryptionKey = await crypto.generateSaltAndEncryptionKey(
      "testpassword123!@#asdf"
    );
    const self: ZupassUserJson = {
      commitment: identity.commitment.toString(),
      email: randomEmail(),
      salt: saltAndEncryptionKey.salt,
      terms_agreed: 1,
      uuid: uuid()
    };
    const pcds = new PCDCollection(pcdPackages);
    pcds.add(
      await SemaphoreIdentityPCDPackage.prove({
        identity
      })
    );
    const errors = validateAppState(self, identity, pcds);

    console.log(errors);
  });
});
