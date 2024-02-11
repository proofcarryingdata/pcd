import { EdDSAPublicKey, isEdDSAPublicKey } from "@pcd/eddsa-pcd";
import {
  Feed,
  GenericCheckinCredentialPayload,
  GenericIssuanceCheckInRequest,
  GenericIssuanceCheckInResponseValue,
  GenericIssuancePipelineListEntry,
  GenericIssuancePreCheckRequest,
  GenericIssuancePreCheckResponseValue,
  GenericIssuanceSendEmailResponseValue,
  GenericPretixEvent,
  GenericPretixProduct,
  ListFeedsResponseValue,
  PipelineDefinition,
  PipelineDefinitionSchema,
  PipelineInfoResponseValue,
  PipelineLoadSummary,
  PipelineType,
  PollFeedRequest,
  PollFeedResponseValue,
  PretixPipelineDefinition
} from "@pcd/passport-interface";
import { PCDPermissionType, getPcdsFromActions } from "@pcd/pcd-collection";
import { SemaphoreSignaturePCDPackage } from "@pcd/semaphore-signature-pcd";
import { normalizeEmail, str } from "@pcd/util";
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
import { RollbarService } from "../rollbarService";
import { setError, traceFlattenedObject, traced } from "../telemetryService";
import { isCheckinCapability } from "./capabilities/CheckinCapability";
import {
  FeedIssuanceCapability,
  ensureFeedIssuanceCapability,
  isFeedIssuanceCapability
} from "./capabilities/FeedIssuanceCapability";
import { traceLoadSummary, tracePipeline, traceUser } from "./honeycombQueries";
import { instantiatePipeline } from "./pipelines/instantiatePipeline";
import { Pipeline, PipelineUser } from "./pipelines/types";
import { makePLogErr, makePLogInfo } from "./util";

const SERVICE_NAME = "GENERIC_ISSUANCE";
const LOG_TAG = `[${SERVICE_NAME}]`;

/**
 * It's not always possible to start a {@link Pipeline} given a {@link PipelineDefinition}
 * because a pipeline could be misconfigured.
 *
 * An {@link PipelineSlot} is used to represent a pair of {@link PipelineDefinition} and
 * its corresponding {@link Pipeline} if one was able to be started.
 */
export interface PipelineSlot {
  definition: PipelineDefinition;
  instance?: Pipeline;
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
  private rollbarService: RollbarService | null;

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
  private pipelineSlots: PipelineSlot[];
  private nextLoadTimeout: NodeJS.Timeout | undefined;
  private stopped = false;

  public constructor(
    context: ApplicationContext,
    rollbarService: RollbarService | null,
    atomDB: IPipelineAtomDB,
    lemonadeAPI: ILemonadeAPI,
    stytchClient: Client,
    genericIssuanceClientUrl: string,
    pretixAPI: IGenericPretixAPI,
    eddsaPrivateKey: string,
    zupassPublicKey: EdDSAPublicKey
  ) {
    this.context = context;
    this.rollbarService = rollbarService;
    this.userDB = new PipelineUserDB(context.dbPool);
    this.definitionDB = new PipelineDefinitionDB(context.dbPool);
    this.atomDB = atomDB;
    this.lemonadeAPI = lemonadeAPI;
    this.genericPretixAPI = pretixAPI;
    this.eddsaPrivateKey = eddsaPrivateKey;
    this.pipelineSlots = [];
    this.stytchClient = stytchClient;
    this.genericIssuanceClientUrl = genericIssuanceClientUrl;
    this.bypassEmail =
      process.env.BYPASS_EMAIL_REGISTRATION === "true" &&
      process.env.NODE_ENV !== "production";
    this.zupassPublicKey = zupassPublicKey;
  }

  public async start(): Promise<void> {
    try {
      await this.maybeInsertLocalDevTestPipeline();
      await this.maybeSetupAdmins();
      await this.loadAndInstantiatePipelines();
      this.startPipelineLoadLoop();
    } catch (e) {
      this.rollbarService?.reportError(e);
      logger(LOG_TAG, "error starting GenericIssuanceService", e);
      throw e;
    }
  }

