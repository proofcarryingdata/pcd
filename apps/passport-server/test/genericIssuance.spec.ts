import { getEdDSAPublicKey, newEdDSAPrivateKey } from "@pcd/eddsa-pcd";
import {
  EdDSATicketPCD,
  EdDSATicketPCDPackage,
  expectIsEdDSATicketPCD
} from "@pcd/eddsa-ticket-pcd";
import { EmailPCDPackage } from "@pcd/email-pcd";
import {
  CSVPipelineDefinition,
  FeedCredentialPayload,
  GenericPretixProduct,
  InfoResult,
  LemonadePipelineDefinition,
  PipelineDefinition,
  PipelineLogLevel,
  PipelineType,
  PodboxTicketActionResponseValue,
  PodboxTicketActionResult,
  PollFeedResult,
  PretixPipelineDefinition,
  createFeedCredentialPayload,
  createTicketActionCredentialPayload,
  getI18nString,
  requestGenericIssuanceHistoricalSemaphoreGroup,
  requestGenericIssuanceSemaphoreGroup,
  requestGenericIssuanceSemaphoreGroupRoot,
  requestGenericIssuanceValidSemaphoreGroup,
  requestPipelineInfo,
  requestPodboxTicketAction,
  requestPollFeed
} from "@pcd/passport-interface";
import { expectIsReplaceInFolderAction } from "@pcd/pcd-collection";
import { ArgumentTypeName, SerializedPCD } from "@pcd/pcd-types";
import {
  SemaphoreGroupPCDPackage,
  deserializeSemaphoreGroup,
  serializeSemaphoreGroup
} from "@pcd/semaphore-group-pcd";
import { SemaphoreIdentityPCDPackage } from "@pcd/semaphore-identity-pcd";
import {
  SemaphoreSignaturePCD,
  SemaphoreSignaturePCDPackage
} from "@pcd/semaphore-signature-pcd";
import { ONE_DAY_MS, ONE_MINUTE_MS, ONE_SECOND_MS } from "@pcd/util";
import { Identity } from "@semaphore-protocol/identity";
import { expect } from "chai";
import { randomUUID } from "crypto";
import "mocha";
import { step } from "mocha-steps";
import * as MockDate from "mockdate";
import { rest } from "msw";
import { SetupServer, setupServer } from "msw/node";
import urljoin from "url-join";
import { LemonadeOAuthCredentials } from "../src/apis/lemonade/auth";
import { ILemonadeAPI, getLemonadeAPI } from "../src/apis/lemonade/lemonadeAPI";
import { LemonadeTicket, LemonadeTicketType } from "../src/apis/lemonade/types";
import { stopApplication } from "../src/application";
import { PipelineCheckinDB } from "../src/database/queries/pipelineCheckinDB";
import { PipelineConsumerDB } from "../src/database/queries/pipelineConsumerDB";
import { PipelineDefinitionDB } from "../src/database/queries/pipelineDefinitionDB";
import { PipelineUserDB } from "../src/database/queries/pipelineUserDB";
import { GenericIssuanceService } from "../src/services/generic-issuance/genericIssuanceService";
import {
  LEMONADE_CHECKER,
  LemonadePipeline
} from "../src/services/generic-issuance/pipelines/LemonadePipeline";
import {
  PRETIX_CHECKER,
  PretixPipeline
} from "../src/services/generic-issuance/pipelines/PretixPipeline";
import {
  Pipeline,
  PipelineUser
} from "../src/services/generic-issuance/pipelines/types";
import { Zupass } from "../src/types";
import { testCSVPipeline } from "./generic-issuance/testCSVPipeline";
import {
  LemonadeDataMocker,
  LemonadeUser
} from "./lemonade/LemonadeDataMocker";
import {
  customLemonadeTicketHandler,
  getMockLemonadeHandlers,
  loadApolloErrorMessages,
  unregisteredLemonadeUserHandler
} from "./lemonade/MockLemonadeServer";
import { TestTokenSource } from "./lemonade/TestTokenSource";
import {
  GenericPretixDataMocker,
  NAME_QUESTION_IDENTIFIER
} from "./pretix/GenericPretixDataMocker";
import { getMockGenericPretixHandlers } from "./pretix/MockGenericPretixServer";
import { overrideEnvironment, testingEnv } from "./util/env";
import { startTestingApp } from "./util/startTestingApplication";
import {
  expectFalse,
  expectLength,
  expectToExist,
  expectTrue
} from "./util/util";

/**
 * {@link GenericIssuanceService}
 * Rough test of the generic issuance functionality defined in this PR, just
 * to make sure that ends are coming together neatly. Totally incomplete.
 *
 * TODO:
 * - finish this during Cat Week.
 * - comprehensive tests for both Pretix and Lemonade cases
 */
