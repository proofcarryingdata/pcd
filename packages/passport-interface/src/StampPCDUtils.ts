import { sha256 } from "js-sha256";
import { ProveRequest } from "./RequestTypes";

export function hashProveRequest(req: ProveRequest): string {
  const reqString = JSON.stringify(req);
  return sha256(reqString);
}

export interface PendingPCD {
  status: StampPCDStatus;

  /**
   * The type of PCD that a server is producing a stamp for.
   */
  pcdType: string;

  /**
   * A hash of the ProveRequest using hashProveRequest. Stored to avoid
   * people re-sending the same request many times and clogging
   * the proving queue.
   */
  hash: string;
}

export enum StampPCDStatus {
  QUEUED = "queued",
  PROVING = "proving",
  COMPLETE = "complete",
  ERROR = "error",
  NONE = "none",
}