  public async stop(): Promise<void> {
    if (this.stopped) {
      logger(LOG_TAG, "already stopped - not stopping");
      return;
    }

    logger(LOG_TAG, "stopping");

    this.stopped = true;
    if (this.nextLoadTimeout) {
      clearTimeout(this.nextLoadTimeout);
      this.nextLoadTimeout = undefined;
    }
  }

  /**
   * - loads all {@link PipelineDefinition}s from persistent storage
   * - creates a {@link PipelineSlot} for each definition
   * - attempts to instantiate the correct {@link Pipeline} for each definition,
   *   according to that pipeline's {@link PipelineType}. Currently implemented
   *   pipeline types include:
   *     - {@link LemonadePipeline}
   *     - {@link PretixPipeline}
   *     - {@link CSVPipeline}
   */
  public async loadAndInstantiatePipelines(): Promise<void> {
    return traced(SERVICE_NAME, "loadAndInstantiatePipelines", async (span) => {
      const pipelinesFromDB = await this.definitionDB.loadPipelineDefinitions();
      span?.setAttribute("pipeline_count", pipelinesFromDB.length);

      await Promise.allSettled(
        this.pipelineSlots.map(async (entry) => {
          if (entry.instance) {
            await entry.instance.stop();
          }
        })
      );

      this.pipelineSlots = await Promise.all(
        pipelinesFromDB.map(async (pd: PipelineDefinition) => {
          const slot: PipelineSlot = {
            definition: pd
          };

          // attempt to instantiate a {@link Pipeline}
          // for this slot. no worries in case of error -
          // log and continue
          try {
            slot.instance = await instantiatePipeline(
              this.eddsaPrivateKey,
              pd,
              this.atomDB,
              {
                lemonadeAPI: this.lemonadeAPI,
                genericPretixAPI: this.genericPretixAPI
              },
              this.zupassPublicKey
            );
          } catch (e) {
            this.rollbarService?.reportError(e);
            logger(LOG_TAG, `failed to instantiate pipeline ${pd.id} `, e);
          }

          return slot;
        })
      );
    });
  }

  /**
   * All {@link Pipeline}s load data somehow. That's a 'first-class'
   * capability.
   */
  private async performPipelineLoad(
    pipelineSlot: PipelineSlot
  ): Promise<PipelineLoadSummary> {
    return traced<PipelineLoadSummary>(
      SERVICE_NAME,
      "performPipelineLoad",
      async (span): Promise<PipelineLoadSummary> => {
        const startTime = Date.now();
        const pipelineId = pipelineSlot.definition.id;
        const pipeline: Pipeline | undefined = pipelineSlot.instance;
        logger(
          LOG_TAG,
          `executing pipeline '${pipelineId}'` +
            ` of type '${pipeline?.type}'` +
            ` belonging to ${pipelineSlot.definition.ownerUserId}`
        );
        const owner = await this.userDB.getUser(
          pipelineSlot.definition.ownerUserId
        );
        traceUser(owner);
        tracePipeline(pipelineSlot.definition);

        if (pipelineSlot.definition.options?.paused) {
          logger(
            LOG_TAG,
            `pipeline '${pipelineSlot.definition.id}' is paused, not loading`
          );
          return {
            atomsLoaded: 0,
            lastRunEndTimestamp: Date.now(),
            lastRunStartTimestamp: Date.now(),
            latestLogs: [makePLogInfo("this pipeline is paused - not loading")],
            success: true
          };
        }

        if (!pipeline) {
          logger(
            LOG_TAG,
            `pipeline '${pipelineId}' of type '${pipelineSlot.definition.type}'` +
              ` is not running; skipping execution`
          );
          const summary: PipelineLoadSummary = {
            lastRunStartTimestamp: startTime,
            lastRunEndTimestamp: Date.now(),
            latestLogs: [makePLogErr("failed to start pipeline")],
            atomsLoaded: 0,
            success: false
          };
          this.definitionDB.saveLoadSummary(pipelineId, summary);
          traceLoadSummary(summary);
          return summary;
        }

        try {
          logger(
            LOG_TAG,
            `loading data for pipeline with id '${pipelineId}'` +
              ` of type '${pipelineSlot.definition.type}'`
          );
          const summary = await pipeline.load();
          logger(
            LOG_TAG,
            `successfully loaded data for pipeline with id '${pipelineId}'` +
              ` of type '${pipelineSlot.definition.type}'`
          );
          this.definitionDB.saveLoadSummary(pipelineId, summary);
          traceLoadSummary(summary);
          return summary;
        } catch (e) {
          this.rollbarService?.reportError(e);
          logger(LOG_TAG, `failed to load pipeline '${pipelineId}'`, e);
          setError(e, span);
          const summary = {
            lastRunStartTimestamp: startTime,
            lastRunEndTimestamp: Date.now(),
            latestLogs: [makePLogErr(`failed to load pipeline: ${e + ""}`)],
            atomsLoaded: 0,
            success: false
          } satisfies PipelineLoadSummary;
          this.definitionDB.saveLoadSummary(pipelineId, summary);
          traceLoadSummary(summary);
          return summary;
        }
      }
    );
  }