describe("Generic Issuance", function () {
  this.timeout(60_000);
  const nowDate = new Date();
  const now = Date.now();

  // The Apollo client used by Lemonade does not load error messages by
  // default, so we have to call this.
  loadApolloErrorMessages();

  let ZUPASS_EDDSA_PRIVATE_KEY: string;
  let giBackend: Zupass;
  let giService: GenericIssuanceService | null;

  const lemonadeOAuthClientId = "edge-city-client-id";

  const adminGIUserId = randomUUID();
  const adminGIUserEmail = "admin@test.com";

  /**
   * Generic Issuance product user who has set up a {@link LemonadePipeline}
   * via the Generic Issuance UI.
   */
  const edgeCityGIUserID = randomUUID();
  const edgeCityGIUserEmail = "edge-city-gi-user@test.com";

  /**
   * Generic Issuance product user who has set up a {@link PretixPipeline}
   * via the Generic Issuance UI.
   */
  const ethLatAmGIUserID = randomUUID();
  const ethLatAmGIUserEmail = "eth-lat-am-gi-user@test.com";
  const EthLatAmBouncerIdentity = new Identity();
  const EthLatAmAttendeeIdentity = new Identity();

  const EthLatAmManualAttendeeIdentity = new Identity();
  const EthLatAmManualAttendeeEmail = "manual_attendee@example.com";

  const EthLatAmManualBouncerIdentity = new Identity();
  const EthLatAmManualBouncerEmail = "manual_bouncer@example.com";

  const lemonadeBackend = new LemonadeDataMocker();

  const EdgeCityLemonadeAccount = lemonadeBackend.addAccount(
    lemonadeOAuthClientId
  );

  const EdgeCityDenver = EdgeCityLemonadeAccount.addEvent("Edge City Denver");

  /**
   * Attendee ticket type. In reality there will be several.
   */
  const EdgeCityAttendeeTicketType: LemonadeTicketType =
    EdgeCityLemonadeAccount.addTicketType(EdgeCityDenver._id, "ga");
  const EdgeCityBouncerTicketType: LemonadeTicketType =
    EdgeCityLemonadeAccount.addTicketType(EdgeCityDenver._id, "bouncer");

  /**
   * Most tests below need a person who is checking tickets {@link EdgeCityDenverBouncer}
   * and a person whose ticket needs to be checked in (@link Attendee)
   */
  const EdgeCityDenverAttendee: LemonadeUser = lemonadeBackend.addUser(
    "attendee@example.com",
    "attendee",
    "smith"
  );
  const EdgeCityDenverAttendeeIdentity = new Identity();
  const EdgeCityAttendeeTicket: LemonadeTicket =
    EdgeCityLemonadeAccount.addUserTicket(
      EdgeCityDenver._id,
      EdgeCityAttendeeTicketType._id,
      EdgeCityDenverAttendee._id,
      `${EdgeCityDenverAttendee.first_name} ${EdgeCityDenverAttendee.last_name}`
    );

  /**
   * Similar to {@link EdgeCityDenverAttendee}
   * Person who has a {@link LemonadeTicket} that does not have a bouncer ticket,
   * i.e. a ticket whose 'product id' or 'tier' is set up to be a 'superuser' ticket
   * by the Generic Issuance User with id {@link edgeCityGIUserID}.
   */
  const EdgeCityDenverBouncer: LemonadeUser = lemonadeBackend.addUser(
    "bouncer@example.com",
    "bouncer",
    "bob"
  );
  const EdgeCityBouncerIdentity = new Identity();
  const EdgeCityDenverBouncerTicket = EdgeCityLemonadeAccount.addUserTicket(
    EdgeCityDenver._id,
    EdgeCityBouncerTicketType._id,
    EdgeCityDenverBouncer._id,
    `${EdgeCityDenverBouncer.first_name} ${EdgeCityDenverBouncer.last_name}`
  );

  /**
   * Similar to {@link EdgeCityBouncerIdentity}, except configured to be
   * a bouncer via the {@link LemonadePipelineOptions#superuserEmails}
   */
  const EdgeCityDenverBouncer2: LemonadeUser = lemonadeBackend.addUser(
    "bouncer2@example.com",
    "bouncer2",
    "joe"
  );
  const EdgeCityBouncer2Identity = new Identity();
  const EdgeCityDenverBouncer2Ticket = EdgeCityLemonadeAccount.addUserTicket(
    EdgeCityDenver._id,
    EdgeCityAttendeeTicketType._id,
    EdgeCityDenverBouncer2._id,
    `${EdgeCityDenverBouncer2.first_name} ${EdgeCityDenverBouncer2.last_name}`
  );

  const EdgeCityManualAttendeeIdentity = new Identity();
  const EdgeCityManualAttendeeEmail = "manual_attendee@example.com";

  const EdgeCityManualBouncerIdentity = new Identity();
  const EdgeCityManualBouncerEmail = "manual_bouncer@example.com";

  const lemonadeTokenSource = new TestTokenSource();
  const lemonadeAPI: ILemonadeAPI = getLemonadeAPI(
    // LemonadeAPI takes an optional `AuthTokenSource` as a parameter. This
    // allows us to mock out the generation of tokens that would otherwise be
    // done by making OAuth requests.
    // TestTokenSource simply returns the `oauthClientId` as the token.
    lemonadeTokenSource
  );
  const edgeCitySemaphoreGroupIds = {
    all: randomUUID(),
    bouncers: randomUUID(),
    attendees: randomUUID(),
    attendeesAndBouncers: randomUUID()
  };
  const lemonadeBackendUrl = "http://localhost";
  const edgeCityDenverEventId = randomUUID();
  const edgeCityDenverAttendeeProductId = randomUUID();
  const edgeCityDenverBouncerProductId = randomUUID();
  const edgeCityPipeline: LemonadePipelineDefinition = {
    ownerUserId: edgeCityGIUserID,
    timeCreated: new Date().toISOString(),
    timeUpdated: new Date().toISOString(),
    id: randomUUID(),
    /**
     * TODO: test that the API that lets the frontend make changes to {@link Pipeline}s
     * on the backend respects generic issuance user permissions. @richard
     */
    editorUserIds: [],
    options: {
      feedOptions: {
        // TODO: @richard what do the organizers want these tickets to be called?
        feedDescription: "Edge City Denver tickets!",
        feedDisplayName: "Edge City Denver",
        feedFolder: "Edge City",
        feedId: "edge-city"
      },
      // Authentication values are not relevant for testing, except for `oauthClientId`
      oauthAudience: "test",
      oauthClientId: lemonadeOAuthClientId,
      oauthClientSecret: "test",
      oauthServerUrl: "test",
      backendUrl: lemonadeBackendUrl,
      superuserEmails: [EdgeCityDenverBouncer2.email],
      events: [
        {
          externalId: EdgeCityDenver._id,
          name: EdgeCityDenver.title,
          genericIssuanceEventId: edgeCityDenverEventId,
          ticketTypes: [
            {
              externalId: EdgeCityBouncerTicketType._id,
              genericIssuanceProductId: edgeCityDenverBouncerProductId,
              isSuperUser: true,
              name: "Bouncer"
            },
            {
              externalId: EdgeCityAttendeeTicketType._id,
              genericIssuanceProductId: edgeCityDenverAttendeeProductId,
              isSuperUser: false,
              name: "Attendee"
            }
          ]
        }
      ],
      manualTickets: [
        {
          id: randomUUID(),
          eventId: edgeCityDenverEventId,
          productId: edgeCityDenverAttendeeProductId,
          attendeeName: "Manual Attendee",
          attendeeEmail: EdgeCityManualAttendeeEmail
        },
        {
          id: randomUUID(),
          eventId: edgeCityDenverEventId,
          productId: edgeCityDenverBouncerProductId,
          attendeeName: "Manual Bouncer",
          attendeeEmail: EdgeCityManualBouncerEmail
        }
      ],
      semaphoreGroups: [
        {
          // All attendees, irrespective of product type
          name: "All",
          groupId: edgeCitySemaphoreGroupIds.all,
          memberCriteria: [{ eventId: edgeCityDenverEventId }]
        },
        {
          // Holders of bouncer-tier tickets
          name: "Bouncers",
          groupId: edgeCitySemaphoreGroupIds.bouncers,
          memberCriteria: [
            {
              eventId: edgeCityDenverEventId,
              productId: edgeCityDenverBouncerProductId
            }
          ]
        },
        {
          // Holders of attendee-tier tickets
          name: "Attendees",
          groupId: edgeCitySemaphoreGroupIds.attendees,
          memberCriteria: [
            {
              eventId: edgeCityDenverEventId,
              productId: edgeCityDenverAttendeeProductId
            }
          ]
        },
        {
          // Both holders of bouncer-tier tickets and attendee-tier tickets.
          // In this case, this group will have the same membership as the
          // "all" group, but if there were more tiers then this demonstrates
          // how it would be possible to create arbitrary groupings.
          name: "Attendees and Bouncers",
          groupId: edgeCitySemaphoreGroupIds.attendeesAndBouncers,
          memberCriteria: [
            {
              eventId: edgeCityDenverEventId,
              productId: edgeCityDenverBouncerProductId
            },
            {
              eventId: edgeCityDenverEventId,
              productId: edgeCityDenverAttendeeProductId
            }
          ]
        }
      ]
    },
    type: PipelineType.Lemonade
  };

  let mockServer: SetupServer;
  const pretixBackend = new GenericPretixDataMocker();
  const ethLatAmPretixOrganizer = pretixBackend.get().ethLatAmOrganizer;
  const ethLatAmEvent = ethLatAmPretixOrganizer.ethLatAm;
  const ethLatAmProducts = ethLatAmPretixOrganizer.productsByEventID.get(
    ethLatAmEvent.slug
  );
  // TODO: how are we going to recommend their Pretix is set up?
  // @richard @rob
  expectToExist(ethLatAmProducts);
  /**
   * We expect an Attendee, a Bouncer, and a Tshirt product
   */
  expectLength(ethLatAmProducts, 3);
  const ethLatAmSuperuserProductIds: number[] = [
    pretixBackend.get().ethLatAmOrganizer.ethLatAmBouncerProduct.id
  ];
  expectLength(ethLatAmSuperuserProductIds, 1);
  expect([]);

  const ethLatAmEventId = randomUUID();
  const ethLatAmConfiguredEvents = [
    {
      genericIssuanceId: ethLatAmEventId,
      externalId: ethLatAmEvent.slug,
      name: "Eth LatAm",
      products: ethLatAmProducts.map((product: GenericPretixProduct) => {
        return {
          externalId: product.id.toString(),
          genericIssuanceId: randomUUID(),
          name: getI18nString(product.name),
          isSuperUser: ethLatAmSuperuserProductIds.includes(product.id),
          nameQuestionPretixQuestionIdentitifier: NAME_QUESTION_IDENTIFIER
        };
      })
    }
  ];

  const ethLatAmAttendeeProduct = ethLatAmConfiguredEvents[0].products.find(
    (product) => product.name == "eth-latam-attendee-product"
  );
  expectToExist(ethLatAmAttendeeProduct);
  const ethLatAmBouncerProduct = ethLatAmConfiguredEvents[0].products.find(
    (product) => product.name == "eth-lat-am-bouncer-product"
  );
  expectToExist(ethLatAmBouncerProduct);

  const ethLatAmSemaphoreGroupIds = {
    all: randomUUID(),
    bouncers: randomUUID(),
    attendees: randomUUID(),
    attendeesAndBouncers: randomUUID()
  };

  const ethLatAmPipeline: PretixPipelineDefinition = {
    ownerUserId: ethLatAmGIUserID,
    timeCreated: new Date().toISOString(),
    timeUpdated: new Date().toISOString(),
    id: randomUUID(),
    /**
     * TODO: test that the API that lets the frontend make changes to {@link Pipeline}s
     * on the backend respects generic issuance user permissions. @richard
     */
    editorUserIds: [],
    options: {
      // https://ethlatam.org/
      feedOptions: {
        feedDescription: "Eth Lat Am tickets! <copy>", // TODO: @richard what's the best copy here?
        feedDisplayName: "Eth LatAm",
        feedFolder: "Eth LatAm",
        feedId: "eth-latam"
        // TODO: product question - would users (pipeline admins) want to
        // customize other branding for their feed issuance? e.g. a nice image
        // or a custom font, or animation, or making it clickable, or have
        // some other built in functionality? We've been thinking about issuing
        // announcements for edge city, what might a cool announcement look like?
      },
      events: ethLatAmConfiguredEvents,
      manualTickets: [
        {
          id: randomUUID(),
          eventId: ethLatAmEventId,
          productId: ethLatAmAttendeeProduct.genericIssuanceId,
          attendeeEmail: EthLatAmManualAttendeeEmail,
          attendeeName: "Manual Attendee"
        },
        {
          id: randomUUID(),
          eventId: ethLatAmEventId,
          productId: ethLatAmBouncerProduct.genericIssuanceId,
          attendeeEmail: EthLatAmManualBouncerEmail,
          attendeeName: "Manual Bouncer"
        }
      ],
      semaphoreGroups: [
        {
          // All attendees, irrespective of product type
          name: "All EthLatAm Attendees",
          groupId: ethLatAmSemaphoreGroupIds.all,
          memberCriteria: [{ eventId: ethLatAmEventId }]
        },
        {
          // Holders of bouncer-tier tickets
          name: "EthLatAm Bouncers",
          groupId: ethLatAmSemaphoreGroupIds.bouncers,
          memberCriteria: [
            {
              eventId: ethLatAmEventId,
              productId: ethLatAmBouncerProduct.genericIssuanceId
            }
          ]
        },
        {
          // Holders of attendee-tier tickets
          name: "EthLatAm Attendees",
          groupId: ethLatAmSemaphoreGroupIds.attendees,
          memberCriteria: [
            {
              eventId: ethLatAmEventId,
              productId: ethLatAmAttendeeProduct.genericIssuanceId
            }
          ]
        },
        {
          // Both holders of bouncer-tier tickets and attendee-tier tickets.
          // In this case, this group will have the same membership as the
          // "all" group, but if there were more tiers then this demonstrates
          // how it would be possible to create arbitrary groupings.
          name: "EthLatAm Bouncers and Attendees",
          groupId: ethLatAmSemaphoreGroupIds.attendeesAndBouncers,
          memberCriteria: [
            {
              eventId: ethLatAmEventId,
              productId: ethLatAmBouncerProduct.genericIssuanceId
            },
            {
              eventId: ethLatAmEventId,
              productId: ethLatAmAttendeeProduct.genericIssuanceId
            }
          ]
        }
      ],
      pretixAPIKey: ethLatAmPretixOrganizer.token,
      pretixOrgUrl: ethLatAmPretixOrganizer.orgUrl
    },
    type: PipelineType.Pretix
  };

  const csvPipeline: CSVPipelineDefinition = {
    type: PipelineType.CSV,
    ownerUserId: ethLatAmGIUserID,
    timeCreated: new Date().toISOString(),
    timeUpdated: new Date().toISOString(),
    id: randomUUID(),
    /**
     * TODO: test that the API that lets the frontend make changes to {@link Pipeline}s
     * on the backend respects generic issuance user permissions. @richard
     */
    editorUserIds: [],
    options: {
      csv: `title,image
t1,i1
t2,i1`,
      feedOptions: {
        feedDescription: "CSV goodies",
        feedDisplayName: "CSV goodies",
        feedFolder: "goodie bag",
        feedId: "goodie-bag"
      }
    }
  };

  const pipelineDefinitions = [ethLatAmPipeline, edgeCityPipeline, csvPipeline];

  /**
   * Sets up a Zupass/Generic issuance backend with two pipelines:
   * - {@link LemonadePipeline}, as defined by {@link edgeCityPipeline}
   * - {@link PretixPipeline}, as defined by {@link ethLatAmPipeline}
   */
  this.beforeAll(async () => {
    // This has to be done here as it requires an `await`
    const zupassPublicKey = JSON.stringify(
      await getEdDSAPublicKey(testingEnv.SERVER_EDDSA_PRIVATE_KEY as string)
    );

    await overrideEnvironment({
      GENERIC_ISSUANCE_ZUPASS_PUBLIC_KEY: zupassPublicKey,
      ...testingEnv
    });

    giBackend = await startTestingApp({
      lemonadeAPI
    });

    const userDB = new PipelineUserDB(giBackend.context.dbPool);
    const ethLatAmGIUser: PipelineUser = {
      id: ethLatAmGIUserID,
      email: ethLatAmGIUserEmail,
      isAdmin: false,
      timeCreated: nowDate,
      timeUpdated: nowDate
    };
    await userDB.updateUserById(ethLatAmGIUser);
    assertUserMatches(
      {
        id: ethLatAmGIUserID,
        email: ethLatAmGIUserEmail,
        isAdmin: false,
        timeCreated: nowDate,
        timeUpdated: nowDate
      },
      await userDB.getUserById(ethLatAmGIUser.id)
    );
    const edgeCityDenverUser: PipelineUser = {
      id: edgeCityGIUserID,
      email: edgeCityGIUserEmail,
      isAdmin: false,
      timeCreated: nowDate,
      timeUpdated: nowDate
    };
    await userDB.updateUserById(edgeCityDenverUser);
    assertUserMatches(
      {
        id: edgeCityGIUserID,
        email: edgeCityGIUserEmail,
        isAdmin: false,
        timeCreated: nowDate,
        timeUpdated: nowDate
      },
      await userDB.getUserById(edgeCityDenverUser.id)
    );

    const pretixOrgUrls = pretixBackend.get().organizersByOrgUrl.keys();
    mockServer = setupServer(
      ...getMockGenericPretixHandlers(pretixOrgUrls, pretixBackend),
      ...getMockLemonadeHandlers(lemonadeBackend, lemonadeBackendUrl)
    );
    // The mock server will intercept any requests for URLs that are registered
    // with it. Unhandled requests will bypass the mock server.
    mockServer.listen({ onUnhandledRequest: "bypass" });

    ZUPASS_EDDSA_PRIVATE_KEY = process.env.SERVER_EDDSA_PRIVATE_KEY as string;
    giService = giBackend.services.genericIssuanceService;
    await giService?.stop();
    const pipelineDefinitionDB = new PipelineDefinitionDB(
      giBackend.context.dbPool
    );
    await pipelineDefinitionDB.clearAllDefinitions();
    await pipelineDefinitionDB.setDefinitions(pipelineDefinitions);
    await giService?.loadAndInstantiatePipelines();
    await giService?.performAllPipelineLoads();
  });

  this.beforeEach(async () => {
    MockDate.set(now);
  });

  this.afterEach(async () => {
    mockServer.resetHandlers();
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

    // TODO: comprehensive tests of create update read delete
  });

  /**
   * Tests for {@link LemonadePipeline} reading from a mocked
   * Edge Cities Denver lemonade configuration, and issuing
   * {@link EdDSATicketPCD} tickets that can be checked in
   * using the Zupass client.
   *
   * @brian and @richard discussed building out a separate app for scanning
   * curious to hear thoughts from rest of team about this
   */
  step(
    "LemonadePipeline feed issuance and checkin for Edge City Denver",
    async () => {
      expectToExist(giService);
      const pipelines = await giService.getAllPipelines();
      expectToExist(pipelines);
      expectLength(pipelines, 3);
      const edgeCityDenverPipeline = pipelines.find(LemonadePipeline.is);
      expectToExist(edgeCityDenverPipeline);
      const edgeCityDenverTicketFeedUrl =
        edgeCityDenverPipeline.issuanceCapability.feedUrl;
      const AttendeeTickets = await requestTicketsFromPipeline(
        edgeCityDenverPipeline.issuanceCapability.options.feedFolder,
        edgeCityDenverTicketFeedUrl,
        edgeCityDenverPipeline.issuanceCapability.options.feedId,
        ZUPASS_EDDSA_PRIVATE_KEY,
        EdgeCityDenverAttendee.email,
        EdgeCityDenverAttendeeIdentity
      );
      expectLength(AttendeeTickets, 1);
      const AttendeeTicket = AttendeeTickets[0];
      expectIsEdDSATicketPCD(AttendeeTicket);
      expect(AttendeeTicket.claim.ticket.attendeeEmail)
        .to.eq(EdgeCityAttendeeTicket.user_email)
        .to.eq(EdgeCityDenverAttendee.email);

      const BouncerTickets = await requestTicketsFromPipeline(
        edgeCityDenverPipeline.issuanceCapability.options.feedFolder,
        edgeCityDenverTicketFeedUrl,
        edgeCityDenverPipeline.issuanceCapability.options.feedId,
        ZUPASS_EDDSA_PRIVATE_KEY,
        EdgeCityDenverBouncerTicket.user_email,
        EdgeCityBouncerIdentity
      );
      expectLength(BouncerTickets, 1);
      const BouncerTicket = BouncerTickets[0];
      expectIsEdDSATicketPCD(BouncerTicket);
      expect(BouncerTicket.claim.ticket.attendeeEmail)
        .to.eq(EdgeCityDenverBouncerTicket.user_email)
        .to.eq(EdgeCityDenverBouncer.email);

      const bouncerChecksInAttendee = await requestCheckInPipelineTicket(
        edgeCityDenverPipeline.checkinCapability.getCheckinUrl(),
        ZUPASS_EDDSA_PRIVATE_KEY,
        EdgeCityDenverBouncerTicket.user_email,
        EdgeCityBouncerIdentity,
        AttendeeTicket
      );
      expect(bouncerChecksInAttendee.value).to.deep.eq({ success: true });

      // can't check in a ticket that's already checked in
      const bouncerChecksInAttendeeAgain = await requestCheckInPipelineTicket(
        edgeCityDenverPipeline.checkinCapability.getCheckinUrl(),
        ZUPASS_EDDSA_PRIVATE_KEY,
        EdgeCityDenverBouncerTicket.user_email,
        EdgeCityBouncerIdentity,
        AttendeeTicket
      );
      // TODO check for specific error type
      expect(bouncerChecksInAttendeeAgain.value).to.deep.contain({
        success: false
      });

      // can't check in a ticket using a ticket that isn't a
      // superuser ticket
      const atteendeeChecksInBouncerResult = await requestCheckInPipelineTicket(
        edgeCityDenverPipeline.checkinCapability.getCheckinUrl(),
        ZUPASS_EDDSA_PRIVATE_KEY,
        EdgeCityAttendeeTicket.user_email,
        EdgeCityDenverAttendeeIdentity,
        BouncerTicket
      );

      expect(atteendeeChecksInBouncerResult.value).to.deep.eq({
        success: false,
        error: { name: "NotSuperuser" }
      } satisfies PodboxTicketActionResponseValue);

      // can't check in a ticket with an email PCD signed by a non-Zupass private key
      const fakeBouncerCheckInBouncerResult =
        await requestCheckInPipelineTicket(
          edgeCityDenverPipeline.checkinCapability.getCheckinUrl(),
          newEdDSAPrivateKey(),
          EdgeCityAttendeeTicket.user_email,
          EdgeCityDenverAttendeeIdentity,
          BouncerTicket
        );
      expect(fakeBouncerCheckInBouncerResult.value).to.deep.eq({
        success: false,
        error: { name: "InvalidSignature" }
      } satisfies PodboxTicketActionResponseValue);

      const Bouncer2Tickets = await requestTicketsFromPipeline(
        edgeCityDenverPipeline.issuanceCapability.options.feedFolder,
        edgeCityDenverTicketFeedUrl,
        edgeCityDenverPipeline.issuanceCapability.options.feedId,
        ZUPASS_EDDSA_PRIVATE_KEY,
        EdgeCityDenverBouncer2Ticket.user_email,
        EdgeCityBouncer2Identity
      );
      expectLength(Bouncer2Tickets, 1);
      const Bouncer2Ticket = Bouncer2Tickets[0];
      expectIsEdDSATicketPCD(Bouncer2Ticket);
      expect(Bouncer2Ticket.claim.ticket.attendeeEmail)
        .to.eq(EdgeCityDenverBouncer2Ticket.user_email)
        .to.eq(EdgeCityDenverBouncer2.email);

      const bouncer2ChecksInSelf = await requestCheckInPipelineTicket(
        edgeCityDenverPipeline.checkinCapability.getCheckinUrl(),
        ZUPASS_EDDSA_PRIVATE_KEY,
        EdgeCityDenverBouncer2Ticket.user_email,
        EdgeCityBouncer2Identity,
        Bouncer2Ticket
      );
      expect(bouncer2ChecksInSelf.value).to.deep.eq({ success: true });

      const ManualAttendeeTickets = await requestTicketsFromPipeline(
        edgeCityDenverPipeline.issuanceCapability.options.feedFolder,
        edgeCityDenverTicketFeedUrl,
        edgeCityDenverPipeline.issuanceCapability.options.feedId,
        ZUPASS_EDDSA_PRIVATE_KEY,
        EdgeCityManualAttendeeEmail,
        EdgeCityManualAttendeeIdentity
      );
      expectLength(ManualAttendeeTickets, 1);
      const ManualAttendeeTicket = ManualAttendeeTickets[0];
      expectIsEdDSATicketPCD(ManualAttendeeTicket);
      expect(ManualAttendeeTicket.claim.ticket.attendeeEmail).to.eq(
        EdgeCityManualAttendeeEmail
      );

      const ManualBouncerTickets = await requestTicketsFromPipeline(
        edgeCityDenverPipeline.issuanceCapability.options.feedFolder,
        edgeCityDenverTicketFeedUrl,
        edgeCityDenverPipeline.issuanceCapability.options.feedId,
        ZUPASS_EDDSA_PRIVATE_KEY,
        EdgeCityManualBouncerEmail,
        EdgeCityManualBouncerIdentity
      );
      expectLength(ManualBouncerTickets, 1);
      const ManualBouncerTicket = ManualBouncerTickets[0];
      expectIsEdDSATicketPCD(ManualBouncerTicket);
      expect(ManualBouncerTicket.claim.ticket.attendeeEmail).to.eq(
        EdgeCityManualBouncerEmail
      );

      const manualBouncerChecksInManualAttendee =
        await requestCheckInPipelineTicket(
          edgeCityDenverPipeline.checkinCapability.getCheckinUrl(),
          ZUPASS_EDDSA_PRIVATE_KEY,
          EdgeCityManualBouncerEmail,
          EdgeCityManualBouncerIdentity,
          ManualAttendeeTicket
        );
      expect(manualBouncerChecksInManualAttendee.value).to.deep.eq({
        success: true
      });

      {
        const ManualAttendeeTickets = await requestTicketsFromPipeline(
          edgeCityDenverPipeline.issuanceCapability.options.feedFolder,
          edgeCityDenverTicketFeedUrl,
          edgeCityDenverPipeline.issuanceCapability.options.feedId,
          ZUPASS_EDDSA_PRIVATE_KEY,
          EdgeCityManualAttendeeEmail,
          EdgeCityManualAttendeeIdentity
        );
        expectLength(ManualAttendeeTickets, 1);
        const ManualAttendeeTicket = ManualAttendeeTickets[0];
        expectIsEdDSATicketPCD(ManualAttendeeTicket);
        expect(ManualAttendeeTicket.claim.ticket.attendeeEmail).to.eq(
          EdgeCityManualAttendeeEmail
        );
        expect(ManualAttendeeTicket.claim.ticket.isConsumed).to.eq(true);
        expect(ManualAttendeeTicket.claim.ticket.timestampConsumed).to.eq(
          Date.now()
        );
      }

      const manualBouncerChecksInManualAttendeeAgain =
        await requestCheckInPipelineTicket(
          edgeCityDenverPipeline.checkinCapability.getCheckinUrl(),
          ZUPASS_EDDSA_PRIVATE_KEY,
          EdgeCityManualBouncerEmail,
          EdgeCityManualBouncerIdentity,
          ManualAttendeeTicket
        );
      expect(manualBouncerChecksInManualAttendeeAgain.value).to.deep.eq({
        success: false,
        error: {
          name: "AlreadyCheckedIn",
          checkinTimestamp: new Date().toISOString(),
          checker: LEMONADE_CHECKER
        }
      } satisfies PodboxTicketActionResponseValue);

      const manualAttendeeChecksInManualBouncer =
        await requestCheckInPipelineTicket(
          edgeCityDenverPipeline.checkinCapability.getCheckinUrl(),
          ZUPASS_EDDSA_PRIVATE_KEY,
          EdgeCityManualAttendeeEmail,
          EdgeCityManualAttendeeIdentity,
          ManualBouncerTicket
        );
      expect(manualAttendeeChecksInManualBouncer.value).to.deep.eq({
        success: false,
        error: { name: "NotSuperuser" }
      } satisfies PodboxTicketActionResponseValue);

      // TODO test checking in manual attendee/bouncer
      // Currently not supported as these are not present in the Lemonade
      // backend, will be implemented with the pipeline as the check-in backend

      // Verify that consumers were saved for each user who requested tickets
      const consumerDB = new PipelineConsumerDB(giBackend.context.dbPool);
      const consumers = await consumerDB.loadByEmails(
        edgeCityDenverPipeline.id,
        [
          EdgeCityManualAttendeeEmail,
          EdgeCityManualBouncerEmail,
          EdgeCityDenverAttendee.email,
          EdgeCityDenverBouncer.email,
          EdgeCityDenverBouncer2.email
        ]
      );
      expectLength(consumers, 5);
      const edgeCityIssuanceDateTime = new Date();
      expect(consumers).to.deep.include.members([
        {
          email: EdgeCityManualAttendeeEmail,
          commitment: EdgeCityManualAttendeeIdentity.commitment.toString(),
          timeCreated: edgeCityIssuanceDateTime,
          timeUpdated: edgeCityIssuanceDateTime
        },
        {
          email: EdgeCityManualBouncerEmail,
          commitment: EdgeCityManualBouncerIdentity.commitment.toString(),
          timeCreated: edgeCityIssuanceDateTime,
          timeUpdated: edgeCityIssuanceDateTime
        },
        {
          email: EdgeCityDenverAttendee.email,
          commitment: EdgeCityDenverAttendeeIdentity.commitment.toString(),
          timeCreated: edgeCityIssuanceDateTime,
          timeUpdated: edgeCityIssuanceDateTime
        },
        {
          email: EdgeCityDenverBouncer.email,
          commitment: EdgeCityBouncerIdentity.commitment.toString(),
          timeCreated: edgeCityIssuanceDateTime,
          timeUpdated: edgeCityIssuanceDateTime
        },
        {
          email: EdgeCityDenverBouncer2.email,
          commitment: EdgeCityBouncer2Identity.commitment.toString(),
          timeCreated: edgeCityIssuanceDateTime,
          timeUpdated: edgeCityIssuanceDateTime
        }
      ]);

      await checkPipelineInfoEndpoint(giBackend, edgeCityDenverPipeline);
    }
  );

  step(
    "Lemonade pipeline Semaphore groups contain correct members",
    async function () {
      expectToExist(giService);
      const pipelines = await giService.getAllPipelines();
      expectToExist(pipelines);
      expectLength(pipelines, 3);
      const edgeCityDenverPipeline = pipelines.find(LemonadePipeline.is);
      expectToExist(edgeCityDenverPipeline);

      await edgeCityDenverPipeline.load();

      const semaphoreGroupAll = await requestGenericIssuanceSemaphoreGroup(
        process.env.PASSPORT_SERVER_URL as string,
        edgeCityDenverPipeline.id,
        edgeCitySemaphoreGroupIds.all
      );

      expectTrue(semaphoreGroupAll.success);
      expectLength(semaphoreGroupAll.value.members, 5);
      expect(semaphoreGroupAll.value.members).to.deep.include.members([
        EdgeCityBouncerIdentity.commitment.toString(),
        EdgeCityBouncer2Identity.commitment.toString(),
        EdgeCityDenverAttendeeIdentity.commitment.toString(),
        EdgeCityManualAttendeeIdentity.commitment.toString(),
        EdgeCityManualBouncerIdentity.commitment.toString()
      ]);

      const semaphoreGroupBouncers = await requestGenericIssuanceSemaphoreGroup(
        process.env.PASSPORT_SERVER_URL as string,
        edgeCityDenverPipeline.id,
        edgeCitySemaphoreGroupIds.bouncers
      );

      expectTrue(semaphoreGroupBouncers.success);
      expectLength(semaphoreGroupBouncers.value.members, 2);
      expect(semaphoreGroupBouncers.value.members).to.deep.include.members([
        EdgeCityBouncerIdentity.commitment.toString(),
        EdgeCityManualBouncerIdentity.commitment.toString()
      ]);

      const semaphoreGroupAttendees =
        await requestGenericIssuanceSemaphoreGroup(
          process.env.PASSPORT_SERVER_URL as string,
          edgeCityDenverPipeline.id,
          edgeCitySemaphoreGroupIds.attendees
        );

      expectTrue(semaphoreGroupAttendees.success);
      expectLength(semaphoreGroupAttendees.value.members, 3);
      expect(semaphoreGroupAttendees.value.members).to.deep.include.members([
        EdgeCityDenverAttendeeIdentity.commitment.toString(),
        EdgeCityManualAttendeeIdentity.commitment.toString(),
        // Bouncer2 has a specially configured "superuser email", but is not
        // a holder of a bouncer-tier ticket. Having a "superuser email" allows
        // a user to perform check-ins, but does not change the product type of
        // their ticket, and so does not change their Semaphore group
        // memberships.
        EdgeCityBouncer2Identity.commitment.toString()
      ]);

      const semaphoreGroupAttendeesAndBouncers =
        await requestGenericIssuanceSemaphoreGroup(
          process.env.PASSPORT_SERVER_URL as string,
          edgeCityDenverPipeline.id,
          edgeCitySemaphoreGroupIds.attendeesAndBouncers
        );

      expectTrue(semaphoreGroupAttendeesAndBouncers.success);
      expectLength(semaphoreGroupAttendeesAndBouncers.value.members, 5);
      expect(
        semaphoreGroupAttendeesAndBouncers.value.members
      ).to.deep.include.members([
        EdgeCityBouncerIdentity.commitment.toString(),
        EdgeCityBouncer2Identity.commitment.toString(),
        EdgeCityDenverAttendeeIdentity.commitment.toString(),
        EdgeCityManualAttendeeIdentity.commitment.toString(),
        EdgeCityManualBouncerIdentity.commitment.toString()
      ]);
    }
  );

  step(
    "New users can sign up, get added to group, prove group membership",
    async function () {
      expectToExist(giService);
      const pipelines = await giService.getAllPipelines();
      expectToExist(pipelines);
      expectLength(pipelines, 3);
      const edgeCityDenverPipeline = pipelines.find(LemonadePipeline.is);
      expectToExist(edgeCityDenverPipeline);

      // Test that a new user is added to the attendee group
      const newUser = lemonadeBackend.addUser(
        "newuser@example.com",
        "New",
        "User"
      );
      const newUserIdentity = new Identity();
      EdgeCityLemonadeAccount.addUserTicket(
        EdgeCityDenver._id,
        EdgeCityAttendeeTicketType._id,
        newUser._id,
        newUser.name
      );
      await edgeCityDenverPipeline.load();
      const edgeCityDenverTicketFeedUrl =
        edgeCityDenverPipeline.issuanceCapability.feedUrl;
      // The pipeline doesn't know that the user exists until they hit the feed
      const NewUserTickets = await requestTicketsFromPipeline(
        edgeCityDenverPipeline.issuanceCapability.options.feedFolder,
        edgeCityDenverTicketFeedUrl,
        edgeCityDenverPipeline.issuanceCapability.options.feedId,
        ZUPASS_EDDSA_PRIVATE_KEY,
        newUser.email,
        newUserIdentity
      );
      expectLength(NewUserTickets, 1);

      const attendeeGroupResponse = await requestGenericIssuanceSemaphoreGroup(
        process.env.PASSPORT_SERVER_URL as string,
        edgeCityDenverPipeline.id,
        edgeCitySemaphoreGroupIds.attendees
      );

      expectTrue(attendeeGroupResponse.success);
      expectLength(attendeeGroupResponse.value.members, 4);
      expect(attendeeGroupResponse.value.members).to.deep.include.members([
        EdgeCityDenverAttendeeIdentity.commitment.toString(),
        EdgeCityManualAttendeeIdentity.commitment.toString(),
        EdgeCityBouncer2Identity.commitment.toString(),
        newUserIdentity.commitment.toString()
      ]);
      const attendeeGroup = deserializeSemaphoreGroup(
        attendeeGroupResponse.value
      );

      const attendeesGroupRootResponse =
        await requestGenericIssuanceSemaphoreGroupRoot(
          process.env.PASSPORT_SERVER_URL as string,
          edgeCityDenverPipeline.id,
          edgeCitySemaphoreGroupIds.attendees
        );
      expectTrue(attendeesGroupRootResponse.success);
      expect(attendeesGroupRootResponse.value).to.eq(
        deserializeSemaphoreGroup(attendeeGroupResponse.value).root.toString()
      );

      const attendeeGroupValidResponse =
        await requestGenericIssuanceValidSemaphoreGroup(
          process.env.PASSPORT_SERVER_URL as string,
          edgeCityDenverPipeline.id,
          edgeCitySemaphoreGroupIds.attendees,
          attendeeGroup.root.toString()
        );

      expectTrue(attendeeGroupValidResponse.success);
      expectTrue(attendeeGroupValidResponse.value.valid);

      const newUserIdentityPCD = await SemaphoreIdentityPCDPackage.prove({
        identity: newUserIdentity
      });

      const groupPCD = await SemaphoreGroupPCDPackage.prove({
        externalNullifier: {
          argumentType: ArgumentTypeName.BigInt,
          value: attendeeGroup.root.toString()
        },
        signal: {
          argumentType: ArgumentTypeName.BigInt,
          value: "1"
        },
        group: {
          argumentType: ArgumentTypeName.Object,
          value: serializeSemaphoreGroup(
            attendeeGroup,
            attendeeGroupResponse.value.name
          )
        },
        identity: {
          argumentType: ArgumentTypeName.PCD,
          pcdType: SemaphoreIdentityPCDPackage.name,
          value: await SemaphoreIdentityPCDPackage.serialize(newUserIdentityPCD)
        }
      });

      expectTrue(await SemaphoreGroupPCDPackage.verify(groupPCD));

      const consumerDB = new PipelineConsumerDB(giBackend.context.dbPool);
      const consumer = (
        await consumerDB.loadByEmails(edgeCityPipeline.id, [newUser.email])
      )[0];
      expectToExist(consumer);
      const consumerUpdated = consumer.timeUpdated;
      const consumerCreated = consumer.timeCreated;
      expect(consumerCreated.getTime()).to.eq(consumerUpdated.getTime());
      MockDate.set(Date.now() + ONE_MINUTE_MS);

      const changedIdentity = new Identity();
      await requestTicketsFromPipeline(
        edgeCityDenverPipeline.issuanceCapability.options.feedFolder,
        edgeCityDenverTicketFeedUrl,
        edgeCityDenverPipeline.issuanceCapability.options.feedId,
        ZUPASS_EDDSA_PRIVATE_KEY,
        newUser.email,
        // The user has a new identity, which might occur if they reset their
        // Zupass account
        changedIdentity
      );

      {
        const newAttendeeGroupResponse =
          await requestGenericIssuanceSemaphoreGroup(
            process.env.PASSPORT_SERVER_URL as string,
            edgeCityDenverPipeline.id,
            edgeCitySemaphoreGroupIds.attendees
          );

        expectTrue(newAttendeeGroupResponse.success);
        expectLength(newAttendeeGroupResponse.value.members, 5);
        expect(newAttendeeGroupResponse.value.members).to.deep.include.members([
          EdgeCityDenverAttendeeIdentity.commitment.toString(),
          EdgeCityManualAttendeeIdentity.commitment.toString(),
          EdgeCityBouncer2Identity.commitment.toString(),
          changedIdentity.commitment.toString(),
          // The deleted entry is represented by a zeroValue
          newAttendeeGroupResponse.value.zeroValue
        ]);

        const newAttendeeGroup = deserializeSemaphoreGroup(
          newAttendeeGroupResponse.value
        );
        expect(newAttendeeGroup.root).to.not.eq(attendeeGroup.root.toString());

        // Requesting the root hash for the group should give us the new root
        const newAttendeeGroupRootResponse =
          await requestGenericIssuanceSemaphoreGroupRoot(
            process.env.PASSPORT_SERVER_URL as string,
            edgeCityDenverPipeline.id,
            edgeCitySemaphoreGroupIds.attendees
          );

        expectTrue(newAttendeeGroupRootResponse.success);
        expect(newAttendeeGroupRootResponse.value).to.eq(
          newAttendeeGroup.root.toString()
        );

        const newAttendeeGroupValidResponse =
          await requestGenericIssuanceValidSemaphoreGroup(
            process.env.PASSPORT_SERVER_URL as string,
            edgeCityDenverPipeline.id,
            edgeCitySemaphoreGroupIds.attendees,
            newAttendeeGroup.root.toString()
          );

        expectTrue(newAttendeeGroupValidResponse.success);
        expectTrue(newAttendeeGroupValidResponse.value.valid);

        // We should be able to get the old values for the group by providing
        // the root hash.
        const historicalGroupResponse =
          await requestGenericIssuanceHistoricalSemaphoreGroup(
            process.env.PASSPORT_SERVER_URL as string,
            edgeCityDenverPipeline.id,
            edgeCitySemaphoreGroupIds.attendees,
            attendeeGroup.root.toString()
          );

        expectTrue(historicalGroupResponse.success);
        expect(historicalGroupResponse.value.members).to.deep.eq(
          attendeeGroupResponse.value.members
        );

        const newUserIdentityPCD = await SemaphoreIdentityPCDPackage.prove({
          identity: changedIdentity // Use the changed identity
        });

        const groupPCD = await SemaphoreGroupPCDPackage.prove({
          externalNullifier: {
            argumentType: ArgumentTypeName.BigInt,
            value: newAttendeeGroup.root.toString()
          },
          signal: {
            argumentType: ArgumentTypeName.BigInt,
            value: "1"
          },
          group: {
            argumentType: ArgumentTypeName.Object,
            value: serializeSemaphoreGroup(
              newAttendeeGroup,
              newAttendeeGroupResponse.value.name
            )
          },
          identity: {
            argumentType: ArgumentTypeName.PCD,
            pcdType: SemaphoreIdentityPCDPackage.name,
            value:
              await SemaphoreIdentityPCDPackage.serialize(newUserIdentityPCD)
          }
        });

        expectTrue(await SemaphoreGroupPCDPackage.verify(groupPCD));
      }

      const consumerAfterChange = (
        await consumerDB.loadByEmails(edgeCityDenverPipeline.id, [
          newUser.email
        ])
      )[0];
      const consumerUpdatedAfterChange = consumerAfterChange.timeUpdated;
      const consumerCreatedAfterChange = consumerAfterChange.timeCreated;

      // Consumer update occurred now
      expect(consumerUpdatedAfterChange.getTime()).to.eq(Date.now());
      // Creation time should never change
      expect(consumerCreatedAfterChange.getTime()).to.eq(
        consumerCreated.getTime()
      );
      // Update time should be later than creation time now
      expect(consumerUpdatedAfterChange.getTime()).to.be.greaterThan(
        consumerCreated.getTime()
      );
      // Update time should be later than original update time
      expect(consumerUpdatedAfterChange.getTime()).to.be.greaterThan(
        consumerUpdated.getTime()
      );
    }
  );

  /**
   * Test for {@link PretixPipeline} for Eth LatAm.
   */
  step(
    "PretixPipeline issuance and checkin and PipelineInfo for Eth LatAm",
    async () => {
      expectToExist(giService);
      const pipelines = await giService.getAllPipelines();
      expectToExist(pipelines);
      expectLength(pipelines, 3);
      const pipeline = pipelines.find(PretixPipeline.is);
      expectToExist(pipeline);
      expect(pipeline.id).to.eq(ethLatAmPipeline.id);
      const ethLatAmTicketFeedUrl = pipeline.issuanceCapability.feedUrl;
      const ethLatAmIssuanceDateTime = new Date();
      const attendeeTickets = await requestTicketsFromPipeline(
        pipeline.issuanceCapability.options.feedFolder,
        ethLatAmTicketFeedUrl,
        pipeline.issuanceCapability.options.feedId,
        ZUPASS_EDDSA_PRIVATE_KEY,
        pretixBackend.get().ethLatAmOrganizer.ethLatAmAttendeeEmail,
        EthLatAmAttendeeIdentity
      );
      expectLength(
        attendeeTickets.map((t) => t.claim.ticket.attendeeEmail),
        1
      );
      const attendeeTicket = attendeeTickets[0];
      expectToExist(attendeeTicket);
      expectIsEdDSATicketPCD(attendeeTicket);
      expect(attendeeTicket.claim.ticket.attendeeEmail).to.eq(
        pretixBackend.get().ethLatAmOrganizer.ethLatAmAttendeeEmail
      );
      expect(attendeeTicket.claim.ticket.attendeeName).to.eq(
        pretixBackend.get().ethLatAmOrganizer.ethLatAmAttendeeName
      );

      const bouncerTickets = await requestTicketsFromPipeline(
        pipeline.issuanceCapability.options.feedFolder,
        ethLatAmTicketFeedUrl,
        pipeline.issuanceCapability.options.feedId,
        ZUPASS_EDDSA_PRIVATE_KEY,
        pretixBackend.get().ethLatAmOrganizer.ethLatAmBouncerEmail,
        EthLatAmBouncerIdentity
      );
      expectLength(bouncerTickets, 1);
      const bouncerTicket = bouncerTickets[0];
      expectToExist(bouncerTicket);
      expectIsEdDSATicketPCD(bouncerTicket);
      expect(bouncerTicket.claim.ticket.attendeeEmail).to.eq(
        pretixBackend.get().ethLatAmOrganizer.ethLatAmBouncerEmail
      );
      expect(bouncerTicket.claim.ticket.attendeeName).to.eq(
        pretixBackend.get().ethLatAmOrganizer.ethLatAmBouncerName
      );

      const ethLatAmCheckinRoute = pipeline.checkinCapability.getCheckinUrl();

      const bouncerCheckInBouncer = await requestCheckInPipelineTicket(
        ethLatAmCheckinRoute,
        ZUPASS_EDDSA_PRIVATE_KEY,
        bouncerTicket.claim.ticket.attendeeEmail,
        EdgeCityBouncerIdentity,
        bouncerTicket
      );
      expect(bouncerCheckInBouncer.value).to.deep.eq({ success: true });

      // can't check in a ticket that's already checked in
      const bouncerCheckInBouncerAgain = await requestCheckInPipelineTicket(
        ethLatAmCheckinRoute,
        ZUPASS_EDDSA_PRIVATE_KEY,
        bouncerTicket.claim.ticket.attendeeEmail,
        EdgeCityBouncerIdentity,
        bouncerTicket
      );
      expect(bouncerCheckInBouncerAgain.value).to.deep.contain({
        success: false
      });

      // can't check in a ticket using a ticket that isn't a superuser ticket
      const attendeeCheckInBouncerResult = await requestCheckInPipelineTicket(
        ethLatAmCheckinRoute,
        ZUPASS_EDDSA_PRIVATE_KEY,
        attendeeTicket.claim.ticket.attendeeEmail,
        EdgeCityDenverAttendeeIdentity,
        bouncerTicket
      );

      expect(attendeeCheckInBouncerResult.value).to.deep.eq({
        success: false,
        error: { name: "NotSuperuser" }
      } satisfies PodboxTicketActionResponseValue);

      // can't check in a ticket with an email PCD signed by a non-Zupass private key
      const fakeBouncerCheckInBouncerResult =
        await requestCheckInPipelineTicket(
          ethLatAmCheckinRoute,
          newEdDSAPrivateKey(),
          attendeeTicket.claim.ticket.attendeeEmail,
          EdgeCityDenverAttendeeIdentity,
          bouncerTicket
        );
      expect(fakeBouncerCheckInBouncerResult.value).to.deep.eq({
        success: false,
        error: { name: "InvalidSignature" }
      } satisfies PodboxTicketActionResponseValue);

      const ManualAttendeeTickets = await requestTicketsFromPipeline(
        pipeline.issuanceCapability.options.feedFolder,
        ethLatAmTicketFeedUrl,
        pipeline.issuanceCapability.options.feedId,
        ZUPASS_EDDSA_PRIVATE_KEY,
        EthLatAmManualAttendeeEmail,
        EthLatAmManualAttendeeIdentity
      );
      expectLength(ManualAttendeeTickets, 1);
      const ManualAttendeeTicket = ManualAttendeeTickets[0];
      expectIsEdDSATicketPCD(ManualAttendeeTicket);
      expect(ManualAttendeeTicket.claim.ticket.attendeeEmail).to.eq(
        EthLatAmManualAttendeeEmail
      );

      const ManualBouncerTickets = await requestTicketsFromPipeline(
        pipeline.issuanceCapability.options.feedFolder,
        ethLatAmTicketFeedUrl,
        pipeline.issuanceCapability.options.feedId,
        ZUPASS_EDDSA_PRIVATE_KEY,
        EthLatAmManualBouncerEmail,
        EthLatAmManualBouncerIdentity
      );
      expectLength(ManualBouncerTickets, 1);
      const ManualBouncerTicket = ManualBouncerTickets[0];
      expectIsEdDSATicketPCD(ManualBouncerTicket);
      expect(ManualBouncerTicket.claim.ticket.attendeeEmail).to.eq(
        EthLatAmManualBouncerEmail
      );

      pretixBackend.checkOut(
        ethLatAmPretixOrganizer.orgUrl,
        ethLatAmEvent.slug,
        bouncerTicket.claim.ticket.attendeeEmail
      );
      MockDate.set(Date.now() + ONE_SECOND_MS);
      await pipeline.load();

      const manualBouncerChecksInManualAttendee =
        await requestCheckInPipelineTicket(
          pipeline.checkinCapability.getCheckinUrl(),
          ZUPASS_EDDSA_PRIVATE_KEY,
          EthLatAmManualBouncerEmail,
          EthLatAmManualBouncerIdentity,
          ManualAttendeeTicket
        );
      expect(manualBouncerChecksInManualAttendee.value).to.deep.eq({
        success: true
      });

      {
        const ManualAttendeeTickets = await requestTicketsFromPipeline(
          pipeline.issuanceCapability.options.feedFolder,
          ethLatAmTicketFeedUrl,
          pipeline.issuanceCapability.options.feedId,
          ZUPASS_EDDSA_PRIVATE_KEY,
          EthLatAmManualAttendeeEmail,
          EthLatAmManualAttendeeIdentity
        );
        expectLength(ManualAttendeeTickets, 1);
        const ManualAttendeeTicket = ManualAttendeeTickets[0];
        expectIsEdDSATicketPCD(ManualAttendeeTicket);
        expect(ManualAttendeeTicket.claim.ticket.attendeeEmail).to.eq(
          EthLatAmManualAttendeeEmail
        );
        expect(ManualAttendeeTicket.claim.ticket.isConsumed).to.eq(true);
        expect(ManualAttendeeTicket.claim.ticket.timestampConsumed).to.eq(
          Date.now()
        );
      }

      const manualBouncerChecksInManualAttendeeAgain =
        await requestCheckInPipelineTicket(
          pipeline.checkinCapability.getCheckinUrl(),
          ZUPASS_EDDSA_PRIVATE_KEY,
          EthLatAmManualBouncerEmail,
          EthLatAmManualBouncerIdentity,
          ManualAttendeeTicket
        );
      expect(manualBouncerChecksInManualAttendeeAgain.value).to.deep.eq({
        success: false,
        error: {
          name: "AlreadyCheckedIn",
          checkinTimestamp: new Date().toISOString(),
          checker: PRETIX_CHECKER
        }
      } satisfies PodboxTicketActionResponseValue);

      const manualAttendeeChecksInManualBouncer =
        await requestCheckInPipelineTicket(
          pipeline.checkinCapability.getCheckinUrl(),
          ZUPASS_EDDSA_PRIVATE_KEY,
          EthLatAmManualAttendeeEmail,
          EthLatAmManualAttendeeIdentity,
          ManualBouncerTicket
        );
      expect(manualAttendeeChecksInManualBouncer.value).to.deep.eq({
        success: false,
        error: { name: "NotSuperuser" }
      } satisfies PodboxTicketActionResponseValue);

      // Verify that consumers were saved for each user who requested tickets
      const consumerDB = new PipelineConsumerDB(giBackend.context.dbPool);
      const consumers = await consumerDB.loadByEmails(ethLatAmPipeline.id, [
        EthLatAmManualAttendeeEmail,
        EthLatAmManualBouncerEmail,
        pretixBackend.get().ethLatAmOrganizer.ethLatAmAttendeeEmail,
        pretixBackend.get().ethLatAmOrganizer.ethLatAmBouncerEmail
      ]);
      expectLength(consumers, 4);
      expect(consumers).to.deep.include.members([
        {
          email: EthLatAmManualAttendeeEmail,
          commitment: EthLatAmManualAttendeeIdentity.commitment.toString(),
          timeCreated: ethLatAmIssuanceDateTime,
          timeUpdated: ethLatAmIssuanceDateTime
        },
        {
          email: EthLatAmManualBouncerEmail,
          commitment: EthLatAmManualBouncerIdentity.commitment.toString(),
          timeCreated: ethLatAmIssuanceDateTime,
          timeUpdated: ethLatAmIssuanceDateTime
        },
        {
          email: pretixBackend.get().ethLatAmOrganizer.ethLatAmAttendeeEmail,
          commitment: EthLatAmAttendeeIdentity.commitment.toString(),
          timeCreated: ethLatAmIssuanceDateTime,
          timeUpdated: ethLatAmIssuanceDateTime
        },
        {
          email: pretixBackend.get().ethLatAmOrganizer.ethLatAmBouncerEmail,
          commitment: EthLatAmBouncerIdentity.commitment.toString(),
          timeCreated: ethLatAmIssuanceDateTime,
          timeUpdated: ethLatAmIssuanceDateTime
        }
      ]);

      await checkPipelineInfoEndpoint(giBackend, pipeline);
    }
  );

  step(
    "Pretix pipeline Semaphore groups contain correct members",
    async function () {
      expectToExist(giService);
      const pipelines = await giService.getAllPipelines();
      expectToExist(pipelines);
      expectLength(pipelines, 3);
      const ethLatAmPipeline = pipelines.find(PretixPipeline.is);
      expectToExist(ethLatAmPipeline);

      await ethLatAmPipeline.load();

      const semaphoreGroupAll = await requestGenericIssuanceSemaphoreGroup(
        process.env.PASSPORT_SERVER_URL as string,
        ethLatAmPipeline.id,
        ethLatAmSemaphoreGroupIds.all
      );
      expectTrue(semaphoreGroupAll.success);
      expectLength(semaphoreGroupAll.value.members, 4);
      expect(semaphoreGroupAll.value.members).to.deep.include.members([
        EthLatAmBouncerIdentity.commitment.toString(),
        EthLatAmAttendeeIdentity.commitment.toString(),
        EthLatAmManualAttendeeIdentity.commitment.toString(),
        EthLatAmManualBouncerIdentity.commitment.toString()
      ]);

      const semaphoreGroupBouncers = await requestGenericIssuanceSemaphoreGroup(
        process.env.PASSPORT_SERVER_URL as string,
        ethLatAmPipeline.id,
        ethLatAmSemaphoreGroupIds.bouncers
      );

      expectTrue(semaphoreGroupBouncers.success);
      expectLength(semaphoreGroupBouncers.value.members, 2);
      expect(semaphoreGroupBouncers.value.members).to.deep.include.members([
        EthLatAmBouncerIdentity.commitment.toString(),
        EthLatAmManualBouncerIdentity.commitment.toString()
      ]);

      const semaphoreGroupAttendees =
        await requestGenericIssuanceSemaphoreGroup(
          process.env.PASSPORT_SERVER_URL as string,
          ethLatAmPipeline.id,
          ethLatAmSemaphoreGroupIds.attendees
        );

      expectTrue(semaphoreGroupAttendees.success);
      expectLength(semaphoreGroupAttendees.value.members, 2);
      expect(semaphoreGroupAttendees.value.members).to.deep.include.members([
        EthLatAmAttendeeIdentity.commitment.toString(),
        EthLatAmManualAttendeeIdentity.commitment.toString()
      ]);

      const semaphoreGroupAttendeesAndBouncers =
        await requestGenericIssuanceSemaphoreGroup(
          process.env.PASSPORT_SERVER_URL as string,
          ethLatAmPipeline.id,
          ethLatAmSemaphoreGroupIds.attendeesAndBouncers
        );

      expectTrue(semaphoreGroupAttendeesAndBouncers.success);
      expectLength(semaphoreGroupAttendeesAndBouncers.value.members, 4);
      expect(
        semaphoreGroupAttendeesAndBouncers.value.members
      ).to.deep.include.members([
        EthLatAmBouncerIdentity.commitment.toString(),
        EthLatAmAttendeeIdentity.commitment.toString(),
        EthLatAmManualAttendeeIdentity.commitment.toString(),
        EthLatAmManualBouncerIdentity.commitment.toString()
      ]);
    }
  );

  step("check-ins for deleted manual tickets are removed", async function () {
    expectToExist(giService);

    const checkinDB = new PipelineCheckinDB(giBackend.context.dbPool);
    const checkins = await checkinDB.getByPipelineId(ethLatAmPipeline.id);
    // Manual attendee ticket was checked in
    expectLength(checkins, 1);

    const userDB = new PipelineUserDB(giBackend.context.dbPool);
    const adminUser = await userDB.getUserById(adminGIUserId);
    expectToExist(adminUser);

    // Delete the manual tickets from the definition
    const newPipelineDefinition = structuredClone(ethLatAmPipeline);
    newPipelineDefinition.options.manualTickets = [];
    // Update the definition
    const { restartPromise } = await giService.upsertPipelineDefinition(
      adminUser,
      newPipelineDefinition
    );
    // On restart, the pipeline will delete the orphaned checkins
    await restartPromise;

    // Find the running pipeline
    const pipelines = await giService.getAllPipelines();
    expectToExist(pipelines);
    expectLength(pipelines, 3);
    const pipeline = pipelines.find(PretixPipeline.is);
    expectToExist(pipeline);
    expect(pipeline.id).to.eq(newPipelineDefinition.id);
    // Verify that there are no checkins in the DB now
    {
      const checkins = await checkinDB.getByPipelineId(ethLatAmPipeline.id);
      // no checkins are found as the tickets have been deleted
      expectLength(checkins, 0);
    }
  });

  step("CSVPipeline", async function () {
    expectToExist(giService);
    await testCSVPipeline(giService);
  });

  step("check-in and remote check-out works in Pretix", async function () {
    expectToExist(giService);
    const pipelines = await giService.getAllPipelines();
    const pipeline = pipelines.find(PretixPipeline.is);
    expectToExist(pipeline);
    expect(pipeline.id).to.eq(ethLatAmPipeline.id);
    const ethLatAmTicketFeedUrl = pipeline.issuanceCapability.feedUrl;

    // Ensure that bouncer is checked out
    pretixBackend.checkOut(
      ethLatAmPretixOrganizer.orgUrl,
      "eth-lat-am",
      pretixBackend.get().ethLatAmOrganizer.ethLatAmBouncerEmail
    );
    MockDate.set(Date.now() + ONE_SECOND_MS);
    // Verify that bouncer is checked out in backend
    await pipeline.load();
    const bouncerTickets = await requestTicketsFromPipeline(
      pipeline.issuanceCapability.options.feedFolder,
      ethLatAmTicketFeedUrl,
      pipeline.issuanceCapability.options.feedId,
      ZUPASS_EDDSA_PRIVATE_KEY,
      pretixBackend.get().ethLatAmOrganizer.ethLatAmBouncerEmail,
      EthLatAmBouncerIdentity
    );
    expectLength(bouncerTickets, 1);
    const bouncerTicket = bouncerTickets[0];
    expectToExist(bouncerTicket);
    expectIsEdDSATicketPCD(bouncerTicket);
    expect(bouncerTicket.claim.ticket.attendeeEmail).to.eq(
      pretixBackend.get().ethLatAmOrganizer.ethLatAmBouncerEmail
    );
    // Bouncer ticket is checked out
    expect(bouncerTicket.claim.ticket.isConsumed).to.eq(false);

    // Now check the bouncer in
    const ethLatAmCheckinRoute = pipeline.checkinCapability.getCheckinUrl();

    const bouncerCheckInBouncer = await requestCheckInPipelineTicket(
      ethLatAmCheckinRoute,
      ZUPASS_EDDSA_PRIVATE_KEY,
      bouncerTicket.claim.ticket.attendeeEmail,
      EdgeCityBouncerIdentity,
      bouncerTicket
    );
    expect(bouncerCheckInBouncer.value).to.deep.eq({ success: true });
    const checkinTimestamp = Date.now();
    MockDate.set(Date.now() + ONE_SECOND_MS);

    // Reload the pipeline
    await pipeline.load();
    {
      // Get updated tickets from feed
      const bouncerTickets = await requestTicketsFromPipeline(
        pipeline.issuanceCapability.options.feedFolder,
        ethLatAmTicketFeedUrl,
        pipeline.issuanceCapability.options.feedId,
        ZUPASS_EDDSA_PRIVATE_KEY,
        pretixBackend.get().ethLatAmOrganizer.ethLatAmBouncerEmail,
        EthLatAmBouncerIdentity
      );
      expectLength(bouncerTickets, 1);
      const bouncerTicket = bouncerTickets[0];
      expectToExist(bouncerTicket);
      expectIsEdDSATicketPCD(bouncerTicket);
      expect(bouncerTicket.claim.ticket.attendeeEmail).to.eq(
        pretixBackend.get().ethLatAmOrganizer.ethLatAmBouncerEmail
      );
      // User is now checked in
      expect(bouncerTicket.claim.ticket.isConsumed).to.eq(true);
    }
    {
      // Trying to check in again should fail
      const bouncerCheckInBouncer = await requestCheckInPipelineTicket(
        ethLatAmCheckinRoute,
        ZUPASS_EDDSA_PRIVATE_KEY,
        bouncerTicket.claim.ticket.attendeeEmail,
        EthLatAmBouncerIdentity,
        bouncerTicket
      );
      expect(bouncerCheckInBouncer.value).to.deep.eq({
        success: false,
        error: {
          name: "AlreadyCheckedIn",
          checkinTimestamp: new Date(checkinTimestamp).toISOString(),
          checker: "Pretix"
        }
      } as PodboxTicketActionResponseValue);
    }
    {
      // Check the bouncer out again
      // Simulates the effect of check-in being deleted in Pretix
      pretixBackend.checkOut(
        ethLatAmPretixOrganizer.orgUrl,
        "eth-lat-am",
        pretixBackend.get().ethLatAmOrganizer.ethLatAmBouncerEmail
      );
    }
    {
      // Trying to check in again should fail because we have not yet reloaded
      // data from Pretix.
      const bouncerCheckInBouncer = await requestCheckInPipelineTicket(
        ethLatAmCheckinRoute,
        ZUPASS_EDDSA_PRIVATE_KEY,
        bouncerTicket.claim.ticket.attendeeEmail,
        EthLatAmBouncerIdentity,
        bouncerTicket
      );
      expect(bouncerCheckInBouncer.value).to.deep.eq({
        success: false,
        error: {
          name: "AlreadyCheckedIn",
          checkinTimestamp: new Date(checkinTimestamp).toISOString(),
          checker: "Pretix"
        }
      } as PodboxTicketActionResponseValue);
    }
    // Verify that bouncer is checked out in backend
    await pipeline.load();
    {
      const bouncerTickets = await requestTicketsFromPipeline(
        pipeline.issuanceCapability.options.feedFolder,
        ethLatAmTicketFeedUrl,
        pipeline.issuanceCapability.options.feedId,
        ZUPASS_EDDSA_PRIVATE_KEY,
        pretixBackend.get().ethLatAmOrganizer.ethLatAmBouncerEmail,
        EthLatAmBouncerIdentity
      );
      expectLength(bouncerTickets, 1);
      const bouncerTicket = bouncerTickets[0];
      expectToExist(bouncerTicket);
      expectIsEdDSATicketPCD(bouncerTicket);
      expect(bouncerTicket.claim.ticket.attendeeEmail).to.eq(
        pretixBackend.get().ethLatAmOrganizer.ethLatAmBouncerEmail
      );
      // Bouncer ticket is checked out
      expect(bouncerTicket.claim.ticket.isConsumed).to.eq(false);
    }
    {
      // Now check the bouncer in
      const ethLatAmCheckinRoute = pipeline.checkinCapability.getCheckinUrl();

      const bouncerCheckInBouncer = await requestCheckInPipelineTicket(
        ethLatAmCheckinRoute,
        ZUPASS_EDDSA_PRIVATE_KEY,
        bouncerTicket.claim.ticket.attendeeEmail,
        EthLatAmBouncerIdentity,
        bouncerTicket
      );
      expect(bouncerCheckInBouncer.value).to.deep.eq({ success: true });
      MockDate.set(Date.now() + ONE_SECOND_MS);

      // Reload the pipeline
      await pipeline.load();
      {
        const bouncerTickets = await requestTicketsFromPipeline(
          pipeline.issuanceCapability.options.feedFolder,
          ethLatAmTicketFeedUrl,
          pipeline.issuanceCapability.options.feedId,
          ZUPASS_EDDSA_PRIVATE_KEY,
          pretixBackend.get().ethLatAmOrganizer.ethLatAmBouncerEmail,
          EthLatAmBouncerIdentity
        );
        expectLength(bouncerTickets, 1);
        const bouncerTicket = bouncerTickets[0];
        expectToExist(bouncerTicket);
        expectIsEdDSATicketPCD(bouncerTicket);
        expect(bouncerTicket.claim.ticket.attendeeEmail).to.eq(
          pretixBackend.get().ethLatAmOrganizer.ethLatAmBouncerEmail
        );
        // User is now checked in
        expect(bouncerTicket.claim.ticket.isConsumed).to.eq(true);
      }
    }
  });

  step("check-in and remote check-out works in Lemonade", async function () {
    expectToExist(giService);
    const pipelines = await giService.getAllPipelines();
    const pipeline = pipelines.find(LemonadePipeline.is);
    expectToExist(pipeline);
    expect(pipeline.id).to.eq(edgeCityPipeline.id);
    const edgeCityTicketFeedUrl = pipeline.issuanceCapability.feedUrl;

    lemonadeBackend.checkOutAll();

    MockDate.set(Date.now() + ONE_SECOND_MS);
    // Verify that bouncer is checked out in backend
    await pipeline.load();
    const bouncerTickets = await requestTicketsFromPipeline(
      pipeline.issuanceCapability.options.feedFolder,
      edgeCityTicketFeedUrl,
      pipeline.issuanceCapability.options.feedId,
      ZUPASS_EDDSA_PRIVATE_KEY,
      EdgeCityDenverBouncer.email,
      EdgeCityBouncerIdentity
    );
    expectLength(bouncerTickets, 1);
    const bouncerTicket = bouncerTickets[0];
    expectToExist(bouncerTicket);
    expectIsEdDSATicketPCD(bouncerTicket);
    expect(bouncerTicket.claim.ticket.attendeeEmail).to.eq(
      EdgeCityDenverBouncer.email
    );
    // Bouncer ticket is checked out
    expect(bouncerTicket.claim.ticket.isConsumed).to.eq(false);

    // Now check the bouncer in
    const edgeCityCheckinRoute = pipeline.checkinCapability.getCheckinUrl();

    const bouncerCheckInBouncer = await requestCheckInPipelineTicket(
      edgeCityCheckinRoute,
      ZUPASS_EDDSA_PRIVATE_KEY,
      bouncerTicket.claim.ticket.attendeeEmail,
      EdgeCityBouncerIdentity,
      bouncerTicket
    );
    expect(bouncerCheckInBouncer.value).to.deep.eq({ success: true });
    const checkinTimestamp = Date.now();
    MockDate.set(Date.now() + ONE_SECOND_MS);

    // Reload the pipeline
    await pipeline.load();
    {
      // Get updated tickets from feed
      const bouncerTickets = await requestTicketsFromPipeline(
        pipeline.issuanceCapability.options.feedFolder,
        edgeCityTicketFeedUrl,
        pipeline.issuanceCapability.options.feedId,
        ZUPASS_EDDSA_PRIVATE_KEY,
        EdgeCityDenverBouncer.email,
        EdgeCityBouncerIdentity
      );
      expectLength(bouncerTickets, 1);
      const bouncerTicket = bouncerTickets[0];
      expectToExist(bouncerTicket);
      expectIsEdDSATicketPCD(bouncerTicket);
      expect(bouncerTicket.claim.ticket.attendeeEmail).to.eq(
        EdgeCityDenverBouncer.email
      );
      // User is now checked in
      expect(bouncerTicket.claim.ticket.isConsumed).to.eq(true);
    }
    {
      // Trying to check in again should fail
      const bouncerCheckInBouncer = await requestCheckInPipelineTicket(
        edgeCityCheckinRoute,
        ZUPASS_EDDSA_PRIVATE_KEY,
        bouncerTicket.claim.ticket.attendeeEmail,
        EdgeCityBouncerIdentity,
        bouncerTicket
      );
      expect(bouncerCheckInBouncer.value).to.deep.eq({
        success: false,
        error: {
          name: "AlreadyCheckedIn",
          checkinTimestamp: new Date(checkinTimestamp).toISOString(),
          checker: "Lemonade"
        }
      } as PodboxTicketActionResponseValue);
    }
    {
      // Check the bouncer out again
      // There isn't a known way to do this in Lemonade, but it's worth testing
      // for what would happen if it did
      lemonadeBackend.checkOutUser(
        lemonadeOAuthClientId,
        EdgeCityDenver._id,
        EdgeCityDenverBouncer._id
      );
    }
    {
      // Trying to check in again should fail because we have not yet reloaded
      // data from Lemonade
      const bouncerCheckInBouncer = await requestCheckInPipelineTicket(
        edgeCityCheckinRoute,
        ZUPASS_EDDSA_PRIVATE_KEY,
        bouncerTicket.claim.ticket.attendeeEmail,
        EdgeCityBouncerIdentity,
        bouncerTicket
      );
      expect(bouncerCheckInBouncer.value).to.deep.eq({
        success: false,
        error: {
          name: "AlreadyCheckedIn",
          checkinTimestamp: new Date(checkinTimestamp).toISOString(),
          checker: "Lemonade"
        }
      } as PodboxTicketActionResponseValue);
    }
    // Verify that bouncer is checked out in backend
    await pipeline.load();
    {
      const bouncerTickets = await requestTicketsFromPipeline(
        pipeline.issuanceCapability.options.feedFolder,
        edgeCityTicketFeedUrl,
        pipeline.issuanceCapability.options.feedId,
        ZUPASS_EDDSA_PRIVATE_KEY,
        EdgeCityDenverBouncer.email,
        EdgeCityBouncerIdentity
      );
      expectLength(bouncerTickets, 1);
      const bouncerTicket = bouncerTickets[0];
      expectToExist(bouncerTicket);
      expectIsEdDSATicketPCD(bouncerTicket);
      expect(bouncerTicket.claim.ticket.attendeeEmail).to.eq(
        EdgeCityDenverBouncer.email
      );
      // Bouncer ticket is checked out
      expect(bouncerTicket.claim.ticket.isConsumed).to.eq(false);
    }
    {
      // Now check the bouncer in
      const edgeCityCheckinRoute = pipeline.checkinCapability.getCheckinUrl();

      const bouncerCheckInBouncer = await requestCheckInPipelineTicket(
        edgeCityCheckinRoute,
        ZUPASS_EDDSA_PRIVATE_KEY,
        bouncerTicket.claim.ticket.attendeeEmail,
        EdgeCityBouncerIdentity,
        bouncerTicket
      );
      expect(bouncerCheckInBouncer.value).to.deep.eq({ success: true });
      MockDate.set(Date.now() + ONE_SECOND_MS);

      // Reload the pipeline
      await pipeline.load();
      {
        const bouncerTickets = await requestTicketsFromPipeline(
          pipeline.issuanceCapability.options.feedFolder,
          edgeCityTicketFeedUrl,
          pipeline.issuanceCapability.options.feedId,
          ZUPASS_EDDSA_PRIVATE_KEY,
          EdgeCityDenverBouncer.email,
          EdgeCityBouncerIdentity
        );
        expectLength(bouncerTickets, 1);
        const bouncerTicket = bouncerTickets[0];
        expectToExist(bouncerTicket);
        expectIsEdDSATicketPCD(bouncerTicket);
        expect(bouncerTicket.claim.ticket.attendeeEmail).to.eq(
          EdgeCityDenverBouncer.email
        );
        // User is now checked in
        expect(bouncerTicket.claim.ticket.isConsumed).to.eq(true);
      }
    }
  });

  /**
   * Test for {@link PipelineDefinitionDB}, which implements postgres CRUD
   * operations for {@link PipelineDefinition}s
   */
  step("PipelineDefinitionDB", async function () {
    const definitionDB = new PipelineDefinitionDB(giBackend.context.dbPool);
    await definitionDB.clearAllDefinitions();

    {
      const definitions: PipelineDefinition[] =
        await definitionDB.loadPipelineDefinitions();
      expectLength(definitions, 0);
    }

    {
      await definitionDB.setDefinitions(pipelineDefinitions);
      const definitions = await definitionDB.loadPipelineDefinitions();
      expectLength(definitions, pipelineDefinitions.length);

      const pretixDefinition = definitions.find(
        (d) => d.type === PipelineType.Pretix
      ) as PretixPipelineDefinition;

      const newKey = "TEST_KEY";
      pretixDefinition.options = {
        ...pretixDefinition?.options,
        pretixAPIKey: newKey
      };
      await definitionDB.setDefinition(pretixDefinition);
      const updatedPretixDefinition = (await definitionDB.getDefinition(
        pretixDefinition.id
      )) as PretixPipelineDefinition;
      expect(updatedPretixDefinition).to.exist;
      expect(
        (updatedPretixDefinition as PretixPipelineDefinition).options
          .pretixAPIKey
      ).to.eq(newKey);

      updatedPretixDefinition.editorUserIds.push(edgeCityGIUserID);
      await definitionDB.setDefinition(updatedPretixDefinition);
      const newEditorDefinition = (await definitionDB.getDefinition(
        updatedPretixDefinition.id
      )) as PretixPipelineDefinition;
      expect(newEditorDefinition).to.exist;
      expect(newEditorDefinition.editorUserIds).to.contain(edgeCityGIUserID);

      newEditorDefinition.editorUserIds = [];
      await definitionDB.setDefinition(newEditorDefinition);
      const emptyEditorsDefinition = (await definitionDB.getDefinition(
        updatedPretixDefinition.id
      )) as PretixPipelineDefinition;
      expect(emptyEditorsDefinition).to.exist;
      expect(emptyEditorsDefinition.editorUserIds).to.be.empty;
    }
  });

  step(
    "Lemonade API will request new token when old one expires",
    async function () {
      // Because we initialized the LemonadeAPI with a TestTokenSource, we can
      // track when LemonadeAPI refreshes its token. TestTokenSource returns an
      // expiry time of Date.now() + ONE_DAY_MS, so advancing the clock beyond
      // one day should trigger a new token refresh.
      lemonadeTokenSource.called = 0;

      const credentials: LemonadeOAuthCredentials = {
        oauthClientId: lemonadeOAuthClientId,
        oauthAudience: "new-credentials",
        oauthClientSecret: "new-credentials",
        oauthServerUrl: "new-credentials"
      };

      await lemonadeAPI.getTickets(
        lemonadeBackendUrl,
        credentials,
        EdgeCityDenver._id
      );

      expect(lemonadeTokenSource.called).to.eq(1);

      MockDate.set(Date.now() + ONE_DAY_MS + 1);

      await lemonadeAPI.getTickets(
        lemonadeBackendUrl,
        credentials,
        EdgeCityDenver._id
      );

      expect(lemonadeTokenSource.called).to.eq(2);

      // Since no time has elapsed since the last request, this request will
      // not require a new token.
      await lemonadeAPI.getTickets(
        lemonadeBackendUrl,
        credentials,
        EdgeCityDenver._id
      );

      expect(lemonadeTokenSource.called).to.eq(2);

      // Simulate an authorization failure, which will cause a new token to be
      // requested.
      mockServer.use(
        rest.post(
          urljoin(lemonadeBackendUrl, "/event/:eventId/export/tickets"),
          (req, res, ctx) => {
            // Calling .once() means that only the first request will be
            // handled. So, the first time we request tickets, we get a 401
            // and this will cause LemonadeAPI to get a new token. The next
            // request will go to the default mock handler, which will succeed.
            return res.once(ctx.status(401, "Unauthorized"));
          }
        )
      );

      await lemonadeAPI.getTickets(
        lemonadeBackendUrl,
        credentials,
        EdgeCityDenver._id
      );
      // We should have seen one more token request
      expect(lemonadeTokenSource.called).to.eq(3);
    }
  );

  step(
    "Lemonade tickets without user emails should not be loaded",
    async function () {
      mockServer.use(
        unregisteredLemonadeUserHandler(lemonadeBackend, lemonadeBackendUrl)
      );

      expectToExist(giService);
      const pipelines = await giService.getAllPipelines();
      const pipeline = pipelines.find(LemonadePipeline.is);
      expectToExist(pipeline);
      expect(pipeline.id).to.eq(edgeCityPipeline.id);
      const runInfo = await pipeline.load();

      // Despite receiving a ticket, the ticket was ignored due to not having
      // a user email
      expect(runInfo.atomsLoaded).to.eq(0);
    }
  );

  step(
    "Mix of valid and invalid Lemonade tickets results in only valid ones being accepted",
    async function () {
      expectToExist(giService);
      const pipelines = await giService.getAllPipelines();
      const pipeline = pipelines.find(LemonadePipeline.is);
      expectToExist(pipeline);
      expect(pipeline.id).to.eq(edgeCityPipeline.id);

      {
        // Two valid tickets
        const tickets: LemonadeTicket[] = [
          EdgeCityAttendeeTicket,
          EdgeCityDenverBouncerTicket
        ];
        mockServer.use(
          customLemonadeTicketHandler(lemonadeBackendUrl, tickets)
        );

        const runInfo = await pipeline.load();
        // Both tickets should have been loaded
        expect(runInfo.atomsLoaded).to.eq(2);
        // Expect no errors to have been logged
        expectLength(
          runInfo.latestLogs.filter(
            (log) => log.level === PipelineLogLevel.Error
          ),
          0
        );
      }

      {
        // One valid ticket and one invalid ticket
        const tickets: LemonadeTicket[] = [
          EdgeCityAttendeeTicket,
          // Empty type ID is not valid
          {
            ...EdgeCityDenverBouncerTicket,
            _id: undefined as unknown as string
          }
        ];
        mockServer.use(
          customLemonadeTicketHandler(lemonadeBackendUrl, tickets)
        );

        const runInfo = await pipeline.load();
        // Despite receiving two tickets, only one should be parsed and saved
        expect(runInfo.atomsLoaded).to.eq(1);
        // Expect one error to have been logged
        expectLength(
          runInfo.latestLogs.filter(
            (log) => log.level === PipelineLogLevel.Error
          ),
          1
        );
      }
    }
  );

  step(
    "Pretix should not load tickets for an event with invalid settings",
    async function () {
      expectToExist(giService);
      const pipelines = await giService.getAllPipelines();
      const pipeline = pipelines.find(PretixPipeline.is);
      expectToExist(pipeline);
      expect(pipeline.id).to.eq(ethLatAmPipeline.id);

      const backup = pretixBackend.backup();
      // These event settings are invalid, and so the Pretix pipeline should
      // refuse to load any tickets for the event.
      pretixBackend.setEventSettings(
        ethLatAmPretixOrganizer.orgUrl,
        ethLatAmEvent.slug,
        { attendee_emails_asked: false, attendee_emails_required: false }
      );

      const runInfo = await pipeline.load();
      expect(runInfo.atomsLoaded).to.eq(0);
      expectLength(
        runInfo.latestLogs.filter(
          (log) => log.level === PipelineLogLevel.Error
        ),
        1
      );

      pretixBackend.restore(backup);
    }
  );

  step(
    "Pretix should not load tickets for events which have products with invalid settings",
    async function () {
      expectToExist(giService);
      const pipelines = await giService.getAllPipelines();
      const pipeline = pipelines.find(PretixPipeline.is);
      expectToExist(pipeline);
      expect(pipeline.id).to.eq(ethLatAmPipeline.id);

      // The setup of products is considered to be part of the event
      // configuration, so a mis-configured product will block the loading of
      // any tickets for the event, even if there are no tickets using this
      // product.

      const backup = pretixBackend.backup();
      pretixBackend.updateProduct(
        ethLatAmPretixOrganizer.orgUrl,
        pretixBackend.get().ethLatAmOrganizer.ethLatAm.slug,
        pretixBackend.get().ethLatAmOrganizer.ethLatAmTShirtProduct.id,
        (product) => {
          product.generate_tickets = true;
        }
      );

      const runInfo = await pipeline.load();
      expect(runInfo.atomsLoaded).to.eq(0);
      expectLength(
        runInfo.latestLogs.filter(
          (log) => log.level === PipelineLogLevel.Error
        ),
        1
      );

      pretixBackend.restore(backup);
    }
  );

  step("Authenticated Generic Issuance Endpoints", async () => {
    expectToExist(giService);
    const pipelines = await giService.getAllPipelines();
    expectToExist(pipelines);
    expectLength(pipelines, 3);
    const edgeCityDenverPipeline = pipelines.find(LemonadePipeline.is);
    expectToExist(edgeCityDenverPipeline);
    const ethLatAmPipeline = pipelines.find(PretixPipeline.is);
    expectToExist(ethLatAmPipeline);

    // TODO
  });

  this.afterAll(async () => {
    await stopApplication(giBackend);
    mockServer.close();
  });
});

