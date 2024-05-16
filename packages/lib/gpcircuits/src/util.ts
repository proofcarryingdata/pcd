import { CircomkitConfig } from "circomkit";
import { PathLike } from "fs";
import path from "path";
import { CircuitSignal } from "./types";

/**
 * Splits an array `arr` into chunks of size
 * `n` in order. If `arr.length` is not a multiple of `n`,
 * then the last chunk will be of length `arr.length % n`.
 */
export function toChunks<A>(arr: A[], n: number): A[][] {
  const chunks: A[][] = [[]];

  for (const a of arr) {
    const lastChunkIndex = chunks.length - 1;
    const lastChunk = chunks[lastChunkIndex];
    if (lastChunk.length < n) {
      lastChunk.push(a);
    } else {
      chunks.push([a]);
    }
  }

  return chunks;
}

/**
 * Applies a Promise-valued function to array elements
 * sequentially. Necessary to avoid OOM for particularly
 * heavy computations.
 */
export async function seqPromise<A, B>(
  f: (a: A) => Promise<B>,
  arr: A[]
): Promise<B[]> {
  const outputArray: B[] = [];

  for (const a of arr) {
    outputArray.push(await f(a));
  }

  return outputArray;
}

/**
 * Applies a Promise-values function to array eleemnts
 * `maxParallelPromises` calls at a time.
 */
export async function batchPromise<A, B>(
  maxParallelPromises: number,
  f: (a: A) => Promise<B>,
  arr: A[]
): Promise<B[]> {
  // Execute sequence of promises
  const chunks = await seqPromise(
    (arr) => Promise.all(arr.map(f)), // by mapping each `maxParallelpromises` sized chunk of `arr` by `f`
    toChunks(arr, maxParallelPromises)
  );

  return chunks.flat(); // Then concatenate the chunks.
}
/**
 * Returns an array which is a copy of `inputArray` extended to `totalLength`,
 * with new values filled with `fillValue`.  Input array is returned as-is if
 * `totalLength` is not longer than its length.
 */
export function padArray<A>(
  inputArray: A[],
  totalLength: number,
  fillValue: A
): A[] {
  if (totalLength <= inputArray.length) {
    return inputArray;
  }
  return inputArray.concat(
    new Array(totalLength - inputArray.length).fill(fillValue)
  );
}

/**
 * Version of `padArray` specialised to `CircuitSignal` arrays with
 * `0n` as default `fillValue`.
 */
export function extendedSignalArray(
  inputArray: CircuitSignal[],
  totalLength: number,
  fillValue = 0n
): CircuitSignal[] {
  return padArray(inputArray, totalLength, fillValue);
}

/**
 * Convert an array of bit signals into a single packed bigint.
 * This will throw an Error if any of the elements is not 0 or 1.
 */
export function array2Bits(boolArray: CircuitSignal[]): bigint {
  let bits = 0n;
  for (let i = 0; i < boolArray.length; i++) {
    if (BigInt(boolArray[i]) !== 0n && BigInt(boolArray[i]) !== 1n) {
      throw new Error(
        `Input to array2Bits must be 0n or 1n not ${boolArray[i]}.`
      );
    }
    if (BigInt(boolArray[i]) === 1n) {
      bits |= 1n << BigInt(i);
    }
  }
  return bits;
}

/**
 * Zips up a an array of arrays, i.e. forms pairs, triples, ... from
 * a list of two, three, ... lists.
 * Examples:
 * zipLists([[1, 2, 3], [4, 5, 6]]) === [[1,4], [2, 5], [3, 6]],
 * zipLists([[99, 976], [3, 2], [4, 7]]) === [[99, 3, 4], [976, 2, 7]].
 * Throws a `TypeError` if the lengths of the sublists are not all equal.
 */
export function zipLists<A>(lists: A[][]): A[][] {
  if (lists.length === 0) {
    return [];
  }
  const listLength = lists[0].length;
  if (lists.slice(1).some((list) => list.length !== listLength)) {
    throw new TypeError("All lists must be of the same length.");
  }
  return (
    lists
      // Embed each element of each sublist into an array.
      .map((list) => list.map((x) => [x]))
      .reduce((zippedList, list) =>
        // Concatenate each of these sublist elements to each other.
        zippedList.map((tuple, i) => tuple.concat(list[i]))
      )
  );
}

/**
 * Loads the configuration for Circomkit for use in unit tests or scripts.
 * All paths in the config will be fixed up to be based on the given package
 * path, rather than relative to the current working directory.
 *
 * @param gpcircuitsPackagePath file path to the root of the gpcircuits
 *   package in the repo
 * @param readFileSync callable function for readFileSync, or a compatible
 *   replacement in browser.  This is necessary to avoid polyfill errors since
 *   this function is intended for utests, but included in a library which
 *   can be loaded in a browser.
 * @returns a Circomkit config object suitable for the Circomkit constructor.
 */
export function loadCircomkitConfig(
  gpcircuitsPackagePath: string,
  readFileSync: (path: PathLike, options: BufferEncoding) => string
): Partial<CircomkitConfig> {
  function replaceConfigPath(
    configValue: string,
    gpcircuitsPath: string
  ): string {
    if (configValue.startsWith("./")) {
      return configValue.replace(/^\.\//, gpcircuitsPath + "/");
    } else if (configValue.startsWith("../")) {
      return path.join(gpcircuitsPath, configValue);
    }
    return configValue;
  }
  function replaceConfigPaths(
    config: Record<string, string | string[]>,
    gpcircuitsPath: string
  ): object {
    for (const [name, value] of Object.entries(config)) {
      if (typeof value === "string") {
        config[name] = replaceConfigPath(value, gpcircuitsPath);
      } else if (typeof value === "object" && Array.isArray(value)) {
        config[name] = value.map((p) => replaceConfigPath(p, gpcircuitsPath));
      }
    }
    return config;
  }
  return replaceConfigPaths(
    JSON.parse(
      readFileSync(path.join(gpcircuitsPackagePath, "circomkit.json"), "utf-8")
    ),
    gpcircuitsPackagePath
  ) as Partial<CircomkitConfig>;
}
