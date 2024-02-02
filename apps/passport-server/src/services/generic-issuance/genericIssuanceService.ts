import { EdDSAPublicKey, isEdDSAPublicKey } from "@pcd/eddsa-pcd";
import {
  CheckTicketInResponseValue,
  Feed,
  GenericIssuanceCheckInRequest,
  GenericIssuanceSendEmailResponseValue,
  ListFeedsResponseValue,
  PipelineDefinition,
  PipelineDefinitionSchema,
  PipelineFeedInfo,
  PipelineInfoResponseValue,
  PipelineType,
  PollFeedRequest,
  PollFeedResponseValue,
  PretixPipelineDefinition
} from "@pcd/passport-interface";
import { PCDPermissionType } from "@pcd/pcd-collection";
import { randomUUID } from "crypto";
import { Request } from "express";
import stytch, { Client, Session } from "stytch";
import { v4 as uuidV4 } from "uuid";
import { ILemonadeAPI } from "../../apis/lemonade/lemonadeAPI";
import { IGenericPretixAPI } from "../../apis/pretix/genericPretixAPI";
import { IPipelineAtomDB } from "../../database/queries/pipelineAtomDB";
import {
  IPipelineDefinitionDB,
  PipelineDefinitionDB
} from "../../database/queries/pipelineDefinitionDB";
import {
  IPipelineUserDB,
  PipelineUserDB
} from "../../database/queries/pipelineUserDB";
import { sqlQuery } from "../../database/sqlQuery";
import { PCDHTTPError } from "../../routing/pcdHttpError";
import { ApplicationContext } from "../../types";
import { logger } from "../../util/logger";
import {
  CheckinCapability,
  isCheckinCapability
} from "./capabilities/CheckinCapability";
import {
  FeedIssuanceCapability,
  isFeedIssuanceCapability
} from "./capabilities/FeedIssuanceCapability";
import {
  LemonadePipeline,
  isLemonadePipelineDefinition
} from "./pipelines/LemonadePipeline";
import {
  PretixPipeline,
  isPretixPipelineDefinition
} from "./pipelines/PretixPipeline";
import { Pipeline, PipelineUser } from "./pipelines/types";

const SERVICE_NAME = "GENERIC_ISSUANCE";
const LOG_TAG = `[${SERVICE_NAME}]`;

/**
 * Given a {@link PipelineDefinition} (which is persisted to the database) instantiates
 * a {@link Pipeline} so that it can be used for loading data from an external provider,
 * and expose its {@link Capability}s to the external world.
 */
export function createPipeline(
  eddsaPrivateKey: string,
  definition: PipelineDefinition,
  db: IPipelineAtomDB,
  apis: {
    lemonadeAPI: ILemonadeAPI;
    genericPretixAPI: IGenericPretixAPI;
  },
  zupassPublicKey: EdDSAPublicKey
): Pipeline {
  if (isLemonadePipelineDefinition(definition)) {
    return new LemonadePipeline(
      eddsaPrivateKey,
      definition,
      db,
      apis.lemonadeAPI,
      zupassPublicKey
    );
  } else if (isPretixPipelineDefinition(definition)) {
    return new PretixPipeline(
      eddsaPrivateKey,
      definition,
      db,
      apis.genericPretixAPI,
      zupassPublicKey
    );
  }

  throw new Error(
    `couldn't instantiate pipeline for configuration ${JSON.stringify(
      definition
    )}`
  );
}

/**
 * It's not always to start a {@link Pipeline} given a {@link PipelineDefinition}
 * since a pipeline could be mis-configured. This data structure lets us store in-memory
 * all our defined pipelines, as well as its corresponding instantiated Pipeline, if
 * the {@link GenericIssuanceService} was able to start one.
 */
export interface InMemoryPipeline {
  definition: PipelineDefinition;
  pipeline?: Pipeline;
}

export class GenericIssuanceService {
  /**
   * The pipeline data reload algorithm works as follows:
   * 1. concurrently load all data for all pipelines
   * 2. save that data
   * 3. wait {@link PIPELINE_REFRESH_INTERVAL_MS} milliseconds
   * 4. go back to step one
   */
  private static readonly PIPELINE_REFRESH_INTERVAL_MS = 60_000;