/**
 * Testing that the Generic Issuance backend calculates {@link InfoResult} about
 * pipeline {@link PretixPipeline} correctly by requesting it from the Generic
 * Issuance API routes.
 *
 * This endpoint is used by the Generic Issuance frontend to assist a user in
 * managing their {@link Pipeline}.
 *
 * TODO: incorporate auth
 */
async function checkPipelineInfoEndpoint(
  giBackend: Zupass,
  pipeline: Pipeline
): Promise<void> {
  const pipelineInfoResult: InfoResult = await requestPipelineInfo(
    "todo",
    giBackend.expressContext.localEndpoint,
    pipeline.id
  );
  expectFalse(pipelineInfoResult.success); // need to implement jwt spoofing
  // expectTrue(pipelineInfoResult.success);
  // expectLength(pipelineInfoResult.value.feeds, 1);
  // const pretixFeedInfo: PipelineFeedInfo | undefined =
  //   pipelineInfoResult.value.feeds?.[0];
  // expectToExist(pretixFeedInfo);
  // expect(pretixFeedInfo.name).to.eq(
  //   pipeline.issuanceCapability.options.feedDisplayName
  // );
  // expect(pretixFeedInfo.url).to.eq(pipeline.issuanceCapability.feedUrl);
  // TODO: more comprehensive pipeline info tests
}

