import * as path from "path";
import { getDevconnectPretixAPI } from "./apis/devconnect/devconnectPretixAPI";
import { IEmailAPI, mailgunSendEmail } from "./apis/emailAPI";
import { getHoneycombAPI } from "./apis/honeycombAPI";
import { getPretixAPI, PretixAPI } from "./apis/pretixAPI";
import { getDB } from "./database/postgresPool";
import { startServer } from "./routing/server";
import { startServices, stopServices } from "./services";
import { APIs, ApplicationContext, PCDPass } from "./types";
import { logger } from "./util/logger";

import process from "node:process";
import { DevconnectPretixAPIFactory } from "./services/devconnectPretixSyncService";
import { getCommitHash } from "./util/util";

process.on("unhandledRejection", (reason) => {
  if (reason instanceof Error) {
    logger("[ERROR] unhandled rejection \n" + reason.stack);
  } else {
    logger("[ERROR] unhandled rejection " + reason);
  }
});

/**
 * Starts the server, all the appropriate services, routes, and instantiates
 * the appropriate APIs if they have not been overriden by the caller.
 */
export async function startApplication(
  apiOverrides?: Partial<APIs>
): Promise<PCDPass> {
  const dbPool = await getDB();
  const honeyClient = getHoneycombAPI();

  const context: ApplicationContext = {
    dbPool,
    honeyClient,
    isZuzalu: process.env.IS_ZUZALU === "true" ? true : false,
    resourcesDir: path.join(process.cwd(), "resources"),
    publicResourcesDir: path.join(process.cwd(), "public"),
    gitCommitHash: await getCommitHash()
  };

  const apis = await getOverridenApis(context, apiOverrides);
  const services = await startServices(context, apis);
  const expressServer = await startServer(context, services);

  services.rollbarService?.log("Server started.");
  services.discordService?.sendAlert(
    `Server \`${process.env.ROLLBAR_ENV_NAME}\` started`
  );

  return {
    context,
    services,
    apis,
    expressContext: expressServer
  };
}

export async function stopApplication(app?: PCDPass): Promise<void> {
  if (!app) return;
  await stopServices(app.services);
  await app.context.dbPool.end();
  app.expressContext.server.close();
}

async function getOverridenApis(
  context: ApplicationContext,
  apiOverrides?: Partial<APIs>
): Promise<APIs> {
  let emailAPI: IEmailAPI | null = null;

  if (apiOverrides?.emailAPI) {
    logger("[INIT] overriding email client");
    emailAPI = apiOverrides.emailAPI;
  } else {
    if (process.env.MAILGUN_API_KEY === undefined) {
      logger("[EMAIL] Missing environment variable: MAILGUN_API_KEY");
      emailAPI = null;
    } else {
      emailAPI = { send: mailgunSendEmail };
    }
  }

  let pretixAPI: PretixAPI | null = null;

  if (context.isZuzalu) {
    if (apiOverrides?.pretixAPI) {
      logger("[INIT] overriding pretix api");
      pretixAPI = apiOverrides.pretixAPI;
    } else {
      pretixAPI = getPretixAPI();
    }
  }

  let devconnectPretixAPIFactory: DevconnectPretixAPIFactory | null = null;

  if (apiOverrides?.devconnectPretixAPIFactory) {
    logger("[INIT] overriding devconnect pretix api factory");
    devconnectPretixAPIFactory = apiOverrides.devconnectPretixAPIFactory;
  } else {
    devconnectPretixAPIFactory = getDevconnectPretixAPI;
  }

  return {
    emailAPI,
    pretixAPI,
    devconnectPretixAPIFactory
  };
}
