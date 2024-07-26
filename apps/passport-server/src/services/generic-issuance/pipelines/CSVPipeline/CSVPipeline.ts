import { getEdDSAPublicKey } from "@pcd/eddsa-pcd";
import {
  CSVPipelineDefinition,
  CSVPipelineOutputType,
  PipelineEdDSATicketZuAuthConfig,
  PipelineLoadSummary,
  PipelineLog,
  PipelineSemaphoreGroupInfo,
  PipelineType,
  PipelineZuAuthConfig,
  PollFeedRequest,
  PollFeedResponseValue
} from "@pcd/passport-interface";
import { PCDActionType } from "@pcd/pcd-collection";
import { SerializedPCD } from "@pcd/pcd-types";
import { SerializedSemaphoreGroup } from "@pcd/semaphore-group-pcd";
import { parse } from "csv-parse";
import PQueue from "p-queue";
import { v4 as uuid, v5 as uuidv5 } from "uuid";
import {
  IPipelineAtomDB,
  PipelineAtom
} from "../../../../database/queries/pipelineAtomDB";
import { IPipelineConsumerDB } from "../../../../database/queries/pipelineConsumerDB";
import { IPipelineSemaphoreHistoryDB } from "../../../../database/queries/pipelineSemaphoreHistoryDB";
import { logger } from "../../../../util/logger";
import { setError, traced } from "../../../telemetryService";
import {
  SemaphoreGroupProvider,
  SemaphoreGroupTicketInfo
} from "../../SemaphoreGroupProvider";
import {
  FeedIssuanceCapability,
  makeGenericIssuanceFeedUrl
} from "../../capabilities/FeedIssuanceCapability";
import { SemaphoreGroupCapability } from "../../capabilities/SemaphoreGroupCapability";
import { PipelineCapability } from "../../capabilities/types";
import { tracePipeline } from "../../honeycombQueries";
import { CredentialSubservice } from "../../subservices/CredentialSubservice";
import { BasePipelineCapability } from "../../types";
import { makePLogErr, makePLogInfo } from "../logging";
import { BasePipeline, Pipeline } from "../types";
import { makeMessagePCD } from "./makeMessagePCD";
import { makePODTicketPCD } from "./makePODTicketPCD";
import {
  makeTicketPCD,
  rowToTicket,
  summarizeEventAndProductIds
} from "./makeTicketPCD";

const LOG_NAME = "CSVPipeline";
const LOG_TAG = `[${LOG_NAME}]`;

export interface CSVAtom extends PipelineAtom {
  row: string[];
}

export class CSVPipeline implements BasePipeline {
  public type = PipelineType.CSV;
  public capabilities: BasePipelineCapability[] = [];

  private eddsaPrivateKey: string;
  private db: IPipelineAtomDB<CSVAtom>;
  private definition: CSVPipelineDefinition;
  private credentialSubservice: CredentialSubservice;
  private semaphoreGroupProvider?: SemaphoreGroupProvider;
  private consumerDB: IPipelineConsumerDB;
  private semaphoreUpdateQueue: PQueue;

  public get id(): string {
    return this.definition.id;
  }

  public get feedCapability(): FeedIssuanceCapability {
    return this.capabilities[0] as FeedIssuanceCapability;
  }

