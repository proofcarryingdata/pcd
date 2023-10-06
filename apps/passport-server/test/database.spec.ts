import { ZuzaluUserRole } from "@pcd/passport-interface";
import { Identity } from "@semaphore-protocol/identity";
import assert from "assert";
import { expect } from "chai";
import "mocha";
import { step } from "mocha-steps";
import { Pool } from "postgres-pool";
import { ZuzaluPretixTicket } from "../src/database/models";
import { getDB } from "../src/database/postgresPool";
import {
  CacheEntry,
  deleteExpiredCacheEntries,
  getCacheSize,
  getCacheValue,
  setCacheValue
} from "../src/database/queries/cache";
import {
  fetchEncryptedStorage,
  insertEncryptedStorage,
  rekeyEncryptedStorage
} from "../src/database/queries/e2ee";
import {
  fetchEmailToken,
  insertEmailToken
} from "../src/database/queries/emailToken";
import { upsertUser } from "../src/database/queries/saveUser";
import {
  deleteUserByEmail,
  fetchAllUsers,
  fetchUserByCommitment,
  fetchUserByEmail
} from "../src/database/queries/users";
import { deleteZuzaluTicket } from "../src/database/queries/zuzalu_pretix_tickets/deleteZuzaluUser";
import {
  fetchAllLoggedInZuzaluUsers,
  fetchLoggedInZuzaluUser,
  fetchZuzaluUser
} from "../src/database/queries/zuzalu_pretix_tickets/fetchZuzaluUser";
import { insertZuzaluPretixTicket } from "../src/database/queries/zuzalu_pretix_tickets/insertZuzaluPretixTicket";
import { updateZuzaluPretixTicket } from "../src/database/queries/zuzalu_pretix_tickets/updateZuzaluPretixTicket";
import { sqlQuery } from "../src/database/sqlQuery";
import { randomEmailToken } from "../src/util/util";
import { overrideEnvironment, testingEnv } from "./util/env";
import { randomEmail } from "./util/util";

