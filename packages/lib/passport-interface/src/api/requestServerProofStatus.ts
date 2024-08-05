import urlJoin from "url-join";
import {
  ProofStatusRequest,
  ProofStatusResponseValue
} from "../RequestTypes.js";
import { APIResult } from "./apiResult.js";
import { httpGetSimple } from "./makeRequest.js";

/**
 * Asks the Zupass server about the status of particular pending PCD proof.
 *
 * Never rejects. All information encoded in the resolved response.
 *
 * @todo - deprecate this
 */
export async function requestServerProofStatus(
  zupassServerUrl: string,
  proveRequest: ProofStatusRequest
): Promise<ServerProofStatusResult> {
  return httpGetSimple(
    urlJoin(zupassServerUrl, `/pcds/status`),
    async (resText) => ({
      value: JSON.parse(resText) as ProofStatusResponseValue,
      success: true
    }),
    proveRequest
  );
}

export type ServerProofStatusResult = APIResult<ProofStatusResponseValue>;
