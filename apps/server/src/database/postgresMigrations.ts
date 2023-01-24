import { Client } from "pg";
import { migrate } from "postgres-migrations";
import * as path from "path";

const MIGRATIONS_PATH = path.join(process.cwd(), "migrations");

export async function migrateDatabase(client: Client): Promise<void> {
  console.log(`Executing migrations from directory ${MIGRATIONS_PATH}`);

  await migrate({ client }, MIGRATIONS_PATH);
}
