import { Pool } from "postgres-pool";
import {
  DevconnectPretixTicketDB,
  DevconnectPretixTicketDBWithCheckinListID,
  DevconnectPretixTicketDBWithEmailAndItem,
  DevconnectSuperuser
} from "../../models";
import { sqlQuery } from "../../sqlQuery";

/*
 * Fetch all users that have a ticket on pretix, even if they haven't
 * logged into Zupass.
 */
export async function fetchAllNonDeletedDevconnectPretixTickets(
  client: Pool
): Promise<Array<DevconnectPretixTicketDB>> {
  const result = await sqlQuery(
    client,
    `\
      select * from devconnect_pretix_tickets where is_deleted = FALSE;`
  );

  return result.rows;
}

/*
 * Fetch users by org and event that have a ticket on pretix, even if they haven't
 * logged into Zupass.
 */
export async function fetchDevconnectPretixTicketsByEvent(
  client: Pool,
  eventConfigID: string
): Promise<Array<DevconnectPretixTicketDB>> {
  const result = await sqlQuery(
    client,
    `\
    select t.* from devconnect_pretix_tickets t
    join devconnect_pretix_items_info i on t.devconnect_pretix_items_info_id = i.id
    join devconnect_pretix_events_info e on e.id = i.devconnect_pretix_events_info_id
    where e.pretix_events_config_id = $1
    and t.is_deleted = false`,
    [eventConfigID]
  );

  return result.rows;
}

/*
 * Fetch a devconnect ticket by its unique internal id.
 */
export async function fetchDevconnectPretixTicketByTicketId(
  client: Pool,
  ticketId: string
): Promise<DevconnectPretixTicketDB | undefined> {
  const result = await sqlQuery(
    client,
    `\
    select t.* from devconnect_pretix_tickets t
    join devconnect_pretix_items_info i on t.devconnect_pretix_items_info_id = i.id
    join devconnect_pretix_events_info e on e.id = i.devconnect_pretix_events_info_id
    where t.id = $1
    and t.is_deleted = false`,
    [ticketId]
  );

  return result.rows[0];
}

export async function fetchDevconnectPretixTicketsByEmail(
  client: Pool,
  email: string
): Promise<Array<DevconnectPretixTicketDBWithEmailAndItem>> {
  const result = await sqlQuery(
    client,
    `\
    select t.*, e.event_name, i.item_name, e.pretix_events_config_id as pretix_events_config_id from devconnect_pretix_tickets t
    join devconnect_pretix_items_info i on t.devconnect_pretix_items_info_id = i.id
    join devconnect_pretix_events_info e on e.id = i.devconnect_pretix_events_info_id
    where t.email = $1
    and t.is_deleted = false
    order by t.id asc
    `,
    [email]
  );
  return result.rows;
}

/**
 * Fetch a Devconnect device login, by email and secret.
 *
 * For Devconnect we want to provide the ability for users to sign in using
 * device-specific email addresses, and a ticket-specific secret. We want
 * this query to succeed if we can match the email/secret, and the item is
 * a superuser for the event.
 */
export async function fetchDevconnectDeviceLoginTicket(
  client: Pool,
  email: string,
  secret: string
): Promise<DevconnectPretixTicketDBWithEmailAndItem> {
  const result = await sqlQuery(
    client,
    `\
    select t.* from devconnect_pretix_tickets t
    join devconnect_pretix_items_info i on t.devconnect_pretix_items_info_id = i.id
    join devconnect_pretix_events_info e on e.id = i.devconnect_pretix_events_info_id
    join pretix_events_config ec on ec.id = e.pretix_events_config_id
    where i.item_id = ANY(ec.superuser_item_ids)
    and t.email = $1 and t.secret = $2
    and t.is_deleted = false
    `,
    [email, secret]
  );

  return result.rows[0];
}

export async function fetchDevconnectSuperusers(
  client: Pool
): Promise<Array<DevconnectSuperuser>> {
  const result = await sqlQuery(
    client,
    `
select *, t.id as ticket_id from devconnect_pretix_tickets t
join devconnect_pretix_items_info i on t.devconnect_pretix_items_info_id = i.id
join devconnect_pretix_events_info e on e.id = i.devconnect_pretix_events_info_id
join pretix_events_config ec on ec.id = e.pretix_events_config_id
where i.item_id = ANY(ec.superuser_item_ids)
and t.is_deleted = false;
    `
  );
  return result.rows;
}

export async function fetchDevconnectSuperusersForEvent(
  client: Pool,
  eventConfigID: string
): Promise<Array<DevconnectSuperuser>> {
  const result = await sqlQuery(
    client,
    `
select *, t.id as ticket_id from devconnect_pretix_tickets t
join devconnect_pretix_items_info i on t.devconnect_pretix_items_info_id = i.id
join devconnect_pretix_events_info e on e.id = i.devconnect_pretix_events_info_id
join pretix_events_config ec on ec.id = e.pretix_events_config_id
where i.item_id = ANY(ec.superuser_item_ids)
and ec.id = $1
and t.is_deleted = false
    `,
    [eventConfigID]
  );
  return result.rows;
}

export async function fetchDevconnectSuperusersForEmail(
  client: Pool,
  email: string
): Promise<Array<DevconnectSuperuser>> {
  const result = await sqlQuery(
    client,
    `
select *, t.id as ticket_id from devconnect_pretix_tickets t
join devconnect_pretix_items_info i on t.devconnect_pretix_items_info_id = i.id
join devconnect_pretix_events_info e on e.id = i.devconnect_pretix_events_info_id
join pretix_events_config ec on ec.id = e.pretix_events_config_id
where i.item_id = ANY(ec.superuser_item_ids)
and t.email = $1
and t.is_deleted = false
    `,
    [email]
  );
  return result.rows;
}

/**
 * Fetches tickets which have been consumed in Zupass, but not checked in
 * on Pretix.
 */
export async function fetchDevconnectTicketsAwaitingSync(
  client: Pool,
  orgUrl: string
): Promise<Array<DevconnectPretixTicketDBWithCheckinListID>> {
  const result = await sqlQuery(
    client,
    `\
      select t.*, e.checkin_list_id from devconnect_pretix_tickets t
      join devconnect_pretix_items_info i on t.devconnect_pretix_items_info_id = i.id
      join devconnect_pretix_events_info e on e.id = i.devconnect_pretix_events_info_id
      join pretix_events_config ec on ec.id = e.pretix_events_config_id
      join pretix_organizers_config o on ec.pretix_organizers_config_id = o.id
      where o.organizer_url = $1
      and t.is_deleted = false
      and t.is_consumed = true
      and t.pretix_checkin_timestamp IS NULL`,
    [orgUrl]
  );

  return result.rows;
}
