import { HoneycombSDK } from "@honeycombio/opentelemetry-node";
import opentelemetry, { Span, Tracer } from "@opentelemetry/api";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { NodeSDK } from "@opentelemetry/sdk-node";
import Libhoney from "libhoney";
import { ApplicationContext } from "../types";

let honeyClient: Libhoney | null;
let tracer: Tracer | null;

export async function startTelemetry(
  context: ApplicationContext
): Promise<void> {
  if (!context.honeyClient) {
    console.log(
      "[INIT] Not starting telemetry service - missing Honeycomb instance."
    );
    return;
  }

  honeyClient = context.honeyClient;
  tracer = opentelemetry.trace.getTracer("server-telemetry");

  const sdk: NodeSDK = new HoneycombSDK({
    instrumentations: [getNodeAutoInstrumentations()],
    serviceName: "server-telemetry",
  });

  console.log("[INIT] Starting telemetry");

  return sdk
    .start()
    .then(() => {
      console.log("[INIT] Tracing initialized");
    })
    .catch((error) => console.log("Error initializing tracing", error));
}

/**
 * Runs the given function, and and creates traces in Honeycomb that are linked
 * to 'parent' and 'child' traces - other invocations of functions wrapped in
 * 'traced' that run inside of this one, or that this one is running inside of.
 *
 * In the case that the Honeycomb environment variables are not set up this function
 * just calls `func`.
 */
export async function traced<T>(
  service: string,
  method: string,
  func: (span?: Span) => Promise<T>,
  options?: {
    autoEndSpan?: boolean; // default true
  }
): Promise<T> {
  if (!honeyClient || !tracer) {
    return func();
  }

  return tracer.startActiveSpan(service + "." + method, async (span) => {
    const result = await func(span);
    if (
      options == null ||
      options.autoEndSpan == null ||
      options.autoEndSpan == true
    ) {
      span.end();
    }
    return result;
  });
}
