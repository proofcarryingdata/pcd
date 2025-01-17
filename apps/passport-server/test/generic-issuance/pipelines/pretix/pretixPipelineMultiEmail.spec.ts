import { getEdDSAPublicKey } from "@pcd/eddsa-pcd";
import { EmailPCD, EmailPCDPackage, EmailPCDTypeName } from "@pcd/email-pcd";
import {
  EmailUpdateError,
  ZUPASS_CREDENTIAL_REQUEST,
  ZupassFeedIds,
  requestAddUserEmail,
  requestChangeUserEmail,
  requestPollFeed,
  requestRemoveUserEmail
} from "@pcd/passport-interface";
import { PCDActionType, isReplaceInFolderAction } from "@pcd/pcd-collection";
import { encodePublicKey } from "@pcd/pod";
import { PODEmailPCDPackage, PODEmailPCDTypeName } from "@pcd/pod-email-pcd";
import { Identity } from "@semaphore-protocol/identity";
import { assert, expect } from "chai";
import "mocha";
import { step } from "mocha-steps";
import * as MockDate from "mockdate";
import { Pool, PoolClient } from "postgres-pool";
import { stopApplication } from "../../../../src/application";
import { fetchEmailToken } from "../../../../src/database/queries/emailToken";
import { PipelineDefinitionDB } from "../../../../src/database/queries/pipelineDefinitionDB";
import { PipelineUserDB } from "../../../../src/database/queries/pipelineUserDB";
import { GenericIssuanceService } from "../../../../src/services/generic-issuance/GenericIssuanceService";
import { PretixPipeline } from "../../../../src/services/generic-issuance/pipelines/PretixPipeline";
import { PipelineUser } from "../../../../src/services/generic-issuance/pipelines/types";
import { Zupass } from "../../../../src/types";
import { testLogin } from "../../../user/testLogin";
import { overrideEnvironment, testingEnv } from "../../../util/env";
import { startTestingApp } from "../../../util/startTestingApplication";
import {
  expectFalse,
  expectLength,
  expectToExist,
  expectTrue,
  randomEmail
} from "../../../util/util";
import {
  assertUserMatches,
  makeTestCredential,
  makeTestCredentialsForEmails,
  requestTicketsFromPipelineWithEmailPCDs
} from "../../util";
import { setupTestPretixPipeline } from "./setupTestPretixPipeline";

/**
 * Tests for {@link GenericIssuanceService}, in particular the {@link PretixPipeline} in situations
 * where a user has different quantites of emails than precisely one.
 */
