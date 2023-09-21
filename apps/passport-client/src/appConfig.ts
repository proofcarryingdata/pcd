interface AppConfig {
  // Development mode lets you bypass email auth, etc.
  devMode: boolean;
  // The URL of the Passport server.
  passportServer: string;
  // The amount of time a zuzalu qr code proof is valid for
  maxIdentityProofAgeMs: number;
  // whether this is the zuzalu version of the application, or the generic PCDpass
  // TODO: medium-term figure out how to get rid of this/ do this better
  isZuzalu: boolean;
  // token that allows the client to upload errors to rollbar
  rollbarToken: string | undefined;
  // the environment to which the client uploads errors in rollbar
  rollbarEnvName: string | undefined;
  // path without leading slash for routes that use gray background color
  grayBackgroundRoutes: string[];
}

export const appConfig: AppConfig = {
  devMode: process.env.NODE_ENV !== "production",
  passportServer: process.env.PASSPORT_SERVER_URL,
  maxIdentityProofAgeMs: 1000 * 60 * 60 * 4,
  isZuzalu: process.env.IS_ZUZALU === "true" ? true : false,
  rollbarToken: process.env.ROLLBAR_TOKEN,
  rollbarEnvName: process.env.ROLLBAR_ENV_NAME,
  grayBackgroundRoutes: [
    "", // home
    "get-without-proving",
    "halo",
    "add",
    "prove",
    "scan"
  ]
};

console.log("App Config: " + JSON.stringify(appConfig));
