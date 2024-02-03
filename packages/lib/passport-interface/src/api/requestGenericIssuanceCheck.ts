import { SerializedPCD } from "@pcd/pcd-types";
import { SemaphoreSignaturePCD } from "@pcd/semaphore-signature-pcd";
import urlJoin from "url-join";
import {
  GenericIssuancePreCheckRequest,
  GenericIssuancePreCheckResponseValue
} from "../RequestTypes";
import { APIResult } from "./apiResult";
import { httpPostSimple } from "./makeRequest";

/**
 * Performs a pre-checkin "check" on a ticket issued by the Generic Issuance
 * Service. {@link signedPayload} is a Semaphore Signature of a payload
 * that is a `JSON.stringify`-ed {@link GenericCheckinCredentialPayload}.
 *
 * Never rejects. All information encoded in the resolved response.
 */
export async function requestGenericIssuancePreCheck(
  preCheckUrl: string,
  signedPayload: SerializedPCD<SemaphoreSignaturePCD>
): Promise<GenericIssuancePreCheckResult> {
  return httpPostSimple(
    urlJoin(preCheckUrl),
    async (resText) => {
      return {
        success: true,
        value: JSON.parse(resText) as GenericIssuancePreCheckResponseValue
      };
    },
    {
      credential: signedPayload
    } satisfies GenericIssuancePreCheckRequest
  );
}

export type GenericIssuancePreCheckResult =
  APIResult<GenericIssuancePreCheckResponseValue>;
