import { EmailPCDPackage, EmailPCDTypeName } from "@pcd/email-pcd";
import {
  ZUPASS_CREDENTIAL_REQUEST,
  ZupassFeedIds,
  requestPollFeed
} from "@pcd/passport-interface";
import { PCDActionType, isReplaceInFolderAction } from "@pcd/pcd-collection";
import { encodePublicKey } from "@pcd/pod";
import { PODEmailPCDPackage, PODEmailPCDTypeName } from "@pcd/pod-email-pcd";
import { Identity } from "@semaphore-protocol/identity";
import { assert, expect } from "chai";
import "mocha";
import { step } from "mocha-steps";
import MockDate from "mockdate";
import { stopApplication } from "../src/application";
import { Zupass } from "../src/types";
import { makeTestCredential } from "./generic-issuance/util";
import { testLogin } from "./user/testLogin";
import { overrideEnvironment, testingEnv } from "./util/env";
import { startTestingApp } from "./util/startTestingApplication";
import { expectToExist, randomEmail } from "./util/util";

describe("attested email feed functionality", function () {
  let application: Zupass;
  let identity: Identity;
  const testEmail = randomEmail();

  this.beforeAll(async () => {
    await overrideEnvironment(testingEnv);
    application = await startTestingApp();
  });

  this.afterAll(async () => {
    await stopApplication(application);
  });

  this.beforeEach(() => {
    // Means that the time won't change during the test, which could cause
    // spurious issues with timestamps in feed credentials.
    MockDate.set(new Date());
  });

  this.afterEach(() => {
    MockDate.reset();
  });

  step("should be able to log in", async function () {
    const loginResult = await testLogin(application, testEmail, {
      force: true,
      expectUserAlreadyLoggedIn: false,
      expectEmailIncorrect: false,
      skipSetupPassword: false
    });

    expect(loginResult?.identity).to.not.be.empty;
    identity = loginResult?.identity as Identity;
  });

  step(
    "user should be able to be issued an attested email PCD from the server",
    async function () {
      const pollFeedResult = await requestPollFeed(
        `${application.expressContext.localEndpoint}/feeds`,
        {
          pcd: await makeTestCredential(identity, ZUPASS_CREDENTIAL_REQUEST),
          feedId: ZupassFeedIds.Email
        }
      );

      if (!pollFeedResult.success) {
        throw new Error("did not expect an error here");
      }

      expect(pollFeedResult.value?.actions.length).to.eq(2);

      // Zeroth action clears the folder, so this one contains the email
      const action = pollFeedResult?.value?.actions?.[1];
      expectToExist(action, isReplaceInFolderAction);
      expect(action.type).to.eq(PCDActionType.ReplaceInFolder);
      expect(action.pcds.length).to.eq(2);
      expect(action.pcds[0].type).to.eq(EmailPCDTypeName);
      expect(action.pcds[1].type).to.eq(PODEmailPCDTypeName);

      // Check that the PCD contains the expected email address
      const deserializedPCD = await EmailPCDPackage.deserialize(
        action.pcds[0].pcd
      );
      expect(deserializedPCD.claim.emailAddress).to.eq(testEmail);

      // Check that the PCD verifies
      expect(await EmailPCDPackage.verify(deserializedPCD)).to.be.true;

      const serverPublicKey =
        await application.services.issuanceService?.getEdDSAPublicKey();
      assert(serverPublicKey, "Server public key should exist");

      // Check the public key
      expect(deserializedPCD.proof.eddsaPCD.claim.publicKey).to.deep.eq(
        serverPublicKey
      );

      // Check the PODEmailPCD
      const podEmailPCD = await PODEmailPCDPackage.deserialize(
        action.pcds[1].pcd
      );
      expect(podEmailPCD.claim.podEntries.emailAddress.value).to.eq(testEmail);
      expect(podEmailPCD.claim.signerPublicKey).to.deep.eq(
        encodePublicKey([
          BigInt(`0x${serverPublicKey[0]}`),
          BigInt(`0x${serverPublicKey[1]}`)
        ])
      );

      // Check that the PODEmailPCD verifies
      expect(await PODEmailPCDPackage.verify(podEmailPCD)).to.be.true;
    }
  );
});
