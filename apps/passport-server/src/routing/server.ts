import cors from "cors";
import express, { Application, NextFunction } from "express";
import * as fs from "fs";
import * as http from "http";
import * as https from "https";
import morgan from "morgan";
import { EventName, sendEvent } from "../apis/honeycombAPI";
import { ApplicationContext, GlobalServices, PCDpass } from "../types";
import { IS_PROD } from "../util/isProd";
import { logger } from "../util/logger";
import { tracingMiddleware } from "./middlewares/tracingMiddleware";
import { initE2EERoutes } from "./routes/e2eeRoutes";
import { initHealthcheckRoutes } from "./routes/healthCheckRoutes";
import { initLogRoutes } from "./routes/logRoutes";
import { initPCDIssuanceRoutes } from "./routes/pcdIssuanceRoutes";
import { initPCDpassRoutes } from "./routes/pcdpassRoutes";
import { initProvingRoutes } from "./routes/provingRoutes";
import { initSemaphoreRoutes } from "./routes/semaphoreRoutes";
import { initStaticRoutes } from "./routes/staticRoutes";
import { initStatusRoutes } from "./routes/statusRoutes";
import { initTelegramRoutes } from "./routes/telegramRoutes";
import { initZuzaluRoutes } from "./routes/zuzaluRoutes";

export async function startHttpServer(
  context: ApplicationContext,
  globalServices: GlobalServices
): Promise<{ app: Application; server: http.Server; localEndpoint: string }> {
  return new Promise<{
    app: Application;
    server: http.Server;
    localEndpoint: string;
  }>((resolve, reject) => {
    const envPort = parseInt(process.env.PORT ?? "", 10);
    const port = IS_PROD ? envPort : 3002;
    if (isNaN(port)) {
      throw new Error("couldn't start http server, missing port");
    }

    const app = express();

    if (process.env.SUPPRESS_LOGGING !== "true") {
      app.use(morgan("tiny"));
    }

    app.use(
      express.json({
        limit: "5mb"
      })
    );
    app.use(cors());
    app.use(tracingMiddleware());
    app.use(
      cors({
        origin: "*",
        methods: ["GET", "POST", "PUT", "DELETE"]
      })
    );

    initAllRoutes(app, context, globalServices);

    app.use(
      (
        err: Error,
        req: express.Request,
        res: express.Response,
        _next: NextFunction
      ) => {
        logger(`[ERROR] ${req.method} ${req.url}`);
        logger(err.stack);
        globalServices.rollbarService?.reportError(err);
        res.status(500).send(err.message);
      }
    );

    if (process.env.IS_LOCAL_HTTPS === "true") {
      const localEndpoint = `https://dev.local:${port}`;
      const httpsOptions = {
        key: fs.readFileSync("../certificates/dev.local-key.pem"),
        cert: fs.readFileSync("../certificates/dev.local.pem")
      };

      const server = https.createServer(httpsOptions, app).listen(port, () => {
        logger(`[INIT] Local HTTPS server listening on ${localEndpoint}`);
        sendEvent(context, EventName.SERVER_START);
        resolve({ server, app, localEndpoint });
      });

      server.on("error", (e: Error) => {
        reject(e);
      });
    } else {
      const localEndpoint = `http://localhost:${port}`;
      const server = app.listen(port, () => {
        logger(`[INIT] HTTP server listening on port ${port}`);
        sendEvent(context, EventName.SERVER_START);
        resolve({ server, app, localEndpoint });
      });
      server.on("error", (e: Error) => {
        reject(e);
      });
    }
  });
}

function initAllRoutes(
  app: express.Application,
  context: ApplicationContext,
  globalServices: GlobalServices
): void {
  initStatusRoutes(app, context, globalServices);
  initHealthcheckRoutes(app, context);
  initSemaphoreRoutes(app, context, globalServices);
  initE2EERoutes(app, context, globalServices);
  initZuzaluRoutes(app, context, globalServices);
  initPCDpassRoutes(app, context, globalServices);
  initProvingRoutes(app, context, globalServices);
  initStaticRoutes(app, context);
  initPCDIssuanceRoutes(app, context, globalServices);
  initTelegramRoutes(app, context, globalServices);
  initLogRoutes(app);
}

export function stopHttpServer(app: PCDpass): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    app.expressContext.server.close((err) => {
      if (err) {
        logger(`error stopping http server`, err);
        reject(err);
      } else {
        resolve();
      }
    });
  });
}