describe("database reads and writes", function () {
  this.timeout(15_000);

  let db: Pool;
  let testTicket: ZuzaluPretixTicket;
  let otherRole: ZuzaluUserRole;

  this.beforeAll(async () => {
    await overrideEnvironment(testingEnv);
    db = await getDB();
  });

  this.afterAll(async () => {
    await db.end();
  });

  step("database should initialize", async function () {
    expect(db).to.not.eq(null);
  });

  step("email tokens should work as expected", async function () {
    const testEmail = randomEmail();
    const testToken = randomEmailToken();
    await insertEmailToken(db, { email: testEmail, token: testToken });
    const insertedToken = await fetchEmailToken(db, testEmail);
    expect(insertedToken).to.eq(testToken);

    const newToken = randomEmailToken();
    await insertEmailToken(db, { email: testEmail, token: newToken });
    const newInsertedToken = await fetchEmailToken(db, testEmail);
    expect(newToken).to.eq(newInsertedToken);
  });

  step("inserting and reading a zuzalu ticket should work", async function () {
    testTicket = {
      email: randomEmail(),
      name: "bob shmob",
      order_id: "ASD12",
      role: ZuzaluUserRole.Organizer,
      visitor_date_ranges: null
    };
    otherRole = ZuzaluUserRole.Visitor;

    await insertZuzaluPretixTicket(db, testTicket);

    const insertedUser = await fetchZuzaluUser(db, testTicket.email);
    if (!insertedUser) {
      throw new Error("user didn't insert properly");
    }

    expect(insertedUser.email).to.eq(testTicket.email);
    expect(insertedUser.name).to.eq(testTicket.name);
    expect(insertedUser.order_id).to.eq(testTicket.order_id);
    expect(insertedUser.role).to.eq(testTicket.role);
    expect(insertedUser.visitor_date_ranges).to.deep.eq(
      testTicket.visitor_date_ranges
    );
    expect(insertedUser.uuid).to.be.null;
    expect(insertedUser.commitment).to.be.null;
  });

  step(
    "adding a commitment corresponding to a zuzalu ticket " +
      "should signify that that zuzalu user is logged in",
    async function () {
      const newIdentity = new Identity();
      const newCommitment = newIdentity.commitment.toString();
      const newUuid = await upsertUser(db, {
        email: testTicket.email,
        commitment: newCommitment
      });

      const loggedinUser = await fetchLoggedInZuzaluUser(db, { uuid: newUuid });
      if (!loggedinUser) {
        throw new Error("user didn't insert properly");
      }

      expect(loggedinUser).to.not.eq(null);
      expect(loggedinUser.email).to.eq(testTicket.email);
      expect(loggedinUser.name).to.eq(testTicket.name);
      expect(loggedinUser.order_id).to.eq(testTicket.order_id);
      expect(loggedinUser.role).to.eq(testTicket.role);
      expect(loggedinUser.visitor_date_ranges).to.deep.eq(
        testTicket.visitor_date_ranges
      );
      expect(loggedinUser.uuid).to.eq(newUuid);
      expect(loggedinUser.commitment).to.eq(newCommitment);

      const allZuzaluUsers = await fetchAllLoggedInZuzaluUsers(db);
      expect(allZuzaluUsers).to.deep.eq([loggedinUser]);

      expect(await fetchZuzaluUser(db, testTicket.email)).to.deep.eq(
        await fetchLoggedInZuzaluUser(db, { uuid: loggedinUser.uuid })
      );
    }
  );

  step(
    "able to fetch commitment separately from logged in user",
    async function () {
      const loggedinUser = await fetchZuzaluUser(db, testTicket.email);
      const commitment = await fetchUserByEmail(db, testTicket.email);

      if (!loggedinUser || !commitment) {
        throw new Error("couldn't find user or commitment");
      }

      expect(loggedinUser.commitment).to.eq(commitment.commitment);
      expect(loggedinUser.email).to.eq(commitment.email);

      const allUsers = await fetchAllUsers(db);
      expect(allUsers).to.deep.eq([commitment]);
    }
  );

  step("updating a zuzalu ticket should work", async function () {
    const update: ZuzaluPretixTicket = {
      order_id: testTicket.order_id,
      name: testTicket.name,
      email: testTicket.email,
      role: otherRole,
      visitor_date_ranges: [
        { date_from: new Date().toString(), date_to: new Date().toString() }
      ]
    };

    await updateZuzaluPretixTicket(db, update);

    const updatedUser = await fetchZuzaluUser(db, testTicket.email);
    if (!updatedUser) {
      throw new Error("not able to get user for email");
    }

    expect(updatedUser.email).to.eq(testTicket.email);
    expect(updatedUser.role).to.eq(update.role);
    expect(updatedUser.visitor_date_ranges).to.deep.eq(
      update.visitor_date_ranges
    );
    expect(update.role).to.not.eq(testTicket.role);
  });

  step("deleting a logged in zuzalu ticket should work", async function () {
    const loggedinUser = await fetchZuzaluUser(db, testTicket.email);
    if (!loggedinUser || !loggedinUser.uuid) {
      throw new Error("expected there to be a logged in user");
    }
    await deleteZuzaluTicket(db, testTicket.email);
    expect(await fetchZuzaluUser(db, testTicket.email)).to.eq(null);
    expect(
      await fetchLoggedInZuzaluUser(db, { uuid: loggedinUser.uuid })
    ).to.eq(null);
  });

  step("deleting a non logged in user should work", async function () {
    await insertZuzaluPretixTicket(db, testTicket);
    expect(await fetchZuzaluUser(db, testTicket.email)).to.not.eq(null);
    await deleteZuzaluTicket(db, testTicket.email);
    expect(await fetchZuzaluUser(db, testTicket.email)).to.eq(null);
  });

  step("e2ee should work", async function () {
    const key = "key";
    const initialStorage = await fetchEncryptedStorage(db, key);
    expect(initialStorage).to.be.undefined;

    const value = "value";
    await insertEncryptedStorage(db, key, value);
    const insertedStorage = await fetchEncryptedStorage(db, key);
    if (!insertedStorage) {
      throw new Error("expected to be able to fetch a e2ee blob");
    }
    expect(insertedStorage.blob_key).to.eq(key);
    expect(insertedStorage.encrypted_blob).to.eq(value);

    const updatedValue = "value2";
    expect(value).to.not.eq(updatedValue);
    await insertEncryptedStorage(db, key, updatedValue);
    const updatedStorage = await fetchEncryptedStorage(db, key);
    if (!updatedStorage) {
      throw new Error("expected to be able to fetch updated e2ee blog");
    }
    expect(updatedStorage.blob_key).to.eq(key);
    expect(updatedStorage.encrypted_blob).to.eq(updatedValue);

    // Storing an empty string is valid, and not treated as deletion.
    const emptyValue = "";
    expect(updatedValue).to.not.eq(emptyValue);
    await insertEncryptedStorage(db, key, emptyValue);
    const emptyStorage = await fetchEncryptedStorage(db, key);
    if (!emptyStorage) {
      throw new Error("expected to be able to fetch updated e2ee blog");
    }
    expect(emptyStorage.blob_key).to.eq(key);
    expect(emptyStorage.encrypted_blob).to.eq(emptyValue);
  });

  step("e2ee rekeying should work", async function () {
    const key1 = "key1";
    const value1 = "value1";
    const salt1 = "1234";

    const email = "e2ee-rekey-user@test.com";
    const commitment = new Identity().commitment.toString();
    const uuid = await upsertUser(db, {
      commitment,
      email,
      salt: salt1
    });
    if (!uuid) {
      throw new Error("expected to be able to insert a commitment");
    }

    await insertEncryptedStorage(db, key1, value1);
    const storage1 = await fetchEncryptedStorage(db, key1);
    if (!storage1) {
      throw new Error("expected to be able to fetch 1st e2ee blob");
    }
    expect(storage1.blob_key).to.eq(key1);
    expect(storage1.encrypted_blob).to.eq(value1);

    const key2 = "key2";
    const value2 = "value2";
    const salt2 = "5678";

    await rekeyEncryptedStorage(db, key1, key2, uuid, salt2, value2);
    const storage2 = await fetchEncryptedStorage(db, key2);
    if (!storage2) {
      throw new Error("expected to be able to fetch 2nd e2ee blob");
    }
    expect(storage2.blob_key).to.eq(key2);
    expect(storage2.encrypted_blob).to.eq(value2);
    const storageMissing = await fetchEncryptedStorage(db, key1);
    if (storageMissing) {
      throw new Error("expected 1st e2ee blob to be gone");
    }

    // We can't rekey again because key doesn't match.
    await assert.rejects(async () => {
      await rekeyEncryptedStorage(db, key1, key2, uuid, salt2, value2);
    });
  });

  step("pcdpass user representation should work", async function () {
    const email = "pcdpassuser@test.com";
    const commitment = new Identity().commitment.toString();
    const uuid = await upsertUser(db, {
      commitment,
      email
    });
    if (!uuid) {
      throw new Error("expected to be able to insert a commitment");
    }
    const insertedCommitment = await fetchUserByEmail(db, email);
    if (!insertedCommitment) {
      throw new Error("expected to be able to fetch an inserted commitment");
    }
    expect(insertedCommitment.commitment).to.eq(commitment);
    expect(insertedCommitment.email).to.eq(email);
    expect(insertedCommitment.uuid).to.eq(uuid);

    expect(await fetchUserByCommitment(db, commitment)).to.deep.eq(
      insertedCommitment
    );

    await deleteUserByEmail(db, email);
    const deletedCommitment = await fetchUserByEmail(db, email);
    expect(deletedCommitment).to.eq(null);
  });

  step("should be able to interact with the cache", async function () {
    // insert a bunch of old entries
    const oldEntries: CacheEntry[] = [];
    for (let i = 0; i < 20; i++) {
      oldEntries.push(await setCacheValue(db, "i_" + i, i + ""));
    }
    await sqlQuery(
      db,
      `
    update cache
      set time_created = NOW() - interval '5 days',
      time_updated = NOW() - interval '5 days'
    `
    );

    // old entries inserted, let's insert some 'new' ones
    await setCacheValue(db, "key", "value");
    const firstEntry = await getCacheValue(db, "key");
    expect(firstEntry?.cache_value).to.eq("value");
    await setCacheValue(db, "key", "value2");
    const editedFirstEntry = await getCacheValue(db, "key");
    expect(editedFirstEntry?.cache_value).to.eq("value2");
    expect(editedFirstEntry?.time_created?.getTime()).to.eq(
      firstEntry?.time_created?.getTime()
    );

    await setCacheValue(db, "spongebob", "squarepants");
    const spongebob = await getCacheValue(db, "spongebob");
    expect(spongebob?.cache_value).to.eq("squarepants");

    // age nothing out
    const beforeFirstAgeOut = await getCacheSize(db);
    expect(beforeFirstAgeOut).to.eq(22);
    const firstDeleteCount = await deleteExpiredCacheEntries(db, 10, 22);
    expect(firstDeleteCount).to.eq(0);
    const afterFirstAgeOut = await getCacheSize(db);
    expect(afterFirstAgeOut).to.eq(beforeFirstAgeOut);

    // age entries older than 10 days or entries that are not one of the 20
    // most recently added entries
    const beforeSecondAgeOut = await getCacheSize(db);
    const secondDeleteCount = await deleteExpiredCacheEntries(db, 10, 20);
    expect(secondDeleteCount).to.eq(2);
    const afterSecondAgeOut = await getCacheSize(db);
    expect(afterSecondAgeOut).to.eq(beforeSecondAgeOut - 2);

    // age entries older than 3 days or entries that are not one of the 20
    // most recently added entries
    const beforeThirdAgeOut = await getCacheSize(db);
    const thirdDeleteCount = await deleteExpiredCacheEntries(db, 3, 20);
    expect(thirdDeleteCount).to.eq(18);
    const afterThirdAgeOut = await getCacheSize(db);
    expect(afterThirdAgeOut).to.eq(beforeThirdAgeOut - 18);
  });
});
