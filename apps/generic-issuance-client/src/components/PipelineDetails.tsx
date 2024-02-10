import {
  GenericIssuancePipelineListEntry,
  PipelineLoadSummary
} from "@pcd/passport-interface";
import moment from "moment";
import { ReactNode } from "react";
import { Link } from "react-router-dom";
import { timeAgo } from "../helpers/util";

export function pipelineStatus(
  latestRun: PipelineLoadSummary | undefined
): ReactNode {
  if (!latestRun) {
    return "Starting";
  }

  if (latestRun.success) {
    return "Success";
  }

  return "Error";
}

export function pipelineIconFromStr(
  str: "starting" | "success" | "error"
): ReactNode {
  if (str === "starting") {
    return "⏳";
  }

  if (str === "success") {
    return "✅";
  }

  return "❌";
}
export function pipelineIcon(
  latestRun: PipelineLoadSummary | undefined
): ReactNode {
  if (!latestRun) {
    return "⏳";
  }

  if (latestRun.success) {
    return "✅";
  }

  return "❌";
}

export function pipelineDetailPagePath(pipelineId: string): string {
  return `/pipelines/${pipelineId}`;
}

export function pipelineLink(pipelineId: string | undefined): ReactNode {
  if (!pipelineId) {
    return null;
  }

  return (
    <Link to={pipelineDetailPagePath(pipelineId)}>
      {pipelineId.substring(0, 8)}...
    </Link>
  );
}

export function pipelineOwner(
  entry: GenericIssuancePipelineListEntry
): ReactNode {
  return entry.extraInfo.ownerEmail;
}

export function pipelineType(
  entry: GenericIssuancePipelineListEntry
): ReactNode {
  return <span>{entry.pipeline.type}</span>;
}

export function pipelineCreatedAt(dateStr: string): ReactNode {
  return (
    <>
      <span>{moment(new Date(dateStr)).format("MMM D")}</span>
      <span> ({timeAgo.format(new Date(dateStr))})</span>
    </>
  );
}

export function pipelineLastEdit(dateStr: string): ReactNode {
  return (
    <>
      <span> {timeAgo.format(new Date(dateStr))}</span>
    </>
  );
}
