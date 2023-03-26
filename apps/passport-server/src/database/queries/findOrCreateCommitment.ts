import { ClientBase, Pool } from "pg";

// Saves a new commitment. Can only happen once per email address.
// Returns the commitment (new or existing) UUID.
export async function findOrCreateCommitment(
  client: ClientBase | Pool,
  params: {
    email: string;
    commitment: string;
  }
): Promise<string> {
  const { email, commitment } = params;
  console.log(`Saving commitment email=${email} commitment=${commitment}`);

  // Insert succeeds only if we already have a Pretix participant (but don't
  // already have a commitment) for this email--due to foreign + unique keys.
  const insertResult = await client.query(
    `\
INSERT INTO commitments (uuid, participant_email, commitment)
VALUES (gen_random_uuid(), $1, $2)
ON CONFLICT (commitment) DO NOTHING`,
    [email, commitment]
  );
  const uuidResult = await client.query(
    `\
SELECT uuid FROM commitments
WHERE participant_email = $1 AND commitment = $2`,
    [email, commitment]
  );
  const uuid = uuidResult.rows[0]?.uuid as string | undefined;
  if (uuid == null) {
    throw new Error(
      `Failed to save commitment. Wrong email? ${email} ${commitment}`
    );
  }

  const stat = insertResult.rowCount === 1 ? "NEW" : "EXISTING";
  console.log(
    `Saved. email=${email} commitment=${commitment} has ${stat} uuid=${uuid}`
  );
  return uuid;
}
