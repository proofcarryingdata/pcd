import { EdDSAPCD, EdDSAPCDPackage } from "@pcd/eddsa-pcd";
import { PCDCrypto } from "@pcd/passport-crypto";
import { ZupassUserJson } from "@pcd/passport-interface";
import { PCDCollection } from "@pcd/pcd-collection";
import { ArgumentTypeName } from "@pcd/pcd-types";
import { SemaphoreIdentityPCDPackage } from "@pcd/semaphore-identity-pcd";
import { Identity } from "@semaphore-protocol/identity";
import { expect } from "chai";
import { v4 as uuid } from "uuid";
import { randomEmail } from "../src/util";
import { ErrorReport, validateRunningAppState } from "../src/validateState";

function newEdSAPCD(): Promise<EdDSAPCD> {
  return EdDSAPCDPackage.prove({
    message: {
      value: ["0x12345", "0x54321", "0xdeadbeef"],
      argumentType: ArgumentTypeName.StringArray
    },
    privateKey: {
      value: "0001020304050607080900010203040506070809000102030405060708090001",
      argumentType: ArgumentTypeName.String
    },
    id: {
      value: undefined,
      argumentType: ArgumentTypeName.String
    }
  });
}

describe("validateAppState", async function () {
  this.timeout(60_000);

  const crypto = await PCDCrypto.newInstance();
  const saltAndEncryptionKey = await crypto.generateSaltAndEncryptionKey(
    "testpassword123!@#asdf"
  );
  const pcdPackages = [SemaphoreIdentityPCDPackage, EdDSAPCDPackage];
  const identity1 = new Identity(
    '["0xaa5fa3165e1ca129bd7a2b3bada18c5f81350faacf2edff59cf44eeba2e2d",' +
      '"0xa944ed90153fc2be5759a0d18eda47266885aea0966ef4dbb96ff979c29ed4"]'
  );
  const commitment1 = identity1.commitment;
  const identity2 = new Identity(
    '["0x8526e030dbd593833f24bf73b60f0bcc58690c590b9953acc741f2eb71394d",' +
      '"0x520e4ae6f5d5e4526dd517e61defe16f90bd4aef72b41394285e77463e0c69"]'
  );
  const commitment2 = identity2.commitment;
  const identity3 = new Identity(
    '["0x4837c6f88904d1dfefcb7dc6486e95c06cda6eb76d76a9888167c0993e40f0",' +
      '"0x956f9e03b0cc324045d24f9b20531e547272fab8e8ee2f96c0cf2e50311468"]'
  );
  const commitment3 = identity3.commitment;

  it("logged out ; no errors", async function () {
    expect(
      validateRunningAppState(TAG_STR, undefined, undefined, undefined)
    ).to.deep.eq({
      errors: [],
      userUUID: undefined,
      ...TAG
    } satisfies ErrorReport);
  });

  it("logged out ; forceCheckPCDs=true; test of all error states", async function () {
    expect(
      validateRunningAppState(
        TAG_STR,
        undefined,
        undefined,
        new PCDCollection(pcdPackages),
        true
      )
    ).to.deep.eq({
      errors: [
        "'pcds' contains no pcds",
        "'pcds' field in app state does not contain an identity PCD"
      ],
      userUUID: undefined,
      ...TAG
    } satisfies ErrorReport);

    expect(
      validateRunningAppState(
        TAG_STR,
        undefined,
        undefined,
        await (async (): Promise<PCDCollection> => {
          const collection = new PCDCollection(pcdPackages);
          collection.add(await newEdSAPCD());
          return collection;
        })(),
        true
      )
    ).to.deep.eq({
      errors: ["'pcds' field in app state does not contain an identity PCD"],
      userUUID: undefined,
      ...TAG
    } satisfies ErrorReport);

    const pcds = new PCDCollection(pcdPackages);
    pcds.add(
      await SemaphoreIdentityPCDPackage.prove({
        identity: identity1
      })
    );
    expect(
      validateRunningAppState(TAG_STR, undefined, undefined, pcds, true)
    ).to.deep.eq({
      errors: [],
      userUUID: undefined,
      ...TAG
    } satisfies ErrorReport);

    expect(
      validateRunningAppState(TAG_STR, undefined, undefined, undefined, true)
    ).to.deep.eq({
      errors: [
        "missing 'pcds'",
        "'pcds' field in app state does not contain an identity PCD"
      ],
      userUUID: undefined,
      ...TAG
    } satisfies ErrorReport);
  });

  it("logged in ; no errors", async function () {
    const self: ZupassUserJson = {
      commitment: identity1.commitment.toString(),
      email: randomEmail(),
      salt: saltAndEncryptionKey.salt,
      terms_agreed: 1,
      uuid: uuid()
    };
    let pcds = new PCDCollection(pcdPackages);
    pcds.add(
      await SemaphoreIdentityPCDPackage.prove({
        identity: identity1
      })
    );
    expect(validateRunningAppState(TAG_STR, self, identity1, pcds)).to.deep.eq({
      userUUID: self.uuid,
      errors: [],
      ...TAG
    } satisfies ErrorReport);

    // Extra identity PCD comes second and is ignored.
    pcds.add(
      await SemaphoreIdentityPCDPackage.prove({
        identity: identity2
      })
    );
    expect(validateRunningAppState(TAG_STR, self, identity1, pcds)).to.deep.eq({
      userUUID: self.uuid,
      errors: [],
      ...TAG
    } satisfies ErrorReport);

    // Extra identity PCD comes first and is ignored.
    pcds = new PCDCollection(pcdPackages);
    pcds.add(
      await SemaphoreIdentityPCDPackage.prove({
        identity: identity2
      })
    );
    pcds.add(
      await SemaphoreIdentityPCDPackage.prove({
        identity: identity1
      })
    );
    expect(validateRunningAppState(TAG_STR, self, identity1, pcds)).to.deep.eq({
      userUUID: self.uuid,
      errors: [],
      ...TAG
    } satisfies ErrorReport);
  });

  it("logged in ; empty pcd collection ; errors", async function () {
    const self: ZupassUserJson = {
      commitment: identity1.commitment.toString(),
      email: randomEmail(),
      salt: saltAndEncryptionKey.salt,
      terms_agreed: 1,
      uuid: uuid()
    };
    const pcds = new PCDCollection(pcdPackages);
    expect(validateRunningAppState(TAG_STR, self, identity1, pcds)).to.deep.eq({
      userUUID: self.uuid,
      errors: [
        "'pcds' contains no pcds",
        "'pcds' field in app state does not contain an identity PCD"
      ],
      ...TAG
    } satisfies ErrorReport);
  });

  it("logged in ; missing pcd collection ; errors", async function () {
    const self: ZupassUserJson = {
      commitment: identity1.commitment.toString(),
      email: randomEmail(),
      salt: saltAndEncryptionKey.salt,
      terms_agreed: 1,
      uuid: uuid()
    };
    expect(
      validateRunningAppState(TAG_STR, self, identity1, undefined)
    ).to.deep.eq({
      userUUID: self.uuid,
      errors: [
        "missing 'pcds'",
        "'pcds' field in app state does not contain an identity PCD"
      ],
      ...TAG
    } satisfies ErrorReport);
  });

  it("logged in ; missing identity ; errors", async function () {
    const self: ZupassUserJson = {
      commitment: identity1.commitment.toString(),
      email: randomEmail(),
      salt: saltAndEncryptionKey.salt,
      terms_agreed: 1,
      uuid: uuid()
    };
    const pcds = new PCDCollection(pcdPackages);
    pcds.add(
      await SemaphoreIdentityPCDPackage.prove({
        identity: identity1
      })
    );
    expect(validateRunningAppState(TAG_STR, self, undefined, pcds)).to.deep.eq({
      userUUID: self.uuid,
      errors: ["missing 'identity'"],
      ...TAG
    } satisfies ErrorReport);
  });

  it("logged in ; self missing commitment ; errors", async function () {
    const self: ZupassUserJson = {
      commitment: identity1.commitment.toString(),
      email: randomEmail(),
      salt: saltAndEncryptionKey.salt,
      terms_agreed: 1,
      uuid: uuid()
    };
    const pcds = new PCDCollection(pcdPackages);
    pcds.add(
      await SemaphoreIdentityPCDPackage.prove({
        identity: identity1
      })
    );
    delete self.commitment;
    expect(validateRunningAppState(TAG_STR, self, identity1, pcds)).to.deep.eq({
      userUUID: self.uuid,
      errors: ["'self' missing a commitment"],
      ...TAG
    } satisfies ErrorReport);
  });

  it("logged in ; self commitment wrong ; errors", async function () {
    const self: ZupassUserJson = {
      commitment: identity2.commitment.toString(),
      email: randomEmail(),
      salt: saltAndEncryptionKey.salt,
      terms_agreed: 1,
      uuid: uuid()
    };
    const pcds = new PCDCollection(pcdPackages);
    pcds.add(
      await SemaphoreIdentityPCDPackage.prove({
        identity: identity1
      })
    );
    expect(validateRunningAppState(TAG_STR, self, identity1, pcds)).to.deep.eq({
      userUUID: self.uuid,
      errors: [
        `commitment of identity pcd in collection (${commitment1}) does not match commitment in 'self' field of app state (${commitment2})`,
        `commitment in 'self' field of app state (${commitment2}) does not match commitment of 'identity' field of app state (${commitment1})`
      ],
      ...TAG
    } satisfies ErrorReport);
  });

  it("logged in ; pcd collection identity wrong ; errors", async function () {
    const self: ZupassUserJson = {
      commitment: identity1.commitment.toString(),
      email: randomEmail(),
      salt: saltAndEncryptionKey.salt,
      terms_agreed: 1,
      uuid: uuid()
    };
    const pcds = new PCDCollection(pcdPackages);
    pcds.add(
      await SemaphoreIdentityPCDPackage.prove({
        identity: identity2
      })
    );
    expect(validateRunningAppState(TAG_STR, self, identity1, pcds)).to.deep.eq({
      userUUID: self.uuid,
      errors: [
        `commitment of identity pcd in collection (${commitment2}) does not match commitment in 'self' field of app state (${commitment1})`,
        `commitment of 'identity' field of app state (${commitment1}) does not match commitment of identity pcd in collection (${commitment2})`
      ],
      ...TAG
    } satisfies ErrorReport);
  });

  it("logged in ; appState identity wrong ; errors", async function () {
    const self: ZupassUserJson = {
      commitment: identity1.commitment.toString(),
      email: randomEmail(),
      salt: saltAndEncryptionKey.salt,
      terms_agreed: 1,
      uuid: uuid()
    };
    const pcds = new PCDCollection(pcdPackages);
    pcds.add(
      await SemaphoreIdentityPCDPackage.prove({
        identity: identity1
      })
    );
    expect(validateRunningAppState(TAG_STR, self, identity2, pcds)).to.deep.eq({
      userUUID: self.uuid,
      errors: [
        `commitment in 'self' field of app state (${commitment1}) does not match commitment of 'identity' field of app state (${commitment2})`,
        `commitment of 'identity' field of app state (${commitment2}) does not match commitment of identity pcd in collection (${commitment1})`
      ],
      ...TAG
    } satisfies ErrorReport);
  });

  it("logged in ; all identities mistmatched ; errors", async function () {
    const self: ZupassUserJson = {
      commitment: identity1.commitment.toString(),
      email: randomEmail(),
      salt: saltAndEncryptionKey.salt,
      terms_agreed: 1,
      uuid: uuid()
    };
    const pcds = new PCDCollection(pcdPackages);
    pcds.add(
      await SemaphoreIdentityPCDPackage.prove({
        identity: identity2
      })
    );
    expect(validateRunningAppState(TAG_STR, self, identity3, pcds)).to.deep.eq({
      userUUID: self.uuid,
      errors: [
        `commitment of identity pcd in collection (${commitment2}) does not match commitment in 'self' field of app state (${commitment1})`,
        `commitment in 'self' field of app state (${commitment1}) does not match commitment of 'identity' field of app state (${commitment3})`,
        `commitment of 'identity' field of app state (${commitment3}) does not match commitment of identity pcd in collection (${commitment2})`
      ],
      ...TAG
    } satisfies ErrorReport);
  });
});

const TAG_STR = "test";
const TAG = { tag: TAG_STR };
