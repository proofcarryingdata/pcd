import { ONE_HOUR_MS } from "@pcd/util";

interface AppConfig {
  // Development mode lets you bypass email auth, etc.
  devMode: boolean;
  // The URL of the Zupass server.
  zupassServer: string;
  // The URL of the FrogCrypto feed host server.
  frogCryptoServer: string;
  // The amount of time a zuzalu qr code proof is valid for
  maxIdentityProofAgeMs: number;
  // token that allows the client to upload errors to rollbar
  rollbarToken: string | undefined;
  // the environment to which the client uploads errors in rollbar
  rollbarEnvName: string | undefined;
  // license key for Strich scanner
  strichLicenseKey: string | undefined;
  // license key for Scandit scanner
  scanditLicenseKey: string | undefined;
  // is a choice of multiple scanning engines enabled?
  multiChoiceScanEnabled: boolean;
}

if (
  !process.env.PASSPORT_SERVER_URL &&
  global.window &&
  !!global.window.alert
) {
  alert("PASSPORT_SERVER_URL not set");
}

if (
  !process.env.FROGCRYPTO_SERVER_URL &&
  global.window &&
  !!global.window.alert
) {
  alert("FROGCRYPTO_SERVER_URL not set");
}

if (
  process.env.MULTI_CHOICE_SCAN_ENABLED === "true" &&
  (!process.env.STRICH_LICENSE_KEY || process.env.STRICH_LICENSE_KEY === "") &&
  global.window &&
  !!global.window.alert
) {
  alert("STRICH_LICENSE_KEY not set");
}

if (
  process.env.MULTI_CHOICE_SCAN_ENABLED === "true" &&
  (!process.env.SCANDIT_LICENSE_KEY || process.env.STRICH_LICENSE_KEY === "") &&
  global.window &&
  !!global.window.alert
) {
  alert("SCANDIT_LICENSE_KEY not set");
}

export const appConfig: AppConfig = {
  devMode: process.env.NODE_ENV !== "production",
  zupassServer: process.env.PASSPORT_SERVER_URL as string,
  frogCryptoServer: process.env.FROGCRYPTO_SERVER_URL as string,
  maxIdentityProofAgeMs: ONE_HOUR_MS * 4,
  rollbarToken: process.env.ROLLBAR_TOKEN,
  rollbarEnvName: process.env.ROLLBAR_ENV_NAME,
  strichLicenseKey: process.env.STRICH_LICENSE_KEY,
  scanditLicenseKey: process.env.SCANDIT_LICENSE_KEY,
  multiChoiceScanEnabled: process.env.MULTI_CHOICE_SCAN_ENABLED === "true"
};

console.log("App Config: " + JSON.stringify(appConfig));