  public constructor(
    eddsaPrivateKey: string,
    definition: CSVPipelineDefinition,
    db: IPipelineAtomDB,
    credentialSubservice: CredentialSubservice,
    consumerDB: IPipelineConsumerDB,
    semaphoreHistoryDB: IPipelineSemaphoreHistoryDB
  ) {
    this.eddsaPrivateKey = eddsaPrivateKey;
    this.definition = definition;
    this.db = db as IPipelineAtomDB<CSVAtom>;
    this.capabilities = [
      {
        type: PipelineCapability.FeedIssuance,
        issue: this.issue.bind(this),
        feedUrl: makeGenericIssuanceFeedUrl(
          this.id,
          this.definition.options.feedOptions.feedId
        ),
        options: this.definition.options.feedOptions,
        getZuAuthConfig: this.getZuAuthConfig.bind(this)
      } satisfies FeedIssuanceCapability,
      {
        type: PipelineCapability.SemaphoreGroup,
        getSerializedLatestGroup: async (
          groupId: string
        ): Promise<SerializedSemaphoreGroup | undefined> => {
          return this.semaphoreGroupProvider?.getSerializedLatestGroup(groupId);
        },
        getLatestGroupRoot: async (
          groupId: string
        ): Promise<string | undefined> => {
          return this.semaphoreGroupProvider?.getLatestGroupRoot(groupId);
        },
        getSerializedHistoricalGroup: async (
          groupId: string,
          rootHash: string
        ): Promise<SerializedSemaphoreGroup | undefined> => {
          return this.semaphoreGroupProvider?.getSerializedHistoricalGroup(
            groupId,
            rootHash
          );
        },
        getSupportedGroups: (): PipelineSemaphoreGroupInfo[] => {
          return this.semaphoreGroupProvider?.getSupportedGroups() ?? [];
        }
      } satisfies SemaphoreGroupCapability
    ] as unknown as BasePipelineCapability[];
    this.credentialSubservice = credentialSubservice;
    this.consumerDB = consumerDB;
    if (definition.options.semaphoreGroupName) {
      this.semaphoreGroupProvider = new SemaphoreGroupProvider(
        this.id,
        [
          {
            name: definition.options.semaphoreGroupName,
            groupId: uuidv5(this.id, this.id),
            memberCriteria: []
          }
        ],
        consumerDB,
        semaphoreHistoryDB
      );
    }
    this.semaphoreUpdateQueue = new PQueue({ concurrency: 1 });
  }

  private async issue(req: PollFeedRequest): Promise<PollFeedResponseValue> {
    return traced(LOG_NAME, "issue", async (span) => {
      logger(LOG_TAG, `issue`, req);
      tracePipeline(this.definition);

      const atoms = await this.db.load(this.id);
      span?.setAttribute("atoms", atoms.length);

      const outputType =
        this.definition.options.outputType ?? CSVPipelineOutputType.Message;

      let requesterEmail: string | undefined;
      let requesterSemaphoreId: string | undefined;

      if (req.pcd) {
        try {
          const { email, semaphoreId } =
            await this.credentialSubservice.verifyAndExpectZupassEmail(req.pcd);
          requesterEmail = email;
          requesterSemaphoreId = semaphoreId;
          // Consumer is validated, so save them in the consumer list
          const didUpdate = await this.consumerDB.save(
            this.id,
            email,
            semaphoreId,
            new Date()
          );

          if (this.definition.options.semaphoreGroupName) {
            // If the user's Semaphore commitment has changed, `didUpdate` will be
            // true, and we need to update the Semaphore groups
            if (didUpdate) {
              span?.setAttribute("semaphore_groups_updated", true);
              await this.triggerSemaphoreGroupUpdate();
            }
          }
        } catch (e) {
          logger(LOG_TAG, "credential PCD not verified for req", req);
        }
      }

      // TODO: cache these
      const somePCDs = await Promise.all(
        atoms.map(async (atom: CSVAtom) =>
          makeCSVPCD(
            atom.row,
            this.definition.options.outputType ?? CSVPipelineOutputType.Message,
            {
              requesterEmail,
              requesterSemaphoreId,
              eddsaPrivateKey: this.eddsaPrivateKey,
              pipelineId: this.id,
              issueToUnmatchedEmail:
                this.definition.options.issueToUnmatchedEmail
            }
          )
        )
      );

      const pcds = somePCDs.filter((p) => !!p) as SerializedPCD[];

      logger(
        LOG_TAG,
        `pipeline ${this.id} of type ${outputType} issuing`,
        pcds.length,
        "PCDs"
      );

      return {
        actions: [
          {
            type: PCDActionType.DeleteFolder,
            folder: this.definition.options.feedOptions.feedFolder,
            recursive: false
          },
          {
            type: PCDActionType.ReplaceInFolder,
            folder: this.definition.options.feedOptions.feedFolder,
            pcds
          }
        ]
      };
    });
  }