  private context: ApplicationContext;

  private userDB: IPipelineUserDB;
  private definitionDB: IPipelineDefinitionDB;
  private atomDB: IPipelineAtomDB;

  private lemonadeAPI: ILemonadeAPI;
  private genericPretixAPI: IGenericPretixAPI;
  private stytchClient: Client;

  private genericIssuanceClientUrl: string;
  private eddsaPrivateKey: string;
  private zupassPublicKey: EdDSAPublicKey;
  private bypassEmail: boolean;
  private pipelines: Map<string, InMemoryPipeline>;
  private nextLoadTimeout: NodeJS.Timeout | undefined;
  private stopped = false;

  public constructor(
    context: ApplicationContext,
    atomDB: IPipelineAtomDB,
    lemonadeAPI: ILemonadeAPI,
    stytchClient: Client,
    genericIssuanceClientUrl: string,
    pretixAPI: IGenericPretixAPI,
    eddsaPrivateKey: string,
    zupassPublicKey: EdDSAPublicKey
  ) {
    this.userDB = new PipelineUserDB(context.dbPool);
    this.definitionDB = new PipelineDefinitionDB(context.dbPool);
    this.atomDB = atomDB;
    this.context = context;
    this.lemonadeAPI = lemonadeAPI;
    this.genericPretixAPI = pretixAPI;
    this.eddsaPrivateKey = eddsaPrivateKey;
    this.pipelines = new Map();
    this.stytchClient = stytchClient;
    this.genericIssuanceClientUrl = genericIssuanceClientUrl;
    this.bypassEmail =
      process.env.BYPASS_EMAIL_REGISTRATION === "true" &&
      process.env.NODE_ENV !== "production";
    this.zupassPublicKey = zupassPublicKey;
  }

  public async start(): Promise<void> {
    await this.maybeInsertLocalDevTestPipeline();
    await this.startPipelinesFromDefinitions();
    this.schedulePipelineLoadLoop();
  }

  public async stop(): Promise<void> {
    logger(LOG_TAG, "stopping");

    this.stopped = true;
    if (this.nextLoadTimeout) {
      clearTimeout(this.nextLoadTimeout);
    }
  }

  public async startPipelinesFromDefinitions(): Promise<void> {
    const existingPipelines = Array.from(this.pipelines.values());
    const piplinesFromDB = await this.definitionDB.loadPipelineDefinitions();

    // TODO: only restart pipelines whose definitions have changed
    await Promise.allSettled(
      existingPipelines.map(async (entry) => {
        if (entry.pipeline) {
          await entry.pipeline.stop();
        }
      })
    );

    const pipelines = await Promise.all(
      piplinesFromDB.map(async (definition) => {
        const result: InMemoryPipeline = {
          definition
        };

        try {
          const pipeline = createPipeline(
            this.eddsaPrivateKey,
            definition,
            this.atomDB,
            {
              lemonadeAPI: this.lemonadeAPI,
              genericPretixAPI: this.genericPretixAPI
            },
            this.zupassPublicKey
          );
          result.pipeline = pipeline;
        } catch (e) {
          //
        }

        return result;
      })
    );

    this.pipelines = new Map(
      pipelines.map((runtimePipeline) => [
        runtimePipeline.definition.id,
        runtimePipeline
      ])
    );
  }

  public async executeAllPipelineLoads(): Promise<void> {
    const pipelines: InMemoryPipeline[] = Array.from(this.pipelines.values());

    logger(
      LOG_TAG,
      `loading data for ${
        pipelines.length
      } pipelines. ids are: ${JSON.stringify(
        pipelines.map((p) => p.definition.id)
      )}`
    );

    await Promise.allSettled(
      pipelines.map(
        async (inMemoryPipeline: InMemoryPipeline): Promise<void> => {
          const pipelineId = inMemoryPipeline.definition.id;
          const pipeline = inMemoryPipeline.pipeline;

          if (!pipeline) {
            logger(
              LOG_TAG,
              `pipeline ${pipelineId} is not running; skipping loading`
            );
            return;
          }

          try {
            logger(
              LOG_TAG,
              `loading data for pipeline with id '${pipelineId}'`
            );
            await pipeline.load();
            logger(
              LOG_TAG,
              `successfully loaded data for pipeline with id '${pipelineId}'`
            );
          } catch (e) {
            logger(LOG_TAG, `failed to load pipeline '${pipelineId}'`, e);
          }
        }
      )
    );
  }

