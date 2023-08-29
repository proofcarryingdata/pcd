import { DevconnectPretixTicket } from "../database/models";

/**
 * Sometimes the ticket we load from pretix is updated.
 * This function detects these changes.
 */
export function pretixTicketsDifferent(
  oldTicket: DevconnectPretixTicket,
  newTicket: DevconnectPretixTicket
): boolean {
  if (oldTicket.is_deleted !== newTicket.is_deleted) {
    return true;
  }

  if (oldTicket.full_name !== newTicket.full_name) {
    return true;
  }

  if (oldTicket.secret !== newTicket.secret) {
    return true;
  }

  if (oldTicket.is_consumed !== newTicket.is_consumed) {
    return true;
  }

  if (
    oldTicket.pretix_checkin_timestamp !== newTicket.pretix_checkin_timestamp
  ) {
    return true;
  }

  return false;
}
