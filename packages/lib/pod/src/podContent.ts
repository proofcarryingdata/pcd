import { LeanIMT, LeanIMTMerkleProof } from "@zk-kit/lean-imt";
import { podMerkleTreeHash, podNameHash, podValueHash } from "./podCrypto";
import { PODEntries, PODName, PODValue } from "./podTypes";
import {
  checkPODName,
  checkPODValue,
  cloneOptionalPODValue,
  clonePODValue,
  deserializePODEntries,
  getPODValueForCircuit,
  requireType,
  serializePODEntries
} from "./podUtil";

type PODEntryInfo = { index: number; value: PODValue };
type PODMap = Map<PODName, PODEntryInfo>;
type PODMerkleTree = LeanIMT<bigint>;

/**
 * Merkle proof of an entry's membership in a POD.  The entry proofs returned
 * by this class are always proofs for the entry's name, while the entry's
 * value can be found as the first sibling.
 *
 * POD proofs use the Lean-IMT datastructure from @zk-kit/imt, which allows
 * shorter proofs for partially-filled subtrees.
 */
export type PODEntryProof = LeanIMTMerkleProof<bigint>;

/**
 * Info about a POD entry for inclusion in a ZK circuit.  The proof
 * is always a proof for the entry's name, while the entry's
 * value can be found as the first sibling.  Every entry has a name hash
 * and value hash as included in the Merkle tree.  The plaintext value
 * is only included for numeric values which can be directly represented
 * in a single circuit signal.
 */
export type PODEntryCircuitSignals = {
  proof: PODEntryProof;
  nameHash: bigint;
  valueHash: bigint;
  value: bigint | undefined;
};

/**
 * Class encapsulating an unsigned POD with functions for common use cases.
 * PODContent instances are immutable (within the limits of TypeScript), but
 * derived data (such as the Merkle tree of entries) is calculated lazily as it
 * is needed.
 *
 * A POD is made up of `PODEntries`, built into a Merkle tree (in sorted order)
 * to produce a root hash called the Content ID, which is then signed.  To
 * create a POD, use one of the static factory methods of this class.
 *
 * `PODContent` instances are usually contained in a signed `POD` instance.
 */
export class PODContent {
  private _map: PODMap;
  private _merkleTree?: PODMerkleTree;

  private constructor(map: PODMap, merkleTree?: LeanIMT<bigint>) {
    this._map = map;
    this._merkleTree = merkleTree;
  }

  /**
   * Factory for creating a new POD from entries.  The entries do not need
   * to be in sorted order, but will be sorted in the resulting `PODContent`.
   *
   * @param entries the POD entries to include
   * @returns a new PODContent
   * @throws if any of the entries aren't legal for inclusion in a POD
   */
  public static fromEntries(entries: PODEntries): PODContent {
    requireType("entries", entries, "object");
    const sortedNames = Object.keys(entries)
      .map((name) => checkPODName(name))
      .sort();
    const podMap: PODMap = new Map();
    for (let i = 0; i < sortedNames.length; i++) {
      const name = sortedNames[i];
      podMap.set(name, { index: i, value: checkPODValue(name, entries[name]) });
    }
    return new PODContent(podMap);
  }

  private get merkleTree(): LeanIMT<bigint> {
    if (this._merkleTree === undefined) {
      const merkleTree = new LeanIMT<bigint>(podMerkleTreeHash);
      const hashes: bigint[] = [];
      for (const [podName, podInfo] of this._map.entries()) {
        hashes.push(podNameHash(podName));
        hashes.push(podValueHash(podInfo.value));
      }
      if (!Object.is(hashes.length, this._map.size * 2)) {
        throw new Error(
          `[ERR_ASSERTION] Expected inputs to be strictly equal:\n\n${
            hashes.length
          } !== ${this._map.size * 2}`
        );
      }
      merkleTree.insertMany(hashes);
      if (!Object.is(merkleTree.size, hashes.length)) {
        throw new Error(
          `[ERR_ASSERTION] Expected inputs to be strictly equal:\n\n${merkleTree.size} !== ${hashes.length}`
        );
      }
      this._merkleTree = merkleTree;
    }
    return this._merkleTree;
  }

  /**
   * The content ID (root hash) of this POD.
   */
  public get contentID(): bigint {
    return this.merkleTree.root;
  }

  /**
   * The depth of the Merkle tree representation of this POD.  The proofs
   * generated by this POD will be no longer than this, but may be shorter
   * due to the optimizations of the Lean-IMT datastructure (see @zk-kit/imt).
   */
  public get merkleTreeDepth(): number {
    return this._merkleTree !== undefined
      ? this.merkleTree.depth
      : calcMinMerkleDepthForEntries(this._map.size);
  }

  /**
   * The number of entries in this POD.
   */
  public get size(): number {
    return this._map.size;
  }

