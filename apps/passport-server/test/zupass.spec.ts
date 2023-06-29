import { User } from "@pcd/passport-interface";
import { expect } from "chai";
import "mocha";
import { step } from "mocha-steps";
import { IEmailAPI } from "../src/apis/emailAPI";
import { getPretixConfig } from "../src/apis/pretixAPI";
import { stopApplication } from "../src/application";
import { ZuzaluUserRole } from "../src/database/models";
import { PretixSyncStatus } from "../src/services/types";
import { PCDPass } from "../src/types";
import {
  getMockPretixAPI,
  newMockZuzaluPretixAPI,
} from "./pretix/mockPretixApi";
import { waitForPretixSyncStatus } from "./pretix/waitForPretixSyncStatus";
import { ZuzaluPretixDataMocker } from "./pretix/zuzaluPretixDataMocker";
import {
  expectCurrentSemaphoreToBe,
  testLatestHistoricSemaphoreGroups as testLatestHistoricSemaphoreGroupsMatchServerGroups,
} from "./semaphore/checkSemaphore";
import { testLoginZupass } from "./user/testLoginZupass";
import { testUserSync as testE2EESync } from "./user/testUserSync";
import { overrideEnvironment, zuzaluTestingEnv } from "./util/env";
import { startTestingApp } from "./util/startTestingApplication";

