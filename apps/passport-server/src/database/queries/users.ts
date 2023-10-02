import { Pool } from "postgres-pool";
import { UserRow } from "../models";
import { sqlQuery } from "../sqlQuery";

/**
 * Fetches the identity commitment row corresponding to a particular
 * email from the database.
 */
export async function fetchUserByEmail(
  client: Pool,
  email: string
): Promise<UserRow | null> {
  const result = await sqlQuery(
    client,
    `select * from users where email = $1`,
    [email]
  );

  return result.rows[0] || null;
}

/**
 * Fetches the user row corresponding to a particular email from the database.
 */
export async function fetchUserByUUID(
  client: Pool,
  uuid: string
): Promise<UserRow | null> {
  const result = await sqlQuery(client, `select * from users where uuid = $1`, [
    uuid
  ]);

  return result.rows[0] || null;
}

/**
 * Fetches all the users from the database.
 */
export async function fetchAllUsers(client: Pool): Promise<UserRow[]> {
  const result = await sqlQuery(client, `select * from users`);
  return result.rows;
}

/**
 * Deletes a user. This also logs them out on the client-side, when the client
 * next tries to refresh the user, which happens every page reload, and also
 * on an interval.
 */
export async function deleteUserByEmail(
  client: Pool,
  email: string
): Promise<void> {
  await sqlQuery(client, "delete from users where email = $1", [email]);
}

/**
 * Fetches the quantity of users.
 */
export async function fetchUserCount(client: Pool): Promise<number> {
  const result = await sqlQuery(client, "select count(*) as count from users");
  return parseInt(result.rows[0].count, 10);
}

/**
 * Fetches a user by their semaphore commitment.
 */
export async function fetchUserByCommitment(
  client: Pool,
  commitment: string
): Promise<UserRow | null> {
  const result = await sqlQuery(
    client,
    `\
  select * from users
  where commitment = $1;
   `,
    [commitment]
  );

  if (result.rowCount === 0) {
    return null;
  }

  return result.rows[0];
}