  /**
   * Iterates over all instantiated {@link Pipeline}s and attempts to
   * perform a load for each one. No individual pipeline load failure should
   * prevent any other load from succeeding. Resolves when all pipelines complete
   * loading. This means that a single pipeline whose load function takes
   * a long time could stall the system.
   *
   * TODO: be robust to stalling. one way to do this could be to race the
   * load promise with a `sleep(30_000)`, and killing pipelines that take
   * longer than 30s.
   */
  public async performAllPipelineLoads(): Promise<void> {
    return traced(SERVICE_NAME, "performAllPipelineLoads", async (span) => {
      const pipelineIds = str(this.pipelineSlots.map((p) => p.definition.id));
      logger(
        LOG_TAG,
        `loading data for ${this.pipelineSlots.length} pipelines. ids are: ${pipelineIds}`
      );
      span?.setAttribute("pipeline_ids", pipelineIds);

      await Promise.allSettled(
        this.pipelineSlots.map(async (slot: PipelineSlot): Promise<void> => {
          const runInfo = await this.performPipelineLoad(slot);
          await this.definitionDB.saveLoadSummary(slot.definition.id, runInfo);
        })
      );
    });
  }

  /**
   * Loads all data for all pipelines (that have been started). Waits 60s,
   * then loads all data for all loaded pipelines again.
   */
  private async startPipelineLoadLoop(): Promise<void> {
    // return traced(SERVICE_NAME, "startPipelineLoadLoop", async (span) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const span: any = undefined;

    try {
      await this.performAllPipelineLoads();
    } catch (e) {
      setError(e, span);
      this.rollbarService?.reportError(e);
      logger(LOG_TAG, "pipeline datas failed to refresh", e);
    }

    if (this.stopped) {
      span?.setAttribute("stopped", true);
      return;
    }

    logger(
      LOG_TAG,
      "scheduling next pipeline refresh for",
      Math.floor(GenericIssuanceService.PIPELINE_REFRESH_INTERVAL_MS / 1000),
      "s from now"
    );
    span?.setAttribute(
      "timeout_ms",
      GenericIssuanceService.PIPELINE_REFRESH_INTERVAL_MS
    );

    this.nextLoadTimeout = setTimeout(() => {
      if (this.stopped) {
        return;
      }
      this.startPipelineLoadLoop();
    }, GenericIssuanceService.PIPELINE_REFRESH_INTERVAL_MS);
    // });
  }

  private async getPipelineSlot(id: string): Promise<PipelineSlot | undefined> {
    return this.pipelineSlots.find((p) => p.definition.id === id);
  }

  private async ensurePipelineSlotExists(id: string): Promise<PipelineSlot> {
    const pipeline = await this.getPipelineSlot(id);
    if (!pipeline) {
      throw new Error(`no pipeline with id ${id} found`);
    }
    return pipeline;
  }

