import { getEdDSAPublicKey } from "@pcd/eddsa-pcd";
import {
  PODBOX_CREDENTIAL_REQUEST,
  PODPipelineDefinition
} from "@pcd/passport-interface";
import { expectIsReplaceInFolderAction } from "@pcd/pcd-collection";
import { PODPCDPackage, PODPCDTypeName } from "@pcd/pod-pcd";
import { Identity } from "@semaphore-protocol/identity";
import { expect } from "chai";
import { randomUUID } from "crypto";
import "mocha";
import { step } from "mocha-steps";
import * as MockDate from "mockdate";
import { stopApplication } from "../../../../src/application";
import { PipelineDefinitionDB } from "../../../../src/database/queries/pipelineDefinitionDB";
import { PipelineUserDB } from "../../../../src/database/queries/pipelineUserDB";
import { GenericIssuanceService } from "../../../../src/services/generic-issuance/GenericIssuanceService";
import { PODPipeline } from "../../../../src/services/generic-issuance/pipelines/PODPipeline/PODPipeline";
import { PipelineUser } from "../../../../src/services/generic-issuance/pipelines/types";
import { Zupass } from "../../../../src/types";
import { overrideEnvironment, testingEnv } from "../../../util/env";
import { startTestingApp } from "../../../util/startTestingApplication";
import {
  expectLength,
  expectPODEntries,
  expectToExist,
  expectTrue
} from "../../../util/util";
import { assertUserMatches, makeTestCredential } from "../../util";
import {
  requestPODFeed,
  setupTestPODPipelineDefinition,
  updateAndRestartPipeline
} from "./utils";

/**
 * Tests for {@link GenericIssuanceService}, in particular the {@link PODPipeline}.
 */
