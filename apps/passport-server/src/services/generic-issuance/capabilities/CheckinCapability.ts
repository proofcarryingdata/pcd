import {
  CheckTicketInResponseValue,
  GenericIssuanceCheckInRequest
} from "@pcd/passport-interface";
import urljoin from "url-join";
import { BasePipelineCapability } from "../types";
import { PipelineCapability } from "./types";

/**
 * Similar to {@link FeedIssuanceCapability} except used to declare the capability
 * of a feed to respond to check in requests.
 */
export interface CheckinCapability extends BasePipelineCapability {
  type: PipelineCapability.Checkin;
  checkin(
    request: GenericIssuanceCheckInRequest
  ): Promise<CheckTicketInResponseValue>;
  getCheckinUrl(): string;
}

export function isCheckinCapability(
  capability: BasePipelineCapability
): capability is CheckinCapability {
  return capability.type === PipelineCapability.Checkin;
}

export function generateCheckinUrlPath(pipelineId: string): string {
  return urljoin(
    process.env.PASSPORT_SERVER_URL as string,
    `/generic-issuance/api/check-in/${pipelineId}`
  );
}