  private async ensurePipelineStarted(id: string): Promise<Pipeline> {
    const pipeline = await this.ensurePipelineSlotExists(id);
    if (!pipeline.instance) {
      throw new Error(`no pipeline instance with id ${id} found`);
    }
    return pipeline.instance;
  }

  /**
   * Handles incoming requests that hit a Pipeline-specific feed for PCDs
   * for every single pipeline that has this capability that this server manages.
   */
  public async handlePollFeed(
    pipelineId: string,
    req: PollFeedRequest
  ): Promise<PollFeedResponseValue> {
    return traced(SERVICE_NAME, "handlePollFeed", async (span) => {
      logger(LOG_TAG, `handlePollFeed`, pipelineId, str(req));
      span?.setAttribute("feed_id", req.feedId);
      const pipelineSlot = await this.ensurePipelineSlotExists(pipelineId);
      tracePipeline(pipelineSlot.definition);

      const pipeline = await this.ensurePipelineStarted(pipelineId);
      const feed = ensureFeedIssuanceCapability(pipeline, req.feedId);
      const feedResponse = await feed.issue(req);

      traceFlattenedObject(span, {
        result: {
          actionCount: feedResponse.actions.length,
          pcdCount: getPcdsFromActions(feedResponse.actions).length
        }
      });

      return feedResponse;
    });
  }

  public async handleGetPipelineInfo(
    user: PipelineUser,
    pipelineId: string
  ): Promise<PipelineInfoResponseValue> {
    return traced(SERVICE_NAME, "handleGetPipelineInfo", async (span) => {
      logger(LOG_TAG, "handleGetPipelineInfo", str(user), pipelineId);
      traceUser(user);
      const pipelineSlot = await this.ensurePipelineSlotExists(pipelineId);
      tracePipeline(pipelineSlot.definition);
      const pipelineInstance = await this.ensurePipelineStarted(pipelineId);
      this.ensureUserHasPipelineDefinitionAccess(user, pipelineSlot.definition);

      const pipelineFeeds: FeedIssuanceCapability[] =
        pipelineInstance.capabilities.filter(isFeedIssuanceCapability);

      const summary = await this.definitionDB.getLastLoadSummary(
        pipelineInstance.id
      );
      const latestAtoms = await this.atomDB.load(pipelineInstance.id);

      const info = {
        feeds: pipelineFeeds.map((f) => ({
          name: f.options.feedDisplayName,
          url: f.feedUrl
        })),
        latestAtoms: latestAtoms,
        lastLoad: summary,
        ownerEmail: user.email
      } satisfies PipelineInfoResponseValue;

      traceFlattenedObject(span, { loadSummary: summary });
      traceFlattenedObject(span, { pipelineFeeds });

      return info;
    });
  }

  /**
   * Accessible to public internet
   */
  public async handleListFeed(
    pipelineId: string,
    feedId: string
  ): Promise<ListFeedsResponseValue> {
    return traced(SERVICE_NAME, "handleListFeed", async (span) => {
      span?.setAttribute("feed_id", feedId);
      const pipelineSlot = await this.ensurePipelineSlotExists(pipelineId);
      const pipeline = await this.ensurePipelineStarted(pipelineId);
      tracePipeline(pipelineSlot.definition);

      const feedCapability = ensureFeedIssuanceCapability(pipeline, feedId);

      const result = {
        feeds: [
          {
            id: feedId,
            name: feedCapability.options.feedDisplayName,
            description: feedCapability.options.feedDescription,
            permissions: [
              {
                folder: feedCapability.options.feedFolder,
                type: PCDPermissionType.DeleteFolder
              },
              {
                folder: feedCapability.options.feedFolder,
                type: PCDPermissionType.AppendToFolder
              },
              {
                folder: feedCapability.options.feedFolder,
                type: PCDPermissionType.ReplaceInFolder
              }
            ],
            credentialRequest: {
              signatureType: "sempahore-signature-pcd",
              pcdType: "email-pcd"
            }
          } satisfies Feed
        ],
        providerName: "PCD-ifier",
        providerUrl: feedCapability.feedUrl
      } satisfies ListFeedsResponseValue;

      traceFlattenedObject(span, {
        feedCount: result.feeds.length
      });

      return result;
    });
  }