  /**
   * Loads all data for all pipelines (that have been started). Waits 60s,
   * then loads all data for all loaded pipelines again.
   */
  private async schedulePipelineLoadLoop(): Promise<void> {
    logger(LOG_TAG, "refreshing pipeline datas");

    try {
      await this.executeAllPipelineLoads();
      logger(LOG_TAG, "pipeline datas refreshed");
    } catch (e) {
      logger(LOG_TAG, "pipeline datas failed to refresh", e);
    }

    if (this.stopped) {
      return;
    }

    logger(
      LOG_TAG,
      "scheduling next pipeline refresh for",
      Math.floor(GenericIssuanceService.PIPELINE_REFRESH_INTERVAL_MS / 1000),
      "s from now"
    );

    this.nextLoadTimeout = setTimeout(() => {
      if (this.stopped) {
        return;
      }
      this.schedulePipelineLoadLoop();
    }, GenericIssuanceService.PIPELINE_REFRESH_INTERVAL_MS);
  }

  private async getPipeline(id: string): Promise<Pipeline | undefined> {
    return this.pipelines.get(id)?.pipeline;
  }

  private async ensurePipeline(id: string): Promise<Pipeline> {
    const pipeline = await this.getPipeline(id);
    if (!pipeline) {
      throw new Error(`no pipeline with id ${id} found`);
    }
    return pipeline;
  }

  /**
   * Handles incoming requests that hit a Pipeline-specific feed for PCDs
   * for every single pipeline that has this capability that this server manages.
   *
   * TODO: better logging, honeycomb tracing
   */
  public async handlePollFeed(
    pipelineId: string,
    req: PollFeedRequest
  ): Promise<PollFeedResponseValue> {
    const pipeline = await this.ensurePipeline(pipelineId);
    const relevantCapability = pipeline.capabilities.find(
      (c) => isFeedIssuanceCapability(c) && c.options.feedId === req.feedId
    ) as FeedIssuanceCapability | undefined;

    if (!relevantCapability) {
      throw new PCDHTTPError(
        403,
        `pipeline ${pipelineId} can't issue PCDs for feed id ${req.feedId}`
      );
    }

    if (!req.pcd) {
      throw new PCDHTTPError(403, `missing credential PCD in request`);
    }

    return relevantCapability.issue(req);
  }

  public async handleGetPipelineInfo(
    pipelineId: string
  ): Promise<PipelineInfoResponseValue> {
    const pipeline = await this.ensurePipeline(pipelineId);
    const feeds = pipeline.capabilities.filter(isFeedIssuanceCapability);
    const infos: PipelineFeedInfo[] = feeds.map((f) => ({
      name: f.options.feedDisplayName,
      url: f.feedUrl
    }));

    const response: PipelineInfoResponseValue = { feeds: infos };

    return response;
  }

  public async handleListFeed(
    pipelineId: string,
    feedId: string
  ): Promise<ListFeedsResponseValue> {
    const pipeline = await this.ensurePipeline(pipelineId);
    const relevantCapability = pipeline.capabilities.find(
      (c) => isFeedIssuanceCapability(c) && c.options.feedId === feedId
    ) as FeedIssuanceCapability | undefined;

    if (!relevantCapability) {
      throw new PCDHTTPError(
        403,
        `pipeline ${pipelineId} can't issue PCDs for feed id ${feedId}`
      );
    }

    const feed: Feed = {
      id: feedId,
      name: relevantCapability.options.feedDisplayName,
      description: relevantCapability.options.feedDescription,
      permissions: [
        {
          folder: relevantCapability.options.feedFolder,
          type: PCDPermissionType.AppendToFolder
        },
        {
          folder: relevantCapability.options.feedFolder,
          type: PCDPermissionType.ReplaceInFolder
        }
      ],
      credentialRequest: {
        signatureType: "sempahore-signature-pcd",
        pcdType: "email-pcd"
      }
    };

    const res: ListFeedsResponseValue = {
      feeds: [feed],
      providerName: "PCD-ifier",
      providerUrl: relevantCapability.feedUrl
    };

    return res;
  }