describe("generic issuance - PretixPipeline - multi-email support", function () {
  const nowDate = new Date();
  const now = Date.now();

  let giBackend: Zupass;
  let giService: GenericIssuanceService;

  let pool: Pool;
  let client: PoolClient;

  const {
    adminGIUserId,
    adminGIUserEmail,
    ethLatAmGIUserID,
    ethLatAmGIUserEmail,
    mockServer,
    pretixBackend,
    ethLatAmPipeline
  } = setupTestPretixPipeline();

  const pipelineDefinitions = [ethLatAmPipeline];
  let pipeline: PretixPipeline;
  let aliceIdentity: Identity;
  const aliceInitialEmail = randomEmail();
  let aliceCurrentEmailPCDs: EmailPCD[] = [];
  let bobIdentity: Identity;
  const bobInitialEmail = randomEmail();
  let bobCurrentEmailPCDs: EmailPCD[] = [];

  /**
   * Sets up a Zupass/Generic issuance backend with one pipeline
   * {@link PretixPipeline}, as defined by {@link setupTestPretixPipeline}
   */
  this.beforeAll(async () => {
    const zupassPublicKey = JSON.stringify(
      await getEdDSAPublicKey(testingEnv.SERVER_EDDSA_PRIVATE_KEY as string)
    );

    await overrideEnvironment({
      GENERIC_ISSUANCE_ZUPASS_PUBLIC_KEY: zupassPublicKey,
      ...testingEnv
    });

    giBackend = await startTestingApp({});
    pool = giBackend.context.dbPool;
    client = await pool.connect();

    const userDB = new PipelineUserDB();
    const adminUser: PipelineUser = {
      id: adminGIUserId,
      email: adminGIUserEmail,
      isAdmin: true,
      timeCreated: nowDate,
      timeUpdated: nowDate
    };
    await userDB.updateUserById(client, adminUser);
    assertUserMatches(
      {
        id: adminGIUserId,
        email: adminGIUserEmail,
        isAdmin: true,
        timeCreated: nowDate,
        timeUpdated: nowDate
      },
      await userDB.getUserById(client, adminUser.id)
    );
    const ethLatAmGIUser: PipelineUser = {
      id: ethLatAmGIUserID,
      email: ethLatAmGIUserEmail,
      isAdmin: false,
      timeCreated: nowDate,
      timeUpdated: nowDate
    };
    await userDB.updateUserById(client, ethLatAmGIUser);
    assertUserMatches(
      {
        id: ethLatAmGIUserID,
        email: ethLatAmGIUserEmail,
        isAdmin: false,
        timeCreated: nowDate,
        timeUpdated: nowDate
      },
      await userDB.getUserById(client, ethLatAmGIUser.id)
    );

    // The mock server will intercept any requests for URLs that are registered
    // with it. Unhandled requests will bypass the mock server.
    mockServer.listen({ onUnhandledRequest: "bypass" });

    giService = giBackend.services
      .genericIssuanceService as GenericIssuanceService;
    await giService.stop();
    const pipelineDefinitionDB = new PipelineDefinitionDB();
    await pipelineDefinitionDB.deleteAllDefinitions(client);
    await pipelineDefinitionDB.upsertDefinitions(client, pipelineDefinitions);
    await giService.start(false);
  });

  this.beforeEach(async () => {
    MockDate.set(now);
  });

  this.afterEach(async () => {
    mockServer.resetHandlers();
    MockDate.reset();
  });

  this.afterAll(async () => {
    await client.release();
    await stopApplication(giBackend);
    mockServer.close();
  });

  step(
    "only pipeline - eth latam pipeline with 4 tickets for 4 different emails - should have been initialized",
    async function () {
      expectToExist(giService);
      const pipelines = await giService.getAllPipelineInstances();
      expectToExist(pipelines);
      expectLength(pipelines, 1);
      const foundPipeline = pipelines.find(PretixPipeline.is);
      expectToExist(foundPipeline);
      pipeline = foundPipeline;
      expect(pipeline.id).to.eq(ethLatAmPipeline.id);
    }
  );

  step(
    "should be able to log in a couple random users - alice and bob - they have no tickets initially",
    async function () {
      const loginResultAlice = await testLogin(giBackend, aliceInitialEmail, {
        force: true,
        expectUserAlreadyLoggedIn: false,
        expectEmailIncorrect: false,
        skipSetupPassword: false
      });
      expect(loginResultAlice?.identity).to.not.be.empty;
      aliceIdentity = loginResultAlice?.identity as Identity;

      const loginResultBob = await testLogin(giBackend, bobInitialEmail, {
        force: true,
        expectUserAlreadyLoggedIn: false,
        expectEmailIncorrect: false,
        skipSetupPassword: false
      });
      expect(loginResultBob?.identity).to.not.be.empty;
      bobIdentity = loginResultBob?.identity as Identity;
    }
  );

  step(
    "alice and bob should be able to be issued an attested email PCD from the server - and see their (empty) ticket list",
    async function () {
      aliceCurrentEmailPCDs = await testGetEmailPCDs(giBackend, aliceIdentity, [
        aliceInitialEmail
      ]);
      await testGetTickets(pipeline, aliceCurrentEmailPCDs, aliceIdentity, []);

      bobCurrentEmailPCDs = await testGetEmailPCDs(giBackend, bobIdentity, [
        bobInitialEmail
      ]);
      await testGetTickets(pipeline, bobCurrentEmailPCDs, bobIdentity, []);
    }
  );

  step(
    "alice and bob should not be able to modify each other's emails",
    async function () {
      const aliceCredential = await makeTestCredentialsForEmails(
        aliceIdentity,
        aliceCurrentEmailPCDs
      );
      const newEmail = randomEmail();
      const sendTokenResult = await requestChangeUserEmail(
        giBackend.expressContext.localEndpoint,
        bobCurrentEmailPCDs[0].claim.emailAddress,
        newEmail,
        aliceCredential
      );
      expectFalse(sendTokenResult.success);
      expect(sendTokenResult.error).to.eq(
        EmailUpdateError.EmailNotAssociatedWithThisAccount
      );
      const removeEmailResult = await requestRemoveUserEmail(
        giBackend.expressContext.localEndpoint,
        bobCurrentEmailPCDs[0].claim.emailAddress,
        aliceCredential
      );
      expectFalse(removeEmailResult.success);
      expect(removeEmailResult.error).to.eq(
        EmailUpdateError.EmailNotAssociatedWithThisAccount
      );
    }
  );

  step(
    "alice should be able to change email address to one that has a ticket",
    async function () {
      const credential = await makeTestCredentialsForEmails(
        aliceIdentity,
        aliceCurrentEmailPCDs
      );

      const newEmail =
        pretixBackend.get().ethLatAmOrganizer.ethLatAmAttendeeEmail;

      // send a confirmation code token
      const sendTokenResult = await requestChangeUserEmail(
        giBackend.expressContext.localEndpoint,
        aliceInitialEmail,
        newEmail,
        credential
      );
      expectTrue(sendTokenResult.success);

      // note this is sent to the new email, not old email
      const token = await fetchEmailToken(client, newEmail);
      expectToExist(token);

      // use the confirmation code to change the email
      const changeEmailResult = await requestChangeUserEmail(
        giBackend.expressContext.localEndpoint,
        aliceInitialEmail,
        newEmail,
        credential,
        token
      );

      expectTrue(changeEmailResult.success);

      aliceCurrentEmailPCDs = await testGetEmailPCDs(giBackend, aliceIdentity, [
        newEmail
      ]);

      await testGetTickets(pipeline, aliceCurrentEmailPCDs, aliceIdentity, [
        newEmail
      ]);
    }
  );

  step("alice should be able to add an email address", async function () {
    const currentEmails = aliceCurrentEmailPCDs.map(
      (pcd) => pcd.claim.emailAddress
    );
    expectLength(currentEmails, 1);

    const credential = await makeTestCredentialsForEmails(
      aliceIdentity,
      aliceCurrentEmailPCDs
    );

    const newEmail = pretixBackend.get().ethLatAmOrganizer.ethLatAmBouncerEmail;

    // send a confirmation code token
    const sendTokenResult = await requestAddUserEmail(
      giBackend.expressContext.localEndpoint,
      newEmail,
      credential
    );
    expectTrue(sendTokenResult.success);

    const token = await fetchEmailToken(client, newEmail);
    expectToExist(token);

    // use the confirmation code to change the email
    const changeEmailResult = await requestAddUserEmail(
      giBackend.expressContext.localEndpoint,
      newEmail,
      credential,
      token
    );

    expectTrue(changeEmailResult.success);

    aliceCurrentEmailPCDs = await testGetEmailPCDs(giBackend, aliceIdentity, [
      newEmail,
      ...currentEmails
    ]);

    await testGetTickets(pipeline, aliceCurrentEmailPCDs, aliceIdentity, [
      newEmail,
      ...currentEmails
    ]);
  });

  step(
    "bob shouldn't be able to change email to an email that has already been added by alice",
    async function () {
      const credential = await makeTestCredentialsForEmails(
        bobIdentity,
        bobCurrentEmailPCDs
      );

      const newEmail =
        pretixBackend.get().ethLatAmOrganizer.ethLatAmAttendeeEmail;

      // send a confirmation code token
      const sendTokenResult = await requestChangeUserEmail(
        giBackend.expressContext.localEndpoint,
        bobInitialEmail,
        newEmail,
        credential
      );
      expectFalse(sendTokenResult.success);
      expect(sendTokenResult.error).to.eq(
        EmailUpdateError.EmailAlreadyRegistered
      );
    }
  );

  step("alice should be able to remove an email address", async function () {
    const currentEmails = aliceCurrentEmailPCDs.map(
      (pcd) => pcd.claim.emailAddress
    );
    expectLength(currentEmails, 2);

    const credential = await makeTestCredentialsForEmails(
      aliceIdentity,
      aliceCurrentEmailPCDs
    );

    const removedEmail = currentEmails[0];

    const removeEmailResult = await requestRemoveUserEmail(
      giBackend.expressContext.localEndpoint,
      removedEmail,
      credential
    );
    expectTrue(removeEmailResult.success);

    const expectedEmailList = currentEmails.filter(
      (email) => email !== removedEmail
    );

    aliceCurrentEmailPCDs = await testGetEmailPCDs(
      giBackend,
      aliceIdentity,
      expectedEmailList
    );

    await testGetTickets(pipeline, aliceCurrentEmailPCDs, aliceIdentity, [
      ...expectedEmailList
    ]);
  });

  step(
    "alice should NOT be able to remove only email address",
    async function () {
      const currentEmails = aliceCurrentEmailPCDs.map(
        (pcd) => pcd.claim.emailAddress
      );
      expectLength(currentEmails, 1);

      const credential = await makeTestCredentialsForEmails(
        aliceIdentity,
        aliceCurrentEmailPCDs
      );

      const sendTokenResult = await requestRemoveUserEmail(
        giBackend.expressContext.localEndpoint,
        currentEmails[0],
        credential
      );

      expectFalse(sendTokenResult.success);
      expect(sendTokenResult.error).to.eq(EmailUpdateError.CantDeleteOnlyEmail);
    }
  );

  step(
    "alice can change email address back to initial value",
    async function () {
      const currentEmails = aliceCurrentEmailPCDs.map(
        (pcd) => pcd.claim.emailAddress
      );
      expectLength(currentEmails, 1);
      const credential = await makeTestCredentialsForEmails(
        aliceIdentity,
        aliceCurrentEmailPCDs
      );

      const newEmail = aliceInitialEmail;

      // send a confirmation code
      const sendTokenResult = await requestChangeUserEmail(
        giBackend.expressContext.localEndpoint,
        currentEmails[0],
        newEmail,
        credential
      );
      expectTrue(sendTokenResult.success);

      const token = await fetchEmailToken(client, newEmail);
      expectToExist(token);

      // use the confirmation code to change the email
      const changeEmailResult = await requestChangeUserEmail(
        giBackend.expressContext.localEndpoint,
        currentEmails[0],
        newEmail,
        credential,
        token
      );

      expectTrue(changeEmailResult.success);

      aliceCurrentEmailPCDs = await testGetEmailPCDs(giBackend, aliceIdentity, [
        newEmail
      ]);

      await testGetTickets(
        pipeline,
        aliceCurrentEmailPCDs,
        aliceIdentity,
        [] // 0 - this person has no tickets
      );
    }
  );

  step(
    "bob can then change email address to one alice was using for some time",
    async function () {
      const currentEmails = aliceCurrentEmailPCDs.map(
        (pcd) => pcd.claim.emailAddress
      );
      expectLength(currentEmails, 1);
      const credential = await makeTestCredentialsForEmails(
        aliceIdentity,
        aliceCurrentEmailPCDs
      );

      const newEmail =
        pretixBackend.get().ethLatAmOrganizer.ethLatAmBouncerEmail;

      // send a confirmation code
      const sendTokenResult = await requestChangeUserEmail(
        giBackend.expressContext.localEndpoint,
        currentEmails[0],
        newEmail,
        credential
      );
      expectTrue(sendTokenResult.success);

      const token = await fetchEmailToken(client, newEmail);
      expectToExist(token);

      // use the confirmation code to change the email
      const changeEmailResult = await requestChangeUserEmail(
        giBackend.expressContext.localEndpoint,
        currentEmails[0],
        newEmail,
        credential,
        token
      );

      expectTrue(changeEmailResult.success);

      aliceCurrentEmailPCDs = await testGetEmailPCDs(giBackend, aliceIdentity, [
        newEmail
      ]);

      await testGetTickets(
        pipeline,
        aliceCurrentEmailPCDs,
        aliceIdentity,
        [newEmail] // alice's old ticket now issued to bob
      );
    }
  );

  // /**
  //  * Test for {@link PretixPipeline} for Eth LatAm.
  //  */
  // step(
  //   "PretixPipeline issuance - specifically multi-email support",
  //   async () => {
  //     const ethLatAmTicketFeedUrl = pipeline.issuanceCapability.feedUrl;
  //     const attendeeTickets = await requestTicketsFromPipeline(
  //       pipeline.issuanceCapability.options.feedFolder,
  //       ethLatAmTicketFeedUrl,
  //       pipeline.issuanceCapability.options.feedId,
  //       ZUPASS_EDDSA_PRIVATE_KEY,
  //       pretixBackend.get().ethLatAmOrganizer.ethLatAmAttendeeEmail,
  //       EthLatAmAttendeeIdentity
  //     );
  //     expectLength(
  //       attendeeTickets.map((t) => t.claim.ticket.attendeeEmail),
  //       2
  //     );
  //     const attendeeTicket = attendeeTickets[0];
  //     expectToExist(attendeeTicket);
  //     expectIsEdDSATicketPCD(attendeeTicket);
  //     expect(attendeeTicket.claim.ticket.attendeeEmail).to.eq(
  //       pretixBackend.get().ethLatAmOrganizer.ethLatAmAttendeeEmail
  //     );
  //     expect(attendeeTicket.claim.ticket.attendeeName).to.eq(
  //       pretixBackend.get().ethLatAmOrganizer.ethLatAmAttendeeName
  //     );

  //     const attendeePODTicket = attendeeTickets[1];
  //     expectToExist(attendeePODTicket);
  //     expectIsPODTicketPCD(attendeePODTicket);
  //     expect(attendeePODTicket.claim.ticket.attendeeEmail).to.eq(
  //       pretixBackend.get().ethLatAmOrganizer.ethLatAmAttendeeEmail
  //     );
  //     expect(attendeePODTicket.claim.ticket.attendeeName).to.eq(
  //       pretixBackend.get().ethLatAmOrganizer.ethLatAmAttendeeName
  //     );

  //     const bouncerTickets = await requestTicketsFromPipeline(
  //       pipeline.issuanceCapability.options.feedFolder,
  //       ethLatAmTicketFeedUrl,
  //       pipeline.issuanceCapability.options.feedId,
  //       ZUPASS_EDDSA_PRIVATE_KEY,
  //       pretixBackend.get().ethLatAmOrganizer.ethLatAmBouncerEmail,
  //       EthLatAmBouncerIdentity
  //     );
  //     expectLength(bouncerTickets, 2);
  //     const bouncerTicket = bouncerTickets[0];
  //     expectToExist(bouncerTicket);
  //     expectIsEdDSATicketPCD(bouncerTicket);
  //     expect(bouncerTicket.claim.ticket.attendeeEmail).to.eq(
  //       pretixBackend.get().ethLatAmOrganizer.ethLatAmBouncerEmail
  //     );
  //     expect(bouncerTicket.claim.ticket.attendeeName).to.eq(
  //       pretixBackend.get().ethLatAmOrganizer.ethLatAmBouncerName
  //     );
  //     const bouncerPODTicket = bouncerTickets[1];
  //     expectToExist(bouncerPODTicket);
  //     expectIsPODTicketPCD(bouncerPODTicket);
  //     expect(bouncerPODTicket.claim.ticket.attendeeEmail).to.eq(
  //       pretixBackend.get().ethLatAmOrganizer.ethLatAmBouncerEmail
  //     );
  //     expect(bouncerPODTicket.claim.ticket.attendeeName).to.eq(
  //       pretixBackend.get().ethLatAmOrganizer.ethLatAmBouncerName
  //     );

  //     const ManualAttendeeTickets = await requestTicketsFromPipeline(
  //       pipeline.issuanceCapability.options.feedFolder,
  //       ethLatAmTicketFeedUrl,
  //       pipeline.issuanceCapability.options.feedId,
  //       ZUPASS_EDDSA_PRIVATE_KEY,
  //       EthLatAmManualAttendeeEmail,
  //       EthLatAmManualAttendeeIdentity
  //     );

  //     expectLength(ManualAttendeeTickets, 2);
  //     const ManualAttendeeTicket = ManualAttendeeTickets[0];
  //     expectIsEdDSATicketPCD(ManualAttendeeTicket);
  //     expect(ManualAttendeeTicket.claim.ticket.attendeeEmail).to.eq(
  //       EthLatAmManualAttendeeEmail
  //     );
  //     const ManualAttendeePODTicket = ManualAttendeeTickets[1];
  //     expectIsPODTicketPCD(ManualAttendeePODTicket);
  //     expect(ManualAttendeePODTicket.claim.ticket.attendeeEmail).to.eq(
  //       EthLatAmManualAttendeeEmail
  //     );

  //     const ManualBouncerTickets = await requestTicketsFromPipeline(
  //       pipeline.issuanceCapability.options.feedFolder,
  //       ethLatAmTicketFeedUrl,
  //       pipeline.issuanceCapability.options.feedId,
  //       ZUPASS_EDDSA_PRIVATE_KEY,
  //       EthLatAmManualBouncerEmail,
  //       EthLatAmManualBouncerIdentity
  //     );
  //     expectLength(ManualBouncerTickets, 2);
  //     const ManualBouncerTicket = ManualBouncerTickets[0];
  //     expectIsEdDSATicketPCD(ManualBouncerTicket);
  //     expect(ManualBouncerTicket.claim.ticket.attendeeEmail).to.eq(
  //       EthLatAmManualBouncerEmail
  //     );
  //     expect(ManualBouncerTicket.claim.ticket.imageUrl).to.be.undefined;

  //     const ManualBouncerPODTicket = ManualBouncerTickets[1];
  //     expectIsPODTicketPCD(ManualBouncerPODTicket);
  //     expect(ManualBouncerPODTicket.claim.ticket.attendeeEmail).to.eq(
  //       EthLatAmManualBouncerEmail
  //     );
  //     expect(ManualBouncerPODTicket.claim.ticket.imageUrl).to.be.undefined;

  //     await checkPipelineInfoEndpoint(giBackend, pipeline);
  //   }
  // );

  // TODO: make this test work for multi-email issuance
  // step(
  //   "Pretix pipeline Semaphore groups contain correct members",
  //   async function () {
  //     await pipeline.load();

  //     const semaphoreGroupAll = await requestGenericIssuanceSemaphoreGroup(
  //       process.env.PASSPORT_SERVER_URL as string,
  //       pipeline.id,
  //       ethLatAmSemaphoreGroupIds.all
  //     );
  //     expectTrue(semaphoreGroupAll.success);
  //     expectLength(semaphoreGroupAll.value.members, 4);
  //     expect(semaphoreGroupAll.value.members).to.deep.include.members([
  //       EthLatAmBouncerIdentity.commitment.toString(),
  //       EthLatAmAttendeeIdentity.commitment.toString(),
  //       EthLatAmManualAttendeeIdentity.commitment.toString(),
  //       EthLatAmManualBouncerIdentity.commitment.toString()
  //     ]);

  //     const semaphoreGroupBouncers = await requestGenericIssuanceSemaphoreGroup(
  //       process.env.PASSPORT_SERVER_URL as string,
  //       pipeline.id,
  //       ethLatAmSemaphoreGroupIds.bouncers
  //     );

  //     expectTrue(semaphoreGroupBouncers.success);
  //     expectLength(semaphoreGroupBouncers.value.members, 2);
  //     expect(semaphoreGroupBouncers.value.members).to.deep.include.members([
  //       EthLatAmBouncerIdentity.commitment.toString(),
  //       EthLatAmManualBouncerIdentity.commitment.toString()
  //     ]);

  //     const semaphoreGroupAttendees =
  //       await requestGenericIssuanceSemaphoreGroup(
  //         process.env.PASSPORT_SERVER_URL as string,
  //         pipeline.id,
  //         ethLatAmSemaphoreGroupIds.attendees
  //       );

  //     expectTrue(semaphoreGroupAttendees.success);
  //     expectLength(semaphoreGroupAttendees.value.members, 2);
  //     expect(semaphoreGroupAttendees.value.members).to.deep.include.members([
  //       EthLatAmAttendeeIdentity.commitment.toString(),
  //       EthLatAmManualAttendeeIdentity.commitment.toString()
  //     ]);

  //     const semaphoreGroupAttendeesAndBouncers =
  //       await requestGenericIssuanceSemaphoreGroup(
  //         process.env.PASSPORT_SERVER_URL as string,
  //         pipeline.id,
  //         ethLatAmSemaphoreGroupIds.attendeesAndBouncers
  //       );

  //     expectTrue(semaphoreGroupAttendeesAndBouncers.success);
  //     expectLength(semaphoreGroupAttendeesAndBouncers.value.members, 4);
  //     expect(
  //       semaphoreGroupAttendeesAndBouncers.value.members
  //     ).to.deep.include.members([
  //       EthLatAmBouncerIdentity.commitment.toString(),
  //       EthLatAmAttendeeIdentity.commitment.toString(),
  //       EthLatAmManualAttendeeIdentity.commitment.toString(),
  //       EthLatAmManualBouncerIdentity.commitment.toString()
  //     ]);
  //   }
  // );
});