  /**
   * @returns the contents of this POD as a PODEntries object.  Mutating
   *   this object will not change this `PODContent` instance.
   */
  public asEntries(): PODEntries {
    const entries: PODEntries = {};
    for (const [entryName, entryInfo] of this._map.entries()) {
      entries[entryName] = clonePODValue(entryInfo.value);
    }
    return entries;
  }

  /**
   * @returns the names of all entries in this POD, in sorted order.  Mutating
   *   this result will not change this `PODContent` instance.
   */
  public listNames(): string[] {
    return [...this._map.keys()];
  }

  /**
   * @returns the entries of this POD, in sorted order.  Mutating
   *   this result will not change this `PODContent` instance.
   */
  public listEntries(): { name: string; value: PODValue }[] {
    return [...this._map.entries()].map((e) => {
      return { name: e[0], value: clonePODValue(e[1].value) };
    });
  }

  /**
   * Gets an entry value by name.  Mutating the returned will not change this
   * `PODContent` instance.
   *
   * @param name the entry name to look up
   * @returns the value, or undefined if there is no value by that name
   */
  public getValue(name: string): PODValue | undefined {
    return cloneOptionalPODValue(this._map.get(name)?.value);
  }

  /**
   * Gets an entry value by name, without its type tag.  Mutating the returned
   * value will not change this `PODContent` instance.
   *
   * @param name the entry name to look up
   * @returns the value, or undefined if there is no value by that name
   */
  public getRawValue(name: string): PODValue["value"] | undefined {
    return this._map.get(name)?.value?.value;
  }

  /**
   * Serializes this instance's entries as a JSON string, in a way which
   * properly preserves all types.
   */
  public serialize(): string {
    return serializePODEntries(this.asEntries());
  }

  /**
   * Deserializes POD entries from JSON.
   *
   * @param serializedEntries a string previously created by {@link #serialize}.
   * @returns a new PODContent instance
   * @throws if the string isn't valid JSON, or represents entries which aren't
   *   legal for inclusion in a POD
   */
  public static deserialize(serializedEntries: string): PODContent {
    return PODContent.fromEntries(deserializePODEntries(serializedEntries));
  }

  /**
   * Creates a new proof of membership for an entry by the given name.
   *
   * @param entryName the entry name to look up
   * @returns a membership proof for the given entry
   * @throws if the entry name is not found
   */
  public generateEntryProof(entryName: string): PODEntryProof {
    return this.merkleTree.generateProof(
      this._getRequiredEntry(entryName).index * 2
    );
  }

  /**
   * Checks the validity of a POD membership proof by recomputing hashes.
   *
   * Validity depends only on the name hash and value hash included in the
   * membership proof.  This method doesn't check (and has no access to) the
   * hash pre-image name or value.
   *
   * @param entryProof the membership proof of a POD entry
   * @returns `true` if the proof is valid.
   */
  public static verifyEntryProof(entryProof: PODEntryProof): boolean {
    return LeanIMT.verifyProof(entryProof, podMerkleTreeHash);
  }

  /**
   * Generates all necessary info about a single POD entry needed to populate
   * a proof circuit.  This includes a membership proof, as well name hash,
   * value hash, and optionally the value itself.  Note that name strings
   * never appear in circuits directly.  Values only appear in circuits
   * if they are numeric values which fit in a single circuit signal.
   *
   * @param entryName the entry name to look up
   * @returns an object containing info for circuit inputs
   * @throws if the entry name is not found
   */
  public generateEntryCircuitSignals(
    entryName: string
  ): PODEntryCircuitSignals {
    const entryInfo = this._getRequiredEntry(entryName);
    const merkleProof = this.generateEntryProof(entryName);
    return {
      proof: merkleProof,
      nameHash: merkleProof.leaf,
      valueHash: merkleProof.siblings[0],
      value: getPODValueForCircuit(entryInfo.value)
    };
  }

  private _getRequiredEntry(entryName: string): PODEntryInfo {
    const entryInfo = this._map.get(entryName);
    if (entryInfo === undefined) {
      throw new Error(`POD doesn't contain entry ${entryName}.`);
    }
    return entryInfo;
  }
}

/**
 * Calculates the minimum Merkle tree depth of a POD containing the given number
 * of entries.  Since names and values are separate leaves of the tree, the
 * formula is ceil(log2(2 * nEntries)).
 *
 * @param nEntries entry count
 * @returns the required Merkle tree depth
 */
export function calcMinMerkleDepthForEntries(nEntries: number): number {
  return Math.ceil(Math.log2(2 * Math.ceil(nEntries)));
}

/**
 * Calculates the maximum number of entries which can be supported by a POD
 * with a given Merkle tree depth.  Since names and values are separate leaves
 * of the tree, the formula is 2**(merkleDepth-1)
 *
 * @param merkleDepth the depth of a POD Merkle tree
 * @returns the maximum number of entries of any POD with the given depth
 */
export function calcMaxEntriesForMerkleDepth(merkleDepth: number): number {
  return Math.floor(2 ** Math.floor(merkleDepth - 1));
}
