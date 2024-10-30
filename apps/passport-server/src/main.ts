// This file is the entry point of the server in development and production
// but not testing. Its main purpose is to load environment variables
// from a configuration file, and then just start the application immediately
// after that.

import cluster from "cluster";
import dotenv from "dotenv";
import path from "path";
import process from "process";
import { startApplication } from "./application";
import { ServerMode } from "./types";
import { IS_PROD } from "./util/isProd";
import { logger } from "./util/logger";

const dotEnvPath = IS_PROD
  ? path.join(process.cwd(), "../../", ".env")
  : path.join(process.cwd(), ".env");
logger(
  `[INIT] cwd:${process.cwd()}; Loading environment variables from: ${dotEnvPath} `
);
dotenv.config({ path: dotEnvPath });

const clusterEnabled = process.env.ENABLE_CLUSTER === "true";

function getClusterSize(): number {
  const defaultWorkerQuantity = 2;
  const maxWorkerQuantity = 4;
  const numWorkers = parseInt(
    process.env.CLUSTER_PROCESSES ?? `${defaultWorkerQuantity}`,
    10
  );

  if (isNaN(numWorkers)) {
    return defaultWorkerQuantity;
  }

  return Math.max(1, Math.min(numWorkers, maxWorkerQuantity));
}

async function main(): Promise<void> {
  // see https://nodejs.org/api/cluster.html
  // see apps/passport-server/src/routing/middlewares/clusterMiddleware.ts
  if (clusterEnabled) {
    if (cluster.isPrimary) {
      await startApplication(ServerMode.PARALLEL_MAIN);

      const clusterSize = getClusterSize();

      logger(`[CLUSTER] Starting ${clusterSize} workers`);

      for (let i = 0; i < clusterSize; i++) {
        logger(`[CLUSTER] Starting worker ${i}`);
        cluster.fork();
      }

      cluster.on("exit", (worker, code, signal) => {
        logger(
          `[CLUSTER] worker ${worker.process.pid} died with code ${code} and signal ${signal}`
        );
      });
    } else {
      await startApplication(ServerMode.PARALLEL_CHILD);
    }
  } else {
    await startApplication(ServerMode.UNIFIED);
  }
}

main()
  .then(() => {
    logger("[INIT] Application started");
  })
  .catch((error) => {
    logger("[INIT] Application failed to start");
    logger(error);
    process.exit(0);
  });