/**
 * Given some email PCDs, expect some list of tickets, identified by email addresses
 * to be returned.
 *
 * NOTE: our feeds issue both POD and non-POD tickets. Thus you should expect to see
 * 2 PCDs for each email address.
 */
async function testGetTickets(
  pipeline: PretixPipeline,
  emailPCDs: EmailPCD[],
  identity: Identity,
  expectedEmails: string[]
): Promise<void> {
  const attendeeTickets = await requestTicketsFromPipelineWithEmailPCDs(
    pipeline.issuanceCapability.options.feedFolder,
    pipeline.issuanceCapability.feedUrl,
    pipeline.issuanceCapability.options.feedId,
    identity,
    emailPCDs
  );
  expectLength(attendeeTickets, expectedEmails.length);

  while (attendeeTickets.length > 0) {
    if (expectedEmails.length === 0) {
      throw new Error("expected more emails than were provided");
    }
    const checkingEmail = expectedEmails.pop();
    const matchingTicket = attendeeTickets.find(
      (t) => t.claim.ticket.attendeeEmail === checkingEmail
    );
    expectToExist(matchingTicket);
    attendeeTickets.splice(attendeeTickets.indexOf(matchingTicket), 1);
  }
}

/**
 * Asks Zupass server for Email PCD, which is necessary to prove ownership of an email address
 * to Feed servers.
 */