/**
 * TODO: extract this to the `@pcd/passport-interface` package.
 */
export async function signFeedCredentialPayload(
  identity: Identity,
  payload: FeedCredentialPayload
): Promise<SerializedPCD<SemaphoreSignaturePCD>> {
  const signaturePCD = await SemaphoreSignaturePCDPackage.prove({
    identity: {
      argumentType: ArgumentTypeName.PCD,
      value: await SemaphoreIdentityPCDPackage.serialize(
        await SemaphoreIdentityPCDPackage.prove({
          identity: identity
        })
      )
    },
    signedMessage: {
      argumentType: ArgumentTypeName.String,
      value: JSON.stringify(payload)
    }
  });

  return await SemaphoreSignaturePCDPackage.serialize(signaturePCD);
}

/**
 * Requests tickets from a pipeline that is issuing {@link EdDSATicketPCD}s.
 */
export async function requestTicketsFromPipeline(
  expectedFolder: string,
  /**
   * Generated by {@code makeGenericIssuanceFeedUrl}.
   */
  feedUrl: string,
  feedId: string,
  /**
   * Rather than get an {@link EmailPCD} issued by the email feed
   * Zupass Server hosts, for testing purposes, we're generating
   * the email PCD on the fly inside this function using this key.
   */
  zupassEddsaPrivateKey: string,
  /**
   * Zupass Server attests that the given email address...
   */
  email: string,
  /**
   * Is owned by this identity.
   */
  identity: Identity
): Promise<EdDSATicketPCD[]> {
  const ticketPCDResponse = await requestPollFeed(feedUrl, {
    feedId: feedId,
    pcd: await signFeedCredentialPayload(
      identity,
      createFeedCredentialPayload(
        await EmailPCDPackage.serialize(
          await EmailPCDPackage.prove({
            privateKey: {
              value: zupassEddsaPrivateKey,
              argumentType: ArgumentTypeName.String
            },
            id: {
              value: "email-id",
              argumentType: ArgumentTypeName.String
            },
            emailAddress: {
              value: email,
              argumentType: ArgumentTypeName.String
            },
            semaphoreId: {
              value: identity.commitment.toString(),
              argumentType: ArgumentTypeName.String
            }
          })
        )
      )
    )
  });

  return getTicketsFromFeedResponse(expectedFolder, ticketPCDResponse);
}

