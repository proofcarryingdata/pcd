import { Pool } from "postgres-pool";
import { logger } from "../../util/logger";
import { sqlQuery } from "../sqlQuery";

/**
 * We keep track of the last few times the user has reset their account,
 * so that we can rate limit this user action.
 */
export async function updateUserAccountRestTimestamps(
  client: Pool,
  email: string,
  resetTimestamps: string[]
): Promise<void> {
  await sqlQuery(
    client,
    `
update users
set account_reset_timestamps = $1
where email = $2`,
    [resetTimestamps, email]
  );
}

/**
 * Saves a new user. If a user with the given email already exists, overwrites their
 * information. Returns the user's UUID.
 */
export async function upsertUser(
  client: Pool,
  params: {
    email: string;
    commitment: string;
    salt?: string;
    encryptionKey?: string;
  }
): Promise<string> {
  const { email, commitment, salt, encryptionKey } = params;
  logger(
    `Saving user email=${email} commitment=${commitment} salt=${salt} encryption_key=${encryptionKey}`
  );

  const insertResult = await sqlQuery(
    client,
    `\
INSERT INTO users (uuid, email, commitment, salt, encryption_key)
VALUES (gen_random_uuid(), $1, $2, $3, $4)
ON CONFLICT (email) DO UPDATE SET commitment = $2, salt = $3, encryption_key = $4`,
    [email, commitment, salt, encryptionKey]
  );
  const uuidResult = await sqlQuery(
    client,
    `\
SELECT uuid FROM users
WHERE email = $1 AND commitment = $2`,
    [email, commitment]
  );
  const uuid = uuidResult.rows[0]?.uuid as string | undefined;
  if (uuid == null) {
    throw new Error(
      `Failed to save commitment. Wrong email? ${email} ${commitment} ${salt} ${encryptionKey}`
    );
  }

  const stat = insertResult.rowCount === 1 ? "NEW" : "EXISTING";
  logger(
    `Saved. email=${email} commitment=${commitment} salt=${salt} encryption_key=${encryptionKey} has ${stat} uuid=${uuid}`
  );
  return uuid;
}
