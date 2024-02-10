/**
 * Honeycomb query that displays pipeline executions for a given pipeline.
 */
export function getPipelineLoadHQuery(pipelineID: string): object {
  return {
    time_range: 3600,
    granularity: 0,
    breakdowns: [
      "trace_method_name",
      "pipeline_type",
      "pipeline_id",
      "error_msg"
    ],
    calculations: [
      { op: "COUNT" },
      { op: "AVG", column: "duration_ms" },
      { op: "MAX", column: "atomsLoaded" }
    ],
    filters: [
      {
        column: "name",
        op: "=",
        value: "GENERIC_ISSUANCE.executeSinglePipeline"
      },
      {
        column: "pipeline_id",
        op: "=",
        value: pipelineID
      }
    ],
    filter_combination: "AND",
    orders: [{ op: "COUNT", order: "descending" }],
    havings: [],
    limit: 1000
  };
}

/**
 * Honeycomb query that displays pipeline executions for a given pipeline.
 */
export function getPipelineAllHQuery(pipelineID: string): object {
  return {
    time_range: 3600,
    granularity: 0,
    breakdowns: ["name", "pipeline_type", "pipeline_id", "error_msg"],
    calculations: [
      { op: "COUNT" },
      { op: "AVG", column: "duration_ms" },
      { op: "MAX", column: "atomsLoaded" }
    ],
    filters: [
      {
        column: "pipeline_id",
        op: "=",
        value: pipelineID
      }
    ],
    filter_combination: "AND",
    orders: [{ op: "COUNT", order: "descending" }],
    havings: [],
    limit: 1000
  };
}
