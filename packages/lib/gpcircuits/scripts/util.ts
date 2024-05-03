import * as fs from "fs/promises";
import * as path from "path";

/**
 * Clears a directory.
 */
export async function clearDir(directory: string): Promise<void> {
  for (const file of await fs.readdir(directory)) {
    await fs.rm(path.join(directory, file));
  }
}

/**
 * Maximum number of parallel promises for Circomkit calls
 * to avoid OOM issues.
 */
export const MAX_PARALLEL_PROMISES = 4;