  /**
   * Handles incoming requests that hit a Pipeline which implements the checkin
   * capability for every pipeline this server manages.
   *
   *
   * TODO: better logging and tracing.
   */
  public async handleCheckIn(
    pipelineId: string,
    req: GenericIssuanceCheckInRequest
  ): Promise<CheckTicketInResponseValue> {
    const pipeline = await this.ensurePipeline(pipelineId);
    const relevantCapability = pipeline.capabilities.find((c) =>
      isCheckinCapability(c)
    ) as CheckinCapability | undefined;

    if (!relevantCapability) {
      throw new PCDHTTPError(
        403,
        `pipeline ${pipelineId} can't check tickets in`
      );
    }

    return relevantCapability.checkin(req);
  }

  public async getAllUserPipelineDefinitions(
    userId: string
  ): Promise<PipelineDefinition[]> {
    // TODO: Add logic for isAdmin = true
    return (await this.definitionDB.loadPipelineDefinitions()).filter((d) =>
      this.userHasPipelineDefinitionAccess(userId, d)
    );
  }

  private userHasPipelineDefinitionAccess(
    userId: string,
    pipeline: PipelineDefinition
  ): boolean {
    return (
      pipeline.ownerUserId === userId || pipeline.editorUserIds.includes(userId)
    );
  }

  public async getPipelineDefinition(
    userId: string,
    pipelineId: string
  ): Promise<PipelineDefinition> {
    const pipeline = await this.definitionDB.getDefinition(pipelineId);
    if (!pipeline || !this.userHasPipelineDefinitionAccess(userId, pipeline))
      throw new PCDHTTPError(404, "Pipeline not found or not accessible");
    return pipeline;
  }

  public async upsertPipelineDefinition(
    userId: string,
    pipelineDefinition: PipelineDefinition
  ): Promise<PipelineDefinition> {
    const existingPipelineDefinition = await this.definitionDB.getDefinition(
      pipelineDefinition.id
    );
    if (existingPipelineDefinition) {
      if (
        !this.userHasPipelineDefinitionAccess(
          userId,
          existingPipelineDefinition
        )
      ) {
        throw new PCDHTTPError(403, "Not allowed to edit pipeline");
      }
      if (
        existingPipelineDefinition.ownerUserId !==
        pipelineDefinition.ownerUserId
      ) {
        throw new PCDHTTPError(400, "Cannot change owner of pipeline");
      }
    } else {
      pipelineDefinition.ownerUserId = userId;
      if (!pipelineDefinition.id) {
        pipelineDefinition.id = uuidV4();
      }
    }

    let newPipelineDefinition: PipelineDefinition;
    try {
      newPipelineDefinition = PipelineDefinitionSchema.parse(
        pipelineDefinition
      ) as PipelineDefinition;
    } catch (e) {
      throw new PCDHTTPError(400, `Invalid formatted response: ${e}`);
    }

    await this.definitionDB.setDefinition(newPipelineDefinition);
    await this.restartPipelineId(newPipelineDefinition.id);
    return newPipelineDefinition;
  }

  public async deletePipelineDefinition(
    userId: string,
    pipelineId: string
  ): Promise<undefined> {
    const pipeline = await this.getPipelineDefinition(userId, pipelineId);
    // TODO: Finalize the "permissions model" for CRUD actions. Right now,
    // create, read, update are permissable by owners and editors, while delete
    // is only permissable by owners.
    if (pipeline.ownerUserId !== userId) {
      throw new PCDHTTPError(403, "Need to be owner to delete pipeline");
    }
    await this.definitionDB.clearDefinition(pipelineId);
    await this.restartPipelineId(pipelineId);
  }

