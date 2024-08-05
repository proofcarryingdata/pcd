import urlJoin from "url-join";
import {
  GenericIssuanceFetchPretixProductsRequest,
  GenericIssuanceFetchPretixProductsResponseValue
} from "../RequestTypes.js";
import { APIResult } from "./apiResult.js";
import { httpPostSimple } from "./makeRequest.js";

/**
 * Asks the server to fetch the Pretix products for the given organizer URL and API token.
 */
export async function requestGenericIssuanceFetchPretixProducts(
  zupassServerUrl: string,
  req: GenericIssuanceFetchPretixProductsRequest
): Promise<GenericIssuanceFetchPretixProductsResponse> {
  return httpPostSimple(
    urlJoin(zupassServerUrl, `/generic-issuance/api/fetch-pretix-products`),
    async (resText) => ({
      value: JSON.parse(resText),
      success: true
    }),
    req,
    true
  );
}

export type GenericIssuanceFetchPretixProductsResponse =
  APIResult<GenericIssuanceFetchPretixProductsResponseValue>;
