import { Application } from "express";
import * as http from "http";
import Libhoney from "libhoney";
import { Pool } from "pg";
import { E2EEService } from "./services/e2eeService";
import { EmailTokenService } from "./services/emailTokenService";
import { ProvingService } from "./services/provingService";
import { RollbarService } from "./services/rollbarService";
import { SemaphoreService } from "./services/semaphoreService";
import { UserService } from "./services/userService";

export interface ApplicationContext {
  dbPool: Pool;
  honeyClient: Libhoney | null;
  // whether this is the version of the application purpose-built for zuzalu,
  // or the generic version
  isZuzalu: boolean;
  resourcesDir: string;
}

export interface GlobalServices {
  semaphoreService: SemaphoreService;
  userService: UserService;
  e2eeService: E2EEService;
  emailTokenService: EmailTokenService;
  rollbarService: RollbarService;
  provingService: ProvingService;
}

export interface PCDPass {
  context: ApplicationContext;
  globalServices: GlobalServices;
  expressContext: { app: Application; server: http.Server };
}