  /**
   * Handles incoming requests that hit a Pipeline which implements the checkin
   * capability for every pipeline this server manages.
   *
   * TODO: better logging and tracing.
   */
  public async handleCheckIn(
    req: GenericIssuanceCheckInRequest
  ): Promise<GenericIssuanceCheckInResponseValue> {
    return traced(SERVICE_NAME, "handleCheckIn", async (span) => {
      logger(LOG_TAG, "handleCheckIn", str(req));

      // This is sub-optimal, but since tickets do not identify the pipelines
      // they come from, we have to match the ticket to the pipeline this way.
      const signaturePCD = await SemaphoreSignaturePCDPackage.deserialize(
        req.credential.pcd
      );
      const signaturePCDValid =
        await SemaphoreSignaturePCDPackage.verify(signaturePCD);

      if (!signaturePCDValid) {
        throw new Error("credential signature invalid");
      }

      const payload: GenericCheckinCredentialPayload = JSON.parse(
        signaturePCD.claim.signedMessage
      );

      const eventId = payload.eventId;
      // TODO detect mismatch between eventId and ticketId?

      span?.setAttribute("event_id", eventId);

      for (const pipeline of this.pipelineSlots) {
        if (!pipeline.instance) {
          continue;
        }

        for (const capability of pipeline?.instance.capabilities) {
          if (
            isCheckinCapability(capability) &&
            capability.canHandleCheckinForEvent(eventId)
          ) {
            tracePipeline(pipeline.definition);
            const res = await capability.checkin(req);
            traceFlattenedObject(span, { res });
            return res;
          }
        }
      }

      throw new PCDHTTPError(
        403,
        `can't find pipeline to check-in for event ${eventId}`
      );
    });
  }

  /**
   * Checks that a ticket could be checked in by the current user.
   */
  public async handlePreCheck(
    req: GenericIssuancePreCheckRequest
  ): Promise<GenericIssuancePreCheckResponseValue> {
    return traced(SERVICE_NAME, "handlePreCheck", async (span) => {
      logger(SERVICE_NAME, "handlePreCheck", str(req));

      // This is sub-optimal, but since tickets do not identify the pipelines
      // they come from, we have to match the ticket to the pipeline this way.
      const signaturePCD = await SemaphoreSignaturePCDPackage.deserialize(
        req.credential.pcd
      );
      const signaturePCDValid =
        await SemaphoreSignaturePCDPackage.verify(signaturePCD);

      if (!signaturePCDValid) {
        throw new Error("credential signature invalid");
      }

      const payload: GenericCheckinCredentialPayload = JSON.parse(
        signaturePCD.claim.signedMessage
      );

      const eventId = payload.eventId;
      span?.setAttribute("event_id", eventId);

      for (const pipeline of this.pipelineSlots) {
        if (!pipeline.instance) {
          continue;
        }

        for (const capability of pipeline.instance.capabilities) {
          if (
            isCheckinCapability(capability) &&
            capability.canHandleCheckinForEvent(eventId)
          ) {
            tracePipeline(pipeline.definition);
            const res = await capability.preCheck(req);
            traceFlattenedObject(span, { res });
            return res;
          }
        }
      }

      throw new PCDHTTPError(
        403,
        `can't find pipeline to check-in for event ${eventId}`
      );
    });
  }

