import * as dotenv from "dotenv";

dotenv.config();

export const IS_PROD = process.env.NODE_ENV === "production";
export const IS_STAGING = process.env.NODE_ENV === "staging";
export const IS_LOCAL_HTTPS = process.env.IS_LOCAL_HTTPS || "true";
export const PASSPORT_CLIENT_URL =
  process.env.PASSPORT_CLIENT_URL || "https://dev.local:3000";
export const PASSPORT_SERVER_URL =
  process.env.PASSPORT_SERVER_URL || "https://dev.local:3002";
export const KUDOSBOT_UPLOAD_URL = PASSPORT_SERVER_URL + "/kudos/upload";
export const KUDOSBOT_LIST_URL = PASSPORT_SERVER_URL + "/kudos/list";
export const KUDOSBOT_USERNAME_URL = PASSPORT_SERVER_URL + "/kudos/username";