describe("generic issuance - PODPipeline", function () {
  const nowDate = new Date();
  const now = Date.now();

  let giBackend: Zupass;
  let giService: GenericIssuanceService;

  const adminGIUserId = randomUUID();
  const adminGIUserEmail = "admin@test.com";

  const podPipeline: PODPipelineDefinition =
    setupTestPODPipelineDefinition(adminGIUserId);

  const pipelineDefinitions = [podPipeline];

  const johnDoeUserIdentity = new Identity();
  const unknownUserIdentity = new Identity();

  /**
   * Sets up a Zupass/Generic issuance backend with one pipelines:
   * - {@link PODPipeline}, as defined by {@link setupTestPODPipelineDefinition}
   */
  this.beforeAll(async () => {
    const zupassPublicKey = JSON.stringify(
      await getEdDSAPublicKey(testingEnv.SERVER_EDDSA_PRIVATE_KEY as string)
    );

    await overrideEnvironment({
      GENERIC_ISSUANCE_ZUPASS_PUBLIC_KEY: zupassPublicKey,
      ...testingEnv
    });

    giBackend = await startTestingApp();

    const userDB = new PipelineUserDB(giBackend.context.dbPool);

    const adminUser: PipelineUser = {
      id: adminGIUserId,
      email: adminGIUserEmail,
      isAdmin: true,
      timeCreated: nowDate,
      timeUpdated: nowDate
    };
    await userDB.updateUserById(adminUser);
    assertUserMatches(
      {
        id: adminGIUserId,
        email: adminGIUserEmail,
        isAdmin: true,
        timeCreated: nowDate,
        timeUpdated: nowDate
      },
      await userDB.getUserById(adminUser.id)
    );

    giService = giBackend.services
      .genericIssuanceService as GenericIssuanceService;
    await giService.stop();
    const pipelineDefinitionDB = new PipelineDefinitionDB(
      giBackend.context.dbPool
    );
    await pipelineDefinitionDB.deleteAllDefinitions();
    await pipelineDefinitionDB.upsertDefinitions(pipelineDefinitions);
    await giService.start(false);
  });

  this.beforeEach(async () => {
    MockDate.set(now);
  });

  this.afterEach(async () => {
    MockDate.reset();
  });

  step("PipelineUserDB", async function () {
    const userDB = new PipelineUserDB(giBackend.context.dbPool);

    const adminUser: PipelineUser = {
      id: adminGIUserId,
      email: adminGIUserEmail,
      isAdmin: true,
      timeCreated: nowDate,
      timeUpdated: nowDate
    };
    await userDB.updateUserById(adminUser);
    assertUserMatches(
      {
        id: adminGIUserId,
        email: adminGIUserEmail,
        isAdmin: true,
        timeCreated: nowDate,
        timeUpdated: nowDate
      },
      await userDB.getUserById(adminUser.id)
    );
  });

  /**
   * Basic end-to-end test showing that the pipeline loads successfully and
   * that PCDs can be successfully requested from a feed.
   */
  step("PODPipeline loads and serves feed request", async function () {
    expectToExist(giService);
    const pipelines = await giService.getAllPipelineInstances();
    expectLength(pipelines, 1);
    const podPipeline = pipelines.find(PODPipeline.is);
    expectToExist(podPipeline);
    const loadRes = await podPipeline.load();
    expectTrue(loadRes.success);
    expect(loadRes.atomsLoaded).to.eq(2);

    const feedRes = await requestPODFeed(
      podPipeline.feedCapability.feedUrl,
      podPipeline.feedCapability.options.feedId,
      await makeTestCredential(
        johnDoeUserIdentity,
        PODBOX_CREDENTIAL_REQUEST,
        // User email is present in the CSV input
        "john.doe@example.com",
        testingEnv.SERVER_EDDSA_PRIVATE_KEY as string
      )
    );
    expectTrue(feedRes.success);
    expectLength(feedRes.value.actions, 2);
    const pcdsAction = feedRes.value.actions[1];
    expectIsReplaceInFolderAction(pcdsAction);
    expectLength(pcdsAction.pcds, 1);
    expect(pcdsAction.pcds[0].type).to.eq(PODPCDTypeName);
    const pcd = await PODPCDPackage.deserialize(pcdsAction.pcds[0].pcd);
    expectPODEntries(pcd.claim.entries, {
      id: ["string", "768dab50-2dea-4fd7-86bd-212f091b7867"],
      first_name: ["string", "John"],
      last_name: ["string", "Doe"],
      email: ["string", "john.doe@example.com"],
      high_score: ["int", 30n],
      birthday: ["int", BigInt(new Date("1980-01-01").getTime())],
      is_approved: ["int", BigInt(true)]
    });
  });

  /**
   * This test polls the feed with a user account whose email does not match
   * any of the emails in the CSV file. The result is an empty feed.
   */
  step("User with no PODs receives an empty feed", async function () {
    expectToExist(giService);
    const pipelines = await giService.getAllPipelineInstances();
    expectLength(pipelines, 1);
    const podPipeline = pipelines.find(PODPipeline.is);
    expectToExist(podPipeline);
    const loadRes = await podPipeline.load();
    expectTrue(loadRes.success);
    expect(loadRes.atomsLoaded).to.eq(2);

    const feedRes = await requestPODFeed(
      podPipeline.feedCapability.feedUrl,
      podPipeline.feedCapability.options.feedId,
      await makeTestCredential(
        unknownUserIdentity,
        PODBOX_CREDENTIAL_REQUEST,
        "unknown@example.com",
        testingEnv.SERVER_EDDSA_PRIVATE_KEY as string
      )
    );
    // Will still receive two actions, Delete and ReplaceInFolder, but the
    // ReplaceInFolder action will have no PCDs.
    expectTrue(feedRes.success);
    expectLength(feedRes.value.actions, 2);
    const pcdsAction = feedRes.value.actions[1];
    expectIsReplaceInFolderAction(pcdsAction);
    // Zero PCDs received
    expectLength(pcdsAction.pcds, 0);
    expect(pcdsAction.folder).to.eq(
      podPipeline.feedCapability.options.feedFolder
    );
  });

  /**
   * Feed outputs can be configured with a "match" filter. If the match type is
   * set to "none", then all PCDs on the pipeline will be served to any user
   * that requests a feed. If the match type is set to "email", then only PCDs
   * with an email address that matches the user's email address will be
   * served.
   *
   * This test sets the match type to "none" and verifies that the user
   * receives both of the PCDs available on this pipeline (there being two
   * input rows in the CSV file by default, see
   * {@link setupTestPODPipelineDefinition}).
   */
  step(
    "Feed can be configured to allow PCDs to be served to any user",
    async function () {
      expectToExist(giService);

      await updateAndRestartPipeline(
        giBackend,
        giService,
        adminGIUserId,
        (definition: PODPipelineDefinition) => {
          definition.options.outputs["output1"].match = {
            type: "none"
          };
        }
      );

      const pipelines = await giService.getAllPipelineInstances();
      expectLength(pipelines, 1);
      const podPipeline = pipelines.find(PODPipeline.is);
      expectToExist(podPipeline);
      const loadRes = await podPipeline.load();
      expectTrue(loadRes.success);
      expect(loadRes.atomsLoaded).to.eq(2);

      const feedRes = await requestPODFeed(
        podPipeline.feedCapability.feedUrl,
        podPipeline.feedCapability.options.feedId,
        await makeTestCredential(
          unknownUserIdentity,
          PODBOX_CREDENTIAL_REQUEST,
          "unknown@example.com",
          testingEnv.SERVER_EDDSA_PRIVATE_KEY as string
        )
      );
      // Will still receive two actions, Delete and ReplaceInFolder, but the
      // ReplaceInFolder action will have no PCDs.
      expectTrue(feedRes.success);
      expectLength(feedRes.value.actions, 2);
      const pcdsAction = feedRes.value.actions[1];
      expectIsReplaceInFolderAction(pcdsAction);
      // Two PCDs received
      expectLength(pcdsAction.pcds, 2);
      expect(pcdsAction.pcds[0].type).to.eq(PODPCDTypeName);
      expect(pcdsAction.pcds[1].type).to.eq(PODPCDTypeName);
      expect(pcdsAction.folder).to.eq(
        podPipeline.feedCapability.options.feedFolder
      );

      const firstPCD = await PODPCDPackage.deserialize(pcdsAction.pcds[0].pcd);
      expectPODEntries(firstPCD.claim.entries, {
        id: ["string", "768dab50-2dea-4fd7-86bd-212f091b7867"],
        first_name: ["string", "John"],
        last_name: ["string", "Doe"],
        email: ["string", "john.doe@example.com"],
        high_score: ["int", 30n],
        birthday: ["int", BigInt(new Date("1980-01-01").getTime())],
        is_approved: ["int", BigInt(true)]
      });
      const secondPCD = await PODPCDPackage.deserialize(pcdsAction.pcds[1].pcd);
      expectPODEntries(secondPCD.claim.entries, {
        id: ["string", "f1304eac-e462-4d8f-b704-9e7aed2e0618"],
        first_name: ["string", "Jane"],
        last_name: ["string", "Doe"],
        email: ["string", "jane.doe@example.com"],
        high_score: ["int", 25n],
        birthday: ["int", BigInt(new Date("1985-02-02").getTime())],
        is_approved: ["int", BigInt(false)]
      });

      // Restore original configuration
      await updateAndRestartPipeline(
        giBackend,
        giService,
        adminGIUserId,
        (definition: PODPipelineDefinition) => {
          definition.options.outputs["output1"].match = {
            type: "email",
            entry: "email"
          };
        }
      );
    }
  );

  /**
   * Output PCDs can be issued to users with matching email addresses. If
   * the user's email matches more than one row in the input CSV, then all
   * matching PCDs will be issued to the user.
   */
  step(
    "Multiple PCDs can be served to a user who appears multiple times in the input",
    async function () {
      await updateAndRestartPipeline(
        giBackend,
        giService,
        adminGIUserId,
        (definition: PODPipelineDefinition) => {
          // existing csv: "id,first_name,last_name,email,high_score,birthday,is_approved\n768dab50-2dea-4fd7-86bd-212f091b7867,John,Doe,john.doe@example.com,30,1980-01-01,true\nf1304eac-e462-4d8f-b704-9e7aed2e0618,Jane,Doe,jane.doe@example.com,25,1985-02-02,true\n"
          // Add another row, using the same email previously present, but
          // with a different high_score and birthday
          definition.options.input.csv =
            definition.options.input.csv +
            "\nb8fb8ad1-6a28-4626-9e31-267580a40134,John,Doe,john.doe@example.com,3000,1981-12-01,true";
        }
      );

      expectToExist(giService);
      const pipelines = await giService.getAllPipelineInstances();
      expectLength(pipelines, 1);
      const podPipeline = pipelines.find(PODPipeline.is);
      expectToExist(podPipeline);
      const loadRes = await podPipeline.load();
      expectTrue(loadRes.success);
      expect(loadRes.atomsLoaded).to.eq(3);

      const feedRes = await requestPODFeed(
        podPipeline.feedCapability.feedUrl,
        podPipeline.feedCapability.options.feedId,
        await makeTestCredential(
          johnDoeUserIdentity,
          PODBOX_CREDENTIAL_REQUEST,
          // User email as present in the CSV input
          "john.doe@example.com",
          testingEnv.SERVER_EDDSA_PRIVATE_KEY as string
        )
      );
      expectTrue(feedRes.success);
      expectLength(feedRes.value.actions, 2);
      const pcdsAction = feedRes.value.actions[1];
      expectIsReplaceInFolderAction(pcdsAction);
      // User receives two PCDs
      expectLength(pcdsAction.pcds, 2);
      expect(pcdsAction.pcds[0].type).to.eq(PODPCDTypeName);
      expect(pcdsAction.folder).to.eq(
        podPipeline.feedCapability.options.feedFolder
      );
      const firstPCD = await PODPCDPackage.deserialize(pcdsAction.pcds[0].pcd);
      expectPODEntries(firstPCD.claim.entries, {
        id: ["string", "768dab50-2dea-4fd7-86bd-212f091b7867"],
        first_name: ["string", "John"],
        last_name: ["string", "Doe"],
        email: ["string", "john.doe@example.com"],
        high_score: ["int", 30n],
        birthday: ["int", BigInt(new Date("1980-01-01").getTime())],
        is_approved: ["int", BigInt(true)]
      });
      const secondPCD = await PODPCDPackage.deserialize(pcdsAction.pcds[1].pcd);
      expectPODEntries(secondPCD.claim.entries, {
        id: ["string", "b8fb8ad1-6a28-4626-9e31-267580a40134"],
        first_name: ["string", "John"],
        last_name: ["string", "Doe"],
        email: ["string", "john.doe@example.com"],
        high_score: ["int", 3000n],
        birthday: ["int", BigInt(new Date("1981-12-01").getTime())],
        is_approved: ["int", BigInt(true)]
      });
    }
  );

  this.afterAll(async () => {
    await stopApplication(giBackend);
  });
});