  /**
   * Gets all piplines this user can see.
   */
  public async getAllUserPipelineDefinitions(
    user: PipelineUser
  ): Promise<GenericIssuancePipelineListEntry[]> {
    return traced(
      SERVICE_NAME,
      "getAllUserPipelineDefinitions",
      async (span) => {
        logger(SERVICE_NAME, "getAllUserPipelineDefinitions", str(user));

        const allDefinitions: PipelineDefinition[] =
          await this.definitionDB.loadPipelineDefinitions();

        const visiblePipelines = allDefinitions.filter((d) =>
          this.userHasPipelineDefinitionAccess(user, d)
        );
        span?.setAttribute("pipeline_count", visiblePipelines.length);

        return Promise.all(
          visiblePipelines.map(async (p) => {
            const owner = await this.userDB.getUser(p.ownerUserId);
            if (!owner) {
              throw new Error(`couldn't load user for id '${p.ownerUserId}'`);
            }
            const summary = await this.definitionDB.getLastLoadSummary(p.id);
            return {
              extraInfo: {
                ownerEmail: owner.email,
                lastLoad: summary
              },
              pipeline: p
            } satisfies GenericIssuancePipelineListEntry;
          })
        );
      }
    );
  }

  /**
   * Returns whether or not the given {@link PipelineUser} has
   * access to the given {@link Pipeline}.
   */
  private userHasPipelineDefinitionAccess(
    user: PipelineUser | undefined,
    pipeline: PipelineDefinition
  ): boolean {
    if (!user) {
      return false;
    }

    return (
      user.isAdmin ||
      pipeline.ownerUserId === user.id ||
      pipeline.editorUserIds.includes(user.id)
    );
  }

  /**
   * Throws an error if the given {@link PipelineUser} does not have
   * access to the given {@link Pipeline}.
   */
  private ensureUserHasPipelineDefinitionAccess(
    user: PipelineUser | undefined,
    pipeline: PipelineDefinition | undefined
  ): void {
    if (!pipeline) {
      throw new Error(`can't view undefined pipeline`);
    }

    const hasAccess = this.userHasPipelineDefinitionAccess(user, pipeline);
    if (!hasAccess) {
      throw new Error(`user ${user?.id} can not view pipeline ${pipeline?.id}`);
    }
  }

  /**
   * Loads a pipeline definition if the given {@link PipelineUser} has access.
   */
  public async loadPipelineDefinition(
    user: PipelineUser,
    pipelineId: string
  ): Promise<PipelineDefinition> {
    return traced(SERVICE_NAME, "loadPipelineDefinition", async (span) => {
      logger(SERVICE_NAME, "loadPipelineDefinition", str(user), pipelineId);
      traceUser(user);
      const pipeline = await this.definitionDB.getDefinition(pipelineId);
      tracePipeline(pipeline);
      if (!pipeline || !this.userHasPipelineDefinitionAccess(user, pipeline)) {
        throw new PCDHTTPError(404, "Pipeline not found or not accessible");
      }
      span?.setAttribute("pipeline_type", pipeline.type);
      return pipeline;
    });
  }

  public async upsertPipelineDefinition(
    user: PipelineUser,
    newDefinition: PipelineDefinition
  ): Promise<PipelineDefinition> {
    return traced(SERVICE_NAME, "upsertPipelineDefinition", async (span) => {
      logger(
        SERVICE_NAME,
        "upsertPipelineDefinition",
        str(user),
        str(newDefinition)
      );
      traceUser(user);

      // TODO: do this in a transaction
      const existingPipelineDefinition = await this.definitionDB.getDefinition(
        newDefinition.id
      );

      if (existingPipelineDefinition) {
        span?.setAttribute("is_new", false);
        this.ensureUserHasPipelineDefinitionAccess(
          user,
          existingPipelineDefinition
        );
        if (
          existingPipelineDefinition.ownerUserId !== newDefinition.ownerUserId
        ) {
          throw new PCDHTTPError(400, "Cannot change owner of pipeline");
        }
      } else {
        // NEW PIPELINE!
        span?.setAttribute("is_new", true);
        newDefinition.ownerUserId = user.id;
        newDefinition.id = uuidV4();
      }

      let validatedNewDefinition: PipelineDefinition = newDefinition;

      try {
        validatedNewDefinition = PipelineDefinitionSchema.parse(
          newDefinition
        ) as PipelineDefinition;
      } catch (e) {
        logger(LOG_TAG, "invalid pipeline definition", e);
        throw new PCDHTTPError(400, `Invalid Pipeline Definition: ${e}`);
      }

      logger(
        LOG_TAG,
        `executing upsert of pipeline ${str(validatedNewDefinition)}`
      );
      tracePipeline(validatedNewDefinition);
      await this.definitionDB.setDefinition(validatedNewDefinition);
      await this.definitionDB.saveLoadSummary(
        validatedNewDefinition.id,
        undefined
      );
      await this.atomDB.clear(validatedNewDefinition.id);
      // purposely not awaited
      this.restartPipeline(validatedNewDefinition.id);
      return validatedNewDefinition;
    });
  }