async function testGetEmailPCDs(
  giBackend: Zupass,
  testUserIdentity: Identity,
  expectedEmails: string[]
): Promise<EmailPCD[]> {
  const pollFeedResult = await requestPollFeed(
    `${giBackend.expressContext.localEndpoint}/feeds`,
    {
      pcd: await makeTestCredential(
        testUserIdentity,
        ZUPASS_CREDENTIAL_REQUEST
      ),
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
  // the feed issues both POD and non-POD email PCDs, so we expect 2 PCDs for each email
  expect(action.pcds.length).to.eq(expectedEmails.length * 2);

  const result: EmailPCD[] = [];

  const serverPublicKey =
    await giBackend.services.issuanceService?.getEdDSAPublicKey();
  assert(serverPublicKey, "Server public key should exist");

  for (const pcd of action.pcds) {
    expect(pcd.type).to.be.oneOf([EmailPCDTypeName, PODEmailPCDTypeName]);

    if (pcd.type === EmailPCDTypeName) {
      // Check that the PCD contains the expected email address
      const deserializedPCD = await EmailPCDPackage.deserialize(pcd.pcd);
      expect(expectedEmails).to.include(deserializedPCD.claim.emailAddress);
      result.push(deserializedPCD);

      // Check that the PCD verifies
      expect(await EmailPCDPackage.verify(deserializedPCD)).to.be.true;

      // Check the public key
      expect(deserializedPCD.proof.eddsaPCD.claim.publicKey).to.deep.eq(
        serverPublicKey
      );
    } else {
      // Check the PODEmailPCD
      const podEmailPCD = await PODEmailPCDPackage.deserialize(pcd.pcd);
      expect(podEmailPCD.claim.signerPublicKey).to.deep.eq(
        encodePublicKey([
          BigInt(`0x${serverPublicKey[0]}`),
          BigInt(`0x${serverPublicKey[1]}`)
        ])
      );
      expect(expectedEmails).to.include(
        podEmailPCD.claim.podEntries.emailAddress.value
      );
      /**
       * @todo right now the POD Email PCDs aren't used for anything, so we don't
       * return them here. When we do, we should push them into the result array.
       */

      // Check that the PODEmailPCD verifies
      expect(await PODEmailPCDPackage.verify(podEmailPCD)).to.be.true;
    }
  }

  return result;
}
