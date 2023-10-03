import { HexString } from "@pcd/passport-crypto";
import urlJoin from "url-join";
import { CreateNewUserRequest, NewUserResponseValue } from "../RequestTypes";
import { APIResult } from "./apiResult";
import { httpPostSimple } from "./makeRequest";

/**
 * Once the user has verified their token, they can create a new
 * user on the backend using this function.
 *
 * Never rejects. All information encoded in the resolved response.
 */
export async function requestCreateNewUser(
  zupassServerUrl: string,
  email: string,
  token: string,
  commitment: string,
  salt: HexString | null
): Promise<NewUserResult> {
  return httpPostSimple(
    urlJoin(zupassServerUrl, "/account/new-participant"),
    async (resText) => ({
      value: JSON.parse(resText) as NewUserResponseValue,
      success: true
    }),
    {
      email,
      token,
      commitment,
      salt
    } satisfies CreateNewUserRequest
  );
}

export type NewUserResult = APIResult<NewUserResponseValue>;