  public async load(): Promise<PipelineLoadSummary> {
    return traced(LOG_NAME, "load", async (span) => {
      tracePipeline(this.definition);
      logger(LOG_TAG, "load", this.id, this.definition.type);

      const start = new Date();
      const logs: PipelineLog[] = [];
      logs.push(makePLogInfo(`parsing csv`));

      try {
        const parsedCSV = await parseCSV(this.definition.options.csv);
        const titleRow = parsedCSV.shift();
        logs.push(makePLogInfo(`skipped title row '${titleRow}'`));
        const atoms = parsedCSV.map((row) => {
          return {
            id: uuid(),
            row: row
          };
        });
        await this.db.clear(this.id);
        logs.push(makePLogInfo(`cleared old data`));
        await this.db.save(this.id, atoms);
        logs.push(makePLogInfo(`saved parsed data: ${atoms.length} entries`));
        span?.setAttribute("atom_count", atoms.length);

        const end = new Date();
        logs.push(
          makePLogInfo(`load finished in ${end.getTime() - start.getTime()}ms`)
        );

        if (
          this.definition.options.outputType === CSVPipelineOutputType.Ticket ||
          this.definition.options.outputType === CSVPipelineOutputType.PODTicket
        ) {
          logs.push(
            makePLogInfo(
              `\n\nevent and product ids summary:\n${summarizeEventAndProductIds(
                this.id,
                atoms.map((a) => a.row)
              )}`
            )
          );
        }

        return {
          atomsLoaded: atoms.length,
          atomsExpected: parsedCSV.length,
          lastRunEndTimestamp: end.toISOString(),
          lastRunStartTimestamp: start.toISOString(),
          latestLogs: logs,
          success: true,
          semaphoreGroups: this.semaphoreGroupProvider?.getSupportedGroups()
        } satisfies PipelineLoadSummary;
      } catch (e) {
        setError(e, span);
        logs.push(makePLogErr(`failed to load csv: ${e}`));
        logs.push(makePLogErr(`csv was ${this.definition.options.csv}`));

        const end = new Date();
        logs.push(
          makePLogInfo(`load finished in ${end.getTime() - start.getTime()}ms`)
        );

        return {
          atomsLoaded: 0,
          atomsExpected: 0,
          lastRunEndTimestamp: end.toISOString(),
          lastRunStartTimestamp: start.toISOString(),
          latestLogs: logs,
          success: false
        } satisfies PipelineLoadSummary;
      }
    });
  }

  public async start(): Promise<void> {
    logger(LOG_TAG, `starting csv pipeline`);
    // Initialize the Semaphore Group provider by loading groups from the DB,
    // if one exists.
    await this.semaphoreGroupProvider?.start();
  }

  public async stop(): Promise<void> {
    logger(LOG_TAG, `stopping csv pipeline`);
  }

  public static is(pipeline: Pipeline): pipeline is CSVPipeline {
    return pipeline.type === PipelineType.CSV;
  }

  /**
   * Retrieves ZuAuth configuration for this pipeline's PCDs.
   */
  private async getZuAuthConfig(): Promise<PipelineZuAuthConfig[]> {
    if (this.definition.options.outputType !== CSVPipelineOutputType.Ticket) {
      // We don't have a metadata format for anything that isn't a ticket
      return [];
    }
    const publicKey = await getEdDSAPublicKey(this.eddsaPrivateKey);
    const uniqueProductMetadata: Record<
      string,
      PipelineEdDSATicketZuAuthConfig
    > = {};
    // Find all of the unique products and create a metadata entry
    for (const atom of await this.db.load(this.id)) {
      // Passing "" as the Semaphore ID here is a bit of a hack
      const ticket = rowToTicket(atom.row, "", this.id);
      if (ticket) {
        uniqueProductMetadata[ticket.productId] = {
          pcdType: "eddsa-ticket-pcd",
          publicKey,
          productId: ticket.productId,
          eventId: ticket.eventId,
          eventName: ticket.eventName,
          productName: ticket.ticketName
        };
      }
    }
    return Object.values(uniqueProductMetadata);
  }

