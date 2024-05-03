import {
  PipelineDefinition,
  isCSVPipelineDefinition,
  isLemonadePipelineDefinition,
  isPretixPipelineDefinition
} from "@pcd/passport-interface";
import { ILemonadeAPI } from "../../../../apis/lemonade/lemonadeAPI";
import { IGenericPretixAPI } from "../../../../apis/pretix/genericPretixAPI";
import { IPipelineAtomDB } from "../../../../database/queries/pipelineAtomDB";
import { IPipelineCheckinDB } from "../../../../database/queries/pipelineCheckinDB";
import { IPipelineConsumerDB } from "../../../../database/queries/pipelineConsumerDB";
import { IPipelineManualTicketDB } from "../../../../database/queries/pipelineManualTicketDB";
import { IPipelineSemaphoreHistoryDB } from "../../../../database/queries/pipelineSemaphoreHistoryDB";
import {
  IBadgeGiftingDB,
  IContactSharingDB
} from "../../../../database/queries/ticketActionDBs";
import { PersistentCacheService } from "../../../persistentCacheService";
import { traced } from "../../../telemetryService";
import { tracePipeline } from "../../honeycombQueries";
import { CSVPipeline } from "../../pipelines/CSVPipeline/CSVPipeline";
import { LemonadePipeline } from "../../pipelines/LemonadePipeline";
import { PretixPipeline } from "../../pipelines/PretixPipeline";
import { Pipeline } from "../../pipelines/types";
import { CredentialSubservice } from "../CredentialSubservice";

/**
 * All the state necessary to instantiate any type of {@link Pipeline}.
 * The current pipeline types are:
 * - {@link LemonadePipeline}
 * - {@link CSVPipeline}
 * - {@link PretixPipeline}
 */
export interface InstantiatePipelineArgs {
  /**
   * Used to sign all PCDs created by all the {@link Pipeline}s.
   */
  eddsaPrivateKey: string;
  cacheService: PersistentCacheService;
  lemonadeAPI: ILemonadeAPI;
  genericPretixAPI: IGenericPretixAPI;
  pipelineAtomDB: IPipelineAtomDB;
  checkinDB: IPipelineCheckinDB;
  contactDB: IContactSharingDB;
  badgeDB: IBadgeGiftingDB;
  consumerDB: IPipelineConsumerDB;
  manualTicketDB: IPipelineManualTicketDB;
  semaphoreHistoryDB: IPipelineSemaphoreHistoryDB;
  credentialSubservice: CredentialSubservice;
}

/**
 * Given a {@link PipelineDefinition} (which is persisted to the database) instantiates
 * a {@link Pipeline} so that it can be used for loading data from an external provider,
 * and expose its {@link Capability}s to the external world.
 */
export function instantiatePipeline(
  definition: PipelineDefinition,
  args: InstantiatePipelineArgs
): Promise<Pipeline> {
  return traced("instantiatePipeline", "instantiatePipeline", async () => {
    tracePipeline(definition);

    let pipeline: Pipeline | undefined = undefined;

    if (isLemonadePipelineDefinition(definition)) {
      pipeline = new LemonadePipeline(
        args.eddsaPrivateKey,
        definition,
        args.pipelineAtomDB,
        args.lemonadeAPI,
        args.cacheService,
        args.checkinDB,
        args.contactDB,
        args.badgeDB,
        args.consumerDB,
        args.semaphoreHistoryDB,
        args.credentialSubservice
      );
    } else if (isPretixPipelineDefinition(definition)) {
      pipeline = new PretixPipeline(
        args.eddsaPrivateKey,
        definition,
        args.pipelineAtomDB,
        args.genericPretixAPI,
        args.credentialSubservice,
        args.cacheService,
        args.checkinDB,
        args.consumerDB,
        args.manualTicketDB,
        args.semaphoreHistoryDB
      );
    } else if (isCSVPipelineDefinition(definition)) {
      pipeline = new CSVPipeline(
        args.eddsaPrivateKey,
        definition,
        args.pipelineAtomDB,
        args.credentialSubservice
      );
    }

    if (pipeline) {
      await pipeline.start();
      return pipeline;
    }

    throw new Error(
      `couldn't instantiate pipeline for configuration ${JSON.stringify(
        definition
      )}`
    );
  });
}
