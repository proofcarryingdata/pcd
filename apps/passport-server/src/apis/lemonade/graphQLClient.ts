import {
  ApolloClient,
  DefaultContext,
  DocumentNode,
  InMemoryCache,
  NormalizedCacheObject
} from "@apollo/client";
import urljoin from "url-join";
import {
  getEventTicketTypesQuery,
  getHostingEventsQuery,
  updateEventCheckinMutation
} from "./queries";
import {
  GetEventTicketTypesResponse,
  GetHostingEventsResponse,
  LemonadeCheckin,
  LemonadeEvents,
  LemonadeTicketTypes,
  UpdateEventCheckinResponse
} from "./types";

/**
 * Wraps an Apollo GraphQL client. There is one client instance per backend
 * URL, so in practice there is likely to be only one instance.
 */
export class LemonadeGraphQLClient {
  private gqlClient: ApolloClient<NormalizedCacheObject>;

  public constructor(backendUrl: string) {
    this.gqlClient = new ApolloClient({
      uri: urljoin(backendUrl, "graphql"),
      cache: new InMemoryCache()
    });
  }

  /**
   * Generate HTTP headers for request context.
   */
  private getContextFromToken(token: string): DefaultContext {
    return {
      headers: {
        authorization: `Bearer ${token}`
      }
    };
  }

  /**
   * Perform a query (read).
   */
  private async query<T>(
    token: string,
    q: DocumentNode,
    variables: Record<string, unknown> = {}
  ): Promise<T> {
    const res = await this.gqlClient.query({
      query: q,
      variables,
      context: this.getContextFromToken(token)
    });

    return res.data as T;
  }

  /**
   * Perform a mutation (write).
   */
  private async mutate<T>(
    token: string,
    m: DocumentNode,
    variables: Record<string, unknown> = {}
  ): Promise<T> {
    const res = await this.gqlClient.mutate({
      mutation: m,
      variables,
      context: this.getContextFromToken(token)
    });

    return res.data as T;
  }

  /**
   * Gets LemonadeEvents for the current user. Number of events returned is
   * variable, and the caller is responsible for setting the `skip` and `limit`
   * values to control pagination.
   */
  public async getHostingEvents(
    token: string,
    opts: { skip?: number; limit?: number } = { skip: 0, limit: 25 }
  ): Promise<LemonadeEvents> {
    const { getHostingEvents } = await this.query<GetHostingEventsResponse>(
      token,
      getHostingEventsQuery,
      opts
    );

    return getHostingEvents;
  }

  /**
   * Gets a LemonadeTicketTypes object for a given event. The returned object
   * contains an array of all ticket types, so there is no pagination to do
   * here.
   */
  public async getEventTicketTypes(
    token: string,
    opts: {
      input: { event: string };
    }
  ): Promise<LemonadeTicketTypes> {
    const { getEventTicketTypes } =
      await this.query<GetEventTicketTypesResponse>(
        token,
        getEventTicketTypesQuery,
        opts
      );

    return getEventTicketTypes;
  }

  /**
   * Updates a user's check-in state for an event.
   */
  public async updateEventCheckin(
    token: string,
    opts: {
      // These are Lemonade IDs, names here match the GraphQL query
      event: string;
      user: string;
      active: boolean;
    }
  ): Promise<LemonadeCheckin> {
    const { updateEventCheckin } =
      await this.mutate<UpdateEventCheckinResponse>(
        token,
        updateEventCheckinMutation,
        opts
      );

    return updateEventCheckin;
  }
}