  /**
   * Makes sure that the pipeline that's running on the server
   * for the given id is based off the latest pipeline configuration
   * stored in the database.
   *
   * If a pipeline with the given definition does not exists in the database
   * makes sure that no pipeline for it is running on the server.
   */
  private async restartPipelineId(pipelineId: string): Promise<void> {
    const inMemoryPipeline = this.pipelines.get(pipelineId);
    if (inMemoryPipeline) {
      // we're going to need to stop the pipeline for this
      // definition, so we do that right at the beginning
      this.pipelines.delete(pipelineId);
      await inMemoryPipeline.pipeline?.stop();
    }

    const definitionInDB = await this.definitionDB.getDefinition(pipelineId);

    if (definitionInDB) {
      const pipeline = createPipeline(
        this.eddsaPrivateKey,
        definitionInDB,
        this.atomDB,
        {
          genericPretixAPI: this.genericPretixAPI,
          lemonadeAPI: this.lemonadeAPI
        },
        this.zupassPublicKey
      );

      this.pipelines.set(definitionInDB.id, {
        pipeline: pipeline,
        definition: definitionInDB
      });

      logger(LOG_TAG, `loading data for updated pipeline ${pipeline.id}`);

      pipeline
        .load()
        .then(() => {
          logger(LOG_TAG, `loaded data for updated pipeline ${pipeline.id}`);
        })
        .catch((e) => {
          logger(
            LOG_TAG,
            `failed to load data for updated pipeline ${pipeline.id}`,
            e
          );
        });
    } else {
      // this pipeline doesn't have a definition anymore, so we don't need to
      // start another instance for it
    }
  }

  public async createOrGetUser(email: string): Promise<PipelineUser> {
    const existingUser = await this.userDB.getUserByEmail(email);
    if (existingUser != null) {
      return existingUser;
    }
    const newUser: PipelineUser = {
      id: uuidV4(),
      email,
      isAdmin: false
    };
    this.userDB.setUser(newUser);
    return newUser;
  }

  /**
   * TODO: this probably shouldn't be public, but it was useful for testing.
   */
  public async getAllPipelines(): Promise<Pipeline[]> {
    return Array.from(this.pipelines.values())
      .map((p) => p.pipeline)
      .filter((p) => !!p) as Pipeline[];
  }

  private getEmailFromStytchSession(session: Session): string {
    const email = session.authentication_factors.find(
      (f) => !!f.email_factor?.email_address
    )?.email_factor?.email_address;
    if (!email) {
      throw new PCDHTTPError(400, "Session did not use email authentication");
    }
    return email;
  }

  public async authenticateStytchSession(req: Request): Promise<PipelineUser> {
    try {
      const reqBody = req.body;
      const jwt = reqBody.jwt;

      const { session } = await this.stytchClient.sessions.authenticateJwt({
        session_jwt: jwt
      });
      const email = this.getEmailFromStytchSession(session);
      const user = await this.createOrGetUser(email);
      return user;
    } catch (e) {
      throw new PCDHTTPError(401, "Not authorized");
    }
  }

  public async sendLoginEmail(
    email: string
  ): Promise<GenericIssuanceSendEmailResponseValue> {
    // TODO: Skip email auth on this.bypassEmail
    try {
      await this.stytchClient.magicLinks.email.loginOrCreate({
        email,
        login_magic_link_url: this.genericIssuanceClientUrl,
        login_expiration_minutes: 10,
        signup_magic_link_url: this.genericIssuanceClientUrl,
        signup_expiration_minutes: 10
      });
    } catch (e) {
      throw new PCDHTTPError(500, "Failed to send generic issuance email");
    }
  }

