import { ZuParticipant } from "@pcd/passport-interface";
import chai from "chai";
import spies from "chai-spies";
import "mocha";
import { step } from "mocha-steps";
import { stopApplication } from "../src/application";
import { PCDPass } from "../src/types";
import { startTestingApp } from "./startTestingApplication";
import { loginZupass } from "./user/loginZupass";
import { sync } from "./user/sync";

chai.use(spies);

describe("logging into Zupass and syncing", function () {
  let application: PCDPass;
  let user: ZuParticipant;

  this.beforeAll(async () => {
    console.log("starting application");
    application = await startTestingApp();
  });

  this.afterAll(async () => {
    await stopApplication(application);
  });

  step("should be able to log in", async function () {
    user = await loginZupass(application);
  });

  step("user should be able to sync end to end encryption", async function () {
    await sync(application, user);
  });
});