  public async deletePipelineDefinition(
    user: PipelineUser,
    pipelineId: string
  ): Promise<void> {
    return traced(SERVICE_NAME, "deletePipelineDefinition", async (span) => {
      traceUser(user);

      span?.setAttribute("pipeline_id", pipelineId);
      const pipeline = await this.loadPipelineDefinition(user, pipelineId);
      tracePipeline(pipeline);

      // TODO: Finalize the "permissions model" for CRUD actions. Right now,
      // create, read, update are permissable by owners and editors, while delete
      // is only permissable by owners.
      if (pipeline.ownerUserId !== user.id && !user.isAdmin) {
        throw new PCDHTTPError(
          403,
          `user '${str(user)}' can't delete pipeline '${
            pipeline.id
          }' owned by other user ${pipeline.ownerUserId}`
        );
      }

      await this.definitionDB.clearDefinition(pipelineId);
      await this.definitionDB.saveLoadSummary(pipelineId, undefined);
      await this.atomDB.clear(pipelineId);
      await this.restartPipeline(pipelineId);
    });
  }

  public async fetchAllPretixEvents(
    orgUrl: string,
    token: string
  ): Promise<GenericPretixEvent[]> {
    return this.genericPretixAPI.fetchAllEvents(orgUrl, token);
  }

  public async fetchPretixProducts(
    orgUrl: string,
    token: string,
    eventID: string
  ): Promise<GenericPretixProduct[]> {
    return this.genericPretixAPI.fetchProducts(orgUrl, token, eventID);
  }

  /**
   * Makes sure that the pipeline that's running on the server
   * for the given id is based off the latest pipeline configuration
   * stored in the database.
   *
   * If a pipeline with the given definition does not exist in the database
   * makes sure that no pipeline for it is running on the server.
   *
   * Tl;dr syncs db <-> pipeline in memory
   */
  private async restartPipeline(pipelineId: string): Promise<void> {
    return traced(SERVICE_NAME, "restartPipeline", async (span) => {
      span?.setAttribute("pipeline_id", pipelineId);
      const definition = await this.definitionDB.getDefinition(pipelineId);
      if (!definition) {
        logger(
          LOG_TAG,
          `can't restart pipeline with id ${pipelineId} - doesn't exist in database`
        );
        return;
      }

      let pipelineSlot = this.pipelineSlots.find(
        (s) => s.definition.id === pipelineId
      );
      span?.setAttribute("slot_existed", !!pipelineSlot);

      if (!pipelineSlot) {
        pipelineSlot = {
          definition: definition
        };
        this.pipelineSlots.push(pipelineSlot);
      }

      tracePipeline(pipelineSlot.definition);

      if (pipelineSlot.instance) {
        logger(
          LOG_TAG,
          `killing already running pipeline instance '${pipelineId}'`
        );
        span?.setAttribute("stopping", true);
        await pipelineSlot.instance.stop();
      } else {
        logger(
          LOG_TAG,
          `no need to kill existing pipeline - none exists '${pipelineId}'`
        );
      }

      logger(LOG_TAG, `instantiating pipeline ${pipelineId}`);

      pipelineSlot.instance = await instantiatePipeline(
        this.eddsaPrivateKey,
        definition,
        this.atomDB,
        {
          genericPretixAPI: this.genericPretixAPI,
          lemonadeAPI: this.lemonadeAPI
        },
        this.zupassPublicKey
      );

      await this.performPipelineLoad(pipelineSlot);
    });
  }