describe("zupass functionality", function () {
  this.timeout(15_000);

  let application: PCDPass;
  let residentUser: User;
  let visitorUser: User;
  let organizerUser: User;
  let emailAPI: IEmailAPI;
  let pretixMocker: ZuzaluPretixDataMocker;

  this.beforeAll(async () => {
    await overrideEnvironment(zuzaluTestingEnv);

    const pretixConfig = getPretixConfig();

    if (!pretixConfig) {
      throw new Error(
        "expected to be able to get a pretix config for zuzalu tests"
      );
    }

    pretixMocker = new ZuzaluPretixDataMocker(pretixConfig);
    const pretixAPI = getMockPretixAPI(pretixMocker.getMockData());
    application = await startTestingApp({ pretixAPI });
  });

  this.afterAll(async () => {
    await stopApplication(application);
  });

  step("email client should have been mocked", async function () {
    if (!application.apis.emailAPI) {
      throw new Error("email client should have been mocked");
    }
    emailAPI = application.apis.emailAPI;
  });

  step("pretix should sync to completion", async function () {
    const pretixSyncStatus = await waitForPretixSyncStatus(application);
    expect(pretixSyncStatus).to.eq(PretixSyncStatus.Synced);
  });

  step(
    "since nobody has logged in yet, all the semaphore groups should be empty",
    async function () {
      expectCurrentSemaphoreToBe(application, {
        p: [],
        r: [],
        v: [],
        o: [],
        g: [],
      });
    }
  );

  step(
    "after pretix sync, semaphore should have synced too," +
      " and saved historic semaphore groups",
    async function () {
      await testLatestHistoricSemaphoreGroupsMatchServerGroups(application);
    }
  );

  step(
    "after pretix sync completes, a pretix user should be able to log in",
    async function () {
      const ticketHolders =
        await application.services.userService.getZuzaluTicketHolders();
      const resident = ticketHolders.find(
        (t) => t.role === ZuzaluUserRole.Resident
      );

      if (!resident) {
        // this shouldn't happen as we've inserted a resident via mock data
        throw new Error("couldn't find a resident to test with");
      }

      residentUser = await testLoginZupass(
        application,
        resident.email,
        false,
        false
      );
      expect(emailAPI.send).to.have.been.called.exactly(1);
    }
  );

  step(
    "after a resident logs in, they should show up in the resident semaphore group and no other groups",
    async function () {
      expectCurrentSemaphoreToBe(application, {
        p: [residentUser.commitment],
        r: [residentUser.commitment],
        v: [],
        o: [],
        g: [],
      });
    }
  );

  step(
    "after a user log in, historic semaphore groups also get updated",
    async function () {
      await testLatestHistoricSemaphoreGroupsMatchServerGroups(application);
    }
  );

  step(
    "logging in with the remaining two users should work",
    async function () {
      const ticketHolders =
        await application.services.userService.getZuzaluTicketHolders();

      const visitor = ticketHolders.find(
        (t) => t.role === ZuzaluUserRole.Visitor
      );
      const organizer = ticketHolders.find(
        (t) => t.role === ZuzaluUserRole.Organizer
      );

      if (!visitor || !organizer) {
        // this shouldn't happen as we've inserted a resident via mock data
        throw new Error("couldn't find a visitor or organizer to test with");
      }

      visitorUser = await testLoginZupass(
        application,
        visitor.email,
        false,
        false
      );
      expect(emailAPI.send).to.have.been.called.exactly(2);

      organizerUser = await testLoginZupass(
        application,
        organizer.email,
        false,
        false
      );
      expect(emailAPI.send).to.have.been.called.exactly(3);
    }
  );

  step(
    "after all three users log in, the semaphore groups should reflect their existence",
    async function () {
      expectCurrentSemaphoreToBe(application, {
        p: [
          residentUser.commitment,
          visitorUser.commitment,
          organizerUser.commitment,
        ],
        r: [residentUser.commitment, organizerUser.commitment],
        v: [visitorUser.commitment],
        o: [organizerUser.commitment],
        g: [],
      });
    }
  );

  step(
    "after more users log in, historic semaphore groups also get updated",
    async function () {
      await testLatestHistoricSemaphoreGroupsMatchServerGroups(application);
    }
  );

  step(
    "after a user has logged in once, they cannot login again without 'force'",
    async function () {
      const ticketHolders =
        await application.services.userService.getZuzaluTicketHolders();

      const resident = ticketHolders.find(
        (t) => t.role === ZuzaluUserRole.Resident
      );

      if (!resident) {
        // this shouldn't happen as we've inserted a resident via mock data
        throw new Error("couldn't find a visitor or organizer to test with");
      }

      await expect(
        testLoginZupass(application, resident.email, false, true)
      ).to.be.rejectedWith("already registered");

      residentUser = await testLoginZupass(
        application,
        resident.email,
        true,
        true
      );

      const oldResidentCommitment = resident.commitment!;
      const newResidentCommitment = residentUser.commitment;

      expect(oldResidentCommitment != null).to.be.true;
      expect(newResidentCommitment != null).to.be.true;
      expect(oldResidentCommitment).to.not.eq(newResidentCommitment);

      expectCurrentSemaphoreToBe(application, {
        p: [
          newResidentCommitment,
          visitorUser.commitment,
          organizerUser.commitment,
        ],
        r: [newResidentCommitment, organizerUser.commitment],
        v: [visitorUser.commitment],
        o: [organizerUser.commitment],
        g: [],
      });
    }
  );

  step("users should be able to e2ee sync", async function () {
    await testE2EESync(application);
  });

  step(
    "replace api and sync should cause all users to be replaced",
    async function () {
      const oldTicketHolders =
        await application.services.userService.getZuzaluTicketHolders();

      const newAPI = newMockZuzaluPretixAPI();
      if (!newAPI) {
        throw new Error("couldn't instantiate a new pretix api");
      }
      application.services.pretixSyncService?.replaceApi(newAPI);
      const syncStatus = await waitForPretixSyncStatus(application);
      expect(syncStatus).to.eq(PretixSyncStatus.Synced);

      const newTicketHolders =
        await application.services.userService.getZuzaluTicketHolders();

      const oldEmails = new Set(...oldTicketHolders.map((t) => t.email));
      const newEmails = new Set(...newTicketHolders.map((t) => t.email));

      expect(oldEmails).to.not.eq(newEmails);

      expectCurrentSemaphoreToBe(application, {
        p: [],
        r: [],
        v: [],
        o: [],
        g: [],
      });
    }
  );
});