/**
 * Extracts tickets from {@link PollFeedResult}. Expects tickets to be returned
 * in a single {@link ReplaceInFolderAction}. Checks that the first and only
 * {@link PCDAction}
 */
export function getTicketsFromFeedResponse(
  expectedFolder: string,
  result: PollFeedResult
): Promise<EdDSATicketPCD[]> {
  expectTrue(result.success);
  const secondAction = result.value.actions[1];
  expectIsReplaceInFolderAction(secondAction);
  expect(secondAction.folder).to.eq(expectedFolder);
  return Promise.all(
    secondAction.pcds.map((t) => EdDSATicketPCDPackage.deserialize(t.pcd))
  );
}

/**
 * Receivers of {@link EdDSATicketPCD} can 'check in' other holders of
 * tickets issued by the same feed, if their ticket's 'product type' has
 * been configured by the owner of the pipeline of this feed.
 */
export async function requestCheckInPipelineTicket(
  /**
   * {@link Pipeline}s can have a {@link CheckinCapability}
   */
  checkinRoute: string,
  zupassEddsaPrivateKey: string,
  checkerEmail: string,
  checkerIdentity: Identity,
  ticket: EdDSATicketPCD
): Promise<PodboxTicketActionResult> {
  const checkerEmailPCD = await EmailPCDPackage.prove({
    privateKey: {
      value: zupassEddsaPrivateKey,
      argumentType: ArgumentTypeName.String
    },
    id: {
      value: "email-id",
      argumentType: ArgumentTypeName.String
    },
    emailAddress: {
      value: checkerEmail,
      argumentType: ArgumentTypeName.String
    },
    semaphoreId: {
      value: checkerIdentity.commitment.toString(),
      argumentType: ArgumentTypeName.String
    }
  });
  const serializedTicketCheckerEmailPCD =
    await EmailPCDPackage.serialize(checkerEmailPCD);

  const ticketCheckerPayload = createTicketActionCredentialPayload(
    serializedTicketCheckerEmailPCD,
    {
      checkin: true
    },
    ticket.claim.ticket.eventId,
    ticket.claim.ticket.ticketId
  );

  const ticketCheckerFeedCredential = await signFeedCredentialPayload(
    checkerIdentity,
    ticketCheckerPayload
  );

  return requestPodboxTicketAction(checkinRoute, ticketCheckerFeedCredential);
}

function assertUserMatches(
  expectedUser: PipelineUser,
  actualUser: PipelineUser | undefined
): void {
  expect(actualUser).to.exist;
  expect(actualUser?.email).to.eq(expectedUser.email);
  expect(actualUser?.id).to.eq(expectedUser.id);
  expect(actualUser?.isAdmin).to.eq(expectedUser.isAdmin);
}