  /**
   * in local development, set the `TEST_PRETIX_KEY` and `TEST_PRETIX_ORG_URL` env
   * variables to the ones that Ivan shares with you to set up a Pretix pipeline.
   */
  public async maybeInsertLocalDevTestPipeline(): Promise<void> {
    if (process.env.NODE_ENV === "production") {
      return;
    }

    logger("[INIT] attempting to create test pipeline data");

    const testPretixAPIKey = process.env.TEST_PRETIX_KEY;
    const testPretixOrgUrl = process.env.TEST_PRETIX_ORG_URL;
    const createTestPretixPipeline = process.env.CREATE_TEST_PIPELINE;

    if (!createTestPretixPipeline || !testPretixAPIKey || !testPretixOrgUrl) {
      logger("[INIT] not creating test pipeline data - missing env vars");
      return;
    }

    const existingPipelines = await this.definitionDB.loadPipelineDefinitions();
    if (existingPipelines.length !== 0) {
      logger("[INIT] there's already a pipeline - not creating test pipeline");
      return;
    }

    const ownerUUID = randomUUID();

    await sqlQuery(
      this.context.dbPool,
      "INSERT INTO generic_issuance_users VALUES($1, $2, $3)",
      [ownerUUID, "test@example.com", true]
    );

    const pretixDefinitionId = "3d6d4c8e-4228-423e-9b0a-33709aa1b468";

    const pretixDefinition: PretixPipelineDefinition = {
      ownerUserId: ownerUUID,
      id: pretixDefinitionId,
      editorUserIds: [],
      options: {
        feedOptions: {
          feedDescription: "progcrypto test tickets",
          feedDisplayName: "progcrypto",
          feedFolder: "generic/progcrypto",
          feedId: "0"
        },
        events: [
          {
            genericIssuanceId: randomUUID(),
            externalId: "progcrypto",
            name: "ProgCrypto (Internal Test)",
            products: [
              {
                externalId: "369803",
                name: "GA",
                genericIssuanceId: randomUUID(),
                isSuperUser: false
              },
              {
                externalId: "374045",
                name: "Organizer",
                genericIssuanceId: randomUUID(),
                isSuperUser: true
              }
            ]
          }
        ],
        pretixAPIKey: testPretixAPIKey,
        pretixOrgUrl: testPretixOrgUrl
      },
      type: PipelineType.Pretix
    };

    await this.definitionDB.setDefinition(pretixDefinition);
  }
}

export async function startGenericIssuanceService(
  context: ApplicationContext,
  lemonadeAPI: ILemonadeAPI | null,
  genericPretixAPI: IGenericPretixAPI | null
): Promise<GenericIssuanceService | null> {
  if (!lemonadeAPI) {
    logger(
      "[INIT] not starting generic issuance service - missing lemonade API"
    );
    return null;
  }

  if (!genericPretixAPI) {
    logger("[INIT] not starting generic issuance service - missing pretix API");
    return null;
  }

  const pkeyEnv = process.env.GENERIC_ISSUANCE_EDDSA_PRIVATE_KEY;
  if (pkeyEnv == null) {
    logger(
      "[INIT] missing environment variable GENERIC_ISSUANCE_EDDSA_PRIVATE_KEY"
    );
    return null;
  }

  const projectIdEnv = process.env.STYTCH_PROJECT_ID;
  if (projectIdEnv == null) {
    logger("[INIT] missing environment variable STYTCH_PROJECT_ID");
    return null;
  }

  const secretEnv = process.env.STYTCH_SECRET;
  if (secretEnv == null) {
    logger("[INIT] missing environment variable STYTCH_SECRET");
    return null;
  }

  const stytchClient = new stytch.Client({
    project_id: projectIdEnv,
    secret: secretEnv
  });

  const genericIssuanceClientUrl = process.env.GENERIC_ISSUANCE_CLIENT_URL;
  if (genericIssuanceClientUrl == null) {
    logger("[INIT] missing GENERIC_ISSUANCE_CLIENT_URL");
    return null;
  }

  const zupassPublicKeyEnv = process.env.GENERIC_ISSUANCE_ZUPASS_PUBLIC_KEY;
  if (!zupassPublicKeyEnv) {
    logger("[INIT missing GENERIC_ISSUANCE_ZUPASS_PUBLIC_KEY");
    return null;
  }

  let zupassPublicKey: EdDSAPublicKey;
  try {
    zupassPublicKey = JSON.parse(zupassPublicKeyEnv);
    if (!isEdDSAPublicKey(zupassPublicKey)) {
      throw new Error("Invalid public key");
    }
  } catch (e) {
    logger("[INIT] invalid GENERIC_ISSUANCE_ZUPASS_PUBLIC_KEY");
    return null;
  }

  const issuanceService = new GenericIssuanceService(
    context,
    context.pipelineAtomDB,
    lemonadeAPI,
    stytchClient,
    genericIssuanceClientUrl,
    genericPretixAPI,
    pkeyEnv,
    zupassPublicKey
  );

  issuanceService.start();

  return issuanceService;
}
