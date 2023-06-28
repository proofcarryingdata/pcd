import { ZuParticipant } from "@pcd/passport-interface";
import { expect } from "chai";
import "mocha";
import { step } from "mocha-steps";
import { stopApplication } from "../src/application";
import { PCDPass } from "../src/types";
import { loginPCDPass } from "./user/loginPCDPass";
import { sync } from "./user/sync";
import { overrideEnvironment, pcdpassTestingEnv } from "./util/env";
import { startTestingApp } from "./util/startTestingApplication";

describe("logging into PCDPass and syncing", function () {
  let application: PCDPass;
  let user: ZuParticipant;

  this.beforeAll(async () => {
    console.log("starting application");
    overrideEnvironment(pcdpassTestingEnv);
    application = await startTestingApp();
  });

  this.afterAll(async () => {
    await stopApplication(application);
  });

  step("should be able to log in", async function () {
    user = await loginPCDPass(application);
    if (application.apis?.emailAPI) {
      expect(application.apis.emailAPI.send).to.be.called();
    } else {
      throw new Error("expected email client to have been mocked");
    }
  });

  step("user should be able to sync end to end encryption", async function () {
    await sync(application);
  });
});
