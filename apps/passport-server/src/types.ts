import { Application } from "express";
import * as http from "http";
import Libhoney from "libhoney";
import { Pool } from "pg";
import { IDevconnectPretixAPI } from "./apis/devconnect/devconnectPretixAPI";
import { IEmailAPI } from "./apis/emailAPI";
import { IPretixAPI } from "./apis/pretixAPI";
import { DevconnectPretixSyncService } from "./services/devconnectPretixSyncService";
import { DiscordService } from "./services/discordService";
import { E2EEService } from "./services/e2eeService";
import { EmailTokenService } from "./services/emailTokenService";
import { IssuanceService } from "./services/issuanceService";
import { MetricsService } from "./services/metricsService";
import { PretixSyncService } from "./services/pretixSyncService";
import { ProvingService } from "./services/provingService";
import { RollbarService } from "./services/rollbarService";
import { SemaphoreService } from "./services/semaphoreService";
import { UserService } from "./services/userService";
import { VerifyService } from "./services/verifyService";

export interface ApplicationContext {
  dbPool: Pool;
  honeyClient: Libhoney | null;
  // whether this is the version of the application purpose-built for zuzalu,
  // or the generic version
  isZuzalu: boolean;
  resourcesDir: string;
  publicResourcesDir: string;
}

export interface GlobalServices {
  semaphoreService: SemaphoreService;
  userService: UserService;
  e2eeService: E2EEService;
  emailTokenService: EmailTokenService;
  rollbarService: RollbarService | null;
  provingService: ProvingService;
  pretixSyncService: PretixSyncService | null;
  devconnectPretixSyncService: DevconnectPretixSyncService | null;
  metricsService: MetricsService;
  issuanceService: IssuanceService | null;
  discordService: DiscordService | null;
  verifyService: VerifyService;
}

export interface PCDPass {
  context: ApplicationContext;
  services: GlobalServices;
  apis: APIs;
  expressContext: { app: Application; server: http.Server };
}

export interface APIs {
  emailAPI: IEmailAPI | null;
  pretixAPI: IPretixAPI | null;
  devconnectPretixAPI: IDevconnectPretixAPI | null;
}

export interface EnvironmentVariables {
  IS_ZUZALU?: string;
  MAILGUN_API_KEY?: string;
  DATABASE_USERNAME?: string;
  DATABASE_PASSWORD?: string;
  DATABASE_HOST?: string;
  DATABASE_DB_NAME?: string;
  DATABASE_SSL?: string;
  BYPASS_EMAIL_REGISTRATION?: string;
  NODE_ENV?: string;
  HONEYCOMB_API_KEY?: string;
  PRETIX_TOKEN?: string;
  PRETIX_ORG_URL?: string;
  PRETIX_ZU_EVENT_ID?: string;
  PRETIX_VISITOR_EVENT_ID?: string;
  ROLLBAR_TOKEN?: string;
  SUPPRESS_LOGGING?: string;
}
