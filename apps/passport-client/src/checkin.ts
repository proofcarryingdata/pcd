import {
  checkinTicketById,
  checkTicketById,
  CheckTicketByIdResult,
  CheckTicketInByIdResult,
  OfflineDevconnectTicket,
  OfflineSecondPartyTicket,
  requestVerifyTicket,
  requestVerifyTicketById,
  VerifyTicketByIdResult,
  VerifyTicketResult
} from "@pcd/passport-interface";
import { ZKEdDSAEventTicketPCDPackage } from "@pcd/zk-eddsa-event-ticket-pcd";
import _ from "lodash";
import { appConfig } from "./appConfig";
import { StateContextValue } from "./dispatch";
import {
  saveCheckedInOfflineTickets,
  saveOfflineTickets
} from "./localstorage";

/**
 * For debugging purposes, makes the checkin flow go through the offline-mode
 * version even in the case that we're actually online.
 */
const DEBUG_FORCE_OFFLINE = false;

function getOfflineDevconnectTicket(
  ticketId: string,
  stateContext: StateContextValue
): OfflineDevconnectTicket | undefined {
  return stateContext
    .getState()
    .offlineTickets?.devconnectTickets?.find((t) => t.id === ticketId);
}

function getCheckedInOfflineDevconnectTicket(
  ticketId: string,
  stateContext: StateContextValue
): OfflineDevconnectTicket | undefined {
  const state = stateContext.getState();
  return state.checkedinOfflineDevconnectTickets?.find(
    (t) => t.id === ticketId
  );
}

function isOfflineDevconnectTicketCheckedIn(
  ticketId: string,
  stateContext: StateContextValue
): boolean {
  return (
    getCheckedInOfflineDevconnectTicket(ticketId, stateContext) !== undefined
  );
}

function getOfflineSecondPartyTicket(
  ticketId: string,
  stateContext: StateContextValue
): OfflineSecondPartyTicket | undefined {
  const state = stateContext.getState();
  const ticket = state.offlineTickets.secondPartyTickets.find(
    (t) => t.id === ticketId
  );

  return ticket;
}

function checkinOfflineDevconnectTicket(
  ticketId: string,
  stateContext: StateContextValue
): OfflineDevconnectTicket | undefined {
  const state = stateContext.getState();
  const offlineTickets = stateContext.getState().offlineTickets;
  const checkedinOfflineDevconnectTickets =
    state.checkedinOfflineDevconnectTickets;

  if (!offlineTickets || !checkedinOfflineDevconnectTickets) {
    return undefined;
  }

  const ticket = getOfflineDevconnectTicket(ticketId, stateContext);

  if (!ticket) {
    return undefined;
  }

  _.remove(offlineTickets.devconnectTickets, (t) => t.id === ticketId);

  const ticketCopy = { ...ticket };
  ticketCopy.checkinTimestamp = new Date().toISOString();
  checkedinOfflineDevconnectTickets.push(ticketCopy);

  saveOfflineTickets(offlineTickets);
  saveCheckedInOfflineTickets(checkedinOfflineDevconnectTickets);
  stateContext.update({
    offlineTickets,
    checkedinOfflineDevconnectTickets
  });
  return ticketCopy;
}

export async function devconnectCheckByIdWithOffline(
  ticketId: string,
  stateContext: StateContextValue
): Promise<CheckTicketByIdResult> {
  if (DEBUG_FORCE_OFFLINE || stateContext.getState().offline) {
    if (isOfflineDevconnectTicketCheckedIn(ticketId, stateContext)) {
      const checkedInTicket = getCheckedInOfflineDevconnectTicket(
        ticketId,
        stateContext
      );
      return {
        success: false,
        error: {
          name: "AlreadyCheckedIn",
          detailedMessage: "You've checked this ticket in in offline mode.",
          checker: "You",
          checkinTimestamp: checkedInTicket?.checkinTimestamp
        }
      };
    }

    const ticket = getOfflineDevconnectTicket(ticketId, stateContext);

    if (ticket) {
      if (ticket.checkinTimestamp) {
        return {
          success: false,
          error: {
            name: "AlreadyCheckedIn",
            detailedMessage: "This attendee has already been checked in",
            checkinTimestamp: ticket.checkinTimestamp,
            checker: ticket.checker
          }
        };
      }

      return {
        success: true,
        value: {
          attendeeEmail: ticket.attendeeEmail,
          attendeeName: ticket.attendeeName,
          eventName: ticket.eventName,
          ticketName: ticket.ticketName
        }
      };
    }

    return {
      success: false,
      error: {
        name: "NetworkError",
        detailedMessage:
          "You are in offline mode, " +
          "and this ticket is not present in the local ticket backup."
      }
    };
  } else {
    return await checkTicketById(
      appConfig.zupassServer,
      ticketId,
      stateContext.getState().identity
    );
  }
}

export async function devconnectCheckInByIdWithOffline(
  ticketId: string,
  stateContext: StateContextValue
): Promise<CheckTicketInByIdResult> {
  if (DEBUG_FORCE_OFFLINE || stateContext.getState().offline) {
    if (isOfflineDevconnectTicketCheckedIn(ticketId, stateContext)) {
      const checkedInTicket = getCheckedInOfflineDevconnectTicket(
        ticketId,
        stateContext
      );
      return {
        success: false,
        error: {
          name: "AlreadyCheckedIn",
          detailedMessage: "You've checked this ticket in in offline mode.",
          checker: "You",
          checkinTimestamp: checkedInTicket?.checkinTimestamp
        }
      };
    }

    checkinOfflineDevconnectTicket(ticketId, stateContext);

    return {
      success: true,
      value: undefined
    };
  } else {
    return await checkinTicketById(
      appConfig.zupassServer,
      ticketId,
      stateContext.getState().identity
    );
  }
}

export async function secondPartyCheckByIdWithOffline(
  ticketId: string,
  timestamp: string,
  stateContext: StateContextValue
): Promise<VerifyTicketByIdResult> {
  if (DEBUG_FORCE_OFFLINE || stateContext.getState().offline) {
    const ticket = getOfflineSecondPartyTicket(ticketId, stateContext);

    if (!ticket) {
      return {
        success: true,
        value: {
          verified: false,
          message: "Unknown ticket. Go online to get the latest tickets."
        }
      };
    }

    return {
      success: true,
      value: {
        group: ticket.group,
        publicKeyName: ticket.publicKeyName,
        verified: true,
        productId: ticket.productId
      }
    };
  } else {
    return await requestVerifyTicketById(appConfig.zupassServer, {
      ticketId,
      timestamp
    });
  }
}

export async function secondPartyCheckByPCDWithOffline(
  pcd: string, // JSON.stringify(SerializedPCD<ZKEdDSAEventTicketPCD>)
  stateContext: StateContextValue
): Promise<VerifyTicketResult> {
  if (DEBUG_FORCE_OFFLINE || stateContext.getState().offline) {
    const parsed = await ZKEdDSAEventTicketPCDPackage.deserialize(
      JSON.parse(pcd).pcd
    );
    const ticketId = parsed.claim.partialTicket.ticketId;
    const ticket = getOfflineSecondPartyTicket(ticketId, stateContext);

    if (!ticket) {
      return {
        success: true,
        value: {
          verified: false,
          message: "Unknown ticket. Go online to get the latest tickets."
        }
      };
    }

    return {
      success: true,
      value: {
        group: ticket.group,
        // todo
        publicKeyName: ticket.publicKeyName,
        verified: true
      }
    };
  } else {
    return await requestVerifyTicket(appConfig.zupassServer, {
      pcd
    });
  }
}