  /**
   * Collects data that is require for Semaphore groups to update.
   * Returns an array of { eventId, productId, email } objects, which the
   * SemaphoreGroupProvider will use to look up Semaphore IDs and match them
   * to configured Semaphore groups.
   * In practice, CSV pipelines do not currently support Semaphore groups that
   * are filtered by event ID or product ID, but this data is required by the
   * SemaphoreGroupProvider class.
   */
  private async semaphoreGroupData(): Promise<SemaphoreGroupTicketInfo[]> {
    return traced(LOG_NAME, "semaphoreGroupData", async (span) => {
      const data = [];
      if (
        this.definition.options.outputType === CSVPipelineOutputType.Ticket ||
        this.definition.options.outputType === CSVPipelineOutputType.PODTicket
      ) {
        for (const atom of await this.db.load(this.id)) {
          // We can use a dummy Semaphore ID here because we only care about
          // the event ID and product ID for the ticket.
          const ticket = rowToTicket(atom.row, "0", this.id);
          if (ticket) {
            data.push({
              email: ticket.attendeeEmail,
              eventId: ticket.eventId,
              productId: ticket.productId
            });
          }
        }
      }

      span?.setAttribute("ticket_data_length", data.length);
      return data;
    });
  }

  /**
   * Tell the Semaphore group provider to update memberships.
   * Marked as public so that it can be called from tests, but otherwise should
   * not be called from outside the class.
   */
  public async triggerSemaphoreGroupUpdate(): Promise<void> {
    return traced(LOG_NAME, "triggerSemaphoreGroupUpdate", async (_span) => {
      tracePipeline(this.definition);
      // Whenever an update is triggered, we want to make sure that the
      // fetching of data and the actual update are atomic.
      // If there were two concurrenct updates, it might be possible for them
      // to use slightly different data sets, but send them to the `update`
      // method in the wrong order, producing unexpected outcomes. Although the
      // group diffing mechanism would eventually cause the group to converge
      // on the correct membership, we can avoid any temporary inconsistency by
      // queuing update requests.
      // By returning this promise, we allow the caller to await on the update
      // having been processed.
      return this.semaphoreUpdateQueue.add(async () => {
        const data = await this.semaphoreGroupData();
        await this.semaphoreGroupProvider?.update(data);
      });
    });
  }

  /**
   * Returns all of the unique IDs associated with a CSV pipeline
   * definition.
   */
  public static uniqueIds(definition: CSVPipelineDefinition): string[] {
    const ids = [definition.id];
    return ids;
  }
}

export function parseCSV(csv: string): Promise<string[][]> {
  return traced("parseCSV", "parseCSV", async (span) => {
    return new Promise<string[][]>((resolve, reject) => {
      span?.setAttribute("text_length", csv.length);

      const parser = parse();
      const records: string[][] = [];

      parser.on("readable", function () {
        let record;
        while ((record = parser.read()) !== null) {
          records.push(record);
        }
      });

      parser.on("error", (err) => {
        setError(err);
        reject(err);
      });

      parser.on("end", () => {
        span?.setAttribute("records", records.length);
        resolve(records);
      });

      parser.write(csv);
      parser.end();
    });
  });
}

export async function makeCSVPCD(
  inputRow: string[],
  type: CSVPipelineOutputType,
  opts: {
    requesterEmail?: string;
    requesterSemaphoreId?: string;
    eddsaPrivateKey: string;
    pipelineId: string;
    issueToUnmatchedEmail?: boolean;
  }
): Promise<SerializedPCD | undefined> {
  return traced("makeCSVPCD", "makeCSVPCD", async (span) => {
    span?.setAttribute("output_type", type);

    switch (type) {
      case CSVPipelineOutputType.Message:
        return makeMessagePCD(inputRow, opts.eddsaPrivateKey);
      case CSVPipelineOutputType.Ticket:
        return makeTicketPCD(
          inputRow,
          opts.eddsaPrivateKey,
          opts.requesterEmail,
          opts.requesterSemaphoreId,
          opts.pipelineId,
          opts.issueToUnmatchedEmail
        );
      case CSVPipelineOutputType.PODTicket:
        return makePODTicketPCD(
          inputRow,
          opts.eddsaPrivateKey,
          opts.requesterEmail,
          opts.requesterSemaphoreId,
          opts.pipelineId,
          opts.issueToUnmatchedEmail
        );
      default:
        // will not compile in case we add a new output type
        // if you've added another type, plz add an impl here XD
        return null as never;
    }
  });
}