  public async createOrGetUser(email: string): Promise<PipelineUser> {
    return traced(SERVICE_NAME, "createOrGetUser", async (span) => {
      span?.setAttribute("email", email);

      const existingUser = await this.userDB.getUserByEmail(email);
      if (existingUser != null) {
        span?.setAttribute("is_new", false);
        traceUser(existingUser);
        return existingUser;
      }
      span?.setAttribute("is_new", true);
      const newUser: PipelineUser = {
        id: uuidV4(),
        email,
        isAdmin: this.getEnvAdminEmails().includes(email)
      };
      traceUser(existingUser);
      await this.userDB.setUser(newUser);
      return newUser;
    });
  }

  public async getAllPipelines(): Promise<Pipeline[]> {
    return this.pipelineSlots
      .map((p) => p.instance)
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
    return traced(SERVICE_NAME, "authenticateStytchSession", async (span) => {
      const reqBody = req?.body;
      const jwt = reqBody?.jwt;
      try {
        span?.setAttribute("has_jwt", !!jwt);
        const { session } = await this.stytchClient.sessions.authenticateJwt({
          session_jwt: jwt
        });
        const email = this.getEmailFromStytchSession(session);
        const user = await this.createOrGetUser(email);
        traceUser(user);
        return user;
      } catch (e) {
        logger(LOG_TAG, `failed to authenticate with jwt '${jwt}'`, e);
        throw new PCDHTTPError(401, "Not authorized");
      }
    });
  }

  public async sendLoginEmail(
    email: string
  ): Promise<GenericIssuanceSendEmailResponseValue> {
    return traced(SERVICE_NAME, "sendLoginEmail", async (span) => {
      const normalizedEmail = normalizeEmail(email);
      logger(LOG_TAG, "sendLoginEmail", normalizedEmail);
      span?.setAttribute("email", normalizedEmail);

      // TODO: Skip email auth on this.bypassEmail
      try {
        await this.stytchClient.magicLinks.email.loginOrCreate({
          email: normalizedEmail,
          login_magic_link_url: this.genericIssuanceClientUrl,
          login_expiration_minutes: 10,
          signup_magic_link_url: this.genericIssuanceClientUrl,
          signup_expiration_minutes: 10
        });
        logger(LOG_TAG, "sendLoginEmail success", normalizedEmail);
      } catch (e) {
        setError(e, span);
        logger(LOG_TAG, `failed to send login email to ${normalizeEmail}`, e);
        throw new PCDHTTPError(500, "Failed to send generic issuance email");
      }

      return undefined;
    });
  }

  private getEnvAdminEmails(): string[] {
    if (!process.env.GENERIC_ISSUANCE_ADMINS) {
      return [];
    }

    try {
      const adminEmailsFromEnv: string[] = JSON.parse(
        process.env.GENERIC_ISSUANCE_ADMINS
      );

      if (!(adminEmailsFromEnv instanceof Array)) {
        throw new Error(
          `expected environment variable 'GENERIC_ISSUANCE_ADMINS' ` +
            `to be an array of strings`
        );
      }

      return adminEmailsFromEnv;
    } catch (e) {
      return [];
    }
  }

  private async maybeSetupAdmins(): Promise<void> {
    try {
      const adminEmailsFromEnv = this.getEnvAdminEmails();
      logger(LOG_TAG, `setting up generic issuance admins`, adminEmailsFromEnv);
      for (const email of adminEmailsFromEnv) {
        await this.userDB.setUserAdmin(email, true);
      }
    } catch (e) {
      logger(LOG_TAG, `failed to set up generic issuance admins`, e);
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
      timeCreated: new Date().toISOString(),
      timeUpdated: new Date().toISOString(),
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
  rollbarService: RollbarService | null,
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
    rollbarService,
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
